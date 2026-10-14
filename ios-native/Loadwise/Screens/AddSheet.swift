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
    @State private var editing = false
    @State private var added: String?
    @State private var failed: String?
    /// What "+" shows and in which order (PlusItem ids), set in Upravit.
    @AppStorage("plusMenu.items") private var stored = PlusItem.defaults.joined(separator: ",")

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    private var shown: [PlusItem] { PlusItem.list(stored) }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Co přidáme?").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }

                ForEach(PlusItem.Section.allCases, id: \.self) { section in
                    let items = shown.filter { $0.section == section }
                    if !items.isEmpty {
                        header(section)
                        if section == .drink {
                            DrinkQuickRow(add: { ml, kind in await save(ml: ml, kind: kind) }, other: { drink = true })
                            if let added { Label(added, systemImage: "checkmark.circle.fill").font(Typo.caption).foregroundStyle(Palette.green).padding(.top, 8) }
                            if let failed { Text(failed).font(Typo.caption).foregroundStyle(Palette.rust).padding(.top, 8) }
                        } else {
                            LazyVGrid(columns: columns, spacing: 10) {
                                ForEach(items) { item in tile(item) }
                            }
                        }
                    }
                }

                Button { editing = true } label: {
                    Label("Upravit", systemImage: "pencil").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 24)
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        // What "+" adds goes to today, also while the screens show another day.
        .onAppear { model.writesToday = true }
        .onDisappear { model.writesToday = false }
        .sheet(item: $food, onDismiss: { dismiss() }) { start in AddFoodSheet(meal: MealSlot.now(slots: model.food?.mealSlots), start: start) }
        .sheet(isPresented: $weight, onDismiss: { dismiss() }) { WeightEntrySheet() }
        .sheet(isPresented: $workout, onDismiss: { dismiss() }) { ManualWorkoutSheet() }
        .sheet(isPresented: $drink) { DrinkSheet { ml, kind in await save(ml: ml, kind: kind) } }
        .sheet(isPresented: $editing) { PlusMenuEditor(stored: $stored) }
    }

    private func header(_ section: PlusItem.Section) -> some View {
        Label(L10n.tr(section.title), systemImage: section.symbol)
            .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(1.2)
            .foregroundStyle(Palette.muted)
            .labelStyle(TintedIcon(color: section.color))
            .padding(.top, 22).padding(.bottom, 10)
    }

    private func tile(_ item: PlusItem) -> some View {
        Button { run(item) } label: {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: item.symbol).font(.system(size: 18)).foregroundStyle(item.section.color)
                Text(L10n.tr(item.title)).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 86, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressableCardStyle())
    }

    private func run(_ item: PlusItem) {
        switch item.id {
        // Today's plan, or an empty workout the exercises are added to.
        case "start": open(.trainingMode(AppModel.localDate(Date())))
        case "log": workout = true
        case "pick": open(.coachPick(true))
        case "library": open(.library)
        case "gymBuilder": open(.gymBuilder)
        case "photo": food = .photo
        case "search": food = .search
        case "gallery": food = .gallery
        case "scan": food = .scan
        case "label": food = .label
        case "manual": food = .manual
        case "weight": weight = true
        case "coach": openCoach()
        default: break
        }
    }

    private func save(ml: Int, kind: String) async {
        failed = nil
        if await model.addDrink(ml: ml, kind: kind) {
            added = L10n.f("Přidáno: %@ %@", L10n.tr(DrinkKind.find(kind)?.label ?? kind).lowercased(with: L10n.locale), Units.volumeText(Double(ml)))
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

/// A label whose icon has its own colour.
private struct TintedIcon: LabelStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 7) { configuration.icon.foregroundStyle(color); configuration.title }
    }
}

/// One thing "+" can do. The user picks which show and their order (Upravit).
struct PlusItem: Identifiable, Equatable {
    enum Section: CaseIterable {
        case training, food, drink, other
        var title: String { switch self { case .training: "Trénink"; case .food: "Jídlo"; case .drink: "Pití"; case .other: "Další" } }
        var symbol: String { switch self { case .training: "figure.run"; case .food: "fork.knife"; case .drink: "drop"; case .other: "plus.circle" } }
        var color: Color { switch self { case .training: Palette.rust; case .food: Palette.amberBar; case .drink: Palette.blue; case .other: Palette.green } }
    }

    let id: String
    let title: String
    let symbol: String
    let section: Section

