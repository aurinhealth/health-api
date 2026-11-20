import SwiftUI
import UniformTypeIdentifiers

/// The "+" in the tab bar (redesign part N, concept 14-plus, variant B like
/// Bevel): a floating glass card above the tab bar, nine spots three to a row,
/// the coach's two lights fixed in the middle. Holding an icon opens the edit:
/// Cancel and Save on top, minus badges, drag to reorder, and under a line the
/// other actions with a plus. A drink shows its amounts above its row; a tap
/// logs it, and the same place then says what was added, with Undo.
struct PlusCard: View {
    @Environment(AppModel.self) private var model
    var close: () -> Void
    var openCoach: () -> Void
    /// The user's actions in order, without the coach (PlusItem.storageKey);
    /// empty until the first save, then the defaults or the old "+" apply.
    @AppStorage(PlusItem.storageKey) private var stored = ""
    @State private var editing = false
    @State private var draft: [String] = []
    @State private var held = false
    @State private var dragging: String?
    @State private var pouring: String?
    @State private var poured: Poured?
    @State private var food: FoodStart?
    @State private var weight = false
    @State private var workout = false
    @State private var drink = false
    @State private var period = false
    @State private var status = false
    /// An AI tile tapped without the AI consent: the consent card, then that tile.
    @State private var consentFor: String?

    /// A drink just logged from the card, with its Undo.
    struct Poured: Equatable {
        let name: String
        let amount: String
        let localId: Int?
        var undone = false
        var text: String { L10n.f(undone ? "Odebráno: %@ %@" : "Přidáno: %@ %@", name.lowercased(with: L10n.locale), amount) }
    }

