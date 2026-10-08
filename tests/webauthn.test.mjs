import test from "node:test";
import assert from "node:assert/strict";
import { decodeCbor, parseAuthenticatorData, derToRawSignature, verifyRegistration, verifyAuthentication, clientDataChallenge, WebAuthnError, fromBase64url } from "../src/webauthn.js";
import { createPasskey, signInWith, encodeCbor, rawToDer } from "./helpers/passkey.mjs";

const ORIGIN = "https://petrfitnessdata.eu", RP = "petrfitnessdata.eu";
const expected = challenge => ({ challenge, origin: ORIGIN, rpId: RP });
const rejects = (promise, pattern) => assert.rejects(promise, error => error instanceof WebAuthnError && pattern.test(error.message));

async function registered(options = {}) {
  const { credential, passkey } = await createPasskey({ challenge: "reg-challenge", ...options });
  const result = await verifyRegistration(credential, expected("reg-challenge"));
  return { credential, passkey, result, stored: { publicKey: result.publicKey, alg: result.alg, signCount: result.signCount } };
}

for (const [name, alg] of [["ES256", -7], ["EdDSA", -8], ["RS256", -257]]) {
  test(`a ${name} passkey registers and signs in`, async () => {
    const { passkey, result, stored, credential } = await registered({ alg });
    assert.equal(result.credentialId, credential.id);
    assert.equal(result.alg, alg);
    assert.deepEqual(result.transports, ["internal", "hybrid"]);
    const assertion = await signInWith(passkey, { challenge: "login-challenge" });
    assert.equal(clientDataChallenge(assertion), "login-challenge");
    const outcome = await verifyAuthentication(assertion, { ...expected("login-challenge"), stored });
    assert.equal(outcome.signCount, 0);
    assert.equal(outcome.userVerified, true);
  });
}

test("registration checks the challenge, origin, type, RP ID and user verification", async () => {
  const make = options => createPasskey({ challenge: "c1", ...options }).then(r => r.credential);
  await rejects(verifyRegistration(await make({ challenge: "other" }), expected("c1")), /Challenge/);
  await rejects(verifyRegistration(await make({ origin: "https://evil.example", rpId: RP }), expected("c1")), /Origin/);
  await rejects(verifyRegistration(await make({ origin: "https://staging.petrfitnessdata.eu", rpId: RP }), expected("c1")), /Origin/);
  await rejects(verifyRegistration(await make({ rpId: "evil.example" }), expected("c1")), /RP ID/);
  await rejects(verifyRegistration(await make({ flags: 0x41 }), expected("c1")), /not verified/);
  await rejects(verifyRegistration(await make({ flags: 0x44 }), expected("c1")), /not present/);
  // Without the AT flag the key that follows is data the parser does not expect.
  await rejects(verifyRegistration(await make({ flags: 0x05 }), expected("c1")), /Trailing/);
  await rejects(verifyRegistration(await make({ flags: 0x55 }), expected("c1")), /backup flags/);
  await rejects(verifyRegistration(await make({ clientData: { type: "webauthn.get" } }), expected("c1")), /type/);
  await rejects(verifyRegistration(await make({ clientData: { crossOrigin: true } }), expected("c1")), /Cross-origin/);
  await rejects(verifyRegistration(await make({}), { ...expected("c1"), algorithms: [-8] }), /not allowed/);
  await rejects(verifyRegistration(await make({ alg: -257, modulusLength: 1024 }), expected("c1")), /too short/);
  const swapped = await make({});
  swapped.id = swapped.rawId = "AAAA";
  await rejects(verifyRegistration(swapped, expected("c1")), /id mismatch/);
  // Without user verification the app could take a passkey nobody unlocked.
  const lax = await verifyRegistration(await make({ flags: 0x41 }), { ...expected("c1"), requireUserVerification: false });
  assert.ok(lax.credentialId);
});

test("registration takes any attestation format but never trusts it", async () => {
  const { credential } = await createPasskey({ challenge: "c2", fmt: "packed", aaguid: Uint8Array.from(Buffer.from("fbfc3007154e4ecc8c0b6e020557d7bd", "hex")) });
  const result = await verifyRegistration(credential, expected("c2"));
  assert.equal(result.aaguid, "fbfc3007-154e-4ecc-8c0b-6e020557d7bd");
});

