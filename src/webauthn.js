// Passkeys (WebAuthn) checked with WebCrypto, without a library: the browser's
// answers to navigator.credentials.create() and .get(), verified the way the
// WebAuthn spec (Level 3, §7.1 and §7.2) asks. Loadwise asks for no attestation,
// so it trusts the public key that the signed-in user's browser hands over and
// never the claimed device model.

export const ALG_ES256 = -7, ALG_EDDSA = -8, ALG_RS256 = -257;
export const SUPPORTED_ALGORITHMS = [ALG_ES256, ALG_EDDSA, ALG_RS256];

const FLAG_UP = 0x01, FLAG_UV = 0x04, FLAG_BE = 0x08, FLAG_BS = 0x10, FLAG_AT = 0x40, FLAG_ED = 0x80;
const MAX_CREDENTIAL_ID_BYTES = 1023;
const TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

export class WebAuthnError extends Error {}

export function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(text) {
  const value = String(text ?? "");
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) throw new WebAuthnError("Invalid base64url value");
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export function randomChallenge(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// CBOR (RFC 8949), only what authenticators send: integers, byte and text
// strings, arrays, maps and simple values, all with definite lengths.
// Returns { value, offset } with the offset just after the item; maps become Map.
export function decodeCbor(bytes, offset = 0, depth = 0) {
  if (depth > 16) throw new WebAuthnError("CBOR nested too deeply");
  const need = n => { if (offset + n > bytes.length) throw new WebAuthnError("CBOR data ends early"); };
  need(1);
  const initial = bytes[offset++], major = initial >> 5, info = initial & 0x1f;
  let length;
  if (info < 24) length = info;
  else if (info === 24) { need(1); length = bytes[offset]; offset += 1; }
  else if (info === 25) { need(2); length = (bytes[offset] << 8) | bytes[offset + 1]; offset += 2; }
  else if (info === 26) { need(4); length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0); offset += 4; }
  else if (info === 27) {
    need(8);
    const big = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new WebAuthnError("CBOR integer too large");
    length = Number(big); offset += 8;
  } else throw new WebAuthnError("Unsupported CBOR length");
  switch (major) {
    case 0: return { value: length, offset };
    case 1: return { value: -1 - length, offset };
    case 2: need(length); return { value: bytes.slice(offset, offset + length), offset: offset + length };
    case 3: {
      need(length);
      let value;
      try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + length)); }
      catch { throw new WebAuthnError("Invalid CBOR text"); }
      return { value, offset: offset + length };
    }
    case 4: {
      // Every item takes at least one byte, so a claimed length beyond the data is invalid.
      need(length);
      const value = [];
      for (let i = 0; i < length; i++) { const item = decodeCbor(bytes, offset, depth + 1); value.push(item.value); offset = item.offset; }
      return { value, offset };
    }
    case 5: {
      need(length * 2);
      const value = new Map();
      for (let i = 0; i < length; i++) {
        const key = decodeCbor(bytes, offset, depth + 1);
        if (typeof key.value !== "number" && typeof key.value !== "string") throw new WebAuthnError("Unsupported CBOR map key");
        if (value.has(key.value)) throw new WebAuthnError("Duplicate CBOR map key");
        const item = decodeCbor(bytes, key.offset, depth + 1);
        value.set(key.value, item.value); offset = item.offset;
      }
      return { value, offset };
    }
    case 7:
      if (info === 20) return { value: false, offset };
      if (info === 21) return { value: true, offset };
      if (info === 22) return { value: null, offset };
      throw new WebAuthnError("Unsupported CBOR simple value");
    default: throw new WebAuthnError("Unsupported CBOR type");
  }
}

function decodeCborExactly(bytes) {
  const { value, offset } = decodeCbor(bytes);
  if (offset !== bytes.length) throw new WebAuthnError("Trailing bytes after CBOR data");
  return value;
}

