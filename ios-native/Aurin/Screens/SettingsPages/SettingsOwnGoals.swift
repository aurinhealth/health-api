import SwiftUI

// Cíle → Kalorie and Pití: Auto follows the computed target; Vlastní is the
// athlete's own number; Pití can also build up week by week to the target
// (Postupně, src/water-goal.js). Saved in the profile: kcalGoal, waterMode,
// waterGoal, waterStart, waterStep, waterFrom.

/// "2,0 l" or "67.6 fl oz".
func waterText(_ ml: Double?) -> String {
    guard let ml else { return "–" }
    return Units.imperial ? Units.volumeText(ml) : Fmt.decimal(ml / 1000, digits: ml.truncatingRemainder(dividingBy: 100) == 0 ? 1 : 2) + " l"
}

/// Auto / Vlastní (/ Postupně): the choice at the top of both sheets.
private struct ModeChips: View {
    @Binding var mode: String
    let options: [(String, String)]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.0) { option in
                Button { mode = option.0 } label: {
                    Text(L10n.tr(option.1)).font(.subheadline.weight(.medium))
                        .foregroundStyle(mode == option.0 ? Palette.onButton : Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(mode == option.0 ? Palette.button : Palette.track, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(mode == option.0 ? .isSelected : [])
            }
        }
    }
}

/// − value +: the big number with round buttons on both sides.
private struct ValueStepper: View {
    let text: String
    let minus: () -> Void
    let plus: () -> Void

    var body: some View {
        HStack {
            button("minus", label: "Méně", action: minus)
            Spacer()
            Text(verbatim: text).font(Typo.number(44)).foregroundStyle(Palette.ink).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
            Spacer()
            button("plus", label: "Více", action: plus)
        }
        .padding(.vertical, 10)
    }

    private func button(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).scaledFont(18, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                .frame(width: 46, height: 46).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}

private struct SheetHeader: View {
    let title: String
    let close: () -> Void

    var body: some View {
        HStack {
            Text(L10n.tr(title)).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
            Spacer()
            ChromeButton(systemImage: "xmark", label: "Zavřít", action: close)
        }
        .padding(.bottom, 6)
    }
}

/// Cíle → Kalorie.
struct CalorieGoalSheet: View {
    let store: SettingsStore
    /// The computed target of today.
    let auto: Double?
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "auto"
    @State private var kcal: Double = 2000

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "Kalorie") { dismiss() }
                ModeChips(mode: $mode, options: [("auto", "Auto"), ("custom", "Vlastní")])
                if mode == "custom" {
                    ValueStepper(text: Fmt.int(kcal) + " kcal",
                                 minus: { kcal = max(1000, kcal - 50) }, plus: { kcal = min(6000, kcal + 50) })
                }
                if let auto {
                    Text(L10n.f("Aurin dnes doporučuje %@ kcal", Fmt.int(auto))).font(Typo.small).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: mode == "custom" ? .center : .leading)
                }
                SaveSheetButton(saving: store.saving) {
                    if await store.saveProfile(["kcalGoal": mode == "custom" ? .number(kcal) : .null]) { dismiss() }
                }
                .padding(.top, 8)
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear {
            let own = store.profile["kcalGoal"]?.number
            mode = own != nil ? "custom" : "auto"
            kcal = own ?? ((auto ?? 2000) / 50).rounded() * 50
        }
    }
}

/// Cíle → Pití.
struct WaterGoalSheet: View {
    let store: SettingsStore
    let water: TodaySnapshot.Water?
    let today: String
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "auto"
    @State private var custom: Double = 2000
    @State private var start: Double = 2000
    @State private var step = "auto"

