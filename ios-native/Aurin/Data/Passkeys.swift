import AuthenticationServices
import Foundation
import UIKit

// Passkeys in the app (Face ID or Touch ID instead of the e-mail code), with
// the server's WebAuthn routes (src/passkeys.js):
//   sign-in:  POST /auth/passkey/options → the assertion → POST /auth/passkey/verify
//   adding:   POST /app/api/passkeys/options → the registration → POST /app/api/passkeys
// The relying party is the server's host (aurin.health), which iOS
// checks against the app's associated-domains entitlement (project.yml) and
// the server's /.well-known/apple-app-site-association. The JSON sent back is
// the same as the web app's credentialJson (src/dashboard-client.js): every
// binary field as base64url without padding.

/// The sign-in options as the server sends them.
struct PasskeyLoginOptions: Decodable {
    let challenge: String
    let rpId: String
}

/// The registration options as the server sends them (the user id is a
/// random base64url string, never the e-mail).
struct PasskeyRegistrationOptions: Decodable {
    let challenge: String
    let rp: RelyingParty
    let user: User

    struct RelyingParty: Decodable { let id: String; let name: String? }
    struct User: Decodable { let id: String; let name: String?; let displayName: String? }
}

/// What the server answers after a passkey signed the user in.
struct PasskeyLoginResult: Decodable {
    let status: String?
    let email: String?
}

extension APIClient {
    func passkeyLoginOptions() async throws -> PasskeyLoginOptions {
        try await send("/auth/passkey/options", method: "POST", body: JSONObject())
    }

    /// The signed assertion for the session cookie.
    func verifyPasskeyLogin(credential: JSONObject) async throws -> PasskeyLoginResult {
        let result: PasskeyLoginResult = try await send("/auth/passkey/verify", method: "POST", body: ["credential": JSONValue.object(credential)])
        guard hasSession else { throw APIError.message(L10n.tr("Server nevrátil přihlášení. Zkus to znovu.")) }
        return result
    }

    func passkeyRegistrationOptions() async throws -> PasskeyRegistrationOptions {
        try await send("/app/api/passkeys/options", method: "POST", body: JSONObject())
    }

    func registerPasskey(credential: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/passkeys", method: "POST", body: ["credential": JSONValue.object(credential)])
    }

    /// The account's passkeys (Profil → Face ID). The phone's Passwords app
    /// forgets the ones the server no longer has (PasskeyService.prune).
    func passkeys() async throws -> [PasskeyInfo] {
        let list: PasskeyList = try await get("/app/api/passkeys")
        PasskeyService.prune(list)
        return list.passkeys
    }

    /// Removes one passkey; whoever signed in with it elsewhere is signed out.
    func removePasskey(id: String) async throws -> [PasskeyInfo] {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+=")))
        let list: PasskeyList = try await send("/app/api/passkeys?id=" + (encoded ?? id), method: "DELETE", body: JSONObject())
        PasskeyService.prune(list)
        return list.passkeys
    }

    /// Before the account is deleted: its passkey handle, so the phone can
    /// drop its passkeys afterwards (PasskeyService.forgetAccount).
    func passkeyHandle() async -> (rpId: String, userHandle: String)? {
        guard let list: PasskeyList = try? await get("/app/api/passkeys"), let rpId = list.rpId, let handle = list.userHandle else { return nil }
        return (rpId, handle)
    }

    /// Signs out every other device; this one gets a fresh cookie and stays.
    func signOutOtherDevices() async throws {
        let _: JSONValue = try await send("/app/api/account/sign-out-everywhere", method: "POST", body: JSONObject())
    }
}

/// One passkey of the account as the server lists it (dates in UTC, "YYYY-MM-DD HH:MM:SS").
struct PasskeyInfo: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let createdAt: String?
    let lastUsedAt: String?
}

struct PasskeyList: Decodable {
    let passkeys: [PasskeyInfo]
    var rpId: String?
    var userHandle: String?
}

