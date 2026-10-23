import PhotosUI
import SwiftUI

/// "Co přidáme?": search your foods and the catalog, scan a barcode, look a
/// food up with AI, or type it in; below the recent or most eaten foods, or
/// the own recipes; then the amount (and the values, editable) and "Přidat".
struct AddFoodSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// The meal the food goes into; the header menu changes it.
    @State private var meal: String
    /// Straight to the camera, the scanner… when opened from the "+" menu.
    var start: FoodStart? = nil
    @State private var started = false
    @State private var galleryOpen = false
    @State private var galleryItem: PhotosPickerItem?
    @State private var query = ""
    @State private var results: [FoodProduct] = []
    @State private var recent: [FoodProduct] = []
    @State private var frequent: [FoodProduct] = []
    @State private var recipes: [FoodRecipe] = []
    /// The own foods (up to 100 of each list), matched on the phone while typing.
    @State private var saved: [FoodProduct] = []
    /// Answers of this sheet's searches, so backspace and typing again shows them at once.
    @State private var answers: [String: [FoodProduct]] = [:]
    @State private var tab = "foods"
    @AppStorage("foodListOrder") private var order = "recent"
    @State private var searching = false
    @State private var lookingUp = false
    @State private var message: String?
    @State private var path: [FoodRoute] = []
    @State private var scanning = false
    @State private var photoMode: String?
    @State private var readingPhoto = false

    init(meal: String, start: FoodStart? = nil) {
        _meal = State(initialValue: meal)
        self.start = start
    }

    var body: some View {
        NavigationStack(path: $path) {
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Co přidáme?").font(Typo.sentence(31, relativeTo: .title)).foregroundStyle(Palette.ink)
                        Spacer()
                        Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    MealMenu(selection: $meal).padding(.top, 6)

                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                        TextField("Hledat potravinu", text: $query)
                            .font(.system(size: 19))
                            .submitLabel(.search)
                            .autocorrectionDisabled()
                        if searching { ProgressView() }
                    }
                    .frame(height: 48)
                    .overlay(alignment: .bottom) { Rectangle().fill(Palette.ink.opacity(0.25)).frame(height: 1) }
                    .padding(.top, 18)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                        tile("Skenovat", "barcode.viewfinder") { scanning = true }
                        tile("Vyfotit", "camera") { photoMode = "portion" }
                        tile("Z galerie", "photo.on.rectangle") { galleryOpen = true }
                        tile("Etiketa", "doc.text.viewfinder") { photoMode = "label" }
                        tile("Ručně", "pencil") { path.append(.manual) }
                        tile("Dohledat AI", "sparkles") { Task { await lookUp() } }
                            .disabled(query.trimmingCharacters(in: .whitespaces).count < 2 || lookingUp || model.demo)
                    }
                    .padding(.top, 18)
                    if readingPhoto {
                        HStack(spacing: 8) { ProgressView(); Text("Čtu fotku…").font(Typo.small).foregroundStyle(Palette.muted) }.padding(.top, 12)
                    }

                    if let message {
                        Text(message).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 14)
                    }

                    if query.isEmpty {
                        Picker("Seznam", selection: $tab) {
                            Text("Potraviny").tag("foods")
                            Text("Recepty").tag("recipes")
                        }
                        .pickerStyle(.segmented)
                        .padding(.top, 22)
                        if tab == "foods" { foodList } else { recipeList }
                    } else {
                        VStack(spacing: 0) {
                            ForEach(results) { product in
                                Button { path.append(.amount(product)) } label: { ProductRow(product: product) }
                                    .buttonStyle(.plain)
                            }
                            if query.trimmingCharacters(in: .whitespaces).count >= 2 && !searching {
                                Button { Task { await lookUp() } } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Není tu, co hledáš?").font(Typo.sentence(15))
                                            Text("Dohledat „\(query)“ pomocí AI").font(Typo.caption).foregroundStyle(Palette.muted)
                                        }
                                        Spacer()
                                        if lookingUp { ProgressView() } else { Image(systemName: "sparkles").foregroundStyle(Palette.green) }
                                    }
                                    .padding(.vertical, 14)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .disabled(lookingUp || model.demo)
                            }
                        }
                        .padding(.top, 14)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .background(Palette.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: FoodRoute.self) { route in
                switch route {
                case .amount(let product): FoodAmountView(product: product, meal: meal, done: { dismiss() })
                case .photo(let product, let note): FoodAmountView(product: product, meal: meal, note: note, editing: true, done: { dismiss() })
                case .manual: ManualFoodView(meal: meal, name: query, done: { dismiss() })
                case .recipe: RecipeEditorView(saved: { Task { await loadRecent() }; path.removeLast() })
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .task(id: query) { await search() }
        .task { await loadRecent() }
        .onAppear(perform: begin)
        .photosPicker(isPresented: $galleryOpen, selection: $galleryItem, matching: .images)
        .onChange(of: galleryItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    await read(image, mode: "portion")
                }
                galleryItem = nil
            }
        }
        .fullScreenCover(isPresented: $scanning) { BarcodeScanSheet(meal: meal, onLogged: { dismiss() }) }
        .fullScreenCover(item: Binding(get: { photoMode.map { Named(name: $0) } }, set: { photoMode = $0?.name })) { mode in
            if mode.name == "label" {
                LabelCameraSheet { image in
                    photoMode = nil
                    Task { await read(image, mode: mode.name) }
                }
            } else {
                CameraPicker { image in
                    photoMode = nil
                    if let image { Task { await read(image, mode: mode.name) } }
                }
                .ignoresSafeArea()
            }
        }
    }

    private func begin() {
        guard !started, let start else { return }
        started = true
        switch start {
        case .photo: photoMode = "portion"
        case .label: photoMode = "label"
        case .scan: scanning = true
        case .gallery: galleryOpen = true
        case .manual: path.append(.manual)
        case .search: break
        }
    }

    private func tile(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 21))
                Text(title).font(.footnote.weight(.medium))
            }
            .foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 72)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { results = []; return }
        let key = Self.fold(q)
        if let known = answers[key] { results = known; return }
        // The own foods that match show at once; the server adds the rest.
        results = localMatches(key)
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled, !model.demo else { return }
        searching = true
        defer { searching = false }
        do {
            let found = try await model.api.searchFood(name: q)
            answers[key] = found
            if !Task.isCancelled { results = found }
            message = nil
        } catch {
            // Typing on cancels the previous search; URLSession then throws "cancelled".
            if !AppModel.isCancellation(error) { message = error.localizedDescription }
        }
    }

    /// "Poslední" or "Časté": the own foods by when or how often they were eaten.
    private var foodList: some View {
        let list = order == "frequent" ? frequent : recent
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                listChip("Poslední", "recent")
                listChip("Časté", "frequent")
            }
            .padding(.top, 14)
            if list.isEmpty {
                Text("Zatím tu nic není. Potraviny, které přidáš, se tu objeví příště.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
            }
            ForEach(list) { product in
                Button { path.append(.amount(product)) } label: { ProductRow(product: product) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func listChip(_ title: String, _ value: String) -> some View {
        Button { order = value } label: {
            Text(title).font(.footnote.weight(.medium))
                .foregroundStyle(order == value ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 14).frame(height: 32)
                .background(order == value ? Palette.button : Palette.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(order == value ? .isSelected : [])
    }

    /// The own recipes: one portion each, and "Nový recept".
    private var recipeList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { path.append(.recipe) } label: {
                Label("Nový recept", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(model.demo)
            .padding(.top, 14)
            if recipes.isEmpty {
                Text("Recept složíš ze surovin a pak ho přidáš jedním klepnutím, po porcích.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
            }
            ForEach(recipes) { recipe in
                Button { path.append(.amount(recipe.product)) } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(recipe.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                            Text(recipeLine(recipe)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        if let kcal = recipe.product.kcal(for: 1) {
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                Text(Fmt.int(kcal)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                                Text("kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                        }
                    }
                    .padding(.vertical, 14)
                    .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) {
                        Task {
                            // Off the list only once the server deleted it, else it'd come back later.
                            do {
                                try await model.api.deleteRecipe(id: recipe.id)
                                recipes.removeAll { $0.id == recipe.id }
                            } catch {
                                model.notice = L10n.f("Recept se nepodařilo smazat: %@", error.localizedDescription)
                            }
                        }
                    } label: { Label("Smazat recept", systemImage: "trash") }
                }
            }
        }
    }

    private func recipeLine(_ r: FoodRecipe) -> String {
        var parts = [L10n.tr("1 porce")]
        if let s = r.servings {
            let number = Fmt.decimal(s, digits: s.rounded() == s ? 0 : 1)
            parts.append(L10n.f("z %@ %@", number, Fmt.plural(Int(s), "porce", "porce", "porcí")))
        }
        let count = r.ingredients?.count ?? 0
        if count > 0 { parts.append("\(count) " + Fmt.plural(count, "surovina", "suroviny", "surovin")) }
        return parts.joined(separator: " · ")
    }

    /// Every query word starts a word of the name (no diacritics, any case).
    private func localMatches(_ key: String) -> [FoodProduct] {
        let wanted = key.split(separator: " ")
        var seen = Set<String>()
        return saved.filter { product in
            let words = Self.fold(product.name).split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            guard wanted.allSatisfy({ q in words.contains { $0.hasPrefix(q) } }) else { return false }
            return seen.insert(Self.fold(product.name + "|" + (product.brand ?? ""))).inserted
        }
        .prefix(12).map { $0 }
    }

    static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).lowercased()
            .split(separator: " ", omittingEmptySubsequences: true).joined(separator: " ")
    }

    /// The lists saved on the phone show at once; the server's answer replaces them.
    private func loadRecent() async {
        guard !model.demo else { recent = DemoData.foods; frequent = DemoData.foods; return }
        let latestKey = "foods-recent", oftenKey = "foods-frequent"
        if recent.isEmpty, let kept = SnapshotCache.load([FoodProduct].self, key: latestKey)?.value { recent = Array(kept.prefix(12)); saved = kept }
        if frequent.isEmpty, let kept = SnapshotCache.load([FoodProduct].self, key: oftenKey)?.value { frequent = Array(kept.prefix(12)); saved += kept }
        async let latest = model.api.personalFoods()
        async let often = model.api.personalFoods(frequent: true)
        async let own = model.api.recipes()
        let newest = try? await latest, most = try? await often
        if let newest { recent = Array(newest.prefix(12)); Self.keep(newest, key: latestKey) }
        if let most { frequent = Array(most.prefix(12)); Self.keep(most, key: oftenKey) }
        if newest != nil || most != nil { saved = (newest ?? []) + (most ?? []) }
        recipes = (try? await own) ?? []
    }

    private static func keep(_ foods: [FoodProduct], key: String) {
        if let data = try? JSONEncoder().encode(foods) { SnapshotCache.save(data, key: key) }
    }

    /// A photo of a meal or a nutrition label, read by AI on the server.
    private func read(_ image: UIImage, mode: String) async {
        guard !model.demo else { return }
        readingPhoto = true
        defer { readingPhoto = false }
        guard let jpeg = await image.jpegForUpload() else { return }
        do {
            let r = try await model.api.readFoodPhoto(jpeg, mode: mode)
            path.append(.photo(r.product, r.note))
            message = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func lookUp() async {
        lookingUp = true
        defer { lookingUp = false }
        do {
            if let product = try await model.api.lookupFood(name: query) {
                path.append(.amount(product))
                message = nil
            } else {
                message = "AI ji nedokázala dohledat ani odhadnout. Zadej ji ručně."
            }
        } catch {
            message = error.localizedDescription
        }
    }
}

enum FoodRoute: Hashable {
    case amount(FoodProduct)
    case photo(FoodProduct, String?)
    case manual
    case recipe
}

extension FoodProduct: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct ProductRow: View {
    let product: FoodProduct

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(product.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let kcal = product.kcal(for: product.defaultAmount) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(Fmt.int(kcal)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                    Text("kcal").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .contentShape(Rectangle())
    }

    private var subtitle: String {
        let amount = product.perPortion ? L10n.tr("1 porce") : Fmt.int(product.defaultAmount) + " " + product.unit
        let source: String? = switch product.source {
        case "personal", "manual": L10n.tr("moje potravina")
        case "recipe", "composed": L10n.tr("moje jídlo")
        case "ai", "ai_lookup": L10n.tr("dohledáno AI")
        default: product.source == nil ? nil : L10n.tr("katalog")
        }
        return [product.brand, amount, source].compactMap { $0 }.joined(separator: " · ")
    }
}

/// How much: the amount in the food's unit, the values for it and "Přidat".
/// The values, the name and the brand can be corrected (opened right away
/// after a photo, where AI only estimates them).
struct FoodAmountView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let product: FoodProduct
    let meal: String
    /// What the AI was unsure about, after a photo.
    var note: String? = nil
    var editing = false
    var done: () -> Void = {}
    /// Another meal than the one the food was opened for.
    @State private var chosenMeal: String?
    @State private var amount = ""
    @State private var saving = false
    @State private var error: String?
    @State private var edit = false
    /// "Co nesedí?" open, and the report sent from here.
    @State private var reporting = false
    @State private var reportedNow = false
    @State private var filled = false
    @State private var name = ""
    @State private var brand = ""
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var sugar = ""
    @State private var fat = ""
    @State private var fiber = ""

    private var target: String { chosenMeal ?? meal }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }
                    Spacer()
                    if product.canReport && !model.demo {
                        Button { reporting = true } label: {
                            Image(systemName: mine ? "flag.fill" : "flag").font(.system(size: 19, weight: .medium))
                                .foregroundStyle(Palette.rust).frame(width: 44, height: 44, alignment: .trailing)
                        }
                        .buttonStyle(.plain)
                        .disabled(mine)
                        .accessibilityLabel(L10n.tr(mine ? "Nahlášeno" : "Hodnoty nesedí"))
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(current.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    if product.source == "ai-estimate" { AIEstimateTag() }
                    HStack(spacing: 8) {
                        if let brand = current.brand { Text(brand).font(Typo.small).foregroundStyle(Palette.muted) }
                        if product.canReport && (product.reported == true || reportedNow) { ReportedTag() }
                    }
                }
                // The same card as after a scan (BarcodeScanSheet): the values, then the wheel.
                NutritionCells(product: current, amount: value ?? 0)
                VStack(alignment: .leading, spacing: 4) {
                    PortionWheel(product: current, amount: Binding(get: { value ?? 0 }, set: { amount = String(($0 * 10).rounded() / 10) }))
                        .id(current.unit + (current.usableServing.map(Self.text) ?? "") + (current.serving_name ?? ""))
                    if !current.perPortion, let size = current.usableServing {
                        Text(L10n.f("1 %@ = %@ %@ · %@ kcal", current.servingName, Self.text(size), current.unit, Fmt.int(current.kcal(for: size))))
                            .font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                if let note {
                    Label(note, systemImage: "sparkles").font(Typo.caption).foregroundStyle(Palette.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button { withAnimation(.easeOut(duration: 0.2)) { edit.toggle() } } label: {
                    HStack {
                        Label("Upravit hodnoty a značku", systemImage: "slider.horizontal.3").font(Typo.bodyStrong)
                        Spacer()
                        Image(systemName: edit ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(Palette.ink)
                }
                .buttonStyle(.plain)
                if edit {
                    SettingsGroup(title: product.perPortion ? "Jedna porce" : L10n.f("Na 100 %@", product.unit),
                                  footer: product.canSuggest && !product.perPortion ? L10n.tr("Oprava zároveň odejde ke kontrole, aby se opravila i v katalogu pro ostatní.") : nil) {
                        SettingsField(title: "Název", text: $name, keyboard: .default, placeholder: "Potravina")
                        SettingsDivider()
                        SettingsField(title: "Výrobce, značka", text: $brand, keyboard: .default, placeholder: "nepovinné")
                        SettingsDivider()
                        SettingsField(title: "Energie", text: $kcal, unit: "kcal")
                        SettingsDivider()
                        SettingsField(title: "Bílkoviny", text: $protein, unit: "g")
                        SettingsDivider()
                        SettingsField(title: "Sacharidy", text: $carbs, unit: "g")
                        SettingsDivider()
                        SettingsField(title: "z toho cukry", text: $sugar, unit: "g")
                        SettingsDivider()
                        SettingsField(title: "Tuky", text: $fat, unit: "g")
                        SettingsDivider()
                        SettingsField(title: "Vláknina", text: $fiber, unit: "g")
                    }
                }

                // Without energy the food would count as 0 kcal (forLogging fills zeros).
                if current.calories_100g == nil {
                    Text("Doplň energii v kcal, jinak by se jídlo počítalo jako 0 kcal.").font(Typo.small).foregroundStyle(Palette.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                MealMenu(selection: Binding(get: { target }, set: { chosenMeal = $0 }))
                Button { Task { await save() } } label: {
                    Text(saving ? L10n.tr("Ukládám…") : MealSlot.addText(target)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || value == nil || current.name.isEmpty || current.calories_100g == nil)
                if reportedNow {
                    Label("Díky, nahlášeno.", systemImage: "checkmark").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .labelStyle(ReportedLabelStyle())
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).frame(height: 48)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .transition(.opacity)
                }
            }
            .padding(24)
        }
        .background(Palette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear(perform: fill)
        .sheet(isPresented: $reporting) {
            FoodReportSheet(product: product) { withAnimation { reportedNow = true } }
                .presentationDetents([.medium, .large])
                .presentationBackground(Palette.background)
        }
    }

    /// The flag is filled once this user reported the food.
    private var mine: Bool { reportedNow || product.reported_by_me == true }

    private func fill() {
        guard !filled else { return }
        filled = true
        // Missing energy: the values open right away to fill it in.
        edit = editing || product.calories_100g == nil
        if amount.isEmpty { amount = Self.text(product.defaultAmount) }
        name = product.name
        brand = product.brand ?? ""
        kcal = product.calories_100g.map(Self.text) ?? ""
        protein = product.protein_100g.map(Self.text) ?? ""
        carbs = product.carbs_100g.map(Self.text) ?? ""
        sugar = product.sugars_100g.map(Self.text) ?? ""
        fat = product.fat_100g.map(Self.text) ?? ""
        fiber = product.fiber_100g.map(Self.text) ?? ""
    }

    /// The product with the corrections.
    private var current: FoodProduct {
        guard filled else { return product }
        var p = product
        p.name = name.trimmingCharacters(in: .whitespaces)
        p.brand = brand.trimmingCharacters(in: .whitespaces).nilIfBlank
        p.calories_100g = Self.number(kcal)
        p.protein_100g = Self.number(protein)
        p.carbs_100g = Self.number(carbs)
        p.sugars_100g = Self.number(sugar)
        p.fat_100g = Self.number(fat)
        p.fiber_100g = Self.number(fiber)
        return p
    }

    static func text(_ value: Double) -> String {
        Fmt.decimal(value, digits: value.rounded() == value ? 0 : 1)
    }

    static func number(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: "\u{00a0}", with: ""))
    }

    private var value: Double? {
        guard let v = Double(amount.replacingOccurrences(of: ",", with: ".")), v > 0 else { return nil }
        return v
    }

    private func save() async {
        guard let value else { return }
        saving = true
        defer { saving = false }
        var corrected = current
        // A corrected catalogue food stays the user's own until the owner approves it.
        let changed = product.canSuggest && corrected.values != product.values
        if changed { corrected.origin = "edited" }
        if let message = await model.logFood(product: corrected, amount: value, meal: target) {
            error = message
        } else {
            if changed { sendCorrection(corrected) }
            done()
        }
    }

    /// A food from the catalog with other values than it had: the owner gets
    /// the change to approve for everyone (Nastavení → Návrhy oprav potravin,
    /// src/food-suggestions.js). The user's own copy is already fixed.
    private func sendCorrection(_ corrected: FoodProduct) {
        guard !model.demo, !product.perPortion else { return }
        let api = model.api, before = product
        // In the background: a refused suggestion (daily limit) must not hold up the food.
        Task.detached { try? await api.suggestFoodCorrection(before: before, after: corrected) }
    }
}

struct NutritionCells: View {
    let product: FoodProduct
    let amount: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                cell(Fmt.int(product.kcal(for: amount)), "kcal", first: true)
                cell(Fmt.int(product.grams(product.protein_100g, for: amount)) + " g", "bílkoviny")
                cell(Fmt.int(product.grams(product.carbs_100g, for: amount)) + " g", "sacharidy")
                cell(Fmt.int(product.grams(product.fat_100g, for: amount)) + " g", "tuky")
            }
            .fixedSize(horizontal: false, vertical: true)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            let extra = extras
            if !extra.isEmpty {
                Text(extra.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
    }

    /// "z toho cukry 5,6 g · vláknina 2 g", for what the food has.
    private var extras: [String] {
        var out: [String] = []
        if let g = product.grams(product.sugars_100g, for: amount) { out.append(L10n.f("z toho cukry %@", Self.grams(g))) }
        if let g = product.grams(product.fiber_100g, for: amount) { out.append(L10n.f("vláknina %@", Self.grams(g))) }
        return out
    }

    static func grams(_ value: Double) -> String {
        Fmt.decimal(value, digits: value < 10 ? 1 : 0) + " g"
    }

    private func cell(_ value: String, _ label: String, first: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(Typo.number(24)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
        .padding(.leading, first ? 0 : 10)
        .overlay(alignment: .leading) { if !first { Rectangle().fill(Palette.hairline).frame(width: 1) } }
    }
}

/// A food typed in: name and the values of one portion.
struct ManualFoodView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let meal: String
    @State var name: String
    var done: () -> Void = {}
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbs = ""
    @State private var fat = ""
    @State private var saving = false
    @State private var error: String?
    @State private var chosenMeal: String?

    init(meal: String, name: String = "", done: @escaping () -> Void = {}) {
        self.meal = meal
        _name = State(initialValue: name)
        self.done = done
    }

    private var target: String { chosenMeal ?? meal }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 20) {
                CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }
                Text("Zadat ručně").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                SettingsGroup(title: "Jedna porce") {
                    SettingsField(title: "Název", text: $name, keyboard: .default, placeholder: "Kuřecí rizoto")
                    SettingsDivider()
                    SettingsField(title: "Energie", text: $kcal, unit: "kcal", keyboard: .numberPad)
                    SettingsDivider()
                    SettingsField(title: "Bílkoviny", text: $protein, unit: "g")
                    SettingsDivider()
                    SettingsField(title: "Sacharidy", text: $carbs, unit: "g")
                    SettingsDivider()
                    SettingsField(title: "Tuky", text: $fat, unit: "g")
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                MealMenu(selection: Binding(get: { target }, set: { chosenMeal = $0 }))
                Button { Task { await save() } } label: {
                    Text(saving ? L10n.tr("Ukládám…") : MealSlot.addText(target)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty || number(kcal) == nil)
            }
            .padding(24)
        }
        .background(Palette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private func number(_ text: String) -> Double? { Double(text.replacingOccurrences(of: ",", with: ".")) }

    private func save() async {
        let product = FoodProduct(name: name.trimmingCharacters(in: .whitespaces), calories_100g: number(kcal), protein_100g: number(protein) ?? 0,
                                  carbs_100g: number(carbs) ?? 0, fat_100g: number(fat) ?? 0, nutrition_basis: "portion", source: "manual")
        saving = true
        defer { saving = false }
        if let message = await model.logFood(product: product, amount: 1, meal: target) { error = message } else { done() }
    }
}

/// The meal the food goes into, as a small menu of the day's meals.
struct MealMenu: View {
    @Environment(AppModel.self) private var model
    @Binding var selection: String

    private var choices: [MealSlot.Slot] {
        let chosen = Set(model.food?.mealSlots ?? MealSlot.usual).union([selection])
        return MealSlot.all.filter { chosen.contains($0.id) }
    }

    var body: some View {
        Menu {
            Picker("Jídlo", selection: $selection) {
                ForEach(choices) { slot in Text(LocalizedStringKey(slot.label)).tag(slot.id) }
            }
        } label: {
            HStack(spacing: 4) {
                Text(LocalizedStringKey(MealSlot.labels[selection] ?? "Jídlo"))
                Image(systemName: "chevron.up.chevron.down").font(.caption2)
            }
            .font(Typo.small.weight(.semibold)).foregroundStyle(Palette.ink)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Capsule().fill(Palette.ink.opacity(0.06)))
        }
    }
}

/// "Nahlášeno": a catalogue food someone reported and the owner hasn't settled.
struct ReportedTag: View {
    var body: some View {
        Label("Nahlášeno", systemImage: "flag.fill").labelStyle(.titleAndIcon)
            .font(.caption2.weight(.semibold)).foregroundStyle(Palette.amber).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Palette.amber.opacity(0.16), in: Capsule())
    }
}

private struct ReportedLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 10) { configuration.icon.foregroundStyle(Palette.green); configuration.title }
    }
}

/// "Co nesedí?": what is wrong with a catalogue food when the right values
/// aren't at hand, and a note; it reaches the owner (Návrhy oprav → Hlášení).
struct FoodReportSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let product: FoodProduct
    let sent: () -> Void
    @State private var reason = "values"
    @State private var note = ""
    @State private var sending = false
    @State private var error: String?

    static let reasons: [(code: String, title: String)] = [
        ("values", "Energie nebo živiny"), ("name", "Název nebo značka"),
        ("serving", "Velikost porce nebo balení"), ("other_product", "Pod kódem je jiný výrobek")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Co nesedí?").font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink).padding(.top, 8)
            SettingsGroup {
                ForEach(Array(Self.reasons.filter { $0.code != "other_product" || product.barcode != nil }.enumerated()), id: \.element.code) { index, item in
                    if index > 0 { SettingsDivider() }
                    Button { reason = item.code } label: {
                        HStack(spacing: 12) {
                            Image(systemName: reason == item.code ? "largecircle.fill.circle" : "circle")
                                .font(.system(size: 20)).foregroundStyle(reason == item.code ? Palette.ink : Palette.faint)
                            Text(LocalizedStringKey(item.title)).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(reason == item.code ? .isSelected : [])
                }
            }
            TextField("Poznámka, nepovinné", text: $note, axis: .vertical)
                .lineLimit(2...4).font(.body)
                .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            Button { Task { await send() } } label: {
                Text(sending ? L10n.tr("Odesílám…") : L10n.tr("Nahlásit")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(sending)
            Spacer(minLength: 0)
        }
        .padding(24)
    }

    private func send() async {
        sending = true
        defer { sending = false }
        do {
            try await model.api.reportFood(product, reason: reason, note: note.trimmingCharacters(in: .whitespacesAndNewlines))
            sent()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