    static let steps = [("auto", "Auto"), ("100", "+ 0,1 l"), ("250", "+ 0,25 l"), ("500", "+ 0,5 l")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "Pití") { dismiss() }
                ModeChips(mode: $mode, options: [("auto", "Auto"), ("build", "Postupně"), ("custom", "Vlastní")])
                switch mode {
                case "custom":
                    ValueStepper(text: waterText(custom),
                                 minus: { custom = max(500, custom - 100) }, plus: { custom = min(6000, custom + 100) })
                case "build":
                    build
                default:
                    EmptyView()
                }
                if let auto = water?.autoTarget {
                    Text(L10n.f("Aurin dnes doporučuje %@", waterText(auto))).font(Typo.small).foregroundStyle(Palette.muted)
                }
                SaveSheetButton(saving: store.saving) {
                    if await store.saveProfile(changes) { dismiss() }
                }
                .padding(.top, 8)
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear(perform: fill)
    }

    /// Start, the weekly step, and how the last two weeks went.
    private var build: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.tr("Začít na")).font(Typo.small).foregroundStyle(Palette.muted)
                ValueStepper(text: waterText(start),
                             minus: { start = max(1000, start - 100) }, plus: { start = min(6000, start + 100) })
            }
            SettingsGroup(title: "Každý týden", footer: step == "auto"
                          ? "Splněno na 95 % a víc: + 0,25 l. Na 80 %: + 0,1 l. Na 60 %: zůstává. Méně: − 0,25 l."
                          : "Splněno na 80 % a víc: o krok výš. Na 60 %: zůstává. Méně: o krok níž.") {
                ForEach(Array(Self.steps.enumerated()), id: \.element.0) { index, item in
                    if index > 0 { SettingsDivider() }
                    Button { step = item.0 } label: {
                        HStack {
                            Text(L10n.tr(item.1)).font(.body).foregroundStyle(Palette.ink)
                            Spacer()
                            Image(systemName: "checkmark").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                                .opacity(step == item.0 ? 1 : 0)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(step == item.0 ? .isSelected : [])
                }
            }
            if let weeks = water?.build?.weeks, !weeks.isEmpty, water?.mode == "build" {
                SettingsGroup(title: "Jak to šlo") {
                    ForEach(Array(weeks.enumerated()), id: \.element.week) { index, week in
                        if index > 0 { SettingsDivider() }
                        SettingsRow(title: index == 0 ? "Minulý týden" : "Týden předtím",
                                    subtitle: L10n.f("%@ z %@ denně", waterText(week.avgMl), waterText(week.targetMl)),
                                    value: Fmt.int(week.percent) + Fmt.percentSign, chevron: false)
                    }
                }
            }
        }
    }

    private var changes: JSONObject {
        let p = store.profile
        var out: JSONObject = ["waterMode": .string(mode == "auto" ? "" : mode)]
        if mode == "custom" { out["waterGoal"] = .number(custom) }
        if mode == "build" {
            out["waterStart"] = .number(start)
            out["waterStep"] = .string(step)
            // A new start or step begins a new run from today.
            let same = p["waterMode"]?.string == "build" && p["waterStart"]?.number == start && (p["waterStep"]?.string ?? "auto") == step
            out["waterFrom"] = .string(same ? (p["waterFrom"]?.string ?? today) : today)
        }
        return out
    }

    private func fill() {
        let p = store.profile
        let saved = p["waterMode"]?.string ?? ""
        mode = ["custom", "build"].contains(saved) ? saved : "auto"
        let auto = water?.autoTarget ?? 2000
        custom = p["waterGoal"]?.number ?? (auto / 100).rounded() * 100
        start = p["waterStart"]?.number ?? max(1000, ((auto * 0.65) / 100).rounded() * 100)
        step = p["waterStep"]?.string ?? "auto"
    }
}

/// The black Uložit at the bottom of a sheet.
private struct SaveSheetButton: View {
    let saving: Bool
    let action: () async -> Void

    var body: some View {
        Button { Task { await action() } } label: {
            Text(L10n.tr("Uložit")).font(.body.weight(.semibold)).foregroundStyle(Palette.onButton)
                .frame(maxWidth: .infinity).frame(height: 52)
                .background(Palette.button, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(saving)
        .opacity(saving ? 0.5 : 1)
    }
}
