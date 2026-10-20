import Foundation

// The website's waitlist (src/testflight-waitlist.js): e-mails that wait for
// the owner, who approves them into the TestFlight group in
// Nastavení → Testování → Zájemci.

struct WaitlistPerson: Decodable, Identifiable, Equatable {
    let id: Int
    let email: String
    let status: String
    let createdAt: String?
    let invitedAt: String?
}

struct Waitlist: Decodable {
    let pending: [WaitlistPerson]
    let invited: [WaitlistPerson]
    /// People in the TestFlight group; nil when Apple can't be asked (see error).
    let testers: Int?
    let limit: Int
    let error: String?
}

extension APIClient {
    /// The owner only.
    func waitlist() async throws -> Waitlist {
        try await get("/app/api/admin/waitlist")
    }

    /// The owner only: "approve" adds the person to TestFlight, "delete" takes them off the list.
    func decideWaitlist(id: Int, decision: String) async throws {
        let _: JSONValue = try await send("/app/api/admin/waitlist/decide", method: "POST",
                                          body: ["id": JSONValue.number(Double(id)), "decision": .string(decision)])
    }
}
