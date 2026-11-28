import SwiftUI

/// The recipe library of the food version (src/recipes.js): Jídlo → Recepty
/// lists the saved recipes and the library with search; a recipe shows its
/// portion, ingredients, steps and allergens, saves with the heart and logs one
/// portion. The server answers only where the library is on (staging, and the
/// owner's account on the live server until the food version ships), so Jídlo
/// shows "Recepty" only when the saved recipes load (Petr 2026-11-27, build N.2).
/// No photos yet.
extension EnvironmentValues {
    /// Jídlo shows "Recepty" (FoodView loads the saved recipes once).
    @Entry var recipesOn = false
}

struct LibraryRecipe: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
    let slot: String?
    let minutes: Int?
    let allergens: [String]?
    let kcal: Double?
    let protein: Double?
    let carbs: Double?
    let fat: Double?
}

struct LibraryRecipePage: Decodable {
    let recipes: [LibraryRecipe]
    let total: Int?
    let next: String?
}

struct RecipeMarks: Decodable, Equatable {
    var saved: [String]
    var hidden: [String]
}

/// One recipe in the app's language (the library's whole record).
struct LibraryRecipeDetail: Decodable, Equatable {
    let id: String
    let title: String
    let total_min: Int?
    let servings_base: Double?
    let allergens: [String]?
    let components: [Component]?
    let phases: [Phase]?
    let nutrition_per_serving: Nutrition?

    struct Component: Decodable, Equatable { let items: [Item]? }
    struct Item: Decodable, Equatable { let display: String?; let grams: Double? }
    struct Phase: Decodable, Equatable { let title: String?; let steps: [String]? }
    struct Nutrition: Decodable, Equatable { let kcal: Double?; let protein: Double?; let carbs: Double?; let fat: Double? }

    /// One portion to log, named as the recipe ("composed": not saved again as a food).
    var product: FoodProduct {
        let n = nutrition_per_serving
        var p = FoodProduct(name: title, calories_100g: n?.kcal, protein_100g: n?.protein, carbs_100g: n?.carbs, fat_100g: n?.fat)
        p.nutrition_basis = "portion"
        p.source = "composed"
        return p
    }
}

extension APIClient {
    func libraryRecipes(query: String, cursor: String? = nil) async throws -> LibraryRecipePage {
        var items = [URLQueryItem(name: "limit", value: "30")]
        if !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        var parts = URLComponents()
        parts.queryItems = items
        return try await get("/app/api/recipes" + (parts.url?.absoluteString ?? ""))
    }

    func libraryRecipe(id: String) async throws -> LibraryRecipeDetail {
        struct Response: Decodable { let recipe: LibraryRecipeDetail }
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let response: Response = try await get("/app/api/recipes/" + encoded)
        return response.recipe
    }

    func recipeMarks() async throws -> RecipeMarks {
        try await get("/app/api/recipes/marks")
    }

    /// "saved", "hidden" or nil (no mark).
    func markRecipe(id: String, mark: String?) async throws -> RecipeMarks {
        let body: JSONObject = ["id": .string(id), "mark": mark.map { .string($0) } ?? .null]
        return try await send("/app/api/recipes/marks", method: "PUT", body: body)
    }
}

