import UIKit
import Vision

/// "Etiketa" for everyone (Free, ProContents.free): the nutrition table read on
/// the iPhone with Apple's text recognition, nothing uploaded and no AI spent.
/// AI reads the photo (src/food-photo.js) only when the phone missed a value
/// and the user has AI: Aurin Pro, or everyone during the pilot.
enum LabelReader {
    struct Reading {
        var product: FoodProduct
        var note: String?
        /// The energy doesn't match the macros (also part of note).
        var warning: String?
        /// Whether the user has AI; nil when it wasn't needed and not asked.
        var aiAccess: Bool?
    }

    static func read(_ image: UIImage, api: APIClient) async throws -> Reading {
        guard let jpeg = await image.jpegForUpload() else { throw APIError.message(L10n.tr(unreadable)) }
        let lines = (try? await Task.detached(priority: .userInitiated) { try textLines(jpeg) }.value) ?? []
        let values = LabelValues(lines: lines)
        if values.complete { return Reading(product: values.product) }
        // Asked only now: a whole table read on the phone works offline too.
        if (try? await api.subscription())?.aiAccess == true {
            let r = try await api.readFoodPhoto(jpeg, mode: "label")
            return Reading(product: r.product, note: r.note, warning: r.warning, aiAccess: true)
        }
        guard values.found else { throw APIError.message(L10n.tr(unreadable)) }
        let note = [L10n.tr("Některé hodnoty se nepodařilo přečíst. Doplň je podle etikety."), values.warning].compactMap { $0 }.joined(separator: " ")
        return Reading(product: values.product, note: note, warning: values.warning, aiAccess: false)
    }

    static let unreadable = "Hodnoty se nepodařilo přečíst. Vyfoť celou tabulku i s řádkem „na 100 g“, zblízka a rovně."

    /// The photo's text, one line per row of the table (left to right), top first.
    static func textLines(_ jpeg: Data) throws -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // Words and numbers of a table, not sentences to correct.
        request.usesLanguageCorrection = false
        // Czech first where the phone has it; without it, the words are read
        // without their accents, which LabelValues folds away anyway.
        let supported = (try? request.supportedRecognitionLanguages()) ?? []
        let wanted = ["cs", "sk", "de", "en"].flatMap { code in supported.filter { $0.hasPrefix(code) } }
        if !wanted.isEmpty { request.recognitionLanguages = wanted }
        try VNImageRequestHandler(data: jpeg, options: [:]).perform([request])
        return rows((request.results ?? []).compactMap { o in o.topCandidates(1).first.map { (o.boundingBox, $0.string) } })
    }

    /// Pieces of text at the same height are one row (Vision's boxes start at the bottom left).
    static func rows(_ boxes: [(CGRect, String)]) -> [String] {
        var rows: [[(CGRect, String)]] = []
        for box in boxes.sorted(by: { $0.0.midY > $1.0.midY }) {
            if let first = rows.last?.first, abs(first.0.midY - box.0.midY) < max(first.0.height, box.0.height) / 2 {
                rows[rows.count - 1].append(box)
            } else {
                rows.append([box])
            }
        }
        return rows.map { $0.sorted { $0.0.minX < $1.0.minX }.map(\.1).joined(separator: "  ") }
    }
}

/// The values per 100 g (or 100 ml) from the lines of a nutrition table, by the
/// rules of the server's parseNutritionLabel (src/food-label.js): energy in kcal
/// (or kJ / 4.184), the first number after each nutrient's word (the 100 g
/// column comes first on EU labels), "z toho" lines only for sugar, the table
/// read from its energy line. A US label's values per serving become per 100 g.
struct LabelValues: Equatable {
    var kcal, protein, carbs, fat, fiber, sugars, salt: Double?
    /// "g" or "ml"; nil when the label says neither per 100 g/ml nor a serving in grams.
    var basis: String?
    /// The grams of a US label's serving, its values already turned per 100 g.
    var serving: Double?

