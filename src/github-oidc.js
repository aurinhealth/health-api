const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${OIDC_ISSUER}/.well-known/jwks`;
const EXPECTED_AUDIENCE = "health-strength";
const EXPECTED_REPOSITORY = "shaarkyn/health-api";
const EXPECTED_REPOSITORY_ID = "1371310425";
const EXPECTED_REPOSITORY_OWNER_ID = "329509326";
const NIGHTLY_GYM_WORKFLOW = "shaarkyn/health-api/.github/workflows/health-strength.yml@refs/heads/main";
const EXPECTED_WORKFLOWS = new Set([
  NIGHTLY_GYM_WORKFLOW,
  "shaarkyn/health-api/.github/workflows/deploy-worker.yml@refs/heads/main"
]);

let cachedJwks = null;
let cachedJwksAt = 0;
let forcedJwksAt = 0;

export async function verifyGitHubActionsToken(request, fetchImpl = fetch) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Missing GitHub Actions bearer token");
  const token = authorization.slice(7).trim();
  if (!token) throw new Error("Missing GitHub Actions bearer token");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid GitHub Actions JWT");

  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported GitHub Actions JWT");

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== OIDC_ISSUER) throw new Error("Invalid GitHub Actions issuer");
  if (claims.aud !== EXPECTED_AUDIENCE) throw new Error("Invalid GitHub Actions audience");
  if (claims.repository !== EXPECTED_REPOSITORY) throw new Error("Invalid GitHub Actions repository");
  if (String(claims.repository_id) !== EXPECTED_REPOSITORY_ID) throw new Error("Invalid GitHub Actions repository id");
  if (String(claims.repository_owner_id) !== EXPECTED_REPOSITORY_OWNER_ID) throw new Error("Invalid GitHub Actions repository owner");
  if (claims.ref !== "refs/heads/main") throw new Error("Invalid GitHub Actions ref");
  if (!EXPECTED_WORKFLOWS.has(claims.workflow_ref)) throw new Error("Invalid GitHub Actions workflow");
  if (claims.event_name !== "push" && !(claims.workflow_ref === NIGHTLY_GYM_WORKFLOW && claims.event_name === "schedule")) {
    throw new Error("Invalid GitHub Actions event");
  }
  if (claims.actor !== "shaarkyn") throw new Error("Invalid GitHub Actions actor");
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error("Expired GitHub Actions token");
  if (Number.isFinite(claims.nbf) && claims.nbf > now + 60) throw new Error("GitHub Actions token is not active yet");

  const jwks = await getJwks(fetchImpl, header.kid);
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("GitHub Actions signing key not found");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    base64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("Invalid GitHub Actions token signature");

  return claims;
}

// GitHub's keys, kept for ten minutes. A token signed with a key the cached
// list does not have (GitHub rotated its keys) fetches the list again, past
// the cache, at most once a minute.
async function getJwks(fetchImpl, kid) {
  const now = Date.now();
  const fresh = cachedJwks && now - cachedJwksAt < 10 * 60 * 1000;
  if (fresh && (cachedJwks.keys.some((key) => key.kid === kid) || now - forcedJwksAt < 60 * 1000)) return cachedJwks;
  if (fresh) forcedJwksAt = now;
  const response = await fetchImpl(JWKS_URL, fresh ? { cache: "no-store" } : { cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error(`GitHub OIDC JWKS HTTP ${response.status}`);
  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) throw new Error("Invalid GitHub OIDC JWKS response");
  cachedJwks = data;
  cachedJwksAt = now;
  return data;
}
export function _resetGitHubJwksCacheForTest() { cachedJwks = null; cachedJwksAt = 0; forcedJwksAt = 0; }

function decodeJson(value) {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlToBytes(value)));
  } catch {
    throw new Error("Invalid GitHub Actions JWT encoding");
  }
}

function base64urlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