/// Runs the system passkey sheet for a sign-in or a registration.
@MainActor
final class PasskeyService: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    /// Set once a passkey was made or used on this phone: the sign-in screen
    /// then offers "Přihlásit přes passkey". Kept over a sign-out.
    nonisolated static let registeredKey = "passkey.registered"

    static var mayHaveOne: Bool { UserDefaults.standard.bool(forKey: registeredKey) }
    static func remember(_ has: Bool) { UserDefaults.standard.set(has, forKey: registeredKey) }

    private var continuation: CheckedContinuation<ASAuthorization, Error>?
    private var controller: ASAuthorizationController?

    /// Sign-in: the server's challenge, the phone's passkey, the server's cookie.
    /// Throws CancellationError when the user closed the sheet.
    func signIn(api: APIClient) async throws {
        let options = try await api.passkeyLoginOptions()
        guard let challenge = Self.decode(options.challenge) else { throw APIError.message(L10n.tr("Přístupový klíč se nepodařilo ověřit. Zkus to znovu.")) }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .required
        let authorization = try await perform(request)
        guard let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw APIError.message(L10n.tr("Přístupový klíč se nepodařilo ověřit. Zkus to znovu."))
        }
        let id = Self.encode(assertion.credentialID)
        let userHandle: JSONValue = assertion.userID.isEmpty ? JSONValue.null : JSONValue.string(Self.encode(assertion.userID))
        let credential: JSONObject = [
            "id": .string(id), "rawId": .string(id), "type": .string("public-key"),
            "authenticatorAttachment": .string("platform"),
            "clientExtensionResults": .object([:]),
            "response": .object([
                "clientDataJSON": .string(Self.encode(assertion.rawClientDataJSON)),
                "authenticatorData": .string(Self.encode(assertion.rawAuthenticatorData)),
                "signature": .string(Self.encode(assertion.signature)),
                "userHandle": userHandle
            ])
        ]
        do {
            _ = try await api.verifyPasskeyLogin(credential: credential)
        } catch APIError.unknownPasskey(let message) {
            // A passkey of a deleted account (or one removed in Settings on
            // another device): the Passwords app drops it, so it is not offered again.
            Self.reportUnknown(rpId: options.rpId, credentialID: assertion.credentialID)
            throw APIError.unknownPasskey(message)
        }
        Self.remember(true)
        // The other passkeys of this account the server no longer knows go too.
        _ = try? await api.passkeys()
    }

    /// Adds a passkey for the signed-in account ("Příště přes Face ID").
    func register(api: APIClient) async throws {
        let options = try await api.passkeyRegistrationOptions()
        guard let challenge = Self.decode(options.challenge), let userID = Self.decode(options.user.id) else {
            throw APIError.message(L10n.tr("Přístupový klíč se nepodařilo vytvořit."))
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rp.id)
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: options.user.name ?? "Aurin", userID: userID)
        request.userVerificationPreference = .required
        let authorization = try await perform(request)
        guard let registration = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestation = registration.rawAttestationObject else {
            throw APIError.message(L10n.tr("Přístupový klíč se nepodařilo vytvořit."))
        }
        let id = Self.encode(registration.credentialID)
        let credential: JSONObject = [
            "id": .string(id), "rawId": .string(id), "type": .string("public-key"),
            "authenticatorAttachment": .string("platform"),
            "clientExtensionResults": .object([:]),
            "response": .object([
                "clientDataJSON": .string(Self.encode(registration.rawClientDataJSON)),
                "attestationObject": .string(Self.encode(attestation)),
                "transports": .array([.string("internal"), .string("hybrid")])
            ])
        ]
        try await api.registerPasskey(credential: credential)
        Self.remember(true)
    }

    // MARK: - Keeping the Passwords app in step with the server (iOS 26)

    /// One passkey the server does not know.
    nonisolated static func reportUnknown(rpId: String, credentialID: Data) {
        guard #available(iOS 26.0, *) else { return }
        Task { try? await ASCredentialUpdater().reportUnknownPublicKeyCredential(relyingPartyIdentifier: rpId, credentialID: credentialID) }
    }

    /// Only the account's passkeys the server lists stay in the Passwords app.
    nonisolated static func prune(_ list: PasskeyList) {
        guard let rpId = list.rpId, let handle = list.userHandle.flatMap(decode) else { return }
        report(rpId: rpId, userHandle: handle, accepted: list.passkeys.compactMap { decode($0.id) })
    }

    /// After the account was deleted: none of its passkeys is any use.
    nonisolated static func forgetAccount(rpId: String, userHandle: String) {
        guard let handle = decode(userHandle) else { return }
        report(rpId: rpId, userHandle: handle, accepted: [])
    }

    nonisolated private static func report(rpId: String, userHandle: Data, accepted: [Data]) {
        guard #available(iOS 26.0, *) else { return }
        Task { try? await ASCredentialUpdater().reportAllAcceptedPublicKeyCredentials(relyingPartyIdentifier: rpId, userHandle: userHandle, acceptedCredentialIDs: accepted) }
    }

    // MARK: - The system sheet

    private func perform(_ request: ASAuthorizationRequest) async throws -> ASAuthorization {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<ASAuthorization, Error>) {
        controller = nil
        guard let continuation else { return }
        self.continuation = nil
        switch result {
        case .success(let authorization): continuation.resume(returning: authorization)
        case .failure(let error): continuation.resume(throwing: error)
        }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated { finish(.success(authorization)) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated {
            if let code = (error as? ASAuthorizationError)?.code, code == .canceled {
                finish(.failure(CancellationError()))
            } else {
                finish(.failure(error))
            }
        }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }

    // MARK: - base64url, as WebAuthn expects

    static func encode(_ data: Data) -> String {
        AuthService.base64url(data)
    }

    nonisolated static func decode(_ text: String) -> Data? {
        var s = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        return Data(base64Encoded: s)
    }
}
