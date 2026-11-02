import SwiftUI

/// The diet as the profile keeps it (src/diet.js normalizeDiet).
struct DietChoice: Equatable {
    var eating = "everything"
    var style = "balanced"
    /// nil = Auto (by the goal and the sport).
    var proteinPerKg: Double? = nil
    var netCarbLimit: Double = 30
    /// Custom: "carbs" (grams) or "fat" (g/kg) is set, the other fills the calories.
    var customSet = "fat"
    var customCarbs: Double = 200
    var customFatPerKg: Double = 0.9

    init() {}

    init(_ profile: JSONObject) {
        eating = profile["dietEating"]?.string ?? eating
        style = profile["dietStyle"]?.string ?? style
        proteinPerKg = profile["proteinPerKg"]?.number
        netCarbLimit = profile["netCarbLimit"]?.number ?? netCarbLimit
        customSet = profile["customSet"]?.string ?? customSet
        customCarbs = profile["customCarbs"]?.number ?? customCarbs
        customFatPerKg = profile["customFatPerKg"]?.number ?? customFatPerKg
    }

    var json: JSONObject {
        [
            "dietEating": .string(eating), "dietStyle": .string(style),
            "proteinPerKg": proteinPerKg.map { .number($0) } ?? .null,
            "netCarbLimit": .number(netCarbLimit), "customSet": .string(customSet),
            "customCarbs": .number(customCarbs), "customFatPerKg": .number(customFatPerKg)
        ]
    }

    static let eatings: [(String, String)] = [
        ("everything", "Všechno"), ("pescatarian", "Pescetarián"), ("vegetarian", "Vegetarián"), ("vegan", "Vegan")
    ]
    static let styles: [(String, String)] = [
        ("high_protein", "Víc bílkovin"), ("lower_carb", "Méně sacharidů"), ("keto", "Keto"), ("custom", "Vlastní")
    ]

    static func styleName(_ id: String) -> String {
        id == "balanced" ? L10n.tr("Vyvážená") : L10n.tr(styles.first { $0.0 == id }?.1 ?? "Vyvážená")
    }

    /// "2,2 g/kg".
    static func perKg(_ value: Double) -> String { Fmt.decimal(value, digits: 1) + " g/kg" }
}