// Authenticator data (§6.1): RP ID hash, flags, signature counter and, when a
// passkey is created, its id and COSE public key.
export function parseAuthenticatorData(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 37) throw new WebAuthnError("Authenticator data too short");
  const flags = bytes[32];
  const result = {
    rpIdHash: bytes.slice(0, 32),
    flags,
    signCount: new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0),
    userPresent: Boolean(flags & FLAG_UP),
    userVerified: Boolean(flags & FLAG_UV),
    backupEligible: Boolean(flags & FLAG_BE),
    backedUp: Boolean(flags & FLAG_BS),
    attestedCredentialData: null
  };
  let offset = 37;
  if (flags & FLAG_AT) {
    if (bytes.length < offset + 18) throw new WebAuthnError("Attested credential data too short");
    const aaguid = bytes.slice(offset, offset + 16);
    const idLength = (bytes[offset + 16] << 8) | bytes[offset + 17];
    offset += 18;
    if (idLength === 0 || idLength > MAX_CREDENTIAL_ID_BYTES || bytes.length < offset + idLength) throw new WebAuthnError("Invalid credential id");
    const credentialId = bytes.slice(offset, offset + idLength);
    offset += idLength;
    const key = decodeCbor(bytes, offset);
    if (!(key.value instanceof Map)) throw new WebAuthnError("Invalid credential public key");
    result.attestedCredentialData = { aaguid, credentialId, publicKey: key.value };
    offset = key.offset;
  }
  if (flags & FLAG_ED) offset = decodeCbor(bytes, offset).offset;
  if (offset !== bytes.length) throw new WebAuthnError("Trailing bytes in authenticator data");
  return result;
}

// A COSE public key (RFC 9053) as a JWK that WebCrypto can import.
export function coseToJwk(cose) {
  const kty = cose.get(1), alg = cose.get(3);
  const bytes = (label, size) => {
    const value = cose.get(label);
    if (!(value instanceof Uint8Array) || (size && value.length !== size)) throw new WebAuthnError("Invalid public key coordinates");
    return base64url(value);
  };
  if (alg === ALG_ES256 && kty === 2 && cose.get(-1) === 1) return { alg, jwk: { kty: "EC", crv: "P-256", x: bytes(-2, 32), y: bytes(-3, 32) } };
  if (alg === ALG_EDDSA && kty === 1 && cose.get(-1) === 6) return { alg, jwk: { kty: "OKP", crv: "Ed25519", x: bytes(-2, 32) } };
  if (alg === ALG_RS256 && kty === 3) {
    const n = cose.get(-1);
    if (!(n instanceof Uint8Array) || n.length < 256) throw new WebAuthnError("RSA key too short");
    return { alg, jwk: { kty: "RSA", n: bytes(-1), e: bytes(-2) } };
  }
  throw new WebAuthnError("Unsupported public key algorithm");
}

async function importPublicKey(jwk, alg) {
  if (alg === ALG_ES256) return crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  if (alg === ALG_EDDSA) return crypto.subtle.importKey("raw", fromBase64url(jwk.x), { name: "Ed25519" }, false, ["verify"]);
  if (alg === ALG_RS256) return crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  throw new WebAuthnError("Unsupported public key algorithm");
}

// WebAuthn ECDSA signatures are DER sequences; WebCrypto wants r and s side by side.
export function derToRawSignature(der, size = 32) {
  const fail = () => { throw new WebAuthnError("Invalid ECDSA signature"); };
  if (!(der instanceof Uint8Array) || der.length < 8 || der[0] !== 0x30) fail();
  let offset = 2;
  if (der[1] === 0x81) offset = 3;
  else if (der[1] & 0x80) fail();
  if ((offset === 2 ? der[1] : der[2]) !== der.length - offset) fail();
  const out = new Uint8Array(size * 2);
  for (let part = 0; part < 2; part++) {
    if (der[offset] !== 0x02) fail();
    const length = der[offset + 1];
    let value = der.subarray(offset + 2, offset + 2 + length);
    if (value.length !== length || length === 0) fail();
    while (value.length > 1 && value[0] === 0) value = value.subarray(1);
    if (value.length > size) fail();
    out.set(value, part * size + size - value.length);
    offset += 2 + length;
  }
  if (offset !== der.length) fail();
  return out;
}

async function verifySignature(alg, jwk, signature, data) {
  const key = await importPublicKey(jwk, alg);
  if (alg === ALG_ES256) return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRawSignature(signature), data);
  if (alg === ALG_EDDSA) return crypto.subtle.verify({ name: "Ed25519" }, key, signature, data);
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, data);
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

// The challenge the browser signed, read before verification so the server can
// look up (and use up) the matching challenge it issued.
export function clientDataChallenge(credential) {
  try { return String(JSON.parse(new TextDecoder().decode(fromBase64url(credential?.response?.clientDataJSON))).challenge || ""); }
  catch { return ""; }
}

