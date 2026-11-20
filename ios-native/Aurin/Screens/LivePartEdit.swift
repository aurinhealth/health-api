import SwiftUI

// Edit warm-up, Edit cardio and Edit stretching in the live workout (concept 08):
// the pill under a part opens it in place, "Today only", Done in the header
// keeps it for the day (GymDayParts.routines / cardio). Free time is a part
// with no moves: a clock you stop yourself.

/// What the Edit screen of a part changes, kept until Done.
struct LivePartDraft: Equatable {
    enum Mode: Equatable { case workout, mine, free }

    let part: GymDayPart
    var mode: Mode
    /// The own routine picked under My warm-ups / My stretching.
    var routine: String?
    var name: String?
    var items: [GymStretching.Item]
    /// The cardio's machine and minutes.
    var cardio: GymDayParts.Choice

    /// The id of Free time's one item: ticked when its Done is tapped.
    static let freeId = "free"

    static func isFree(_ routine: GymStretching?) -> Bool { routine?.items.first?.id == freeId }

    /// Something to do: a part with no moves left in it could never be done.
    var canSave: Bool { part.isCardio || mode == .free || !items.isEmpty }

    /// The part as it is now.
    static func start(_ part: GymDayPart, parts: GymDayParts, day: GymDay) -> LivePartDraft {
        let chosen = parts.routines?[part.rawValue]
        let moves = parts.routine(part, day: day)
        let mode: Mode = isFree(moves) ? .free : chosen?.routine != nil ? .mine : .workout
        return LivePartDraft(part: part, mode: mode, routine: mode == .mine ? chosen?.routine : nil, name: moves?.name,
                             items: mode == .free ? [] : moves?.items ?? [], cardio: parts.choice(part))
    }

    /// The day's parts with the change in.
    func applied(to parts: GymDayParts) -> GymDayParts {
        var next = parts
        if part.isCardio {
            next.cardio[part.rawValue] = cardio
            return next
        }
        var routines = next.routines ?? [:]
        switch mode {
        case .free:
            let item = GymStretching.Item(id: Self.freeId, name: L10n.tr("Volný čas"), seconds: 0, sides: false)
            routines[part.rawValue] = GymDayParts.Routine(routine: Self.freeId, length: nil,
                                                          moves: GymStretching(minutes: 0, items: [item], name: L10n.tr("Volný čas")))
        case .workout, .mine:
            let seconds = items.reduce(0) { $0 + ($1.seconds + 5) * ($1.sides ? 2 : 1) * max(1, $1.rounds) }
            let moves = GymStretching(minutes: max(1, Int((Double(seconds) / 60).rounded())), items: items, name: mode == .mine ? name : nil)
            routines[part.rawValue] = GymDayParts.Routine(routine: mode == .mine ? routine : nil, length: nil, moves: moves)
        }
        next.routines = routines
        return next
    }
}

/// Edit warm-up or Edit stretching: This workout, My warm-ups or Free time, the
/// moves (done ones ticked, the rest removed with minus or dragged), moves to
/// add, an own move, and Save as my warm-up.
struct LiveRoutineEditor: View {
    @Binding var draft: LivePartDraft
    let day: GymDay
    let date: String
    /// Today's ticks (GymRoutineKind.key + a move's id).
    let done: Set<String>
    /// The first move not done yet, marked Now.
    private var now: String? { leftItems.first?.id }
    @Environment(AppModel.self) private var model
    @State private var mine: [GymPreferences.MyRoutine] = []
    /// The own ones loaded: saving one before would replace them all.
    @State private var loadedMine = false
    @State private var library: GymRoutineMoves?
    @State private var writing = false
    @State private var loading = false
    @State private var saved = false
    @State private var error: String?