/// Nastavení → Výživa → Strava: what the athlete eats, and how the day's
/// calories are shared out among protein, carbs and fat. The calories stay
/// with the goal and the training; each change saves at once and the Food
/// screen is worked out again. Custom macros and an own protein are Aurin Pro.
struct DietSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var store: SettingsStore?
    @State private var diet = DietChoice()
    @State private var saved = DietChoice()
    @State private var pro = false
    @State private var sheet: DietSheet?

    enum DietSheet: String, Identifiable {
        case style, protein, custom
        var id: String { rawValue }
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 2)

    var body: some View {
        SettingsPage(title: "Strava") {
            VStack(alignment: .leading, spacing: 10) {
                Text(L10n.tr("Jím")).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4)
                    .accessibilityAddTraits(.isHeader)
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(DietChoice.eatings, id: \.0) { item in eatingChip(item.0, item.1) }
                }
            }
            SettingsGroup(title: "Makra", footer: L10n.tr("Kalorie zůstávají podle tvého cíle. Aurin je jen rozdělí.")) {
                Button { sheet = .style } label: {
                    SettingsRow(title: "Styl", value: DietChoice.styleName(diet.style))
                }
                SettingsDivider()
                Button { sheet = diet.style == "custom" ? .custom : .protein } label: {
                    SettingsRow(title: "Bílkoviny", value: proteinValue)
                }
            }
            .buttonStyle(.plain)
            if let macros = model.food?.macros {
                DietTodayCells(macros: macros, kcal: model.food?.target)
            }
            if let error = store?.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }
        }
        .sheet(item: $sheet, onDismiss: { save() }) { which in
            switch which {
            case .style: DietStyleSheet(diet: $diet, pro: pro) { sheet = .custom }
            case .protein: DietProteinSheet(diet: $diet, pro: pro, food: model.food)
            case .custom: DietCustomSheet(diet: $diet, food: model.food)
            }
        }
        .task {
            guard store == nil else { return }
            let s = SettingsStore(api: model.api, demo: model.demo)
            await s.load()
            store = s
            diet = DietChoice(s.profile)
            saved = diet
            if !model.demo { pro = (try? await model.api.subscription())?.hasAI == true }
        }
    }

    /// "Auto · 2,0 g/kg" or one's own "2,2 g/kg".
    private var proteinValue: String {
        if let own = diet.proteinPerKg { return DietChoice.perKg(own) }
        guard let auto = model.food?.diet?.proteinPerKg else { return "Auto" }
        return "Auto · " + DietChoice.perKg(auto)
    }

    private func eatingChip(_ id: String, _ title: String) -> some View {
        let on = diet.eating == id
        return Button {
            diet.eating = id
            save()
        } label: {
            Text(L10n.tr(title)).font(.subheadline.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(on ? Palette.ink : Palette.ink.opacity(0.08), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func save() {
        guard let store, diet != saved else { return }
        let next = diet
        Task {
            guard await store.saveProfile(next.json) else { return }
            // The server keeps Pro choices only with Pro.
            diet = DietChoice(store.profile)
            saved = diet
            await model.refreshFood()
        }
    }
}

/// "Dnes s touto stravou · 2 450 kcal" and the three targets it makes.
struct DietTodayCells: View {
    let macros: FoodSnapshot.Macros
    let kcal: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(kcal.map { L10n.f("Dnes s touto stravou · %@ kcal", Fmt.int($0)) } ?? L10n.tr("Dnes s touto stravou"))
                .font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                .padding(.horizontal, 4)
            HStack(spacing: 0) {
                cell(macros.carbs.net == true ? "Čisté sacharidy" : "Sacharidy", macros.carbs, Palette.carbs, first: true)
                Rectangle().fill(Palette.hairline).frame(width: 1)
                cell("Bílkoviny", macros.protein, Palette.protein)
                Rectangle().fill(Palette.hairline).frame(width: 1)
                cell("Tuky", macros.fat, Palette.fat)
            }
            .fixedSize(horizontal: false, vertical: true)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        }
        .accessibilityElement(children: .combine)
    }

    private func cell(_ title: String, _ amount: FoodSnapshot.Amount, _ color: Color, first: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                if amount.limit == true { Text(verbatim: "max").font(Typo.number(15)).foregroundStyle(Palette.faint) }
                Text(Fmt.int(amount.target)).font(Typo.number(28)).foregroundStyle(Palette.ink)
                Text(verbatim: "g").font(Typo.number(15)).foregroundStyle(Palette.faint)
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.vertical, 16)
        .padding(.leading, first ? 0 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The head of the diet sheets: the title and a close button.
private struct DietSheetHead: View {
    let title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack {
            Text(L10n.tr(title)).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
            Spacer()
            ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
        }
        .padding(.bottom, 6)
    }
}

/// The Auto card at the top of a sheet, as in GymGoalSheet.
private struct DietAutoCard: View {
    let title: String
    let hint: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(verbatim: hint).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Spacer(minLength: 8)
                Image(systemName: "checkmark").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                    .frame(width: 18).opacity(selected ? 1 : 0)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(selected ? Palette.ink.opacity(0.7) : .clear, lineWidth: 1.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

private struct DietCap: View {
    let text: String
    var body: some View {
        Text(L10n.tr(text)).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
            .padding(.horizontal, 4).padding(.top, 8)
    }
}

private struct DietFoot: View {
    let text: String
    var body: some View {
        Text(verbatim: text).font(Typo.caption).foregroundStyle(Palette.muted)
            .padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
    }
}

/// "Aurin Pro" with a lock, for a choice only Pro keeps.
private struct ProLock: View {
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "lock.fill").scaledFont(10)
            Text(verbatim: "Pro")
        }
        .font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted)
    }
}

