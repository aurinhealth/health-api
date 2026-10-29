import SwiftUI

/// Jídlo → Pití → a tap on the number: the day's drinks by kind (how much of
/// each and what it counts for, a tap shows the single drinks) or through the
/// day. A swipe or a long press on a drink edits or deletes it.
struct DrinkHistoryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var byTime = false
    @State private var editing: FoodSnapshot.Drink?
    /// Kinds opened to their single drinks, which can be edited or deleted.
    @State private var open: Set<String> = []
    /// Vybrat: the ticked drinks, to copy, move or delete at once.
    @State private var selecting = false
    @State private var selected: Set<Int> = []
    @State private var moving: String?
    @State private var confirmDelete = false

    private var water: FoodSnapshot.Water? { model.food?.water }
    private var drinks: [FoodSnapshot.Drink] { water?.drinks ?? [] }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        BackSlot { dismiss() }
                        Spacer()
                        SectionLabel(text: "Pití dnes")
                        Spacer()
                        BackSlot {}.hidden()
                    }
                    summary.padding(.top, 28)
                    HStack(spacing: 6) {
                        tab("Podle druhu", on: !byTime) { byTime = false }
                        tab("Během dne", on: byTime) { byTime = true }
                    }
                    .padding(.top, 22)
                    if drinks.isEmpty {
                        Text("Dnes zatím nic.").font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 20)
                    } else if byTime {
                        timeList.padding(.top, 14)
                    } else {
                        kindList.padding(.top, 14)
                    }
                }
                .padding(24)
                .padding(.bottom, selecting ? 190 : 100)
            }
        }
        .modifier(SelectionBar(selecting: $selecting, selected: $selected, allIds: drinks.map(\.id), title: "Pití dnes", back: { dismiss() }))
        .overlay(alignment: .bottom) {
            if selecting {
                BulkActionBar(count: selected.count, copy: { moving = "Kopírovat" }, move: { moving = "Přesunout" }, delete: { confirmDelete = true })
                    .padding(.horizontal, 24).padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .sheet(item: Binding(get: { moving.map { BulkVerb(verb: $0) } }, set: { moving = $0?.verb })) { v in
            BulkMoveSheet(verb: v.verb, count: selected.count, from: model.food?.date ?? AppModel.localDate(Date())) { date, _ in
                await run(v.verb == "Kopírovat" ? "copy" : "move", date: date)
            }
        }
        .confirmationDialog(L10n.f("Smazat %@?", BulkMoveSheet.items(selected.count)), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { Task { _ = await run("delete") } }
        }
        .navBarVisibility(.hidden)
        .sheet(item: $editing) { d in
            DrinkSheet(kind: d.kind, ml: Int(d.ml ?? 250), editing: true) { ml, kind in _ = await model.updateDrink(id: d.id, ml: ml, kind: kind) }
        }
    }

    // MARK: - Summary

    private var target: Double { max(water?.target ?? 2500, 1) }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(DrinkHistory.big(water?.ml ?? 0)).font(Typo.number(64)).foregroundStyle(Palette.ink)
                Text("/ " + DrinksCard.litres(target)).font(Typo.number(26)).foregroundStyle(Palette.faint)
            }
            if let drunk = water?.drunkMl, abs(drunk - (water?.ml ?? 0)) >= 20 {
                Text(L10n.f("vypito %@", DrinksCard.litres(drunk))).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            stackedBar.padding(.top, 12)
        }
    }

    /// The day's goal as a bar, each kind of drink in its own colour.
    private var stackedBar: some View {
        let groups = DrinkHistory.byKind(drinks)
        let total = max(target, groups.reduce(0) { $0 + $1.hydrationMl })
        return GeometryReader { geo in
            HStack(spacing: 3) {
                ForEach(groups) { g in
                    Rectangle().fill(DrinkHistory.color(g.kind))
                        .frame(width: max(0, geo.size.width * g.hydrationMl / total - 3))
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.track)
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }

    private func tab(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeOut(duration: 0.2), action) } label: {
            Text(L10n.tr(title)).font(Typo.bodyStrong)
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 14).frame(height: 34)
                .background(on ? Palette.button : .clear, in: Capsule())
                .overlay { Capsule().stroke(Palette.ink.opacity(on ? 0 : 0.18), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: - Lists

    private var kindList: some View {
        Card {
            VStack(spacing: 0) {
                ForEach(Array(DrinkHistory.byKind(drinks).enumerated()), id: \.element.id) { index, g in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    let kind = DrinkKind.find(g.kind)
                    HStack(spacing: 12) {
                        Image(systemName: kind?.symbol ?? "drop.fill").scaledFont(15, cap: .denseCap)
                            .foregroundStyle(DrinkHistory.color(g.kind))
                            .frame(width: 34, height: 34)
                            .background(DrinkHistory.color(g.kind).opacity(0.14), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.tr(kind?.label ?? g.kind)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(L10n.f("%@× · vypito %@", Fmt.int(Double(g.count)), Units.volumeText(g.ml)))
                                .font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                        Text(Units.volumeText(g.hydrationMl)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                        Image(systemName: "chevron.down").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                            .rotationEffect(.degrees(open.contains(g.kind) ? 180 : 0))
                    }
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.easeOut(duration: 0.2)) {
                            if open.contains(g.kind) { open.remove(g.kind) } else { open.insert(g.kind) }
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    if open.contains(g.kind) {
                        ForEach(drinks.filter { $0.kind == g.kind }.sorted { ($0.time ?? "99") < ($1.time ?? "99") }) { d in
                            row(d).padding(.leading, 46)
                        }
                    }
                }
            }
        }
    }

    private var timeList: some View {
        Card {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(DrinkHistory.byPart(drinks), id: \.title) { part in
                    SectionLabel(text: part.title).padding(.top, 12).padding(.bottom, 2)
                    ForEach(part.drinks) { row($0) }
                }
            }
        }
    }

    /// Sends the change for the ticked drinks; nil when it worked, else the message.
    private func run(_ action: String, date: String? = nil) async -> String? {
        let ids = selected.filter { $0 > 0 }
        if action == "delete" { for id in selected where id < 0 { await model.deleteDrink(id: id) } }
        if !model.demo, !ids.isEmpty {
            do {
                let skipped = try await model.api.bulkFluids(action, ids: Array(ids), date: date)
                if !skipped.isEmpty { model.notice = L10n.tr("Pití z jiné aplikace nejde přesunout, jen zkopírovat nebo smazat. Zůstalo na místě.") }
            } catch {
                return error.localizedDescription
            }
            await model.refreshFood()
            await model.refresh()
        }
        withAnimation(.easeOut(duration: 0.2)) { selecting = false }
        selected = []
        return nil
    }

    /// One drink; a swipe or a long press edits or deletes it, a swipe right
    /// starts Vybrat. Another app's drink is only deleted, from Aurin alone.
    /// While selecting, a tap ticks it.
    @ViewBuilder
    private func row(_ d: FoodSnapshot.Drink) -> some View {
        if selecting {
            SelectableRow(on: selected.contains(d.id), toggle: {
                if selected.contains(d.id) { selected.remove(d.id) } else { selected.insert(d.id) }
            }) { DrinkLine(drink: d) }
        } else {
            editableRow(d)
        }
    }

    @ViewBuilder
    private func editableRow(_ d: FoodSnapshot.Drink) -> some View {
        let delete = { Task { _ = await model.deleteDrink(id: d.id) } }
        let select = { selected = [d.id]; withAnimation(.easeOut(duration: 0.2)) { selecting = true } }
        Group {
            if d.app != nil {
                SwipeRow(select: select, delete: { _ = delete() }) { DrinkLine(drink: d) }
            } else {
                SwipeRow(edit: { editing = d }, select: select, delete: { _ = delete() }) { DrinkLine(drink: d) }
            }
        }
        .contextMenu {
            if d.app == nil {
                Button { editing = d } label: { Label("Upravit", systemImage: "pencil") }
            }
            Button(role: .destructive) { _ = delete() } label: {
                Label(L10n.tr(d.app == nil ? "Smazat" : "Smazat jen v Aurinu"), systemImage: "trash")
            }
        }
    }
}

/// The groupings of Pití dnes, apart from the view to test them.
enum DrinkHistory {
    struct KindGroup: Identifiable, Equatable {
        let kind: String
        var count: Int
        var ml: Double
        var hydrationMl: Double
        var id: String { kind }
    }

    struct Part {
        let title: String
        let drinks: [FoodSnapshot.Drink]
    }

    /// Each kind once, the one that hydrated most first.
    static func byKind(_ drinks: [FoodSnapshot.Drink]) -> [KindGroup] {
        var groups: [KindGroup] = []
        for d in drinks {
            let ml = d.ml ?? 0, hydration = d.hydrationMl ?? ml
            if let i = groups.firstIndex(where: { $0.kind == d.kind }) {
                groups[i].count += 1
                groups[i].ml += ml
                groups[i].hydrationMl += hydration
            } else {
                groups.append(KindGroup(kind: d.kind, count: 1, ml: ml, hydrationMl: hydration))
            }
        }
        return groups.sorted { $0.hydrationMl > $1.hydrationMl }
    }

    /// Ráno (until 10), Dopoledne (until 12), Odpoledne (until 18), Večer;
    /// drinks without a time last. Empty parts are left out.
    static func byPart(_ drinks: [FoodSnapshot.Drink]) -> [Part] {
        let sorted = drinks.sorted { ($0.time ?? "99") < ($1.time ?? "99") }
        func hour(_ d: FoodSnapshot.Drink) -> Int? { d.time.flatMap { Int($0.prefix(2)) } }
        let parts: [(String, (Int) -> Bool)] = [("Ráno", { $0 < 10 }), ("Dopoledne", { $0 >= 10 && $0 < 12 }),
                                                ("Odpoledne", { $0 >= 12 && $0 < 18 }), ("Večer", { $0 >= 18 })]
        var out = parts.map { title, test in Part(title: title, drinks: sorted.filter { hour($0).map(test) ?? false }) }
        out.append(Part(title: "Bez času", drinks: sorted.filter { hour($0) == nil }))
        return out.filter { !$0.drinks.isEmpty }
    }

    static func color(_ kind: String) -> Color {
        switch kind {
        case "water": Palette.blue
        case "coffee": Palette.sand
        case "tea": Palette.green
        case "milk": Palette.ink
        case "juice", "soda": Palette.amber
        case "sport": Palette.indigo
        case "beer": Palette.gold
        case "wine": Palette.rust
        default: Palette.muted
        }
    }

    /// The big number: litres, or fluid ounces in imperial units.
    static func big(_ ml: Double) -> String {
        Units.imperial ? Fmt.int(Units.volume(ml)) : Fmt.decimal(ml / 1000)
    }
}