test("sign-in rejects other challenges, origins, keys and tampered data", async () => {
  const { passkey, stored } = await registered();
  const other = (await createPasskey({ challenge: "x" })).passkey;
  await rejects(verifyAuthentication(await signInWith(passkey, { challenge: "a" }), { ...expected("b"), stored }), /Challenge/);
  await rejects(verifyAuthentication(await signInWith(passkey, { challenge: "a", origin: "https://evil.example" }), { ...expected("a"), stored }), /Origin/);
  await rejects(verifyAuthentication(await signInWith(passkey, { challenge: "a", rpId: "evil.example" }), { ...expected("a"), stored }), /RP ID/);
  await rejects(verifyAuthentication(await signInWith(passkey, { challenge: "a", flags: 0x01 }), { ...expected("a"), stored }), /not verified/);
  await rejects(verifyAuthentication(await signInWith(passkey, { challenge: "a", clientData: { type: "webauthn.create" } }), { ...expected("a"), stored }), /type/);
  await rejects(verifyAuthentication(await signInWith(passkey, { challenge: "a", signer: other }), { ...expected("a"), stored }), /signature/);
  const tampered = await signInWith(passkey, { challenge: "a" });
  const data = fromBase64url(tampered.response.authenticatorData);
  data[32] |= 0x10; // backed up, now without backup eligibility
  tampered.response.authenticatorData = Buffer.from(data).toString("base64url");
  await rejects(verifyAuthentication(tampered, { ...expected("a"), stored }), /backup flags/);
  const resigned = await signInWith(passkey, { challenge: "a" });
  const bytes = fromBase64url(resigned.response.authenticatorData);
  bytes[33] = 9; // counter changed after signing
  resigned.response.authenticatorData = Buffer.from(bytes).toString("base64url");
  await rejects(verifyAuthentication(resigned, { ...expected("a"), stored }), /signature/);
  await rejects(verifyAuthentication({ ...(await signInWith(passkey, { challenge: "a" })), type: "password" }, { ...expected("a"), stored }), /Not a passkey/);
});

test("a signature counter that does not grow is refused", async () => {
  const { passkey, stored } = await registered();
  const run = (signCount, previous) => signInWith(passkey, { challenge: "a", signCount }).then(c => verifyAuthentication(c, { ...expected("a"), stored: { ...stored, signCount: previous } }));
  assert.equal((await run(0, 0)).signCount, 0);
  assert.equal((await run(3, 0)).signCount, 3);
  assert.equal((await run(8, 7)).signCount, 8);
  await rejects(run(7, 7), /counter/);
  await rejects(run(0, 7), /counter/);
});

test("CBOR decoding handles what authenticators send and refuses the rest", () => {
  const value = new Map([[1, 2], [-1, "text"], ["k", Uint8Array.of(1, 2, 3)], ["list", [true, false, null, 500, 70000]]]);
  const decoded = decodeCbor(encodeCbor(value));
  assert.equal(decoded.offset, encodeCbor(value).length);
  assert.deepEqual([...decoded.value.keys()], [1, -1, "k", "list"]);
  assert.deepEqual(decoded.value.get("list"), [true, false, null, 500, 70000]);
  assert.deepEqual([...decoded.value.get("k")], [1, 2, 3]);
  assert.throws(() => decodeCbor(Uint8Array.of(0x5f)), WebAuthnError); // indefinite byte string
  assert.throws(() => decodeCbor(Uint8Array.of(0xc0, 0x00)), WebAuthnError); // tag
  assert.throws(() => decodeCbor(Uint8Array.of(0xf9, 0, 0)), WebAuthnError); // float
  assert.throws(() => decodeCbor(Uint8Array.of(0x9b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)), WebAuthnError);
  assert.throws(() => decodeCbor(Uint8Array.of(0x9a, 0xff, 0xff, 0xff, 0xff)), WebAuthnError); // array longer than the data
  assert.throws(() => decodeCbor(Uint8Array.of(0xa2, 0x01, 0x01, 0x01, 0x02)), /Duplicate/);
  assert.throws(() => decodeCbor(new Uint8Array(40).fill(0x81)), /deeply/);
});

test("random bytes never crash the parsers with anything but a WebAuthn error", () => {
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
  for (let i = 0; i < 3000; i++) {
    const bytes = Uint8Array.from({ length: 1 + (i % 90) }, next);
    for (const parse of [b => decodeCbor(b), b => parseAuthenticatorData(b), b => derToRawSignature(b)]) {
      try { parse(bytes); } catch (error) { assert.ok(error instanceof WebAuthnError, error.message); }
    }
  }
});

test("authenticator data with trailing bytes or an oversized credential id is refused", async () => {
  const { credential } = await createPasskey({ challenge: "c" });
  const attestation = decodeCbor(fromBase64url(credential.response.attestationObject)).value;
  const authData = attestation.get("authData");
  assert.ok(parseAuthenticatorData(authData).attestedCredentialData);
  assert.throws(() => parseAuthenticatorData(Uint8Array.from([...authData, 0])), /Trailing/);
  const long = Uint8Array.from(authData);
  long[53] = 0x04; long[54] = 0x00; // credential id length 1024
  assert.throws(() => parseAuthenticatorData(long), /credential id/);
  attestation.set("authData", Uint8Array.from([...authData, 0]));
  credential.response.attestationObject = Buffer.from(encodeCbor(attestation)).toString("base64url");
  await rejects(verifyRegistration(credential, expected("c")), /Trailing/);
});

test("DER signatures convert to r||s, with and without leading zeros", () => {
  const raw = Uint8Array.from({ length: 64 }, (_, i) => (i === 0 || i === 32 ? 0x80 : i));
  assert.deepEqual([...derToRawSignature(rawToDer(raw))], [...raw]);
  const short = Uint8Array.from({ length: 64 }, (_, i) => (i < 2 || (i >= 32 && i < 35) ? 0 : 7));
  assert.deepEqual([...derToRawSignature(rawToDer(short))], [...short]);
  assert.throws(() => derToRawSignature(Uint8Array.of(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01)), WebAuthnError);
});
