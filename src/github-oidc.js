const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${OIDC_ISSUER}/.well-known/jwks`;
const EXPECTED_AUDIENCE = "health-strength";
const EXPECTED_REPOSITORY = "shaarkyn/health-api";
const EXPECTED_WORKFLOW = "shaarkyn/health-api/.github/workflows/health-strength.yml@refs/heads/main";

let cachedJwks = null;
let cachedJwksAt = 0;

export async function verifyGitHubActionsToken(request) {
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
  if (claims.repository_visibility !== "private") throw new Error("Invalid GitHub Actions repository visibility");
  if (claims.ref !== "refs/heads/main") throw new Error("Invalid GitHub Actions ref");
  if (claims.workflow_ref !== EXPECTED_WORKFLOW) throw new Error("Invalid GitHub Actions workflow");
  if (claims.event_name !== "push") throw new Error("Invalid GitHub Actions event");
  if (claims.actor !== "shaarkyn") throw new Error("Invalid GitHub Actions actor");
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error("Expired GitHub Actions token");
  if (Number.isFinite(claims.nbf) && claims.nbf > now + 60) throw new Error("GitHub Actions token is not active yet");

  const jwks = await getJwks();
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

async function getJwks() {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < 10 * 60 * 1000) return cachedJwks;
  const response = await fetch(JWKS_URL, { cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error(`GitHub OIDC JWKS HTTP ${response.status}`);
  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) throw new Error("Invalid GitHub OIDC JWKS response");
  cachedJwks = data;
  cachedJwksAt = now;
  return data;
}

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
