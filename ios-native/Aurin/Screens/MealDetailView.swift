import SwiftUI

/// Jídlo → a meal: its calories and macros against the meal's targets, the
/// fibre, sugar and salt, and every food with all its values. Vybrat (or a
/// swipe right on a food) ticks several foods to copy, move or delete.
struct MealDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let type: String
    @State private var adding = false
    @State private var selecting = false
    @State private var selected: Set<Int> = []
    @State private var moving: String?
    @State private var confirmDelete = false

    private var meal: FoodSnapshot.Meal? { model.food?.meals.first(where: { $0.type == type }) }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                if let meal {
                    MealDetailContent(meal: meal, back: { dismiss() }, add: { adding = true },
                                      selection: selecting ? $selected : nil,
                                      startSelecting: { id in selected = [id]; withAnimation(.easeOut(duration: 0.2)) { selecting = true } })
                        .padding(.bottom, selecting ? 190 : 100)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        BackSlot { dismiss() }
                        Text("Tohle jídlo v tento den není.").font(Typo.body).foregroundStyle(Palette.muted)
                    }
                    .padding(24)
                }
            }
        }
        .modifier(SelectionBar(selecting: $selecting, selected: $selected, allIds: meal?.entries.map(\.id) ?? [],
                               title: meal?.label, add: MealSlot.addText(type), onAdd: { adding = true }, back: { dismiss() }))
        .overlay(alignment: .bottom) {
            if selecting {
                BulkActionBar(count: selected.count, copy: { moving = "Kopírovat" }, move: { moving = "Přesunout" }, delete: { confirmDelete = true })
                    .padding(.horizontal, 24).padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .navBarVisibility(.hidden)
        .sheet(isPresented: $adding) { AddFoodSheet(meal: type) }
        .sheet(item: Binding(get: { moving.map { BulkVerb(verb: $0) } }, set: { moving = $0?.verb })) { v in
            BulkMoveSheet(verb: v.verb, count: selected.count, from: model.food?.date ?? AppModel.localDate(Date()), meal: type) { date, mealType in
                await run(v.verb == "Kopírovat" ? "copy" : "move", date: date, mealType: mealType)
            }
        }
        .confirmationDialog(L10n.f("Smazat %@?", BulkMoveSheet.items(selected.count)), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) {
                Task { if let failed = await run("delete") { model.notice = failed } }
            }
        }
    }

    /// Sends the change for the ticked foods; nil when it worked, else the message.
    /// A food logged here and not on the server yet is deleted from the phone's
    /// queue; copied or moved once it went out, else nothing moves and it is said.
    private func run(_ action: String, date: String? = nil, mealType: String? = nil) async -> String? {
        var ids = Set(selected.filter { $0 > 0 })
        if action == "delete" {
            for id in selected where id < 0 { await model.deleteFood(id: id) }
        } else {
            for id in selected where id < 0 {
                guard let sent = await model.sentFoodId(id) else {
                    return L10n.tr("Některá jídla se ještě neuložila na server. Zkus to znovu, až budeš mít signál.")
                }
                ids.insert(sent)
            }
        }
        if !model.demo, !ids.isEmpty {
            do {
                _ = try await model.api.bulkFood(action, ids: Array(ids), date: date, mealType: mealType)
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
}

/// The sheet's verb as an identifiable item.
struct BulkVerb: Identifiable {
    let verb: String
    var id: String { verb }
}

/// The pinned bar of a list that can select: back, the page's "+" and
/// Vybrat; while selecting Zrušit, "Vybráno 2" and Vše.
struct SelectionBar: ViewModifier {
    @Binding var selecting: Bool
    @Binding var selected: Set<Int>
    let allIds: [Int]
    var title: String?
    var add: String? = nil
    var onAdd: (() -> Void)? = nil
    let back: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if selecting {
            let all = !allIds.isEmpty && Set(allIds).isSubset(of: selected)
            content.floatingBack(title: L10n.f("Vybráno %@", String(selected.count)),
                                 trailing: ChromeAction(systemImage: "checklist", label: all ? "Nic" : "Vše", text: all ? "Nic" : "Vše") {
                                     selected = all ? [] : Set(allIds)
                                 },
                                 leading: ChromeAction(systemImage: "xmark", label: "Zrušit", text: "Zrušit") {
                                     withAnimation(.easeOut(duration: 0.2)) { selecting = false }
                                     selected = []
                                 },
                                 pinTitle: true, back)
        } else {
            content.floatingBack(title: title,
                                 trailing: onAdd == nil ? nil : ChromeAction(systemImage: "plus", label: add ?? "Přidat") { onAdd?() },
                                 extra: allIds.isEmpty ? nil : ChromeAction(systemImage: "checkmark.circle", label: "Vybrat", text: "Vybrat") {
                                     withAnimation(.easeOut(duration: 0.2)) { selecting = true }
                                 }, back)
        }
    }
}

struct MealDetailContent: View {
    @Environment(\.floatingBack) private var floating
    let meal: FoodSnapshot.Meal
    var back: () -> Void = {}
    var add: () -> Void = {}
    /// The ticked foods while selecting (Vybrat).
    var selection: Binding<Set<Int>>? = nil
    /// A swipe right on a food: start selecting with it ticked.
    var startSelecting: ((Int) -> Void)? = nil

    private var goal: FoodSnapshot.Suggestion? { meal.target ?? meal.suggestion }

    private func sum(_ key: KeyPath<FoodSnapshot.Entry, Double?>) -> Double {
        meal.entries.compactMap { $0[keyPath: key] }.reduce(0, +)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                BackSlot(action: back)
                Spacer()
                SectionLabel(text: L10n.f("Jídlo · %@", ClockText.format(meal.time)))
                Spacer()
                // The pinned bar carries the "+" when the page has one.
                if floating {
                    Color.clear.frame(width: 36, height: 36)
                } else {
                    CircleButton(systemImage: "plus", label: MealSlot.addText(meal.type), action: add)
                }
            }

            Text(meal.label).font(Typo.sentence(34, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 28)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(Fmt.int(meal.kcal ?? 0)).font(Typo.number(76)).foregroundStyle(Palette.ink)
                if let goal { Text(L10n.f("z %@ kcal", Fmt.int(goal.kcal))).font(Typo.small).foregroundStyle(Palette.muted) }
            }
            if let goal {
                ProgressLine(fraction: (meal.kcal ?? 0) / max(goal.kcal, 1), color: Palette.amberBar, height: 5).padding(.top, 4)
            }

            Card {
                WidgetHeader(title: "Makra", color: Palette.carbs, trailing: goal == nil ? nil : "cíl jídla")
                MacroBars(carbs: sum(\.carbs), protein: sum(\.protein), fat: sum(\.fat), goal: goal)
                Rectangle().fill(Palette.hairline).frame(height: 1)
                HStack(spacing: 0) {
                    extra("Vláknina", sum(\.fiber), unit: "g")
                    extra("Cukry", sum(\.sugar), unit: "g")
                    extra("Sůl", sum(\.salt), unit: "g", digits: 1)
                }
            }
            .padding(.top, 22)

            SectionLabel(text: meal.entries.isEmpty ? "Zatím nic" : L10n.f("Potraviny · %@", String(meal.entries.count))).padding(.top, 28)
            if meal.entries.isEmpty {
                Text("V tomto jídle zatím nic není. Přidej první potravinu.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 10)
                PrimaryButton(title: MealSlot.addText(meal.type), systemImage: "plus", action: add).padding(.top, 16)
            } else {
                VStack(spacing: 10) {
                    ForEach(meal.entries) { entry in
                        if let selection {
                            SelectableRow(on: selection.wrappedValue.contains(entry.id), toggle: {
                                if selection.wrappedValue.contains(entry.id) { selection.wrappedValue.remove(entry.id) } else { selection.wrappedValue.insert(entry.id) }
                            }) {
                                FoodEntryCard(entry: entry, plain: true)
                            }
                        } else {
                            FoodEntryCard(entry: entry, select: startSelecting == nil ? nil : { startSelecting?(entry.id) })
                        }
                    }
                }
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }

    private func extra(_ title: String, _ value: Double, unit: String, digits: Int = 0) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(digits == 0 ? Fmt.int(value) : Fmt.decimal(value, digits: digits)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                Text(unit).font(Typo.caption).foregroundStyle(Palette.faint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One food of the meal with every value it has. A tap or a swipe opens its
/// edit (amount, meal, day, copy; another app's food without the amount);
/// deleting asks first.
struct FoodEntryCard: View {
    @Environment(AppModel.self) private var model
    let entry: FoodSnapshot.Entry
    /// A swipe right shows Vybrat.
    var select: (() -> Void)? = nil
    /// While selecting: the card alone, no swipe or edit.
    var plain = false
    @State private var editing = false
    @State private var confirmDelete = false

    var body: some View {
        Group {
            if plain {
                card
            } else {
                // Food from another app (Yazio…) opens too: its meal and day change
                // in Aurin alone (it stays in that app and Apple Health).
                SwipeRow(edit: { editing = true }, select: select, delete: { confirmDelete = true }) {
                    card.onTapGesture { editing = true }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .sheet(isPresented: $editing) {
            FoodEntryEditSheet(entry: entry, date: model.food?.date ?? AppModel.localDate(Date()))
        }
        .confirmationDialog(L10n.f("Smazat „%@“?", entry.name), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(entry.app == nil ? "Smazat" : "Smazat jen v Aurinu", role: .destructive) { Task { await model.deleteFood(id: entry.id) } }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(entry.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                        if let app = entry.app { AppTag(name: app) }
                        if entry.estimate == true { AIEstimateTag() }
                    }
                    if let detail = Self.detail(entry) {
                        Text(detail).font(Typo.caption).foregroundStyle(Palette.faint)
                    }
                }
                Spacer(minLength: 8)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(Fmt.int(entry.kcal)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                    Text("kcal").font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
            HStack(spacing: 6) {
                value(L10n.isEnglish ? "C" : "S", entry.carbs, Palette.carbs)
                value(L10n.isEnglish ? "P" : "B", entry.protein, Palette.protein)
                value(L10n.isEnglish ? "F" : "T", entry.fat, Palette.fat)
            }
            Text(Self.extras(entry)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .padding(14)
        .cardSurface(cornerRadius: 18)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    private func value(_ letter: String, _ grams: Double?, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(verbatim: letter).scaledFont(11, weight: .bold, cap: .denseCap).foregroundStyle(.white)
                .frame(width: 18, height: 18).background(color, in: Circle())
            Text(Fmt.decimal(grams ?? 0, digits: (grams ?? 0) < 10 ? 1 : 0) + " g").font(.footnote.weight(.semibold).monospacedDigit()).foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, 8).padding(.vertical, 5)
        .background(color.opacity(0.12), in: Capsule())
    }

    /// "150 g · Madeta".
    static func detail(_ e: FoodSnapshot.Entry) -> String? {
        let parts = [e.amount, e.brand, ClockText.format(optional: e.time)].compactMap { $0?.nilIfBlank }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "vláknina 3 g · cukry 12 g · sůl 0,4 g".
    static func extras(_ e: FoodSnapshot.Entry) -> String {
        let fiberGrams: String = e.fiber.map { Fmt.decimal($0) + " g" } ?? "–"
        let sugarGrams: String = e.sugar.map { Fmt.decimal($0) + " g" } ?? "–"
        let saltGrams: String = e.salt.map { Fmt.decimal($0, digits: 2) + " g" } ?? "–"
        let fiber = L10n.f("vláknina %@", fiberGrams)
        let sugar = L10n.f("cukry %@", sugarGrams)
        let salt = L10n.f("sůl %@", saltGrams)
        return [fiber, sugar, salt].joined(separator: " · ")
    }
}

/// The app a food or drink was logged in, when it came through Apple Health: "Yazio".
struct AppTag: View {
    let name: String

    var body: some View {
        Text(verbatim: name).font(.caption2.weight(.medium)).foregroundStyle(Palette.muted).lineLimit(1)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(Palette.track, in: Capsule())
    }
}

/// Values AI estimated because no such product was found: "AI odhad".
struct AIEstimateTag: View {
    var body: some View {
        Label("AI odhad", systemImage: "sparkles").labelStyle(.titleAndIcon)
            .font(.caption2.weight(.semibold)).foregroundStyle(Palette.indigo).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Palette.indigo.opacity(0.16), in: Capsule())
    }
}
