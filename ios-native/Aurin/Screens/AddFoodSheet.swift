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
    /// A food just added with "+" in Poslední/Časté, with its "Vrátit".
    @State private var added: PlanToast?
    @State private var searching = false
    /// The AI lookup or photo read this sheet waits for; it goes on in Jídlo
    /// when the sheet closes (AppModel+PendingFood.swift).
    @State private var current: UUID?
    /// Everything this sheet started, and the one whose food it shows.
    @State private var startedHere: [UUID] = []
    @State private var shown: UUID?
    @State private var message: String?
    @State private var path: [FoodRoute] = []
    @State private var scanning = false
    @State private var photoMode: String?
    /// Choosing a food for a meal photo's list (PhotoItemsView "Přidat
    /// položku"): only the search and the lists; the food comes back here.
    var pick: ((FoodProduct, Double) -> Void)? = nil
    /// "Přidat" on a food waiting in Jídlo: straight to its amount (or the photo's list).
    var pending: PendingFood? = nil

    init(meal: String, start: FoodStart? = nil, pick: ((FoodProduct, Double) -> Void)? = nil, pending: PendingFood? = nil) {
        _meal = State(initialValue: meal)
        self.start = start
        self.pick = pick
        self.pending = pending
    }

    private var working: PendingFood? {
        current.flatMap { id in model.pendingFoods.first { $0.id == id && $0.state == .looking } }
    }
    private var lookingUp: Bool { working.map { $0.query != nil } ?? false }
    private var readingPhoto: Bool { working.map { $0.query == nil } ?? false }

    var body: some View {
        NavigationStack(path: $path) {
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Co přidáme?").font(Typo.sentence(31, relativeTo: .title)).foregroundStyle(Palette.ink)
                        Spacer()
                        Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    if pick == nil { MealMenu(selection: $meal).padding(.top, 6) }

                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                        TextField("Hledat potravinu", text: $query)
                            .scaledFont(19)
                            .submitLabel(.search)
                            .autocorrectionDisabled()
                        if searching { ProgressView() }
                    }
                    .frame(height: 48)
                    .overlay(alignment: .bottom) { Rectangle().fill(Palette.ink.opacity(0.25)).frame(height: 1) }
                    .padding(.top, 18)

                    // One row, so the foods start higher (Petr vs Yazio 2026-11-09); while
                    // typing the results start right under the search. Dohledat AI is
                    // the row under the results: without words it can't look anything up.
                    if pick == nil, query.isEmpty { LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                        tile("Skenovat", "barcode.viewfinder") { scanning = true }
                        Menu {
                            Button { photoMode = "portion" } label: { Label("Vyfotit", systemImage: "camera") }
                            Button { galleryOpen = true } label: { Label("Z galerie", systemImage: "photo.on.rectangle") }
                        } label: { tileFace("Vyfotit", "camera") }
                        tile("Etiketa", "doc.text.viewfinder") { photoMode = "label" }
                        tile("Ručně", "pencil") { path.append(.manual) }
                    }
                    .padding(.top, 16) }
                    if readingPhoto {
                        CoachThinking(text: L10n.tr("AI čte fotku…")).padding(.top, 12)
                    } else if lookingUp {
                        CoachThinking(text: L10n.tr("AI dohledává potravinu…")).padding(.top, 12)
                    }

                    if let message {
                        Text(message).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 14)
                    }

                    if query.isEmpty {
                        HStack(spacing: 8) {
                            listChip("Poslední", "recent")
                            listChip("Časté", "frequent")
                            listChip("Recepty", "recipes")
                        }
                        .padding(.top, 16)
                        if tab == "foods" { foodList } else { recipeList }
                    } else {
                        VStack(spacing: 0) {
                            ForEach(results) { product in
                                Button { path.append(.amount(product)) } label: { ProductRow(product: product) }
                                    .buttonStyle(.plain)
                            }
                            if query.trimmingCharacters(in: .whitespaces).count >= 2 && !searching {
                                Button { lookUp() } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Není tu, co hledáš?").font(Typo.sentence(15))
                                            Text("Dohledat „\(query)“ pomocí AI").font(Typo.caption).foregroundStyle(Palette.muted)
                                        }
                                        Spacer()
                                        if lookingUp { CoachDots() } else { Image(systemName: "sparkles").foregroundStyle(Palette.green) }
                                    }
                                    .padding(.vertical, 14)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .disabled(lookingUp || model.demo)
                                if pick == nil {
                                    Button { path.append(.manual) } label: {
                                        HStack {
                                            Text("Zadat ručně").font(Typo.sentence(15))
                                            Spacer()
                                            Image(systemName: "pencil").foregroundStyle(Palette.muted)
                                        }
                                        .padding(.vertical, 14)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(.top, 14)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .background { Palette.background.ignoresSafeArea() }
            .overlay(alignment: .bottom) {
                if let added {
                    PlanToastView(toast: added) {
                        self.added = nil
                        if let undo = added.settle(undo: true) { Task { await undo() } }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.snappy, value: added?.id)
            // "Vrátit" stays a few seconds; the food is logged already.
            .task(id: added?.id) {
                guard let current = added else { return }
                try? await Task.sleep(for: .seconds(5))
                if added?.id == current.id { added = nil }
                _ = current.settle(undo: false)
            }
            .navBarVisibility(.hidden)
            .navigationDestination(for: FoodRoute.self) { route in
                switch route {
                case .amount(let product): FoodAmountView(product: product, meal: meal, pick: pick, done: finish)
                case .photo(let product, let note): FoodAmountView(product: product, meal: meal, note: note, editing: true, done: finish)
                case .items(let photoMeal): PhotoItemsView(meal: photoMeal, mealType: meal, done: finish)
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
        .onChange(of: model.pendingFoods.first { $0.id == current }?.state) { _, state in
            guard let state, state != .looking, let item = model.pendingFoods.first(where: { $0.id == current }) else { return }
            current = nil
            if item.state == .missing {
                message = item.message
                model.removePendingFood(item.id)
            } else {
                message = nil
                show(item)
            }
        }
        // Closed: what is still looked up, or found and not added, waits in
        // Jídlo; choosing for a meal photo's list keeps nothing.
        .onDisappear {
            if pick != nil { startedHere.forEach(model.removePendingFood) } else { model.unwatchPendingFoods(startedHere) }
        }
        .photosPicker(isPresented: $galleryOpen, selection: $galleryItem, matching: .images)
        .onChange(of: galleryItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = await UIImage.photo(data) {
                    read(image, mode: "portion")
                }
                galleryItem = nil
            }
        }
        .fullScreenCover(isPresented: $scanning) { BarcodeScanSheet(meal: meal, onLogged: { dismiss() }) }
        .fullScreenCover(item: Binding(get: { photoMode.map { Named(name: $0) } }, set: { photoMode = $0?.name })) { mode in
            if mode.name == "label" {
                LabelCameraSheet { image in
                    photoMode = nil
                    read(image, mode: mode.name)
                }
            } else {
                CameraPicker { image in
                    photoMode = nil
                    if let image { read(image, mode: mode.name) }
                }
                .ignoresSafeArea()
            }
        }
    }

    private func begin() {
        if let pending, !started {
            started = true
            show(pending)
            return
        }
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

    private func tile(_ title: LocalizedStringKey, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { tileFace(title, symbol) }
            .buttonStyle(.plain)
    }

    private func tileFace(_ title: LocalizedStringKey, _ symbol: String) -> some View {
        VStack(spacing: 5) {
            Image(systemName: symbol).scaledFont(19)
            Text(title).font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(Palette.ink)
        .frame(maxWidth: .infinity).frame(minHeight: 58)
        .padding(.horizontal, 4)
        .cardSurface(cornerRadius: 16)
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

    /// "Poslední" or "Časté": the own foods by when or how often they were
    /// eaten (up to 50, Petr 2026-11-09); "+" adds the amount logged last time.
    private var foodList: some View {
        let list = order == "frequent" ? frequent : recent
        return LazyVStack(alignment: .leading, spacing: 0) {
            if list.isEmpty {
                Text("Zatím tu nic není. Potraviny, které přidáš, se tu objeví příště.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
            }
            ForEach(list) { product in
                HStack(spacing: 10) {
                    Button { path.append(.amount(product)) } label: { ProductRow(product: product, hairline: false) }
                        .buttonStyle(.plain)
                    // Choosing for a meal photo's list: only the amount screen.
                    if pick == nil {
                        Button { quickAdd(product) } label: {
                            Image(systemName: "plus").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                                .frame(width: 32, height: 32)
                                .overlay { Circle().stroke(Palette.green, lineWidth: 1.5) }
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(verbatim: L10n.f("Přidat %@", product.name)))
                    }
                }
                .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
        }
    }

    /// "+": the food at the amount logged last time, at once, with "Vrátit";
    /// a food without one yet (saved before that was kept) opens its amount.
    private func quickAdd(_ product: FoodProduct) {
        guard let amount = product.last_amount, !model.demo else { path.append(.amount(product)); return }
        let id = model.loggedFood(product: product, amount: amount, meal: meal)
        let kcal = product.kcal(for: amount).map { Fmt.int($0) + " kcal" }
        added = PlanToast(title: L10n.f("Přidáno: %@", product.name), note: kcal, cancelled: false, symbol: "checkmark",
                          undo: { await model.deleteFood(id: id) })
    }

    /// Poslední, Časté (the foods) or Recepty.
    private func listChip(_ title: LocalizedStringKey, _ value: String) -> some View {
        let on = value == "recipes" ? tab == "recipes" : tab == "foods" && order == value
        return Button {
            if value == "recipes" { tab = "recipes" } else { tab = "foods"; order = value }
        } label: {
            Text(title).font(.footnote.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 14).frame(height: 32)
                .background(on ? Palette.button : Palette.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The own recipes: one portion each, and "Nový recept".
    private var recipeList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { path.append(.recipe) } label: {
                Label("Nový recept", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
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
            parts.append(L10n.plural("z %@ porcí", number, Int(s)))
        }
        let count = r.ingredients?.count ?? 0
        if count > 0 { parts.append(L10n.plural("%lld surovin", count)) }
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
        if recent.isEmpty, let kept = SnapshotCache.load([FoodProduct].self, key: latestKey)?.value { recent = kept; saved = kept }
        if frequent.isEmpty, let kept = SnapshotCache.load([FoodProduct].self, key: oftenKey)?.value { frequent = kept; saved += kept }
        async let latest = model.api.personalFoods()
        async let often = model.api.personalFoods(frequent: true)
        async let own = model.api.recipes()
        let newest = try? await latest, most = try? await often
        if let newest { recent = newest; Self.keep(newest, key: latestKey) }
        if let most { frequent = most; Self.keep(most, key: oftenKey) }
        if newest != nil || most != nil { saved = (newest ?? []) + (most ?? []) }
        recipes = (try? await own) ?? []
    }

    private static func keep(_ foods: [FoodProduct], key: String) {
        if let data = try? JSONEncoder().encode(foods) { SnapshotCache.save(data, key: key) }
    }

    /// A photo of a meal or a nutrition label, read by AI on the server.
    private func read(_ image: UIImage, mode: String) {
        guard !model.demo else { return }
        let api = model.api, own = saved
        run(query: nil, photo: image) {
            // A label is read on the iPhone first (free); AI only for what it missed.
            if mode == "label" {
                let r = try await LabelReader.read(image, api: api)
                return .product(r.product, note: r.note)
            }
            guard let jpeg = await image.jpegForUpload() else { return .missing(L10n.tr("Na fotce se hodnoty nepodařilo přečíst.")) }
            let r = try await api.readFoodPhoto(jpeg, mode: mode)
            if r.items.count >= 2 { return .items(r.items.map { Self.ownFood($0, saved: own) }) }
            return .product(r.product, note: r.note)
        }
    }

    /// A food from the photo that is one of the user's own (every word of the
    /// AI's name starts a word of it) takes the own food's values: nothing is
    /// looked up on the web.
    private static func ownFood(_ item: PhotoItem, saved: [FoodProduct]) -> PhotoItem {
        let wanted = Self.fold(item.product.name).split(whereSeparator: { !$0.isLetter && !$0.isNumber })
        guard !wanted.isEmpty, let own = saved.first(where: { product in
            guard !product.perPortion, product.calories_100g != nil else { return false }
            let words = Self.fold(product.name).split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            return wanted.allSatisfy { q in words.contains { $0.hasPrefix(q) } }
        }) else { return item }
        return PhotoItem(product: own, amount: item.amount, mine: true)
    }

    private func lookUp() {
        let name = query, api = model.api
        run(query: name) {
            if let product = try await api.lookupFood(name: name) { return .product(product, note: nil) }
            return .missing(L10n.tr("AI ji nedokázala dohledat ani odhadnout. Zadej ji ručně."))
        }
    }

    /// The work goes on in AppModel, so closing the sheet keeps it (AppModel+PendingFood.swift).
    private func run(query: String?, photo: UIImage? = nil, work: @escaping @MainActor @Sendable () async throws -> PendingFood.Result) {
        message = nil
        // An earlier one still going waits in Jídlo.
        if let current { model.unwatchPendingFoods([current]) }
        let id = model.startPendingFood(meal: meal, query: query, photo: photo, work: work)
        current = id
        startedHere.append(id)
    }

    /// The food found (or the photo's list), to add.
    private func show(_ item: PendingFood) {
        shown = item.id
        if item.items.count >= 2 {
            path.append(.items(model.pendingPhotoMeal(item)))
        } else if let product = item.product {
            path.append(item.query == nil ? .photo(product, item.note) : .amount(product))
        }
    }

    /// Added: the food no longer waits in Jídlo.
    private func finish() {
        if let shown { model.removePendingFood(shown) }
        dismiss()
    }
}

enum FoodRoute: Hashable {
    case amount(FoodProduct)
    case photo(FoodProduct, String?)
    case items(PhotoMeal)
    case manual
    case recipe
}

extension FoodProduct: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct ProductRow: View {
    let product: FoodProduct
    /// false when the row's line goes under it together with a "+" beside it.
    var hairline = true

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(product.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                    if product.isTableFood {
                        Image(systemName: "checkmark.circle.fill").font(.subheadline).foregroundStyle(Palette.green)
                            .accessibilityLabel(Text("z tabulky složení potravin"))
                    }
                }
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
        .overlay(alignment: .bottom) { if hairline { Rectangle().fill(Palette.hairline).frame(height: 1) } }
        .contentShape(Rectangle())
    }

    private var subtitle: String {
        // A basic food: "1 šálek (237 ml) · USDA".
        if product.isTableFood, let size = product.usableServing {
            return "1 " + product.servingName + " (" + Fmt.int(size) + " " + product.unit + ") · " + (product.source_name ?? "USDA")
        }
        let amount = !product.perPortion ? Fmt.int(product.defaultAmount) + " " + product.unit
            : product.defaultAmount == 1 ? L10n.tr("1 porce") : L10n.f("%@ porce", FoodAmountView.text(product.defaultAmount))
        let source: String? = switch product.source {
        case "personal", "manual": L10n.tr("moje potravina")
        case "recipe", "composed": L10n.tr("moje jídlo")
        case "ai", "ai_lookup": L10n.tr("dohledáno AI")
        case "table": product.source_name ?? "USDA"
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
    /// Opened from the push that the owner fixed it ("Opraveno").
    var fixed = false
    /// The amount to start at (a food of a meal photo).
    var start: Double? = nil
    /// Choosing for a meal photo's list: "Hotovo" hands the food and the
    /// amount back instead of logging it.
    var pick: ((FoodProduct, Double) -> Void)? = nil
    var done: () -> Void = {}
    /// Another meal than the one the food was opened for.
    @State private var chosenMeal: String?
    @State private var amount = ""
    @State private var saving = false
    @State private var error: String?
    @State private var edit = false
    /// "Navrhnout pro všechny" for a food read from its label (FoodProduct.canSuggestNew).
    @State private var suggestNew = true
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
    @State private var salt = ""

    private var target: String { chosenMeal ?? meal }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 16) {
                BackSlot { dismiss() }
                VStack(alignment: .leading, spacing: 4) {
                    Text(current.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    if product.isEstimate { AIEstimateTag() }
                    HStack(spacing: 8) {
                        if let brand = current.brand { Text(brand).font(Typo.small).foregroundStyle(Palette.muted) }
                        if fixed { FixedTag() } else if product.canReport && (product.reported == true || reportedNow) { ReportedTag() }
                    }
                }
                // The same card as after a scan (BarcodeScanSheet): the values, then the wheel.
                NutritionCells(product: current, amount: value ?? 0)
                if pick == nil {
                    DayLeftLine(day: model.writeDay, kcal: current.kcal(for: value ?? 0) ?? 0,
                                protein: current.grams(current.protein_100g, for: value ?? 0) ?? 0,
                                carbs: current.grams(current.carbs_100g, for: value ?? 0) ?? 0)
                }
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
                        Image(systemName: edit ? "chevron.up" : "chevron.down").scaledFont(12, weight: .semibold)
                    }
                    .foregroundStyle(Palette.ink)
                }
                .buttonStyle(.plain)
                if edit {
                    SettingsGroup(title: product.perPortion ? "Jedna porce" : L10n.f("Na 100 %@", product.unit),
                                  footer: product.canSuggest && !product.canSuggestNew && !product.perPortion ? L10n.tr("Oprava zároveň odejde ke kontrole, aby se opravila i v katalogu pro ostatní.") : nil) {
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
                        SettingsDivider()
                        SettingsField(title: "Sůl", text: $salt, unit: "g")
                    }
                }

                // Without energy the food would count as 0 kcal (forLogging fills zeros).
                if current.calories_100g == nil {
                    Text("Doplň energii v kcal, jinak by se jídlo počítalo jako 0 kcal.").font(Typo.small).foregroundStyle(Palette.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
                MissingMacrosLine(missing: current.missingMacros)
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                if product.canSuggestNew && !model.demo && pick == nil {
                    SettingsGroup { SettingsToggle(title: "Navrhnout pro všechny", isOn: $suggestNew) }
                }
                if pick == nil { MealMenu(selection: Binding(get: { target }, set: { chosenMeal = $0 })) }
                Button { Task { await save() } } label: {
                    Text(saving ? L10n.tr("Ukládám…") : pick != nil ? L10n.tr("Hotovo") : MealSlot.addText(target)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
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
        .background { Palette.background.ignoresSafeArea() }
        .floatingBack(trailing: product.canReport && !model.demo
                      ? ChromeAction(systemImage: mine ? "flag.fill" : "flag", label: mine ? "Nahlášeno" : "Hodnoty nesedí",
                                     enabled: !mine, tint: Palette.rust) { reporting = true }
                      : nil) { dismiss() }
        .navBarVisibility(.hidden)
        .onAppear(perform: fill)
        .sheet(isPresented: $reporting) {
            FoodReportSheet(product: product) { withAnimation { reportedNow = true } }
                .presentationDetents([.medium, .large])
                .glassSheetBackground()
        }
    }

    /// The flag is filled once this user reported the food.
    private var mine: Bool { reportedNow || product.reported_by_me == true }

    private func fill() {
        guard !filled else { return }
        filled = true
        // Missing energy: the values open right away to fill it in.
        edit = editing || product.calories_100g == nil
        if amount.isEmpty { amount = Self.text(start ?? product.defaultAmount) }
        name = product.name
        brand = product.brand ?? ""
        kcal = product.calories_100g.map(Self.text) ?? ""
        protein = product.protein_100g.map(Self.text) ?? ""
        carbs = product.carbs_100g.map(Self.text) ?? ""
        sugar = product.sugars_100g.map(Self.text) ?? ""
        fat = product.fat_100g.map(Self.text) ?? ""
        fiber = product.fiber_100g.map(Self.text) ?? ""
        salt = product.salt_100g.map(Self.text) ?? ""
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
        p.salt_100g = Self.number(salt)
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
        if let pick { pick(current, value); return }
        saving = true
        defer { saving = false }
        var corrected = current
        // A corrected catalogue food stays the user's own until the owner approves it.
        // A food read from its label has nothing in the catalogue to correct: the
        // values as the user fixed them go as the new food (suggestNewFood).
        let changed = product.canSuggest && !product.canSuggestNew && corrected.values != product.values
        if changed { corrected.origin = "edited" }
        if let message = await model.logFood(product: corrected, amount: value, meal: target) {
            error = message
        } else {
            if changed { sendCorrection(corrected) } else if suggestNew { model.suggestNewFood(corrected) }
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

    /// "z toho cukry 5,6 g · vláknina 2 g · sůl 0,8 g", for what the food has.
    private var extras: [String] {
        var out: [String] = []
        if let g = product.grams(product.sugars_100g, for: amount) { out.append(L10n.f("z toho cukry %@", Self.grams(g))) }
        if let g = product.grams(product.fiber_100g, for: amount) { out.append(L10n.f("vláknina %@", Self.grams(g))) }
        if let g = product.grams(product.salt_100g, for: amount) { out.append(L10n.f("sůl %@", Self.grams(g))) }
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
                BackSlot { dismiss() }
                Text("Zadat ručně").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                SettingsGroup(title: "Jedna porce", footer: L10n.tr("Co necháš prázdné, počítá se jako 0 g.")) {
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
        .background { Palette.background.ignoresSafeArea() }
        .floatingBack { dismiss() }
        .navBarVisibility(.hidden)
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

/// "Chybí bílkoviny, počítají se jako 0 g.": the macros a label, the catalogue
/// or AI left out, which are logged as 0 (FoodProduct.forLogging).
struct MissingMacrosLine: View {
    let missing: [String]

    var body: some View {
        if !missing.isEmpty {
            Text(Self.text(missing)).font(Typo.small).foregroundStyle(Palette.amber)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    static func text(_ missing: [String]) -> String {
        let list = ListFormatter()
        list.locale = L10n.locale
        return L10n.f("Chybí %@, počítají se jako 0 g.", list.string(from: missing) ?? missing.joined(separator: ", "))
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
            .background { Capsule().fill(Palette.ink.opacity(0.06)) }
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

/// "Opraveno": the owner approved a report or a correction of this food.
struct FixedTag: View {
    var body: some View {
        Label("Opraveno", systemImage: "checkmark").labelStyle(.titleAndIcon)
            .font(.caption2.weight(.semibold)).foregroundStyle(Palette.green).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Palette.green.opacity(0.16), in: Capsule())
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
                                .scaledFont(20).foregroundStyle(reason == item.code ? Palette.ink : Palette.faint)
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
