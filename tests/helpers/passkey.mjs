// A software passkey for tests: creates credentials and signs sign-ins the way
// a browser and authenticator answer navigator.credentials.create() and .get().
const b64u = bytes => Buffer.from(bytes).toString("base64url");
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const uint32 = n => Uint8Array.of((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);

export function encodeCbor(value) {
  const out = [];
  const head = (major, n) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 256) out.push((major << 5) | 24, n);
    else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
    else out.push((major << 5) | 26, ...uint32(n));
  };
  const write = v => {
    if (typeof v === "number") { if (v >= 0) head(0, v); else head(1, -1 - v); }
    else if (typeof v === "string") { const b = new TextEncoder().encode(v); head(3, b.length); for (const x of b) out.push(x); }
    else if (v instanceof Uint8Array) { head(2, v.length); for (const x of v) out.push(x); }
    else if (Array.isArray(v)) { head(4, v.length); v.forEach(write); }
    else if (v instanceof Map) { head(5, v.size); for (const [k, x] of v) { write(k); write(x); } }
    else if (v === true) out.push(0xf5);
    else if (v === false) out.push(0xf4);
    else if (v === null) out.push(0xf6);
    else throw new Error("Cannot encode " + typeof v);
  };
  write(value);
  return new Uint8Array(out);
}

// WebCrypto signs ECDSA as r||s; authenticators send DER.
export function rawToDer(raw) {
  const int = bytes => { let i = 0; while (i < bytes.length - 1 && bytes[i] === 0) i++; let v = bytes.slice(i); if (v[0] & 0x80) v = concat(Uint8Array.of(0), v); return concat(Uint8Array.of(0x02, v.length), v); };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32));
  return concat(Uint8Array.of(0x30, r.length + s.length), r, s);
}

async function keyPair(alg, modulusLength = 2048) {
  if (alg === -7) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    return { pair, cose: new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]) };
  }
  if (alg === -8) {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    return { pair, cose: new Map([[1, 1], [3, -8], [-1, 6], [-2, new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))]]) };
  }
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { pair, cose: new Map([[1, 3], [3, -257], [-1, new Uint8Array(Buffer.from(jwk.n, "base64url"))], [-2, new Uint8Array(Buffer.from(jwk.e, "base64url"))]]) };
}

async function sign(alg, privateKey, data) {
  if (alg === -7) return rawToDer(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, data)));
  if (alg === -8) return new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, data));
  return new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, data));
}

// Answers navigator.credentials.create(). Returns { credential, passkey }; keep
// the passkey to sign in later.
export async function createPasskey({ challenge, origin = "https://petrfitnessdata.eu", rpId = new URL(origin).hostname, alg = -7, flags = 0x45, signCount = 0, aaguid = new Uint8Array(16), userHandle = b64u(crypto.getRandomValues(new Uint8Array(32))), transports = ["internal", "hybrid"], fmt = "none", modulusLength, clientData = {}, credentialId = crypto.getRandomValues(new Uint8Array(16)) } = {}) {
  const { pair, cose } = await keyPair(alg, modulusLength);
  const authData = concat(await sha256(new TextEncoder().encode(rpId)), Uint8Array.of(flags), uint32(signCount), aaguid, Uint8Array.of(credentialId.length >> 8, credentialId.length & 255), credentialId, encodeCbor(cose));
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false, ...clientData }));
  const attestationObject = encodeCbor(new Map([["fmt", fmt], ["attStmt", new Map()], ["authData", authData]]));
  const id = b64u(credentialId);
  return {
    credential: { id, rawId: id, type: "public-key", authenticatorAttachment: "platform", response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports }, clientExtensionResults: {} },
    passkey: { id, alg, privateKey: pair.privateKey, userHandle, rpId, origin, signCount }
  };
}

// Answers navigator.credentials.get() with a passkey from createPasskey().
export async function signInWith(passkey, { challenge, origin = passkey.origin, rpId = passkey.rpId, flags = 0x05, signCount = 0, userHandle = passkey.userHandle, clientData = {}, signer = passkey } = {}) {
  const authenticatorData = concat(await sha256(new TextEncoder().encode(rpId)), Uint8Array.of(flags), uint32(signCount));
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false, ...clientData }));
  const signature = await sign(signer.alg, signer.privateKey, concat(authenticatorData, await sha256(clientDataJSON)));
  return { id: passkey.id, rawId: passkey.id, type: "public-key", authenticatorAttachment: "platform", response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authenticatorData), signature: b64u(signature), userHandle }, clientExtensionResults: {} };
}
