import Foundation

/// GET /app/api/food-today (src/app-food.js): the Food screen.
struct FoodSnapshot: Decodable, Equatable {
    let date: String
    let kcal: Double?
    let target: Double?
    let trainingBonus: Double?
    let sentence: String?
    let macros: Macros
    let meals: [Meal]
    let water: Water
    /// The meals of the day the athlete chose (Nastavení → Jídla dne).
    var mealSlots: [String]? = nil

    struct Amount: Decodable, Equatable {
        let eaten: Double?
        let target: Double?
    }

    struct Macros: Decodable, Equatable {
        let carbs: Amount
        let protein: Amount
        let fat: Amount
        var fiber: Amount? = nil
        /// Sugars, against at most a tenth of the day's energy.
        var sugar: Amount? = nil
    }

    struct Entry: Decodable, Equatable, Identifiable {
        let id: Int
        let name: String
        let time: String?
        let meal: String
        let kcal: Double?
        let protein: Double?
        let carbs: Double?
        let fat: Double?
        let amount: String?
        let brand: String?
        var fiber: Double? = nil
        var sugar: Double? = nil
    }

    /// What to aim for in this meal (its share of the day's targets).
    struct Suggestion: Decodable, Equatable {
        let kcal: Double
        let protein: Double?
        var carbs: Double? = nil
        var fat: Double? = nil
    }

    struct Meal: Decodable, Equatable, Identifiable {
        /// breakfast, snack_am, lunch, snack_pm, dinner or snack_late.
        let type: String
        let label: String
        let time: String
        let kcal: Double?
        let entries: [Entry]
        /// What is left for this meal, while it is still ahead.
        let suggestion: Suggestion?
        /// The meal's part of the whole day's target.
        var target: Suggestion? = nil
        var id: String { type }
    }

    /// ml counts the drinks by how much they hydrate (coffee 90 %, beer 50 %…).
    struct Water: Decodable, Equatable {
        let ml: Double?
        let target: Double?
        let entries: Int
        /// All that was drunk, before the hydration factors.
        var drunkMl: Double? = nil
        var drinks: [Drink]? = nil
    }

    struct Drink: Decodable, Equatable, Identifiable {
        let id: Int
        /// water, tea, coffee, juice, milk, sport, soda, beer, wine or other.
        let kind: String
        let ml: Double?
        let hydrationMl: Double?
        let time: String?
    }
}

/// A food from POST /app/api/food/search or /food/ai-lookup (food-sources.js
/// productFromLabel): values per 100 g / 100 ml, or per portion.
struct FoodProduct: Codable, Equatable, Identifiable {
    var name: String
    var brand: String?
    var calories_100g: Double?
    var protein_100g: Double?
    var carbs_100g: Double?
    var fat_100g: Double?
    var fiber_100g: Double?
    var sugars_100g: Double?
    var salt_100g: Double?
    /// "g", "ml" or "portion".
    var nutrition_basis: String?
    /// Text such as "140 g" or a number, as the source had it.
    var serving_size: JSONValue?
    var quantity: JSONValue?
    var barcode: String?
    var source: String?
    var source_url: String?

    enum CodingKeys: String, CodingKey {
        case name, brand, calories_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g
        case nutrition_basis, serving_size, quantity, barcode, source, source_url
    }

    init(name: String, brand: String? = nil, calories_100g: Double? = nil, protein_100g: Double? = nil, carbs_100g: Double? = nil,
         fat_100g: Double? = nil, nutrition_basis: String? = "g", serving_size: JSONValue? = nil, barcode: String? = nil, source: String? = nil) {
        self.name = name
        self.brand = brand
        self.calories_100g = calories_100g
        self.protein_100g = protein_100g
        self.carbs_100g = carbs_100g
        self.fat_100g = fat_100g
        self.nutrition_basis = nutrition_basis
        self.serving_size = serving_size
        self.barcode = barcode
        self.source = source
    }

    /// Lenient: catalogs and personal foods store numbers as numbers or text.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let value = { (key: CodingKeys) in (try? c.decodeIfPresent(JSONValue.self, forKey: key)) ?? nil }
        name = value(.name)?.string ?? "Potravina"
        brand = value(.brand)?.string
        calories_100g = value(.calories_100g)?.number
        protein_100g = value(.protein_100g)?.number
        carbs_100g = value(.carbs_100g)?.number
        fat_100g = value(.fat_100g)?.number
        fiber_100g = value(.fiber_100g)?.number
        sugars_100g = value(.sugars_100g)?.number
        salt_100g = value(.salt_100g)?.number
        nutrition_basis = value(.nutrition_basis)?.string
        serving_size = value(.serving_size)
        quantity = value(.quantity)
        barcode = value(.barcode)?.string
        source = value(.source)?.string
        source_url = value(.source_url)?.string
    }

    var id: String { (barcode ?? "") + "|" + name + "|" + (brand ?? "") + "|" + (source ?? "") }

    var perPortion: Bool { nutrition_basis == "portion" }
    var unit: String { perPortion ? "portion" : nutrition_basis == "ml" ? "ml" : "g" }

    /// The amount offered first: a serving, else the package, else 100.
    var defaultAmount: Double {
        if perPortion { return 1 }
        if let s = Self.leadingNumber(serving_size), s > 0 { return s }
        if let q = Self.leadingNumber(quantity), q > 0, q <= 500 { return q }
        return 100
    }

    /// 140 from "140 g", 0.5 from "0,5 l" (the unit is the product's).
    static func leadingNumber(_ value: JSONValue?) -> Double? {
        if case .number(let n) = value { return n }
        guard case .string(let s) = value else { return nil }
        let digits = s.replacingOccurrences(of: ",", with: ".").prefix { $0.isNumber || $0 == "." }
        return Double(digits)
    }

    func kcal(for amount: Double) -> Double? {
        guard let c = calories_100g else { return nil }
        return perPortion ? c * amount : c * amount / 100
    }

    func grams(_ value: Double?, for amount: Double) -> Double? {
        guard let value else { return nil }
        return perPortion ? value * amount : value * amount / 100
    }
}

struct FoodSearchResponse: Decodable {
    let candidates: [FoodProduct]?
    let product: FoodProduct?
}

struct FoodLookupResponse: Decodable {
    let status: String?
    let product: FoodProduct?
}

/// POST /app/api/food/log.
/// The server wants all four values; a missing one counts as 0.
extension FoodProduct {
    var forLogging: FoodProduct {
        var p = self
        p.calories_100g = p.calories_100g ?? 0
        p.protein_100g = p.protein_100g ?? 0
        p.carbs_100g = p.carbs_100g ?? 0
        p.fat_100g = p.fat_100g ?? 0
        return p
    }
}

struct FoodLogRequest: Encodable {
    let date: String
    let product: FoodProduct
    let quantity: Double
    let unit: String
    let mealType: String
}

/// A saved recipe (GET /app/api/food/recipes, src/personal-recipes.js): the
/// ingredients with their values for the amount used, and one portion.
struct FoodRecipe: Decodable, Equatable, Identifiable {
    let id: String
    let name: String
    let servings: Double?
    let ingredients: [Ingredient]?
    let portion: FoodProduct?
    let calories: Double?

    struct Ingredient: Decodable, Equatable {
        let name: String
        let quantity: Double?
        let unit: String?
        let calories: Double?
    }

    /// One portion to log, named as the recipe.
    var product: FoodProduct {
        var p = portion ?? FoodProduct(name: name, nutrition_basis: "portion")
        p.name = name
        p.nutrition_basis = "portion"
        // "composed": logged as the recipe, not saved again as a food.
        p.source = "composed"
        return p
    }
}
