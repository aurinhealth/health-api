import Foundation

// What AI costs today (src/ai-total.js aiSpendingReport), for the owner in
// Nastavení → Správa → Útraty AI: each group of accounts against its own daily
// brake. Days are UTC days, like the brakes.

struct AISpending: Decodable {
    let today: Double
    let yesterday: Double
    let month: Double
    /// When the day (and every brake) starts again: the next UTC midnight.
    let resetsAt: String?
    let groups: [Group]

    struct Group: Decodable, Identifiable, Equatable {
        /// paid, gift, trial, testflight, free or system.
        let group: String
        let spent: Double
        /// USD; nil when the group has no brake.
        let brake: Double?
        /// Accounts the brake grows with; nil for a fixed brake.
        let accounts: Int?
        var id: String { group }
    }
}

extension APIClient {
    /// The owner only.
    func aiSpending() async throws -> AISpending {
        try await get("/app/api/admin/ai-spending")
    }
}