    private var kind: GymRoutineKind { draft.part.kind }
    private var warmup: Bool { kind == .warmup }
    private var doneItems: [GymStretching.Item] { draft.items.filter { done.contains(kind.key + $0.id) } }
    private var leftItems: [GymStretching.Item] { draft.items.filter { !done.contains(kind.key + $0.id) } }

    var body: some View {
        List {
            Section {
                tiles
            } header: {
                SectionLabel(text: kind.title)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            if draft.mode == .free {
                Section {
                    Text("Volný čas spustí hodiny a neukáže žádné cviky. Zastavíš je, až skončíš, a čas se počítá do tréninku.")
                        .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } else {
                if draft.mode == .mine { savedSection }
                movesSection
                addSection
                Section {
                    textButton(warmup ? "Přidat vlastní pohyb" : "Přidat vlastní protažení") { writing = true }
                    textButton(saved ? "Uloženo" : warmup ? "Uložit jako moji rozcvičku" : "Uložit jako moje protažení") { Task { await saveAsMine() } }
                        .disabled(saved || draft.items.isEmpty || model.demo || !loadedMine)
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                }
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .environment(\.editMode, .constant(.active))
        .opacity(loading ? 0.6 : 1)
        .sheet(isPresented: $writing) {
            GymOwnMoveSheet { item in
                draft.items.append(GymStretching.Item(id: "own-" + String(UUID().uuidString.prefix(8)).lowercased(), name: item.name,
                                                      seconds: item.seconds, sides: item.sides == true))
                saved = false
            }
        }
        .task { await load() }
    }

    // MARK: This workout, My warm-ups, Free time

    private var tiles: some View {
        HStack(spacing: 8) {
            tile("Tento trénink", on: draft.mode == .workout) { Task { await choose(.workout) } }
            tile(warmup ? "Moje rozcvičky" : "Moje protažení", on: draft.mode == .mine) { Task { await choose(.mine) } }
            tile("Volný čas", on: draft.mode == .free) { draft.mode = .free }
        }
    }

    private func tile(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: L10n.tr(title)).font(.subheadline.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .lineLimit(2).minimumScaleFactor(0.8).multilineTextAlignment(.center)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(on ? Palette.ink : Palette.ink.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The own ones to pick from; nothing saved yet says how to make one.
    private var savedSection: some View {
        Section {
            if mine.isEmpty {
                Text(warmup ? "Zatím žádná vlastní rozcvička. Uprav tuhle a ulož ji dole." : "Zatím žádné vlastní protažení. Uprav tohle a ulož ho dole.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(mine) { own in
                            tile(own.name, on: draft.routine == own.id) { Task { await pick(own) } }
                                .frame(width: 118)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        } header: {
            SectionLabel(text: "Uložené")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
    }

    // MARK: The moves

    private var movesSection: some View {
        Section {
            ForEach(doneItems) { item in
                HStack(spacing: 12) {
                    Image(systemName: "checkmark").scaledFont(14, weight: .semibold).foregroundStyle(Palette.green)
                        .frame(width: 22).accessibilityHidden(true)
                    moveText(item, faded: true)
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityValue(Text("Hotovo"))
            }
            if draft.items.isEmpty {
                Text(warmup ? "Přidej aspoň jeden pohyb, nebo zvol Volný čas." : "Přidej aspoň jedno protažení, nebo zvol Volný čas.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(leftItems) { item in
                HStack(spacing: 8) {
                    moveText(item, faded: false)
                    Spacer(minLength: 6)
                    if item.id == now {
                        Text("Teď").font(.footnote.weight(.semibold)).foregroundStyle(Palette.amber)
                    }
                }
                .frame(minHeight: 44)
            }
            .onDelete { offsets in
                let gone = Set(offsets.map { leftItems[$0].id })
                draft.items.removeAll { gone.contains($0.id) }
                saved = false
            }
            .onMove { from, to in
                var left = leftItems
                left.move(fromOffsets: from, toOffset: to)
                draft.items = doneItems + left
                saved = false
            }
        } header: {
            HStack {
                SectionLabel(text: warmup ? "Pohyby" : "Protažení")
                Spacer()
                Text(verbatim: L10n.f("Celkem %@ min", String(totalMinutes)))
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink).textCase(nil)
            }
        }
    }

    private var addSection: some View {
        let have = Set(draft.items.map(\.id))
        let moves = (library?.moves(kind) ?? []).filter { !have.contains($0.id) }
        return Section {
            ForEach(moves) { move in
                Button {
                    draft.items.append(GymStretching.Item(id: move.id, name: move.name, seconds: move.seconds, sides: move.sides,
                                                          photos: move.photos ?? []))
                    saved = false
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "plus.circle.fill").scaledFont(22).foregroundStyle(Palette.green)
                            .accessibilityHidden(true)
                        moveText(GymStretching.Item(id: move.id, name: move.name, seconds: move.seconds, sides: move.sides), faded: false)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text("Přidat"))
            }
        } header: {
            if !moves.isEmpty { SectionLabel(text: warmup ? "Přidat pohyb" : "Přidat protažení") }
        }
    }

    private func moveText(_ item: GymStretching.Item, faded: Bool) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(verbatim: item.name).font(.body).foregroundStyle(faded ? Palette.muted : Palette.ink).lineLimit(2)
            Text(verbatim: item.duration).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }

    private func textButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var totalMinutes: Int {
        let seconds = draft.items.reduce(0) { $0 + $1.seconds * ($1.sides ? 2 : 1) * max(1, $1.rounds) }
        return max(1, Int((Double(seconds) / 60).rounded()))
    }

    // MARK: Server

    private func load() async {
        guard !model.demo else { return }
        async let prefs = try? model.api.gymPreferences()
        async let moves = try? model.api.gymRoutineMoves()
        if let loaded = await prefs {
            mine = loaded.routines(kind)
            loadedMine = true
        }
        library = await moves
    }

    /// This workout: the plan's moves again; My warm-ups: the first own one.
    /// The moves done so far stay at the top either way.
    private func choose(_ mode: LivePartDraft.Mode) async {
        guard mode != draft.mode else { return }
        if mode == .mine {
            draft.mode = .mine
            if let first = mine.first {
                await pick(first)
            } else if draft.items.isEmpty {
                // Nothing saved yet (from Free time): the plan's moves to start one from.
                merge((warmup ? day.warmup : day.stretching)?.items ?? [])
            }
            return
        }
        draft.mode = .workout
        draft.routine = nil
        draft.name = nil
        let plan = kind == .warmup ? day.warmup : day.stretching
        if let plan, !model.demo {
            loading = true
            defer { loading = false }
            do {
                merge(try await model.api.gymRoutine(date: date, kind: kind, length: nil, routine: nil).items)
                error = nil
            } catch {
                merge(plan.items)
            }
        } else if let plan {
            merge(plan.items)
        }
    }

    private func pick(_ own: GymPreferences.MyRoutine) async {
        draft.routine = own.id
        draft.name = own.name
        guard !model.demo else { return }
        loading = true
        defer { loading = false }
        do {
            merge(try await model.api.gymRoutine(date: date, kind: kind, length: nil, routine: own.id).items)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The done moves, then the new ones not done yet.
    private func merge(_ items: [GymStretching.Item]) {
        let kept = doneItems
        let ids = Set(kept.map(\.id))
        draft.items = kept + items.filter { !ids.contains($0.id) }
        saved = false
    }

    /// Save as my warm-up: the moves as they are now, as an own one (Settings → Gym lists it too).
    private func saveAsMine() async {
        let catalog = Set((library?.moves(kind) ?? []).map(\.id))
        let items = draft.items.map { item in
            GymPreferences.MyItem(move: catalog.contains(item.id) ? item.id : nil, name: item.name, seconds: item.seconds, sides: item.sides)
        }
        let name = L10n.tr(warmup ? "Moje rozcvička" : "Moje protažení") + (mine.isEmpty ? "" : " \(mine.count + 1)")
        let own = GymPreferences.MyRoutine(id: kind.id + "-" + String(UUID().uuidString.prefix(8)).lowercased(), name: name, minutes: nil, items: items)
        do {
            let prefs = try await model.api.saveGymPreferences(["myRoutines": .object([kind.id: .array((mine + [own]).map(\.json))])])
            mine = prefs.routines(kind)
            saved = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Edit cardio: the machine, the time and nothing else to choose.
struct LiveCardioEditor: View {
    @Binding var choice: GymDayParts.Choice
    @Environment(AppModel.self) private var model
    @State private var options: [GymPreferences.CardioOption] = []
    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Stroj").padding(.top, 8)
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(machines, id: \.self) { id in
                        let on = choice.type == id
                        Button { choice.type = id } label: {
                            Text(verbatim: GymCardio.name(id)).font(.subheadline.weight(.medium))
                                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                                .lineLimit(1).minimumScaleFactor(0.8)
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(on ? Palette.ink : Palette.ink.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                CardioLengthSlider(minutes: $choice.minutes, title: "Čas")
                    .padding(16)
                    .cardSurface(cornerRadius: 22)
                    .padding(.top, 10)
                SectionLabel(text: "Cíl").padding(.top, 14)
                HStack(spacing: 8) {
                    targetTile(L10n.f("Zóna %@", "2"), 2)
                    targetTile(L10n.f("Zóna %@", "3"), 3)
                    targetTile(L10n.tr("Bez cíle"), nil)
                }
                Text(choice.target == nil ? "Bez cíle se počítá čas a ukazuje tep, bez zóny, kterou držet." : "Karta ukáže, jestli jsi v zóně, a kolik času v ní zatím máš.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .task {
            guard !model.demo, let prefs = try? await model.api.gymPreferences() else { return }
            options = prefs.cardioOptions ?? []
        }
    }

    private func targetTile(_ title: String, _ zone: Int?) -> some View {
        let on = choice.target == zone
        return Button { choice.target = zone } label: {
            Text(verbatim: title).font(.subheadline.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(on ? Palette.ink : Palette.ink.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The place's machines (all of them until they load), the chosen one kept.
    private var machines: [String] {
        var list = options.isEmpty ? GymCardio.all : options.map(\.id)
        if !list.contains(choice.type) { list.insert(choice.type, at: 0) }
        return list
    }
}

/// Free time: the part's clock, heart rate and calories, and no moves.
struct FreeTimeRunner: View {
    let kind: GymRoutineKind
    let key: String
    var live: LiveWorkout = .shared

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: 14) {
                VStack(spacing: 4) {
                    SectionLabel(text: "Čas")
                    Text(verbatim: clock(live.seconds(of: key, at: context.date)))
                        .font(Typo.heading(84, relativeTo: .largeTitle)).monospacedDigit().foregroundStyle(Palette.ink)
                }
                .padding(.top, 18)
                Rectangle().fill(Palette.hairline).frame(height: 1)
                HStack(alignment: .lastTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        SectionLabel(text: "Tep")
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(verbatim: live.heartRate.map { Fmt.int($0) } ?? "–").font(Typo.heading(34)).foregroundStyle(Palette.ink)
                            Text(verbatim: "bpm").font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        SectionLabel(text: "Kalorie")
                        Text(verbatim: Fmt.int(kcal)).font(Typo.heading(34)).foregroundStyle(Palette.ink)
                    }
                }
                .padding(.bottom, 4)
            }
            .padding(16)
        }
        .accessibilityElement(children: .combine)
    }

    /// The calories while this part was on, as its time.
    private var kcal: Double { live.kcal(of: key) }

    private func clock(_ seconds: Int) -> String {
        let m = seconds / 60, s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }
}
