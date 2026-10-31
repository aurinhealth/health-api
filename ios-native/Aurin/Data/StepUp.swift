import Foundation

// "Confirm it's you" before a sensitive change (src/step-up.js): changing the
// e-mail, adding Face ID, downloading the data and deleting the account answer
// 403 step_up_required until the user confirms with a passkey of the account or
// a code sent to its e-mail. The server then sets a short-lived cookie, and the
// app runs the change again (Screens/SettingsPages/StepUpSheet.swift).
//   code:    POST /app/api/account/step-up/start → POST /app/api/account/step-up/verify
//   passkey: POST /app/api/account/step-up/passkey/options → the assertion → POST /app/api/account/step-up/passkey

/// How the account can confirm: with a passkey, and with a code to the masked address.
struct StepUpInfo: Decodable, Equatable, Sendable {
    let passkey: Bool
    let email: String?
}

/// The passkey challenge for the signed-in account, with its own passkeys only.
struct StepUpPasskeyOptions: Decodable {
    let challenge: String
    let rpId: String
    let allowCredentials: [Credential]

    struct Credential: Decodable { let id: String }
}

extension APIClient {
    func startStepUp() async throws {
        let _: JSONValue = try await send("/app/api/account/step-up/start", method: "POST", body: JSONObject())
    }

    func verifyStepUp(code: String) async throws {
        let _: JSONValue = try await send("/app/api/account/step-up/verify", method: "POST", body: ["code": JSONValue.string(code)])
    }

    func stepUpPasskeyOptions() async throws -> StepUpPasskeyOptions {
        try await send("/app/api/account/step-up/passkey/options", method: "POST", body: JSONObject())
    }

    func verifyStepUpPasskey(credential: JSONObject) async throws {
        let _: JSONValue = try await send("/app/api/account/step-up/passkey", method: "POST", body: ["credential": JSONValue.object(credential)])
    }
}