/// Jídlo → Recepty: search, the saved recipes, then the library.
struct RecipesView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var marks: RecipeMarks?
    @State private var saved: [LibraryRecipe] = []
    @State private var list: [LibraryRecipe] = []
    @State private var next: String?
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: "Recepty", back: { dismiss() })
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                        TextField("Hledat recept", text: $query)
                            .scaledFont(19)
                            .submitLabel(.search)
                            .autocorrectionDisabled()
                        if loading { ProgressView() }
                    }
                    .frame(height: 48)
                    .overlay(alignment: .bottom) { Rectangle().fill(Palette.ink.opacity(0.25)).frame(height: 1) }
                    .padding(.top, 18)

                    if let error {
                        Text(error).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 16)
                    }
                    if query.isEmpty && !saved.isEmpty {
                        SectionLabel(text: "Uložené").padding(.top, 24).padding(.horizontal, 4)
                        rows(saved)
                    }
                    SectionLabel(text: query.isEmpty ? "Knihovna" : "Výsledky").padding(.top, 24).padding(.horizontal, 4)
                    if list.isEmpty && !loading && error == nil {
                        Text("Žádný recept to nenašlo.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 12)
                    } else {
                        rows(list, more: next != nil)
                    }
                }
                .padding(24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: "Recepty", pinTitle: true, coach: CoachEntry(view: "food")) { dismiss() }
        .navBarVisibility(.hidden)
        .task(id: query) {
            if !query.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            await load(reset: true)
        }
        .task { await loadSaved() }
    }

    /// The saved rows after a heart on a recipe page, without reading them again.
    private func keep(_ rows: [LibraryRecipe], _ recipe: LibraryRecipe, _ marks: RecipeMarks) -> [LibraryRecipe] {
        let all = rows.contains { $0.id == recipe.id } ? rows : [recipe] + rows
        return all.filter { marks.saved.contains($0.id) }
    }

    private func rows(_ recipes: [LibraryRecipe], more: Bool = false) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(recipes.enumerated()), id: \.element.id) { index, recipe in
                // The Food tab's path holds AppRoute only, so the detail is pushed as a destination.
                NavigationLink {
                    RecipeDetailView(row: recipe) { new in marks = new; saved = keep(saved, recipe, new) }
                } label: { RecipeRow(recipe: recipe, saved: marks?.saved.contains(recipe.id) == true) }
                    .buttonStyle(.plain)
                if index < recipes.count - 1 || more { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
            if more {
                Button { Task { await load(reset: false) } } label: {
                    Text("Další recepty").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.plain)
                .disabled(loading)
            }
        }
        .padding(.horizontal, 16)
        .cardSurface(cornerRadius: 22)
        .padding(.top, 8)
    }

    private func load(reset: Bool) async {
        loading = true
        do {
            let page = try await model.api.libraryRecipes(query: query.trimmingCharacters(in: .whitespaces), cursor: reset ? nil : next)
            list = reset ? page.recipes : list + page.recipes
            next = page.next
            error = nil
            loading = false
        } catch {
            // A newer search cancelled this one: the newer one shows its own answer.
            if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            self.error = error.localizedDescription
            loading = false
        }
    }

    /// The saved recipes, newest first: one detail read each (the list route has no ids filter), at most 20.
    private func loadSaved() async {
        do {
            let marks = try await model.api.recipeMarks()
            self.marks = marks
            var rows: [LibraryRecipe] = []
            for id in marks.saved.prefix(20) {
                if let d = try? await model.api.libraryRecipe(id: id) {
                    let n = d.nutrition_per_serving
                    rows.append(LibraryRecipe(id: d.id, title: d.title, slot: nil, minutes: d.total_min, allergens: d.allergens,
                                              kcal: n?.kcal, protein: n?.protein, carbs: n?.carbs, fat: n?.fat))
                }
            }
            saved = rows
        } catch { }
    }
}

struct RecipeRow: View {
    let recipe: LibraryRecipe
    var saved = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(recipe.title).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let minutes = recipe.minutes {
                    Text(Fmt.duration(minutes)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Spacer(minLength: 8)
            if saved {
                Image(systemName: "heart.fill").scaledFont(14).foregroundStyle(Palette.ink)
                    .accessibilityLabel(L10n.tr("Uložený"))
            }
            if let kcal = recipe.kcal {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(Fmt.int(kcal)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                    Text("kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
        }
        .padding(.vertical, 14)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

/// One library recipe: the portion's kcal and macros, the ingredients, what it
/// contains, the steps; the heart saves it, "Zapsat" logs one portion.
struct RecipeDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let row: LibraryRecipe
    /// nil until the saved recipes load; the heart waits for it.
    @State private var saved: Bool?
    var changed: (RecipeMarks) -> Void = { _ in }
    @State private var recipe: LibraryRecipeDetail?
    @State private var error: String?
    @State private var logging = false

    init(row: LibraryRecipe, changed: @escaping (RecipeMarks) -> Void = { _ in }) {
        self.row = row
        self.changed = changed
    }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: "", back: { dismiss() })
                    Text(recipe?.title ?? row.title).font(Typo.heading(31, relativeTo: .title)).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                    if let minutes = recipe?.total_min ?? row.minutes {
                        Text(Fmt.duration(minutes)).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 6)
                    }
                    macros.padding(.top, 18)

                    Button { logging = true } label: {
                        Text("Zapsat").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(recipe == nil || model.demo)
                    .padding(.top, 18)

                    if let error {
                        Text(error).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 16)
                    }
                    if let recipe {
                        content(recipe)
                    } else if error == nil {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    }
                }
                .padding(24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: "",
                      trailing: ChromeAction(systemImage: saved == true ? "heart.fill" : "heart",
                                             label: saved == true ? "Odebrat z uložených" : "Uložit recept", text: nil,
                                             enabled: saved != nil && !model.demo) { Task { await toggleSaved() } },
                      coach: CoachEntry(view: "food")) { dismiss() }
        .navBarVisibility(.hidden)
        .sheet(isPresented: $logging) {
            if let recipe {
                NavigationStack {
                    FoodAmountView(product: recipe.product, meal: MealSlot.now(slots: model.food?.mealSlots), done: { logging = false })
                }
            }
        }
        .task { await load() }
    }

