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
    /// Up to three nutrients pinned under the macros (Pro; Živiny → Upravit).
    var nutrients: [NutrientItem]? = nil
    /// Nastavení → Výživa → Strava as it applies today (src/diet.js).
    var diet: Diet? = nil
    /// The day's target in its parts: base, workouts done and planned
    /// (targetParts in src/app-food.js). None with an own calorie goal.
    var targetParts: TargetParts? = nil

    struct TargetParts: Decodable, Equatable {
        let base: Double
        let workouts: Double
        let planned: Double
        /// The share of a workout's burn the target takes (0.7).
        var coverage: Double? = nil
        var lines: Lines? = nil
        var items: [Item]? = nil

        /// The base line by line; they add up to `base`.
        struct Lines: Decodable, Equatable {
            let restingBurn: Double
            let movement: Double
            /// The weight goal (negative when losing weight).
            let goal: Double
            /// What the safe minimum holds the base up by.
            let minimum: Double
            /// What the watch measured above a usual day.
            let moreActive: Double
        }

        /// One workout: "done" or "planned", what it burns and what it adds.
        struct Item: Decodable, Equatable {
            let kind: String
            var type: String? = nil
            var name: String? = nil
            var minutes: Double? = nil
            let kcal: Double
            let counted: Double
        }
    }

    struct Amount: Decodable, Equatable {
        let eaten: Double?
        let target: Double?
        /// Keto and less carbs: the carbs are a limit, not a target to eat up.
        var limit: Bool? = nil
        /// Keto: net carbs (fibre is not counted).
        var net: Bool? = nil
    }

    /// What the athlete eats and how the day's calories are split.
    struct Diet: Decodable, Equatable {
        /// everything, pescatarian, vegetarian, vegan
        var eating: String? = nil
        /// balanced, high_protein, lower_carb, keto, custom
        var style: String? = nil
        var proteinPerKg: Double? = nil
        var proteinAuto: Bool? = nil
        var proteinPerMealG: Double? = nil
        var carbsLimitG: Double? = nil
        var netCarbs: Bool? = nil
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
        var salt: Double? = nil
        /// Logged in another app and read from Apple Health ("Yazio"), or such
        /// a food moved in Aurin: only its meal and day change here.
        var app: String? = nil
        /// Values estimated by AI (no such product was found): "AI odhad".
        var estimate: Bool? = nil
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
        /// Logged in another app and read from Apple Health; not editable here.
        var app: String? = nil
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
    /// Vitamins and minerals per 100 g from the catalogue (src/micronutrients.js keys).
    var micros_100g: [String: Double]?
    var catalog_key: String?
    /// What one serving is called ("sušenka"); "porce" when not set.
    var serving_name: String?
    /// "edited": a catalogue food the user corrected, kept to themselves
    /// until the owner approves the suggestion (src/food-suggestions.js).
    var origin: String?
    /// A catalogue food someone reported ("Hodnoty nesedí") and the owner
    /// hasn't settled yet; reported_by_me when this user did.
    var reported: Bool?
    var reported_by_me: Bool?

    enum CodingKeys: String, CodingKey {
        case name, brand, calories_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugars_100g, salt_100g
        case nutrition_basis, serving_size, quantity, barcode, source, source_url, micros_100g, catalog_key, serving_name, origin
        case reported, reported_by_me
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
        micros_100g = try? c.decodeIfPresent([String: Double].self, forKey: .micros_100g)
        catalog_key = value(.catalog_key)?.string
        serving_name = value(.serving_name)?.string?.nilIfBlank
        origin = value(.origin)?.string
        reported = try? c.decodeIfPresent(Bool.self, forKey: .reported)
        reported_by_me = try? c.decodeIfPresent(Bool.self, forKey: .reported_by_me)
    }

    var id: String { (barcode ?? "") + "|" + name + "|" + (brand ?? "") + "|" + (source ?? "") }

    var perPortion: Bool { nutrition_basis == "portion" }
    var unit: String { perPortion ? "portion" : nutrition_basis == "ml" ? "ml" : "g" }

    /// The amount offered first: a serving, else the package, else 100.
    var defaultAmount: Double {
        if perPortion { return 1 }
        if let s = usableServing { return s }
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

    /// A size in the food's own unit: 1000 from "1 kg" for grams, 500 from
    /// "0,5 l" for ml. nil for "2 x 125 g", where the first number is a count.
    static func size(_ value: JSONValue?, unit: String) -> Double? {
        guard let n = leadingNumber(value), n > 0 else { return nil }
        guard case .string(let s) = value else { return n }
        let text = s.lowercased()
        if text.contains("x") || text.contains("×") { return nil }
        if unit == "g", text.range(of: #"\d\s*kg"#, options: .regularExpression) != nil { return n * 1000 }
        if unit == "ml", text.range(of: #"\d\s*l\b"#, options: .regularExpression) != nil { return n * 1000 }
        return n
    }

    /// What ¼, ½ or 2 are counted from: one serving, else the whole package.
    var portionReference: (size: Double, name: String)? {
        if perPortion { return (1, L10n.tr("porce")) }
        if let s = usableServing { return (s, L10n.tr("porce")) }
        if let q = Self.size(quantity, unit: unit) { return (q, L10n.tr("balení")) }
        return nil
    }

    /// One serving in the food's unit when it means something: a serving stored
    /// as "1 g" (some catalogue records) does not.
    var usableServing: Double? {
        guard !perPortion, let s = Self.size(serving_size, unit: unit), s >= 2 else { return nil }
        return s
    }

    /// The serving's name: "sušenka", else "porce".
    var servingName: String { serving_name ?? L10n.tr("porce") }

    /// The nutrition values, to compare before and after a correction.
    var values: JSONObject {
        var out: JSONObject = ["name": .string(name)]
        if let brand { out["brand"] = .string(brand) }
        if let s = serving_size?.string { out["serving_size"] = .string(s) }
        if let serving_name { out["serving_name"] = .string(serving_name) }
        if let quantity = quantity?.string { out["quantity"] = .string(quantity) }
        for (key, value) in [("calories_100g", calories_100g), ("protein_100g", protein_100g), ("carbs_100g", carbs_100g),
                             ("sugars_100g", sugars_100g), ("fat_100g", fat_100g), ("fiber_100g", fiber_100g)] {
            if let value { out[key] = .number(value) }
        }
        return out
    }

    /// From the shared catalog or an AI lookup, so a correction concerns everyone.
    var isShared: Bool { !["personal", "manual", "recipe", "composed"].contains(source ?? "") }

    /// A correction of it can be suggested for everyone: a catalogue food, or
    /// the user's own corrected copy of one.
    /// "Hodnoty nesedí" can be sent: a food from a catalogue, not one the user
    /// saved, AI found or read from a photo.
    var canReport: Bool { isShared && !["ai", "ai-estimate", "photo", "package_label"].contains(source ?? "") && origin != "edited" }

    var canSuggest: Bool { (isShared && source != "ai-estimate" && source != "ai") || origin == "edited" }

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

/// One nutrient of GET /app/api/food/nutrients (src/micronutrients.js): the
/// day's or the week's average against the target, or locked without Pro.
struct NutrientItem: Decodable, Equatable, Identifiable {
    let key: String
    let name: String
    let unit: String
    /// main, min or vit.
    let group: String
    var eaten: Double? = nil
    var target: Double? = nil
    var limit: Bool = false
    var locked: Bool = false
    var percent: Double? = nil
    var known: Bool? = nil

    var id: String { key }

    /// Under half the target: shown in rust.
    var low: Bool { !limit && !locked && (percent ?? 100) <= 50 }
    var over: Bool { limit && (eaten ?? 0) > (target ?? .infinity) }

    /// "9 / 18 mg", "41 / max 66 g".
    var text: String {
        let value = Self.amount(eaten ?? 0)
        guard let target else { return value + " " + unit }
        return value + (limit ? " / max " : " / ") + Self.amount(target) + " " + unit
    }

    static func amount(_ v: Double) -> String {
        v >= 100 ? Fmt.int(v) : v >= 10 ? Fmt.decimal(v, digits: v.rounded() == v ? 0 : 1) : Fmt.decimal(v, digits: v < 1 && v > 0 ? 2 : 1)
    }
}

struct NutrientsPage: Decodable, Equatable {
    let days: Int
    let pro: Bool
    let meals: Int
    let withMicros: Int
    let items: [NutrientItem]
    var coach: String? = nil
    var favorites: [String] = []
}

/// GET /app/api/food/nutrients?key=…: one nutrient with today's meals and rich foods.
struct NutrientDetail: Decodable, Equatable {
    struct Source: Decodable, Equatable, Hashable { let name: String; let amount: Double }
    struct Rich: Decodable, Equatable, Hashable { let name: String; let per100: Double }
    let key: String
    let name: String
    let unit: String
    var limit: Bool = false
    var eaten: Double? = nil
    var target: Double? = nil
    var percent: Double? = nil
    var weekPercent: Double? = nil
    var sources: [Source] = []
    var richTitle: String? = nil
    var rich: [Rich] = []
    /// The Target row: Aurin's value, the user's own one, the upper limit
    /// (EFSA) and why Auto is higher ("vegetarian", "vegan").
    var autoTarget: Double? = nil
    var custom: Bool? = nil
    var upperLimit: Double? = nil
    var autoBasis: String? = nil
    /// Aurin Pro: only then can the target be one's own.
    var pro: Bool? = nil
}