    static let all: [PlusItem] = [
        PlusItem(id: "start", title: "Začít trénink", symbol: "play.fill", section: .training),
        PlusItem(id: "log", title: "Zapsat trénink", symbol: "square.and.pencil", section: .training),
        PlusItem(id: "pick", title: "Aktivita dne", symbol: "sparkles", section: .training),
        PlusItem(id: "library", title: "Knihovna", symbol: "books.vertical", section: .training),
        PlusItem(id: "gymBuilder", title: "Sestavit posilovnu", symbol: "dumbbell", section: .training),
        PlusItem(id: "photo", title: "Vyfotit jídlo", symbol: "camera", section: .food),
        PlusItem(id: "search", title: "Hledat jídlo", symbol: "magnifyingglass", section: .food),
        PlusItem(id: "scan", title: "Čárový kód", symbol: "barcode.viewfinder", section: .food),
        PlusItem(id: "gallery", title: "Jídlo z galerie", symbol: "photo.on.rectangle", section: .food),
        PlusItem(id: "label", title: "Etiketa", symbol: "doc.text.viewfinder", section: .food),
        PlusItem(id: "manual", title: "Jídlo ručně", symbol: "square.and.pencil", section: .food),
        PlusItem(id: "drink", title: "Pití", symbol: "drop", section: .drink),
        PlusItem(id: "weight", title: "Zapsat váhu", symbol: "scalemass", section: .other),
        PlusItem(id: "coach", title: "Zeptat se kouče", symbol: "bubble.left.and.text.bubble.right", section: .other)
    ]

    static let defaults = ["start", "log", "pick", "library", "photo", "search", "drink"]

    static func list(_ stored: String) -> [PlusItem] {
        stored.split(separator: ",").compactMap { id in all.first { $0.id == id } }
    }
}

/// Upravit +: drag to reorder, − hides, + adds.
struct PlusMenuEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var stored: String
    @State private var shown: [PlusItem] = []

    private var hidden: [PlusItem] { PlusItem.all.filter { !shown.contains($0) } }

    var body: some View {
        NavigationStack {
            List {
                Section("Zobrazené") {
                    ForEach(shown) { item in row(item) }
                        .onMove { shown.move(fromOffsets: $0, toOffset: $1) }
                        .onDelete { shown.remove(atOffsets: $0) }
                }
                if !hidden.isEmpty {
                    Section("Další") {
                        ForEach(hidden) { item in
                            HStack(spacing: 12) {
                                Button { withAnimation { shown.append(item) } } label: {
                                    Image(systemName: "plus.circle.fill").font(.title3).foregroundStyle(.white, Palette.green)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(L10n.f("Přidat %@", L10n.tr(item.title)))
                                row(item)
                            }
                        }
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle(L10n.tr("Upravit +"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { stored = shown.map(\.id).joined(separator: ","); dismiss() } label: { Text("Hotovo").bold() }
                }
            }
            .onAppear { shown = PlusItem.list(stored) }
        }
        .tint(Palette.ink)
    }

    private func row(_ item: PlusItem) -> some View {
        Label(L10n.tr(item.title), systemImage: item.symbol).foregroundStyle(Palette.ink)
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
        PageScroll {
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
                    Button { step(-1) } label: { Image(systemName: "minus.circle").font(.system(size: 28)) }
                        .accessibilityLabel("Méně")
                    Spacer()
                    Text(Units.imperial ? Fmt.int(Units.volume(Double(ml))) : String(ml)).font(Typo.number(64)).foregroundStyle(Palette.ink)
                    Text(verbatim: Units.volumeUnit).font(Typo.small).foregroundStyle(Palette.muted)
                    Spacer()
                    Button { step(1) } label: { Image(systemName: "plus.circle").font(.system(size: 28)) }
                        .accessibilityLabel("Více")
                }
                .foregroundStyle(Palette.ink)
                ChipFlow(items: Array(Set(amounts + DrinkPrefs.amounts(kind))).sorted(), label: { Units.volumeText(Double($0)) }, isOn: { $0 == ml }, toggle: { ml = $0 })
                HStack(spacing: 16) {
                    Button {
                        var list = DrinkPrefs.list(favorites).filter { $0 != kind }
                        if !DrinkPrefs.list(favorites).contains(kind) { list.append(kind) }
                        favorites = list.joined(separator: ",")
                    } label: {
                        Label(L10n.tr(DrinkPrefs.list(favorites).contains(kind) ? "V oblíbených" : "Do oblíbených"),
                              systemImage: DrinkPrefs.list(favorites).contains(kind) ? "star.fill" : "star")
                    }
                    Button {
                        DrinkPrefs.setAmounts(kind, Array((DrinkPrefs.amounts(kind) + [ml]).suffix(5)))
                        presetSaved = true
                    } label: {
                        Label(DrinkPrefs.amounts(kind).contains(ml) || presetSaved
                              ? L10n.tr("Množství uložené")
                              : L10n.f("Uložit %@ jako předvolbu", Units.volumeText(Double(ml))), systemImage: "bookmark")
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
                            Text(Units.volumeText((Double(ml) * d.factor).rounded())).font(Typo.number(24)).foregroundStyle(Palette.blue)
                        }
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

    /// −/+ by 50 ml, or by 1 fl oz in imperial units; the amount stays in ml.
    private func step(_ direction: Int) {
        if Units.imperial {
            let ounces = max(1, Units.volume(Double(ml)).rounded() + Double(direction))
            ml = min(2000, Units.roundedMl(fluidOunces: ounces))
        } else {
            ml = min(2000, max(50, ml + 50 * direction))
        }
    }
}
