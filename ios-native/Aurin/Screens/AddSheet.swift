import SwiftUI

/// The "+" in the tab bar: shortcuts for training, food, drinks, weight and the
/// coach, as small icon tiles four to a row with the name under each. By
/// category (the default) a category with two shortcuts or fewer shares its row
/// with the next such one; in any order the shortcuts go one after another
/// without headings. The sheet is as tall as what it shows, at least a third of
/// the screen and at most 80 %, and scrolls past that.
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
    /// The drink whose amounts are open under the tiles.
    @State private var pouring: String?
    @State private var busy: Int?
    @State private var contentHeight: CGFloat = 0
    /// What "+" shows and in which order (PlusItem ids), set with the pencil.
    @AppStorage("plusMenu.items") private var stored = PlusItem.defaults.joined(separator: ",")
    @AppStorage("plusMenu.layout") private var layout = PlusLayout.categories.rawValue

    @AppStorage(DrinkPrefs.favoritesKey) private var favorites = DrinkPrefs.defaultFavorites

    private var shown: [PlusItem] { PlusItem.tiles(PlusItem.list(stored), favorites: DrinkPrefs.list(favorites)) }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: 4)

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 0) {
                // No title: the tiles say what "+" is for.
                HStack(alignment: .center) {
                    Spacer()
                    ChromeButton(systemImage: "pencil", label: "Upravit +") { editing = true }
                    ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                        .padding(.leading, 6)
                }

                if PlusLayout(rawValue: layout) == .free {
                    grid(shown).padding(.top, 18)
                } else {
                    ForEach(Array(PlusLayout.rows(shown).enumerated()), id: \.offset) { _, row in
                        if row.count == 2 {
                            // A wider gap between the two categories than between their tiles.
                            HStack(alignment: .top, spacing: 24) {
                                ForEach(row, id: \.section) { group in
                                    VStack(alignment: .leading, spacing: 0) {
                                        header(group.section)
                                        HStack(alignment: .top, spacing: 10) {
                                            ForEach(group.items) { tile($0) }
                                            if group.items.count == 1 { Color.clear.frame(maxWidth: .infinity, maxHeight: 1) }
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        } else if let group = row.first {
                            header(group.section)
                            grid(group.items)
                        }
                    }
                }

                if let pouring, let d = DrinkKind.find(pouring) { amounts(d) }
                if let added { Label(added, systemImage: "checkmark.circle.fill").font(Typo.caption).foregroundStyle(Palette.green).padding(.top, 12) }
                if let failed { Text(failed).font(Typo.caption).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
            .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 20)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationDetents([.height(sheetHeight)])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
        // What "+" adds goes to today, also while the screens show another day.
        .onAppear { model.writesToday = true }
        .onDisappear { model.writesToday = false }
        .sheet(item: $food, onDismiss: { dismiss() }) { start in AddFoodSheet(meal: MealSlot.now(slots: model.food?.mealSlots), start: start) }
        .sheet(isPresented: $weight, onDismiss: { dismiss() }) { WeightEntrySheet() }
        .sheet(isPresented: $workout, onDismiss: { dismiss() }) { ManualWorkoutSheet() }
        .sheet(isPresented: $drink) { DrinkSheet { ml, kind in await save(ml: ml, kind: kind) } }
        .sheet(isPresented: $editing) { PlusMenuEditor(stored: $stored, layout: $layout) }
    }

    /// At least a third of the screen, at most 80 %.
    private var sheetHeight: CGFloat {
        let screen = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.screen.bounds.height ?? 800
        return min(max(contentHeight + 24, screen / 3), screen * 0.8)
    }

    private func grid(_ items: [PlusItem]) -> some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
            ForEach(items) { tile($0) }
        }
    }

    private func header(_ section: PlusItem.Section) -> some View {
        Label(L10n.tr(section.title), systemImage: section.symbol)
            .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(1.2)
            .foregroundStyle(Palette.muted)
            .labelStyle(TintedIcon(color: section.color))
            .lineLimit(1)
            .padding(.top, 20).padding(.bottom, 10)
    }

    /// The icon in a small rounded block, its name under it.
    private func tile(_ item: PlusItem) -> some View {
        let on = item.drink != nil && pouring == item.drink
        return Button { run(item) } label: {
            VStack(spacing: 6) {
                Image(systemName: item.symbol).scaledFont(20, cap: .denseCap)
                    .foregroundStyle(on ? Palette.onButton : item.section == .drink ? Palette.ink : item.section.color)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(on ? Palette.blue : Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(L10n.tr(item.title)).font(.caption.weight(.medium)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(PressableCardStyle())
    }

    /// The amounts of the drink tapped, one tap adds it.
    private func amounts(_ d: DrinkKind) -> some View {
        HStack(spacing: 6) {
            ForEach(DrinkPrefs.amounts(d.id), id: \.self) { ml in
                Button {
                    Task {
                        busy = ml
                        await save(ml: ml, kind: d.id)
                        busy = nil
                        withAnimation(.easeOut(duration: 0.2)) { pouring = nil }
                    }
                } label: {
                    Group {
                        if busy == ml { ProgressView().tint(Palette.onButton) } else { Text(Units.volumeText(Double(ml))).font(.footnote.weight(.semibold)) }
                    }
                    .foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 38)
                    .background(Palette.blue, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
                .accessibilityLabel(L10n.f("Přidat %@ %@", L10n.tr(d.label).lowercased(with: L10n.locale), Units.volumeText(Double(ml))))
            }
        }
        .padding(.top, 16)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    private func run(_ item: PlusItem) {
        if let kind = item.drink {
            withAnimation(.easeOut(duration: 0.2)) { pouring = pouring == kind ? nil : kind }
            return
        }
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
        case "drinkCustom": drink = true
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

/// How "+" lays its shortcuts out.
enum PlusLayout: String {
    case categories, free

    struct Group { let section: PlusItem.Section; let items: [PlusItem] }

    /// The categories in their order, each on its own row, except that two
    /// neighbouring categories of two shortcuts or fewer share one row.
    static func rows(_ items: [PlusItem]) -> [[Group]] {
        let groups = PlusItem.Section.allCases.compactMap { section -> Group? in
            let list = items.filter { $0.section == section }
            return list.isEmpty ? nil : Group(section: section, items: list)
        }
        var rows: [[Group]] = []
        var i = 0
        while i < groups.count {
            if groups[i].items.count <= 2, i + 1 < groups.count, groups[i + 1].items.count <= 2 {
                rows.append([groups[i], groups[i + 1]])
                i += 2
            } else {
                rows.append([groups[i]])
                i += 1
            }
        }
        return rows
    }
}

/// A label whose icon has its own colour.
private struct TintedIcon: LabelStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 7) { configuration.icon.foregroundStyle(color); configuration.title }
    }
}

/// One thing "+" can do. The user picks which show and their order (pencil).
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

    /// The drink a drink shortcut pours (DrinkKind id).
    var drink: String? { id.hasPrefix("drink.") ? String(id.dropFirst(6)) : nil }

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

    /// "Pití" shows as the favourite drinks (Nastavení → Oblíbené nápoje),
    /// each its own tile, and Vlastní for any drink and amount.
    static func tiles(_ items: [PlusItem], favorites: [String]) -> [PlusItem] {
        items.flatMap { item -> [PlusItem] in
            guard item.id == "drink" else { return [item] }
            return favorites.compactMap(DrinkKind.find).map { PlusItem(id: "drink." + $0.id, title: $0.label, symbol: $0.symbol, section: .drink) }
                + [PlusItem(id: "drinkCustom", title: "Vlastní", symbol: "slider.horizontal.3", section: .drink)]
        }
    }
}

/// The pencil in "+": by category or in any order on top, then drag to
/// reorder, − hides, + adds.
struct PlusMenuEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var stored: String
    @Binding var layout: String
    @State private var shown: [PlusItem] = []
    @State private var arrangement = PlusLayout.categories

    private var hidden: [PlusItem] { PlusItem.all.filter { !shown.contains($0) } }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("", selection: $arrangement) {
                        Text("Po kategoriích").tag(PlusLayout.categories)
                        Text("Libovolně").tag(PlusLayout.free)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
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
                    Button {
                        stored = shown.map(\.id).joined(separator: ",")
                        layout = arrangement.rawValue
                        dismiss()
                    } label: { Text("Hotovo").bold() }
                }
            }
            .onAppear {
                shown = PlusItem.list(stored)
                arrangement = PlusLayout(rawValue: layout) ?? .categories
            }
        }
        .tint(Palette.ink)
    }

    private func row(_ item: PlusItem) -> some View {
        Label(L10n.tr(item.title), systemImage: item.symbol).foregroundStyle(item.section == .drink ? Palette.ink : item.section.color)
            .labelStyle(EditorRow())
    }
}

/// The editor row: the icon in its category's colour, the name in ink.
private struct EditorRow: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 12) { configuration.icon.frame(width: 24); configuration.title.foregroundStyle(Palette.ink) }
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
                                Image(systemName: d.symbol).scaledFont(18)
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
                    Button { step(-1) } label: { Image(systemName: "minus.circle").scaledFont(28) }
                        .accessibilityLabel("Méně")
                    Spacer()
                    Text(Units.imperial ? Fmt.int(Units.volume(Double(ml))) : String(ml)).font(Typo.number(64)).foregroundStyle(Palette.ink)
                    Text(verbatim: Units.volumeUnit).font(Typo.small).foregroundStyle(Palette.muted)
                    Spacer()
                    Button { step(1) } label: { Image(systemName: "plus.circle").scaledFont(28) }
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
