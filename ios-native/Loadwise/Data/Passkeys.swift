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
        _ = try await api.verifyPasskeyLogin(credential: credential)
        Self.remember(true)
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

    static func decode(_ text: String) -> Data? {
        var s = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        return Data(base64Encoded: s)
    }
}