    private var macros: some View {
        let n = recipe?.nutrition_per_serving
        let values: [(String, Double?, String, Color?)] = [
            ("kcal", n?.kcal ?? row.kcal, "", nil),
            ("Sacharidy", n?.carbs ?? row.carbs, " g", Palette.carbs),
            ("Bílkoviny", n?.protein ?? row.protein, " g", Palette.protein),
            ("Tuky", n?.fat ?? row.fat, " g", Palette.fat)
        ]
        return VStack(alignment: .leading, spacing: 8) {
            Text("Jedna porce").font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(alignment: .top, spacing: 0) {
                ForEach(values.indices, id: \.self) { index in
                    let (label, value, unit, color) = values[index]
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            if let color { Circle().fill(color).frame(width: 6, height: 6) }
                            Text(L10n.tr(label)).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Text(value.map { Fmt.int($0) + unit } ?? "–").font(Typo.number(24)).foregroundStyle(Palette.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }

    /// A number stays on the line of what follows it ("1.5 l", "20 cm"), and a
    /// range stays whole ("2–3 minutes").
    static func keepUnits(_ text: String) -> String {
        text.replacing(#/(\d) /#) { "\($0.1)\u{00A0}" }
            .replacing(#/(\d)–(\d)/#) { "\($0.1)–\u{2060}\($0.2)" }
    }

    @ViewBuilder private func content(_ recipe: LibraryRecipeDetail) -> some View {
        let items = (recipe.components ?? []).flatMap { $0.items ?? [] }.compactMap(\.display)
        SectionLabel(text: "Suroviny").padding(.top, 26).padding(.horizontal, 4)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                Text(Self.keepUnits(item)).font(Typo.body).foregroundStyle(Palette.ink).frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 11)
                if index < items.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
        }
        .padding(.horizontal, 16)
        .cardSurface(cornerRadius: 22)
        .padding(.top, 8)
        if let allergens = recipe.allergens, !allergens.isEmpty {
            Text(L10n.f("Obsahuje: %@. Zkontroluj etiketu.", allergens.map(Self.allergen).joined(separator: ", ")))
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10).padding(.horizontal, 4)
        }
        SectionLabel(text: "Postup").padding(.top, 26).padding(.horizontal, 4)
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array((recipe.phases ?? []).enumerated()), id: \.offset) { _, phase in
                VStack(alignment: .leading, spacing: 8) {
                    if let title = phase.title { Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.ink) }
                    ForEach(Array((phase.steps ?? []).enumerated()), id: \.offset) { _, step in
                        Text(Self.keepUnits(step)).font(Typo.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .padding(.top, 8)
    }

    static func allergen(_ key: String) -> String {
        switch key {
        case "gluten": return L10n.tr("lepek")
        case "crustaceans": return L10n.tr("korýši")
        case "eggs": return L10n.tr("vejce")
        case "fish": return L10n.tr("ryby")
        case "peanuts": return L10n.tr("arašídy")
        case "soy": return L10n.tr("sója")
        case "milk": return L10n.tr("mléko")
        case "tree_nuts": return L10n.tr("ořechy")
        case "celery": return L10n.tr("celer")
        case "mustard": return L10n.tr("hořčice")
        case "sesame": return L10n.tr("sezam")
        case "sulphites": return L10n.tr("siřičitany")
        case "lupin": return L10n.tr("vlčí bob")
        case "molluscs": return L10n.tr("měkkýši")
        default: return key
        }
    }

    private func load() async {
        async let marks = try? model.api.recipeMarks()
        do { recipe = try await model.api.libraryRecipe(id: row.id); error = nil }
        catch { self.error = error.localizedDescription }
        if let marks = await marks { saved = marks.saved.contains(row.id) }
    }

    private func toggleSaved() async {
        guard let now = saved else { return }
        let want = !now
        saved = want
        do {
            let marks = try await model.api.markRecipe(id: row.id, mark: want ? "saved" : nil)
            changed(marks)
        }
        catch { saved = now; self.error = error.localizedDescription }
    }
}