/// Styl: Balanced is Auto, then the other styles; Keto adds its net carb limit.
struct DietStyleSheet: View {
    @Binding var diet: DietChoice
    let pro: Bool
    /// Custom opens its own sheet.
    let openCustom: () -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                DietSheetHead(title: "Styl")
                DietAutoCard(title: "Vyvážená", hint: L10n.tr("Sacharidy podle tréninku"), selected: diet.style == "balanced") {
                    diet.style = "balanced"
                    dismiss()
                }
                DietCap(text: "Nebo vyber")
                VStack(spacing: 0) {
                    ForEach(Array(DietChoice.styles.enumerated()), id: \.element.0) { index, item in
                        if index > 0 { SettingsDivider() }
                        Button { pick(item.0) } label: {
                            HStack(spacing: 12) {
                                Text(L10n.tr(item.1)).font(.body).foregroundStyle(Palette.ink)
                                Spacer(minLength: 8)
                                if item.0 == "custom" && !pro {
                                    ProLock()
                                } else {
                                    Text(verbatim: hint(item.0)).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
                                }
                                Image(systemName: "checkmark").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                                    .frame(width: 18).opacity(diet.style == item.0 ? 1 : 0)
                            }
                            .padding(.horizontal, 16).frame(minHeight: 50)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(diet.style == item.0 ? .isSelected : [])
                    }
                }
                .cardSurface(cornerRadius: 22)
                if diet.style == "keto" {
                    DietCap(text: "Limit sacharidů").padding(.top, 12)
                    NumberStepper(title: "Za den", value: $diet.netCarbLimit, range: 20...50, step: 5, unit: "g")
                }
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func hint(_ id: String) -> String {
        switch id {
        case "high_protein": return L10n.tr("2,2 g/kg bílkovin")
        case "lower_carb": return L10n.tr("do 100 g sacharidů")
        case "keto": return L10n.f("do %@ g sacharidů", Fmt.int(diet.netCarbLimit))
        default: return L10n.tr("tvoje čísla")
        }
    }

    private func pick(_ id: String) {
        if id == "custom" {
            guard pro else { Paywall.present(model); return }
            diet.style = id
            openCustom()
            return
        }
        diet.style = id
        // Keto stays open for its limit.
        if id != "keto" { dismiss() }
    }
}

/// Bílkoviny: Auto by the goal and the sport, or one's own g per kg (Pro).
struct DietProteinSheet: View {
    @Binding var diet: DietChoice
    let pro: Bool
    let food: FoodSnapshot?
    @Environment(AppModel.self) private var model
    @State private var own: Double = 2.0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                DietSheetHead(title: "Bílkoviny")
                DietAutoCard(title: "Auto", hint: autoHint, selected: diet.proteinPerKg == nil) { diet.proteinPerKg = nil }
                DietCap(text: "Nebo nastav vlastní")
                if pro {
                    DietProteinSlider(value: Binding(get: { diet.proteinPerKg ?? own }, set: { own = $0; diet.proteinPerKg = $0 }), kg: DietMath.referenceKg(food))
                } else {
                    Button { Paywall.present(model) } label: {
                        SettingsRow(title: "Vlastní g/kg", value: nil, chevron: false)
                            .overlay(alignment: .trailing) { ProLock().padding(.trailing, 18) }
                            .cardSurface(cornerRadius: 22)
                    }
                    .buttonStyle(.plain)
                }
                DietFoot(text: L10n.tr("Nad 2,5 g/kg většina lidí už nic dalšího nezíská."))
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear { own = diet.proteinPerKg ?? food?.diet?.proteinPerKg ?? 2.0 }
    }

    /// "2,0 g/kg · podle cíle a sportu".
    private var autoHint: String {
        guard let auto = food?.diet?.proteinAuto == true ? food?.diet?.proteinPerKg : nil else { return L10n.tr("Podle cíle a sportu") }
        return DietChoice.perKg(auto) + " · " + L10n.tr("podle cíle a sportu")
    }
}

/// "2,2 g/kg · 174 g denně" over a slider from 1,2 to 3,0.
private struct DietProteinSlider: View {
    @Binding var value: Double
    let kg: Double?

    var body: some View {
        VStack(spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(Fmt.decimal(value, digits: 1)).font(Typo.number(52)).foregroundStyle(Palette.ink).monospacedDigit()
                Text(verbatim: "g/kg").font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
            }
            .padding(.top, 16)
            if let kg {
                Text(L10n.f("%@ g denně", Fmt.int(kg * value))).font(.subheadline).foregroundStyle(Palette.muted)
            }
            Slider(value: $value, in: 1.2...3.0, step: 0.1).tint(Palette.protein)
                .padding(.horizontal, 18).padding(.top, 8)
            HStack {
                Text(verbatim: Fmt.decimal(1.2, digits: 1))
                Spacer()
                Text(verbatim: Fmt.decimal(3.0, digits: 1) + " g/kg")
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
            .padding(.horizontal, 18).padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity)
        .cardSurface(cornerRadius: 22)
        .accessibilityElement(children: .combine)
        .accessibilityValue(DietChoice.perKg(value))
    }
}