function checkClientData(bytes, { type, challenge, origin }) {
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new WebAuthnError("Invalid client data"); }
  if (data?.type !== type) throw new WebAuthnError("Unexpected client data type");
  if (typeof data.challenge !== "string" || !challenge || data.challenge !== challenge) throw new WebAuthnError("Challenge does not match");
  if (data.origin !== origin) throw new WebAuthnError("Origin does not match");
  // Loadwise never asks for a passkey from inside another site's frame.
  if (data.crossOrigin === true) throw new WebAuthnError("Cross-origin request");
}

async function checkAuthenticatorData(authData, { rpId, requireUserVerification }) {
  if (!sameBytes(authData.rpIdHash, await sha256(new TextEncoder().encode(rpId)))) throw new WebAuthnError("RP ID does not match");
  if (!authData.userPresent) throw new WebAuthnError("User was not present");
  if (requireUserVerification && !authData.userVerified) throw new WebAuthnError("User was not verified");
  if (authData.backedUp && !authData.backupEligible) throw new WebAuthnError("Invalid backup flags");
}

function credentialBytes(credential, name) {
  const value = credential?.response?.[name];
  if (typeof value !== "string" || !value) throw new WebAuthnError("Missing " + name);
  return fromBase64url(value);
}

function checkCredentialShape(credential) {
  if (!credential || credential.type !== "public-key" || typeof credential.id !== "string" || !credential.id) throw new WebAuthnError("Not a passkey response");
  if (credential.rawId !== undefined && credential.rawId !== credential.id) throw new WebAuthnError("Credential id mismatch");
}

function aaguidText(bytes) {
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

// §7.1: a new passkey from navigator.credentials.create().
export async function verifyRegistration(credential, { challenge, origin, rpId, requireUserVerification = true, algorithms = SUPPORTED_ALGORITHMS }) {
  checkCredentialShape(credential);
  checkClientData(credentialBytes(credential, "clientDataJSON"), { type: "webauthn.create", challenge, origin });
  const attestation = decodeCborExactly(credentialBytes(credential, "attestationObject"));
  if (!(attestation instanceof Map) || typeof attestation.get("fmt") !== "string" || !(attestation.get("authData") instanceof Uint8Array)) throw new WebAuthnError("Invalid attestation object");
  const authData = parseAuthenticatorData(attestation.get("authData"));
  await checkAuthenticatorData(authData, { rpId, requireUserVerification });
  const attested = authData.attestedCredentialData;
  if (!attested) throw new WebAuthnError("No credential in the response");
  const credentialId = base64url(attested.credentialId);
  if (credentialId !== credential.id) throw new WebAuthnError("Credential id mismatch");
  const { alg, jwk } = coseToJwk(attested.publicKey);
  if (!algorithms.includes(alg)) throw new WebAuthnError("Algorithm not allowed");
  // Fails now, not at the first sign-in, if WebCrypto cannot use the key.
  await importPublicKey(jwk, alg);
  const transports = Array.isArray(credential.response.transports) ? [...new Set(credential.response.transports.filter(t => TRANSPORTS.has(t)))] : [];
  return { credentialId, publicKey: jwk, alg, signCount: authData.signCount, aaguid: aaguidText(attested.aaguid), backupEligible: authData.backupEligible, backedUp: authData.backedUp, transports };
}

// §7.2: signing in with a stored passkey ({ publicKey, alg, signCount }).
export async function verifyAuthentication(credential, { challenge, origin, rpId, stored, requireUserVerification = true }) {
  checkCredentialShape(credential);
  const clientDataJSON = credentialBytes(credential, "clientDataJSON");
  checkClientData(clientDataJSON, { type: "webauthn.get", challenge, origin });
  const rawAuthData = credentialBytes(credential, "authenticatorData");
  const authData = parseAuthenticatorData(rawAuthData);
  await checkAuthenticatorData(authData, { rpId, requireUserVerification });
  const signed = new Uint8Array(rawAuthData.length + 32);
  signed.set(rawAuthData, 0);
  signed.set(await sha256(clientDataJSON), rawAuthData.length);
  let valid = false;
  try { valid = await verifySignature(Number(stored.alg), stored.publicKey, credentialBytes(credential, "signature"), signed); }
  catch (error) { if (error instanceof WebAuthnError) throw error; valid = false; }
  if (!valid) throw new WebAuthnError("Invalid signature");
  // A counter that does not grow means a copied authenticator (§6.1.1). Synced passkeys always send 0.
  const previous = Number(stored.signCount) || 0;
  if ((authData.signCount !== 0 || previous !== 0) && authData.signCount <= previous) throw new WebAuthnError("Signature counter went back");
  return { signCount: authData.signCount, backedUp: authData.backedUp, userVerified: authData.userVerified };
}