    /// Words of the table, accents and case folded ("Bílkoviny" → "bilkoviny").
    private static var fields: [(WritableKeyPath<LabelValues, Double?>?, String)] { [
        (\LabelValues.kcal, #"energ|brennwert|\bcalories\b|\bkalorie"#),
        (\LabelValues.sugars, #"cukr|\bsugars?\b|zucker"#),
        (\LabelValues.fiber, #"vlaknin|\bfib(?:er|re)\b|ballaststoff"#),
        (\LabelValues.carbs, #"sacharid|carbohydrate|kohlenhydrat"#),
        (\LabelValues.protein, #"b[ie]lkovin|\bproteins?\b|eiwei"#),
        (\LabelValues.fat, #"\btuky?\b|\bfats?\b|\bfett\b"#),
        (\LabelValues.salt, #"\bs[uo]l\b|\bsalt\b|\bsalz\b"#),
        // Lines under fat or carbs that aren't sugar: their numbers belong to no field.
        (nil, #"nasycen|saturat|gesattig|mastn|\btrans\b|polyol|skrob|starke|starch|from fat|cholesterol"#)
    ] }
    private static let number = #"(\d+(?:[.,]\d+)?)"#

    init(lines: [String]) {
        let folded = lines.map { $0.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX")).lowercased() }
        let text = folded.joined(separator: "\n")
        basis = Self.groups(#"(?<![\d.,])100\s*(g|ml)\b"#, in: text)?[1]
        // The table from its energy line: a word before it is usually the name ("Protein pudding 200 g").
        let start = folded.firstIndex { Self.groups(Self.fields[0].1, in: $0) != nil } ?? 0
        for line in folded[start...] + folded[..<start] { read(line) }
        if salt == nil, let sodium = Self.groups(#"\bsodium\b\D*?"# + Self.number + #"\s*(mg|g)?"#, in: text) {
            salt = (Self.value(sodium[1]) ?? 0) * (sodium[2] == "g" ? 1 : 0.001) * 2.5
        }
        if basis == nil, let line = folded.first(where: { $0.contains("serving size") }),
           let grams = Self.groups(Self.number + #"\s*g\b"#, in: line).flatMap({ Self.value($0[1]) }), grams > 0 {
            serving = grams
            basis = "g"
            for field in [\LabelValues.kcal, \.protein, \.carbs, \.fat, \.fiber, \.sugars, \.salt] {
                self[keyPath: field] = self[keyPath: field].map { $0 * 100 / grams }
            }
        }
    }

    /// Every field named on the line takes the text up to the next word of the
    /// table; one right after a sub-item ("saturated fat") is that sub-item.
    private mutating func read(_ line: String) {
        let whole = NSRange(line.startIndex..., in: line)
        var marks: [(range: Range<String.Index>, field: WritableKeyPath<LabelValues, Double?>?)] = []
        for (field, pattern) in Self.fields {
            for m in (try? NSRegularExpression(pattern: pattern))?.matches(in: line, range: whole) ?? [] {
                if let r = Range(m.range, in: line) { marks.append((r, field)) }
            }
        }
        marks.sort { $0.range.lowerBound < $1.range.lowerBound }
        for (i, mark) in marks.enumerated() {
            guard let field = mark.field, self[keyPath: field] == nil else { continue }
            if i > 0, marks[i - 1].field == nil,
               !line[min(marks[i - 1].range.upperBound, mark.range.lowerBound)..<mark.range.lowerBound].contains(where: \.isNumber) { continue }
            let end = i + 1 < marks.count ? marks[i + 1].range.lowerBound : line.endIndex
            let rest = String(line[mark.range.upperBound..<max(end, mark.range.upperBound)])
            self[keyPath: field] = field == \LabelValues.kcal ? Self.kcal(rest) : Self.groups(Self.number, in: rest).flatMap { Self.value($0[1]) }
        }
    }

    private static func kcal(_ text: String) -> Double? {
        if let pair = groups(#"kj\s*/\s*kcal\D*?"# + number + #"\s*/\s*"# + number, in: text) { return value(pair[2]) }
        if let kcal = groups(number + #"\s*kcal"#, in: text) { return value(kcal[1]) }
        if let kj = groups(#"(\d{1,2} \d{3}|\d+(?:[.,]\d+)?)\s*kj"#, in: text) { return value(kj[1]).map { ($0 / 4.184).rounded() } }
        // "Calories 230" on a US label.
        return groups(number, in: text).flatMap { value($0[1]) }
    }

    private static func value(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."))
    }

    private static func groups(_ pattern: String, in text: String) -> [String]? {
        guard let match = (try? NSRegularExpression(pattern: pattern))?.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (0..<match.numberOfRanges).map { Range(match.range(at: $0), in: text).map { String(text[$0]) } ?? "" }
    }

    /// Something of the table was read, and what it is per.
    var found: Bool { basis != nil && [kcal, protein, carbs, fat].contains { $0 != nil } }

    /// The whole table, believable and adding up: no AI needed.
    var complete: Bool {
        guard basis != nil, let kcal, let protein, let carbs, let fat else { return false }
        return kcal <= 950 && [protein, carbs, fat].allSatisfy { $0 <= 100 } && protein + carbs + fat <= 105 && warning == nil
    }

    /// The server's nutritionConsistency (src/food-label.js): 4/4/9 kcal per g, fibre 2.
    var warning: String? {
        guard let kcal, kcal >= 40, let protein, let carbs, let fat else { return nil }
        let estimate = 4 * protein + 4 * max(0, carbs) + 9 * fat + 2 * (fiber ?? 0)
        guard abs(estimate - kcal) > max(25, kcal * 0.2) else { return nil }
        return L10n.f("Energie %@ kcal nesedí s makroživinami (≈ %@ kcal). Zkontroluj přepis proti fotce.", Fmt.int(kcal), Fmt.int(estimate))
    }

    var product: FoodProduct {
        let tenth = { (v: Double?) in v.map { ($0 * 10).rounded() / 10 } }
        var p = FoodProduct(name: L10n.tr("Jídlo z fotky"), calories_100g: kcal.map { $0.rounded() }, protein_100g: tenth(protein),
                            carbs_100g: tenth(carbs), fat_100g: tenth(fat), nutrition_basis: basis == "ml" ? "ml" : "g",
                            serving_size: serving.map { JSONValue.string(Fmt.int($0) + " g") }, source: "package_label")
        p.fiber_100g = tenth(fiber)
        p.sugars_100g = tenth(sugars)
        p.salt_100g = salt.map { ($0 * 100).rounded() / 100 }
        return p
    }
}
