import Foundation

// The phone's APNs device token for the morning readiness push (src/push.js).

extension APIClient {
    /// POST /app/api/push/token: the hex token and "production" or "development".
    func registerPushToken(_ token: String, environment: String) async throws {
        let _: JSONValue = try await send("/app/api/push/token", method: "POST",
                                          body: ["token": JSONValue.string(token), "environment": .string(environment)])
    }

    /// DELETE /app/api/push/token: this phone's token off the account.
    func removePushToken(_ token: String) async throws {
        let _: JSONValue = try await send("/app/api/push/token", method: "DELETE", body: ["token": JSONValue.string(token)])
    }
}
