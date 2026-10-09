import Foundation

// "Nahlásit problém" (src/support-report.js): the user's description, an
// optional screenshot and the app's diagnostics go to the operator.

struct SupportReportResponse: Decodable {
    let status: String?
    let id: Int?
    let emailed: Bool?
    let message: String?
}

extension APIClient {
    /// The server keeps the report and e-mails it; a JPEG up to about 1 MB.
    func reportProblem(message: String, screenshot: Data?, diagnostics: JSONObject?) async throws -> SupportReportResponse {
        var body: JSONObject = ["message": .string(message)]
        if let screenshot { body["screenshot"] = .string(screenshot.base64EncodedString()) }
        if let diagnostics { body["diagnostics"] = .object(diagnostics) }
        return try await send("/app/api/support/report", method: "POST", body: body)
    }
}
