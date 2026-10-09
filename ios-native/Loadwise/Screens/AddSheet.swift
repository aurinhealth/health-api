import SwiftUI

/// The "+" in the tab bar, in four parts: food (search, photo, gallery,
/// barcode, label), drinks (water at one tap, any drink with its hydration),
/// weight, and training (log it, build a gym session with AI, the library),
/// plus the AI coach.
struct AddSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var openCoach: () -> Void = {}
    @State private var food: FoodStart?
    @State private var weight = false
    @State private var workout = false
    @State private var drink = false
    @State private var added: String?
    @State private var failed: String?

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Co přidáme?").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }

                section("Jídlo", "fork.knife", Palette.amberBar)
                LazyVGrid(columns: columns, spacing: 10) {
                    tile("Hledat", "magnifyingglass") { food = .search }
                    tile("Vyfotit jídlo", "camera") { food = .photo }
                    tile("Z galerie", "photo.on.rectangle") { food = .gallery }
                    tile("Čárový kód", "barcode.viewfinder") { food = .scan }
                    tile("Etiketa", "doc.text.viewfinder") { food = .label }
                    tile("Ručně", "square.and.pencil") { food = .manual }
                }

                section("Pití", "drop.fill", Palette.blue)
                DrinkQuickRow(add: { ml, kind in await save(ml: ml, kind: kind) }, other: { drink = true })
                if let added { Label(added, systemImage: "checkmark.circle.fill").font(Typo.caption).foregroundStyle(Palette.green).padding(.top, 8) }
                if let failed { Text(failed).font(Typo.caption).foregroundStyle(Palette.rust).padding(.top, 8) }

                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 0) {
                        section("Váha", "scalemass", Palette.brown)
                        tile("Zapsat váhu", "scalemass") { weight = true }
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        section("AI kouč", "sparkles", Palette.green)
                        tile("Zeptat se", "bubble.left.and.text.bubble.right") { openCoach() }
                    }
                }

                section("Trénink", "figure.run", Palette.rust)
                LazyVGrid(columns: columns, spacing: 10) {
                    tile("Zapsat trénink", "square.and.pencil") { workout = true }
                    tile("Posilovna s AI", "sparkles") { open(.gymBuilder) }
                    tile("Režim tréninku", "play.fill") { open(.trainingMode(AppModel.localDate(Date()))) }
                    tile("Knihovna", "books.vertical") { open(.workoutLibrary("ride")) }
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .sheet(item: $food, onDismiss: { dismiss() }) { start in AddFoodSheet(meal: MealSlot.now(slots: model.food?.mealSlots), start: start) }
        .sheet(isPresented: $weight, onDismiss: { dismiss() }) { WeightEntrySheet() }
        .sheet(isPresented: $workout, onDismiss: { dismiss() }) { ManualWorkoutSheet() }
        .sheet(isPresented: $drink) { DrinkSheet { ml, kind in await save(ml: ml, kind: kind) } }
    }

    private func section(_ title: String, _ symbol: String, _ color: Color) -> some View {
        HStack(spacing: 7) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
        }
        .padding(.top, 22).padding(.bottom, 10)
    }

    private func tile(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 20))
                Text(title).font(.footnote.weight(.medium)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 78)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressableCardStyle())
    }

    private func save(ml: Int, kind: String) async {
        failed = nil
        if await model.addDrink(ml: ml, kind: kind) {
            added = "Přidáno: " + (DrinkKind.find(kind)?.label ?? kind).lowercased() + " \(ml) ml"
        } else {
            added = nil
            failed = model.foodError ?? "Nepodařilo se uložit."
        }
    }

    private func open(_ route: AppRoute) {
        dismiss()
        model.open(route)
    }
}

/// How the food sheet opens from the "+" menu.
enum FoodStart: String, Identifiable {
    case search, photo, gallery, scan, label, manual
    var id: String { rawValue }
}

// MARK: - Drinks

/// A drink and how much of it counts as hydration (src/fluids.js HYDRATION_FACTORS).
struct DrinkKind: Identifiable {
    let id: String
    let label: String
    let symbol: String
    let factor: Double

    static let all: [DrinkKind] = [
        DrinkKind(id: "water", label: "Voda", symbol: "drop.fill", factor: 1),
        DrinkKind(id: "tea", label: "Čaj", symbol: "cup.and.saucer.fill", factor: 1),
        DrinkKind(id: "coffee", label: "Káva", symbol: "mug.fill", factor: 0.9),
        DrinkKind(id: "juice", label: "Džus", symbol: "takeoutbag.and.cup.and.straw.fill", factor: 1),
        DrinkKind(id: "milk", label: "Mléko", symbol: "carton.fill", factor: 1.1),
        DrinkKind(id: "sport", label: "Ionťák", symbol: "bolt.fill", factor: 1.1),
        DrinkKind(id: "soda", label: "Limonáda", symbol: "bubbles.and.sparkles.fill", factor: 0.9),
        DrinkKind(id: "beer", label: "Pivo", symbol: "wineglass", factor: 0.5),
        DrinkKind(id: "wine", label: "Víno", symbol: "wineglass.fill", factor: 0),
        DrinkKind(id: "other", label: "Jiné", symbol: "waterbottle.fill", factor: 1)
    ]

