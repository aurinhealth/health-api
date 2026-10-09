import PhotosUI
import SwiftUI

/// "Co přidáme?": search your foods and the catalog, scan a barcode, look a
/// food up with AI, or type it in; then the amount and "Přidat".
struct AddFoodSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let meal: String
    /// Straight to the camera, the scanner… when opened from the "+" menu.
    var start: FoodStart? = nil
    @State private var started = false
    @State private var galleryOpen = false
    @State private var galleryItem: PhotosPickerItem?
    @State private var query = ""
    @State private var results: [FoodProduct] = []
    @State private var recent: [FoodProduct] = []
    @State private var searching = false
    @State private var lookingUp = false
    @State private var message: String?
    @State private var path: [FoodRoute] = []
    @State private var scanning = false
    @State private var photoMode: String?
    @State private var readingPhoto = false

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Co přidáme?").font(Typo.sentence(31, relativeTo: .title)).foregroundStyle(Palette.ink)
                        Spacer()
                        Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    Text(MealSlot.labels[meal] ?? "Jídlo").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 4)

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
                    Text("Vyfoť talíř a AI odhadne porci, nebo vyfoť tabulku nutričních hodnot na obalu. „Dohledat AI“ najde potravinu podle napsaného názvu.")
                        .font(Typo.tiny).foregroundStyle(Palette.faint).fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                    if readingPhoto {
                        HStack(spacing: 8) { ProgressView(); Text("Čtu fotku…").font(Typo.small).foregroundStyle(Palette.muted) }.padding(.top, 12)
                    }

                    if let message {
                        Text(message).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 14)
                    }

                    VStack(spacing: 0) {
                        ForEach(query.isEmpty ? recent : results) { product in
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
                    if query.isEmpty && !recent.isEmpty {
                        Text("Tvoje naposledy uložené potraviny").font(Typo.tiny).foregroundStyle(Palette.faint).padding(.top, 6)
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
                case .photo(let product, let note): FoodAmountView(product: product, meal: meal, note: note, done: { dismiss() })
                case .manual: ManualFoodView(meal: meal, name: query, done: { dismiss() })
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
            CameraPicker { image in
                photoMode = nil
                if let image { Task { await read(image, mode: mode.name) } }
            }
            .ignoresSafeArea()
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
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled, !model.demo else { return }
        searching = true
        defer { searching = false }
        do {
            results = try await model.api.searchFood(name: q)
            message = nil
        } catch is CancellationError {
        } catch {
            message = error.localizedDescription
        }
    }

    private func loadRecent() async {
        guard !model.demo else { recent = DemoData.foods; return }
        recent = Array(((try? await model.api.personalFoods()) ?? []).prefix(8))
    }

    /// A photo of a meal or a nutrition label, read by AI on the server.
    private func read(_ image: UIImage, mode: String) async {
        guard !model.demo, let jpeg = image.jpegForUpload() else { return }
        readingPhoto = true
        defer { readingPhoto = false }
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
                message = "AI potravinu nenašla. Zadej ji ručně."
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
        let amount = product.perPortion ? "1 porce" : Fmt.int(product.defaultAmount) + " " + product.unit
        let source: String? = switch product.source {
        case "personal", "manual": "moje potravina"
        case "recipe", "composed": "moje jídlo"
        case "ai", "ai_lookup": "dohledáno AI"
        default: product.source == nil ? nil : "katalog"
        }
        return [product.brand, amount, source].compactMap { $0 }.joined(separator: " · ")
    }
}

/// How much: the amount in the food's unit, the values for it and "Přidat".
struct FoodAmountView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let product: FoodProduct
    let meal: String
    /// What the AI was unsure about, after a photo.
    var note: String? = nil
    var done: () -> Void = {}
    @State private var amount = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    if let brand = product.brand { Text(brand).font(Typo.small).foregroundStyle(Palette.muted) }
                }
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    TextField("100", text: $amount).keyboardType(.decimalPad).font(Typo.number(56)).frame(maxWidth: 160)
                    Text(product.perPortion ? "porce" : product.unit).font(Typo.body).foregroundStyle(Palette.faint)
                }
                NutritionCells(product: product, amount: value ?? 0)
                if let note {
                    Label(note, systemImage: "sparkles").font(Typo.caption).foregroundStyle(Palette.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(product.perPortion ? "Hodnoty na porci." : "Hodnoty ze 100 \(product.unit) přepočtené na množství.")
                    .font(Typo.caption).foregroundStyle(Palette.faint)
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                Button { Task { await save() } } label: {
                    Text(saving ? "Ukládám…" : "Přidat " + MealSlot.toMeal(meal)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || value == nil)
            }
            .padding(24)
        }
        .background(Palette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { if amount.isEmpty { amount = Fmt.decimal(product.defaultAmount, digits: product.defaultAmount.rounded() == product.defaultAmount ? 0 : 1) } }
    }

    private var value: Double? {
        guard let v = Double(amount.replacingOccurrences(of: ",", with: ".")), v > 0 else { return nil }
        return v
    }

    private func save() async {
        guard let value else { return }
        saving = true
        defer { saving = false }
        if let message = await model.logFood(product: product, amount: value, meal: meal) {
            error = message
        } else {
            done()
        }
    }
}

struct NutritionCells: View {
    let product: FoodProduct
    let amount: Double

    var body: some View {
        HStack(spacing: 0) {
            cell(Fmt.int(product.kcal(for: amount)), "kcal", first: true)
            cell(Fmt.int(product.grams(product.protein_100g, for: amount)) + " g", "bílkoviny")
            cell(Fmt.int(product.grams(product.carbs_100g, for: amount)) + " g", "sacharidy")
            cell(Fmt.int(product.grams(product.fat_100g, for: amount)) + " g", "tuky")
        }
        .fixedSize(horizontal: false, vertical: true)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
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

    init(meal: String, name: String = "", done: @escaping () -> Void = {}) {
        self.meal = meal
        _name = State(initialValue: name)
        self.done = done
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                CircleButton(systemImage: "chevron.left", label: "Zpět") { dismiss() }
                Text("Zadat ručně").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                SettingsGroup(footer: "Hodnoty jedné porce. Potravina se uloží mezi tvoje, příště ji najdeš hledáním.") {
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
                Button { Task { await save() } } label: {
                    Text(saving ? "Ukládám…" : "Přidat " + MealSlot.toMeal(meal)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
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
        if let message = await model.logFood(product: product, amount: 1, meal: meal) { error = message } else { done() }
    }
}
