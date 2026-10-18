import Foundation

// Corrections of catalogue foods (src/food-suggestions.js): the user's corrected
// copy is saved for them, a suggestion waits for the owner, who approves or
// rejects it in Nastavení → Návrhy oprav potravin.

struct FoodSuggestion: Decodable, Identifiable, Equatable {
    let id: Int
    let userId: Int
    let barcode: String?
    let name: String
    let before: JSONObject
    let after: JSONObject
    let changes: [String]
    let status: String
    let createdAt: String?
    let fromUser: FromUser?

    struct FromUser: Decodable, Equatable {
        let sent: Int
        let approved: Int
    }
}

struct FoodSuggestionList: Decodable {
    let suggestions: [FoodSuggestion]
    let counts: [String: Int]?
}

extension APIClient {
    /// Saves the corrected food as the user's own (it stays private: origin "edited").
    func savePersonalFood(_ product: FoodProduct) async throws -> FoodProduct {
        struct Response: Decodable { let product: FoodProduct? }
        var p = product
        p.origin = "edited"
        let response: Response = try await send("/app/api/food/personal", method: "POST", body: p.forLogging)
        return response.product ?? p
    }

    func suggestFoodCorrection(before: FoodProduct, after: FoodProduct) async throws {
        struct Body: Encodable { let before: FoodProduct; let after: FoodProduct }
        let _: JSONValue = try await send("/app/api/food/suggestions", method: "POST", body: Body(before: before, after: after))
    }

    /// The owner only: pending, approved or rejected suggestions.
    func foodSuggestions(status: String = "pending") async throws -> FoodSuggestionList {
        try await get("/app/api/food/suggestions?status=" + status)
    }

    /// The owner only: "approve" or "reject".
    func decideFoodSuggestion(id: Int, decision: String) async throws {
        let _: JSONValue = try await send("/app/api/food/suggestions/decide", method: "POST",
                                          body: ["id": JSONValue.number(Double(id)), "decision": .string(decision)])
    }
}