/// Vlastní makra (Pro): protein per kg, then the carbs or the fat; the other
/// one takes what the day's calories leave.
struct DietCustomSheet: View {
    @Binding var diet: DietChoice
    let food: FoodSnapshot?

    var body: some View {
        let kg = DietMath.referenceKg(food), kcal = food?.target
        let protein = Binding(get: { diet.proteinPerKg ?? food?.diet?.proteinPerKg ?? 2.0 }, set: { diet.proteinPerKg = $0 })
        let split = DietMath.custom(kg: kg, kcal: kcal, diet: diet, proteinPerKg: protein.wrappedValue)
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                DietSheetHead(title: "Vlastní makra")
                DietCap(text: "Bílkoviny")
                NumberStepper(title: "Na kg", value: protein, range: 1.2...3.0, step: 0.1, unit: "g/kg", digits: 1)
                DietCap(text: "Pak").padding(.top, 8)
                HStack(spacing: 8) {
                    chip("carbs", "Nastavit sacharidy")
                    chip("fat", "Nastavit tuky")
                }
                if diet.customSet == "carbs" {
                    NumberStepper(title: "Sacharidy", value: $diet.customCarbs, range: 20...600, step: 10, unit: "g")
                    rest("Tuky", split?.fat)
                } else {
                    NumberStepper(title: "Tuky", value: $diet.customFatPerKg, range: 0.5...2.5, step: 0.1, unit: "g/kg", digits: 1)
                    rest("Sacharidy", split?.carbs)
                }
                if let kcal {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark").scaledFont(12, weight: .bold).foregroundStyle(Palette.green)
                        Text(L10n.f("Dohromady dnešních %@ kcal", Fmt.int(kcal))).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    .padding(.horizontal, 4)
                }
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear { if diet.proteinPerKg == nil { diet.proteinPerKg = protein.wrappedValue } }
    }

    private func chip(_ id: String, _ title: String) -> some View {
        let on = diet.customSet == id
        return Button { diet.customSet = id } label: {
            Text(L10n.tr(title)).font(.subheadline.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(on ? Palette.ink : Palette.ink.opacity(0.08), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// "Sacharidy · zbytek · 244 g".
    private func rest(_ title: String, _ grams: Double?) -> some View {
        SettingsRow(title: title, value: grams.map { L10n.f("zbytek · %@ g", Fmt.int($0)) } ?? L10n.tr("zbytek"), chevron: false)
            .cardSurface(cornerRadius: 22)
    }
}

/// The few sums the sheets show before the server works the day out again.
enum DietMath {
    /// The weight the protein is counted from: today's protein over its g/kg.
    static func referenceKg(_ food: FoodSnapshot?) -> Double? {
        guard let target = food?.macros.protein.target, let perKg = food?.diet?.proteinPerKg, perKg > 0, target > 0 else { return nil }
        return target / perKg
    }

    /// Custom macros as src/diet.js dayMacros splits them, fat never under 0,5 g/kg.
    static func custom(kg: Double?, kcal: Double?, diet: DietChoice, proteinPerKg: Double) -> (carbs: Double, fat: Double)? {
        guard let kg, let kcal, kg > 0, kcal > 0 else { return nil }
        let protein = (kg * proteinPerKg).rounded(), floor = (kg * 0.5).rounded(), rest = kcal - protein * 4
        if diet.customSet == "carbs" {
            let carbs = max(0, min(diet.customCarbs, ((rest - floor * 9) / 4).rounded(.down)))
            return (carbs, max(floor, ((rest - carbs * 4) / 9).rounded()))
        }
        let fat = max(floor, (kg * diet.customFatPerKg).rounded())
        return (max(0, ((rest - fat * 9) / 4).rounded()), fat)
    }
}