    static func find(_ id: String) -> DrinkKind? { all.first { $0.id == id } }
}

struct DrinkSheet: View {
    @Environment(\.dismiss) private var dismiss
    let save: (Int, String) async -> Void
    /// Changing a drink already logged (swiped left → pencil).
    var editing = false
    @State private var kind = "water"
    @State private var ml = 250
    @State private var saving = false

    init(kind: String = "water", ml: Int = 250, editing: Bool = false, save: @escaping (Int, String) async -> Void) {
        self.save = save
        self.editing = editing
        _kind = State(initialValue: kind)
        _ml = State(initialValue: ml)
    }
    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites
    @State private var presetSaved = false

    private let amounts = [100, 150, 200, 250, 330, 500, 750]
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 5)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(editing ? "Upravit pití" : "Co piješ?").font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(DrinkKind.all) { d in
                        Button { kind = d.id } label: {
                            VStack(spacing: 5) {
                                Image(systemName: d.symbol).font(.system(size: 18))
                                Text(d.label).font(.caption2.weight(.medium)).lineLimit(1).minimumScaleFactor(0.7)
                            }
                            .foregroundStyle(kind == d.id ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 62)
                            .background(kind == d.id ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(kind == d.id ? .isSelected : [])
                    }
                }

                HStack(alignment: .lastTextBaseline) {
                    Button { ml = max(50, ml - 50) } label: { Image(systemName: "minus.circle").font(.system(size: 28)) }
                    Spacer()
                    Text("\(ml)").font(Typo.number(64)).foregroundStyle(Palette.ink)
                    Text("ml").font(Typo.small).foregroundStyle(Palette.muted)
                    Spacer()
                    Button { ml = min(2000, ml + 50) } label: { Image(systemName: "plus.circle").font(.system(size: 28)) }
                }
                .foregroundStyle(Palette.ink)
                ChipFlow(items: Array(Set(amounts + DrinkPrefs.amounts(kind))).sorted(), label: { "\($0) ml" }, isOn: { $0 == ml }, toggle: { ml = $0 })
                HStack(spacing: 16) {
                    Button {
                        var list = DrinkPrefs.list(favorites).filter { $0 != kind }
                        if !DrinkPrefs.list(favorites).contains(kind) { list.append(kind) }
                        favorites = list.joined(separator: ",")
                    } label: {
                        Label(DrinkPrefs.list(favorites).contains(kind) ? "V oblíbených" : "Do oblíbených",
                              systemImage: DrinkPrefs.list(favorites).contains(kind) ? "star.fill" : "star")
                    }
                    Button {
                        DrinkPrefs.setAmounts(kind, Array((DrinkPrefs.amounts(kind) + [ml]).suffix(5)))
                        presetSaved = true
                    } label: {
                        Label(DrinkPrefs.amounts(kind).contains(ml) || presetSaved ? "Množství uložené" : "Uložit \(ml) ml jako předvolbu", systemImage: "bookmark")
                    }
                    .disabled(DrinkPrefs.amounts(kind).contains(ml))
                }
                .font(.footnote.weight(.medium))
                .foregroundStyle(Palette.ink)
                .onChange(of: kind) { _, _ in presetSaved = false }
                .onChange(of: ml) { _, _ in presetSaved = false }

                if let d = DrinkKind.find(kind) {
                    Card {
                        HStack {
                            Text("Do hydratace se počítá").font(Typo.body).foregroundStyle(Palette.secondary)
                            Spacer()
                            Text("\(Int((Double(ml) * d.factor).rounded())) ml").font(Typo.number(24)).foregroundStyle(Palette.blue)
                        }
                        Text(note(d)).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }

                PrimaryButton(title: saving ? "Ukládám…" : editing ? "Uložit" : "Přidat", systemImage: editing ? "checkmark" : "plus", busy: saving) {
                    Task {
                        saving = true
                        await save(ml, kind)
                        saving = false
                        dismiss()
                    }
                }
                .disabled(saving)
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }

    private func note(_ d: DrinkKind) -> String {
        switch d.id {
        case "coffee": return "Káva hydratuje skoro jako voda, kofein ubere asi desetinu."
        case "milk", "sport": return "Mléko a ionťák díky minerálům zavodní o něco víc než voda."
        case "beer": return "Alkohol odvádí vodu, pivo se počítá jen napůl."
        case "wine": return "Víno a destiláty do hydratace nepočítám."
        case "soda": return "Sladké limonády hydratují o něco méně než voda."
        default: return "Počítá se celé množství."
        }
    }
}