    private var cycleOn: Bool { model.cycle?.enabled == true }
    private var saved: [String] {
        PlusItem.card(stored: stored, legacy: UserDefaults.standard.string(forKey: PlusItem.legacyKey),
                      favorites: UserDefaults.standard.string(forKey: DrinkPrefs.favoritesKey) ?? DrinkPrefs.defaultFavorites)
    }
    /// What the card shows: the saved actions (Log period only while cycle
    /// tracking is on), the coach in the middle spot.
    private var spots: [String] {
        PlusItem.withCoach((editing ? draft : saved).filter { $0 != "period" || cycleOn })
    }
    private var more: [PlusItem] {
        PlusItem.all.filter { $0.id != PlusItem.coach && !draft.contains($0.id) && ($0.id != "period" || cycleOn) }
    }
    private var left: Int { max(0, PlusItem.actions - draft.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if editing { editBar }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                if !editing, slotRow == row { slot }
                HStack(alignment: .top, spacing: 8) {
                    ForEach(row, id: \.self) { tile($0) }
                    ForEach(0..<(3 - row.count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity, maxHeight: 1) }
                }
                .padding(.top, 14)
            }
            if editing { addActions }
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 18)
        .chromeGlass(in: RoundedRectangle(cornerRadius: 34, style: .continuous), interactive: false)
        .chromeShadow(0.14, radius: 24, y: 10)
        .sensoryFeedback(.impact(weight: .medium), trigger: editing)
        .accessibilityAction(.escape) { editing ? finishEditing() : close() }
        // What "+" adds goes to today, also while the screens show another day.
        .onAppear { model.writesToday = true }
        .onDisappear {
            model.writesToday = false
            // Closed by a tap beside it or the ×: the edit is kept, as on the home screen.
            if editing { save() }
        }
        .sheet(item: $food, onDismiss: close) { start in AddFoodSheet(meal: MealSlot.now(slots: model.food?.mealSlots), start: start) }
        .sheet(isPresented: $weight, onDismiss: close) { WeightEntrySheet() }
        .sheet(isPresented: $workout, onDismiss: close) { ManualWorkoutSheet() }
        .sheet(isPresented: $drink, onDismiss: close) { DrinkSheet(kind: "water") { ml, kind in _ = await model.addDrink(ml: ml, kind: kind) } }
        .sheet(isPresented: $period, onDismiss: close) { PeriodLogSheet() }
        .sheet(isPresented: $status, onDismiss: close) { AthleteStatusSheet(current: model.athleteStatus ?? .active) }
        .sheet(item: Binding(get: { consentFor.map(ConsentTile.init) }, set: { consentFor = $0?.id })) { tile in
            AIConsentAsk { run(tile.id) }
        }
    }

    private struct ConsentTile: Identifiable { let id: String }

    /// `editing`: opens straight in the edit (the snapshot tests).
    init(close: @escaping () -> Void, openCoach: @escaping () -> Void, editing: Bool = false) {
        self.close = close
        self.openCoach = openCoach
        _editing = State(initialValue: editing)
        let defaults = UserDefaults.standard
        _draft = State(initialValue: editing ? PlusItem.card(stored: defaults.string(forKey: PlusItem.storageKey) ?? "", legacy: defaults.string(forKey: PlusItem.legacyKey),
                                                              favorites: defaults.string(forKey: DrinkPrefs.favoritesKey) ?? DrinkPrefs.defaultFavorites) : [])
    }

    private var rows: [[String]] { stride(from: 0, to: spots.count, by: 3).map { Array(spots[$0..<min($0 + 3, spots.count)]) } }
    /// The row whose drink was tapped: its amounts, or what was added, sit just
    /// above it, so the card grows upward and nothing at or below it moves.
    private var slotRow: [String]? {
        guard let id = pouring ?? poured.map({ _ in lastDrink }) else { return nil }
        return rows.first { $0.contains(id) }
    }
    @State private var lastDrink = ""

    // MARK: Edit

    private var editBar: some View {
        HStack {
            Button { finishEditing() } label: { Text("Zrušit").font(.body) }
                .frame(minHeight: 44)
                .accessibilityIdentifier("plus.cancel")
            Spacer()
            Button {
                save()
                finishEditing()
            } label: {
                Text("Uložit").font(.body.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(Palette.track, in: Capsule())
            }
                .frame(minHeight: 44)
                .accessibilityIdentifier("plus.save")
        }
        .foregroundStyle(Palette.ink)
        .padding(.horizontal, 8)
    }

    private var addActions: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Palette.hairline).frame(height: 1).padding(.top, 18)
            HStack(alignment: .firstTextBaseline) {
                Text("Přidat akce").font(.headline).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: left == 0 ? L10n.tr("Karta je plná") : L10n.plural("%lld volných míst", left))
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
            .padding(.top, 14).padding(.horizontal, 8)
            if left == 0 {
                Text("Odeber akci, aby šla přidat jiná.").font(Typo.small).foregroundStyle(Palette.muted)
                    .padding(.top, 4).padding(.horizontal, 8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if more.isEmpty {
                Text("Všechno je na kartě.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 12).padding(.horizontal, 8)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 4) {
                        ForEach(more) { item in
                            Button { if left > 0 { withAnimation(.snappy) { draft.append(item.id) } } } label: {
                                label(item, badge: "plus")
                            }
                            .buttonStyle(.plain)
                            .frame(width: 84)
                            .disabled(left == 0)
                            .opacity(left > 0 ? 1 : 0.4)
                            .accessibilityLabel(L10n.f("Přidat %@", L10n.tr(item.title)))
                            .accessibilityIdentifier("plus.add." + item.id)
                        }
                    }
                    .padding(.horizontal, 4)
                }
                .padding(.top, 12)
            }
        }
    }

    /// An empty card is saved as "-", so it stays empty and the defaults
    /// don't come back (PlusItem.card).
    private func save() { stored = draft.isEmpty ? "-" : draft.joined(separator: ",") }

    private func finishEditing() {
        held = false
        withAnimation(.snappy) { editing = false }
    }

    private func startEditing() {
        draft = saved.filter { $0 != "period" || cycleOn }
        pouring = nil
        poured = nil
        withAnimation(.snappy) { editing = true }
    }

    // MARK: Tiles

    @ViewBuilder private func tile(_ id: String) -> some View {
        if let item = PlusItem.find(id) {
            if editing {
                let fixed = id == PlusItem.coach
                label(item, badge: fixed ? nil : "minus")
                    .modifier(Wiggle(amplitude: fixed ? 0 : 1.6, seed: id.count))
                    .contentShape(Rectangle())
                    .onTapGesture { if !fixed { withAnimation(.snappy) { draft.removeAll { $0 == id } } } }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(L10n.tr(item.title))
                    .accessibilityIdentifier("plus." + id)
                    .modifier(PlusMovable(id: id, fixed: fixed, draft: $draft, dragging: $dragging))
            } else {
                Button {
                    if held { held = false; return }
                    run(id)
                } label: { label(item, badge: nil) }
                .buttonStyle(PressableCardStyle())
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded { _ in
                    held = true
                    startEditing()
                })
                .accessibilityIdentifier("plus." + id)
                .accessibilityAction(named: Text("Upravit +")) { startEditing() }
            }
        }
    }

    /// The icon in a round glass disc, its name under it; the coach's two
    /// lights stand without a disc.
    private func label(_ item: PlusItem, badge: String?) -> some View {
        let on = item.pours && pouring == item.id
        return VStack(spacing: 7) {
            ZStack(alignment: .topLeading) {
                Group {
                    if item.id == PlusItem.coach {
                        TwoLights(size: 56)
                    } else {
                        icon(item)
                            .foregroundStyle(on ? Palette.onAccent : Palette.ink)
                            .frame(width: 56, height: 56)
                            .background { if on { Circle().fill(Palette.blue) } }
                            .chromeGlass(in: Circle(), interactive: false)
                    }
                }
                .frame(width: 56, height: 56)
                if let badge {
                    Image(systemName: badge + ".circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Palette.onButton, badge == "minus" ? Palette.secondary : Palette.button)
                        .offset(x: -4, y: -4)
                        .accessibilityHidden(true)
                }
            }
            Text(L10n.tr(item.title)).font(.footnote.weight(.medium)).foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func icon(_ item: PlusItem) -> some View {
        if let asset = item.asset {
            Image(asset).renderingMode(.template).resizable().scaledToFit().frame(width: 30, height: 30)
        } else {
            Image(systemName: item.symbol).font(.system(size: 22, weight: .semibold))
        }
    }

    // MARK: Drinks

    /// The amounts over the tapped drink, or what was added with Undo.
    @ViewBuilder private var slot: some View {
        if let pouring {
            HStack(spacing: 8) {
                ForEach(Array(DrinkPrefs.amounts(pouring).prefix(3)), id: \.self) { ml in
                    Button { pour(ml, pouring) } label: {
                        Text(Units.volumeText(Double(ml))).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onAccent)
                            .padding(.horizontal, 16).frame(minHeight: 44).background(Palette.blue, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.f("Přidat %@ %@", L10n.tr(PlusItem.find(pouring)?.title ?? "").lowercased(with: L10n.locale), Units.volumeText(Double(ml))))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 14)
            .transition(.opacity)
        } else if let poured {
            HStack(spacing: 8) {
                if !poured.undone { Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(Palette.green) }
                Text(verbatim: poured.text).font(Typo.small).foregroundStyle(poured.undone ? Palette.muted : Palette.ink)
                Spacer(minLength: 8)
                if !poured.undone {
                    Button { undo() } label: {
                        Label("Vrátit", systemImage: "arrow.uturn.backward").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("plus.undo")
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .accessibilityElement(children: .contain)
            .transition(.opacity)
        }
    }

    private func pour(_ ml: Int, _ kind: String) {
        let id = model.addDrinkForUndo(ml: ml, kind: kind)
        let name = L10n.tr(PlusItem.find(kind)?.title ?? kind)
        lastDrink = kind
        withAnimation(.easeOut(duration: 0.2)) {
            pouring = nil
            poured = Poured(name: name, amount: Units.volumeText(Double(ml)), localId: id)
        }
        if let poured { AccessibilityNotification.Announcement(poured.text).post() }
    }

    private func undo() {
        guard let p = poured else { return }
        if let id = p.localId { Task { _ = await model.deleteDrink(id: id) } }
        withAnimation(.easeOut(duration: 0.2)) {
            poured = Poured(name: p.name, amount: p.amount, localId: nil, undone: true)
        }
        if let poured { AccessibilityNotification.Announcement(poured.text).post() }
    }

    // MARK: Actions

    private func run(_ id: String) {
        if let item = PlusItem.find(id), item.pours {
            lastDrink = id
            withAnimation(.easeOut(duration: 0.2)) {
                poured = nil
                pouring = pouring == id ? nil : id
            }
            return
        }
        // The AI features ask for the consent first (D-PLUS-1): the same card as in the coach.
        if ["photo", "gallery"].contains(id), model.aiOff, !model.demo { consentFor = id; return }
        let today = AppModel.localDate(Date())
        switch id {
        case "start": open(.trainingMode(today))
        case "log": workout = true
        case "aotd": open(.coachPick(true))
        case "library": open(.library)
        case "build": open(.gymBuilder)
        case "photo": food = .photo
        case "search": food = .search
        case "barcode": food = .scan
        case "gallery": food = .gallery
        case "label": food = .label
        case "manual": food = .manual
        case "other": drink = true
        case "journal": open(.journal(today))
        case "status": status = true
        case "period": period = true
        case "weight": weight = true
        case PlusItem.coach: openCoach()
        default: break
        }
    }

    private func open(_ route: AppRoute) {
        close()
        model.open(route)
    }
}

/// In the edit an action moves by dragging, or with VoiceOver's Move up /
/// down; the coach keeps its spot and does neither.
private struct PlusMovable: ViewModifier {
    let id: String
    let fixed: Bool
    @Binding var draft: [String]
    @Binding var dragging: String?

    func body(content: Content) -> some View {
        if fixed {
            content.accessibilityHint(Text("Kouč má na kartě pevné místo."))
        } else {
            content
                .onDrag {
                    dragging = id
                    return NSItemProvider(object: id as NSString)
                }
                .onDrop(of: [UTType.text], delegate: PlusDrop(target: id, items: $draft, dragging: $dragging))
                .accessibilityHint(Text("Odebere akci z karty."))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction(named: Text("Posunout výš")) { move(-1) }
                .accessibilityAction(named: Text("Posunout níž")) { move(1) }
        }
    }

    private func move(_ by: Int) {
        guard let i = draft.firstIndex(of: id), draft.indices.contains(i + by) else { return }
        draft.swapAt(i, i + by)
    }
}

/// Dragging a tile over another puts it there (as WidgetDropDelegate).
private struct PlusDrop: DropDelegate {
    let target: String
    @Binding var items: [String]
    @Binding var dragging: String?

    func dropEntered(info: DropInfo) {
        guard let moving = dragging, moving != target,
              let from = items.firstIndex(of: moving), let to = items.firstIndex(of: target) else { return }
        var list = items
        list.move(fromOffsets: IndexSet(integer: from), toOffset: to > from ? to + 1 : to)
        withAnimation(.snappy) { items = list }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }

    func performDrop(info: DropInfo) -> Bool {
        dragging = nil
        return true
    }
}

/// One thing "+" can do (the concept's catalogue of 26 actions).
struct PlusItem: Identifiable, Equatable {
    let id: String
    /// The Czech key of its name (en.lproj has the English one).
    let title: String
    let symbol: String
    /// Our own glyph (Assets: Plus…) where SF Symbols has none.
    var asset: String? = nil

    /// A drink with its amounts over the row; "other" opens the drink sheet instead.
    var pours: Bool { DrinkKind.find(id) != nil && id != "other" }

    static let coach = "coach"
    /// Nine spots: the coach in the middle and eight actions of the user's.
    static let actions = 8
    static let storageKey = "plusMenu.card"
    /// Today's "+" before the redesign: ids and the "drink" group of favourites.
    static let legacyKey = "plusMenu.items"

    static let all: [PlusItem] = [
        PlusItem(id: "start", title: "Začít trénink", symbol: "play.fill"),
        PlusItem(id: "log", title: "Zapsat trénink", symbol: "list.clipboard.fill"),
        PlusItem(id: "aotd", title: "Aktivita dne", symbol: "figure.mixed.cardio"),
        PlusItem(id: "library", title: "Knihovna", symbol: "figure.run.square.stack.fill"),
        PlusItem(id: "build", title: "Sestavit posilovnu", symbol: "dumbbell.fill", asset: "PlusBuild"),
        PlusItem(id: "photo", title: "Vyfotit jídlo", symbol: "camera.fill"),
        PlusItem(id: "search", title: "Hledat jídlo", symbol: "magnifyingglass"),
        PlusItem(id: "barcode", title: "Čárový kód", symbol: "barcode.viewfinder"),
        PlusItem(id: "gallery", title: "Jídlo z galerie", symbol: "photo.on.rectangle.angled.fill"),
        PlusItem(id: "label", title: "Etiketa", symbol: "text.viewfinder"),
        PlusItem(id: "manual", title: "Jídlo ručně", symbol: "square.and.pencil"),
        PlusItem(id: "water", title: "Voda", symbol: "drop.fill"),
        PlusItem(id: "coffee", title: "Káva", symbol: "cup.and.heat.waves.fill"),
        PlusItem(id: "tea", title: "Čaj", symbol: "cup.and.saucer.fill"),
        PlusItem(id: "juice", title: "Džus", symbol: "takeoutbag.and.cup.and.straw.fill", asset: "PlusJuice"),
        PlusItem(id: "milk", title: "Mléko", symbol: "waterbottle.fill", asset: "PlusMilk"),
        PlusItem(id: "sport", title: "Ionťák", symbol: "bolt.fill", asset: "PlusSportsDrink"),
        PlusItem(id: "soda", title: "Limonáda", symbol: "bubbles.and.sparkles.fill", asset: "PlusSoda"),
        PlusItem(id: "beer", title: "Pivo", symbol: "mug.fill", asset: "PlusBeer"),
        PlusItem(id: "wine", title: "Víno", symbol: "wineglass.fill"),
        PlusItem(id: "other", title: "Jiný nápoj", symbol: "plus", asset: "PlusOtherDrink"),
        PlusItem(id: "journal", title: "Deník", symbol: "text.book.closed.fill"),
        PlusItem(id: "status", title: "Stav sportovce", symbol: "person.crop.circle.badge.fill"),
        PlusItem(id: "period", title: "Zapsat menstruaci", symbol: "drop.circle.fill", asset: "PlusPeriod"),
        PlusItem(id: "weight", title: "Zapsat váhu", symbol: "scalemass.fill", asset: "PlusWeight"),
        PlusItem(id: coach, title: "Zeptat se kouče", symbol: "bubble.left.fill")
    ]

    /// Petr's default card (2026-11-14): Photo of meal, Search food, Barcode /
    /// Start workout, the coach, Log workout / Water, Journal, Log weight.
    static let defaults = ["photo", "search", "barcode", "start", "log", "water", "journal", "weight"]

    static func find(_ id: String) -> PlusItem? { all.first { $0.id == id } }

    /// The coach in the fifth spot, the middle of the card when it is full.
    static func withCoach(_ ids: [String]) -> [String] {
        var list = ids.filter { $0 != coach }
        list.insert(coach, at: min(4, list.count))
        return list
    }

    /// The saved card; before the first save the old "+" carries over (its
    /// ids renamed, its drink group as the favourite drinks), or the defaults.
    static func card(stored: String, legacy: String?, favorites: String) -> [String] {
        if !stored.isEmpty { return clean(stored.split(separator: ",").map(String.init)) }
        guard let legacy else { return defaults }
        let renamed = ["pick": "aotd", "gymBuilder": "build", "scan": "barcode"]
        let ids = legacy.split(separator: ",").flatMap { part -> [String] in
            let id = String(part)
            if id == "drink" { return DrinkPrefs.list(favorites) }
            return [renamed[id] ?? id]
        }
        return clean(ids)
    }

    /// Known actions once each, at most eight, never the coach (it has its own spot).
    private static func clean(_ ids: [String]) -> [String] {
        var seen: Set<String> = []
        return Array(ids.filter { $0 != coach && find($0) != nil && seen.insert($0).inserted }.prefix(actions))
    }
}

/// "+" → Log period (only while cycle tracking is on): the day and the flow;
/// the day's symptoms stay as they were (src/cycle-store.js).
struct PeriodLogSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var day = Date()
    @State private var flow = 2
    @State private var saving = false
    @State private var error: String?

    /// The concept's Light / Medium / Heavy (the cycle screen keeps its own words).
    static let flows = ["Slabé", "Středně silné", "Silné"]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center) {
                Text("Zapsat menstruaci").font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
            }
            SettingsGroup {
                DatePicker("Datum", selection: $day, in: ...Date(), displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
                    .padding(.horizontal, 16).frame(minHeight: 50)
            }
            Text(verbatim: L10n.tr("Síla krvácení").uppercased(with: Fmt.locale))
                .font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(Palette.muted)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                ForEach(1...3, id: \.self) { level in
                    let on = flow == level
                    Button { flow = level } label: {
                        Text(L10n.tr(Self.flows[level - 1])).font(Typo.bodyStrong)
                            .foregroundStyle(on ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(on ? Palette.button : Palette.track, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            PrimaryButton(title: saving ? "Ukládám…" : "Uložit", busy: saving) { Task { await save() } }
                .disabled(saving)
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.height(380), .medium])
        .glassSheetBackground()
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await model.logCycleDay(AppModel.localDate(day), ["flow": .number(Double(flow))])
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
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
        // The preview only; the numbers come from the server (HYDRATION_FACTORS in src/fluids.js, beer 0 since NUT-2).
        DrinkKind(id: "beer", label: "Pivo", symbol: "wineglass", factor: 0),
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
                    Text(editing ? "Upravit pití" : "Co piješ?").font(Typo.heading(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
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
