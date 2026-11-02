import SwiftUI

/// Jídlo → Všechny živiny: fibre, sugar and salt for everyone; minerals and
/// vitamins (and the 7-day average) with Aurin Pro, blurred without it.
/// Pro picks up to three of them for Jídlo under Upravit.
struct NutrientsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    @State private var week = false
    @State private var page: NutrientsPage?
    @State private var error: String?
    @State private var editing = false

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: "Živiny", back: { dismiss() })
                    if let page {
                        NutrientsContent(page: page, week: $week, date: date).padding(.top, 20)
                    } else if let error {
                        Text(error).font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 24)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                }
                .padding(24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: "Živiny",
                      trailing: page?.pro == true ? ChromeAction(systemImage: "slider.horizontal.3", label: "Upravit živiny na Jídle", text: "Upravit") { editing = true } : nil) { dismiss() }
        .navBarVisibility(.hidden)
        .navigationDestination(isPresented: $editing) { NutrientFavoritesView(items: page?.items ?? [], chosen: page?.favorites ?? []) }
        .task(id: week) { await load() }
    }

    private func load() async {
        do { page = try await model.api.nutrients(date: date, days: week ? 7 : 1); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

/// The page without loading, so tests can render it.
struct NutrientsContent: View {
    let page: NutrientsPage
    @Binding var week: Bool
    let date: String

    private func group(_ id: String) -> [NutrientItem] { page.items.filter { $0.group == id } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                tab("Dnes", on: !week, enabled: true) { week = false }
                tab("7 dní", on: week, enabled: page.pro) { week = true }
            }
            if let coach = page.coach {
                // The coach card of Jídlo, with this page's rule-based sentence.
                CoachTextCard(screen: "nutrients", fallbackText: coach, live: false).padding(.top, 16)
            }
            section("Hlavní", group("main"))
            if page.pro {
                section("Minerály", group("min"))
                section("Vitamíny", group("vit"))
                if page.meals > 0 {
                    Text(L10n.f("Hodnoty má %@ z %@ jídel.", String(page.withMicros), String(page.meals)))
                        .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 16)
                }
            } else {
                locked
            }
        }
    }

    private func section(_ title: String, _ items: [NutrientItem]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: title).padding(.top, 26).padding(.bottom, 2)
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                NavigationLink { NutrientDetailView(key: item.key, date: date) } label: {
                    NutrientRow(item: item, chevron: true).padding(.vertical, 12)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Minerals and vitamins without values, blurred, with the way to Pro.
    private var locked: some View {
        ZStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(["min", "vit"], id: \.self) { id in
                    SectionLabel(text: id == "min" ? "Minerály" : "Vitamíny").padding(.top, 26).padding(.bottom, 2)
                    ForEach(group(id).prefix(3)) { item in
                        HStack(spacing: 12) {
                            Text(item.name).font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 96, alignment: .leading)
                            ProgressLine(fraction: 0, color: Palette.muted, height: 3)
                            Text("00 / 00 mg").font(Typo.number(16)).foregroundStyle(Palette.ink).blur(radius: 5).opacity(0.6)
                        }
                        .padding(.vertical, 12)
                    }
                }
            }
            .accessibilityHidden(true)
            VStack(spacing: 14) {
                Label("Vitamíny a minerály jsou v Aurin Pro", systemImage: "lock")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                NavigationLink { SubscriptionView() } label: {
                    Text("Vyzkoušet Pro").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 60).padding(.bottom, 4)
            .frame(maxWidth: .infinity)
            .background(LinearGradient(colors: [Palette.background.opacity(0), Palette.background.opacity(0.9)], startPoint: .top, endPoint: .center))
        }
    }

    private func tab(_ title: String, on: Bool, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeOut(duration: 0.2), action) } label: {
            HStack(spacing: 5) {
                Text(L10n.tr(title))
                if !enabled { Image(systemName: "lock").font(.caption2) }
            }
            .font(Typo.bodyStrong)
            .foregroundStyle(on ? Palette.onButton : Palette.ink)
            .padding(.horizontal, 14).frame(height: 34)
            .background(on ? Palette.button : .clear, in: Capsule())
            .overlay { Capsule().stroke(Palette.ink.opacity(on ? 0 : 0.18), lineWidth: 1) }
            .opacity(enabled ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// "Železo ——— 9 / 18 mg": green when met, amber on the way, rust under half
/// or over a limit. Fibre stays green and sugar and salt amber, like Jídlo.
struct NutrientRow: View {
    let item: NutrientItem
    var chevron = false

    private var color: Color {
        if item.over { return Palette.rust }
        switch item.key {
        case "fiber": return Palette.green
        case "sugar", "salt": return Palette.amberBar
        default: return item.low ? Palette.rust : (item.percent ?? 0) < 85 ? Palette.amberBar : Palette.green
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(item.name).font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 96, alignment: .leading)
            ProgressLine(fraction: (item.eaten ?? 0) / max(item.target ?? 1, 0.001), color: color, height: 3)
            Text(item.text).font(Typo.number(16)).foregroundStyle(item.low || item.over ? Palette.rust : Palette.ink).lineLimit(1)
            if chevron { Image(systemName: "chevron.right").font(.caption).foregroundStyle(Palette.muted) }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.name + " " + item.text)
    }
}

/// One nutrient: today against the target, the 7-day average, today's meals
/// that brought it and foods rich in it.
struct NutrientDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let key: String
    let date: String
    @State private var detail: NutrientDetail?
    @State private var error: String?
    @State private var editing = false
    /// The own target in the sheet; nil is Auto.
    @State private var own: Double?
    @State private var ownBefore: Double?

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: detail?.name ?? "", back: { dismiss() })
                    if let detail {
                        NutrientDetailContent(detail: detail, editTarget: { editing = true })
                    } else if let error {
                        Text(error).font(Typo.body).foregroundStyle(Palette.muted).padding(.top, 24)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                }
                .padding(24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: detail?.name) { dismiss() }
        .navBarVisibility(.hidden)
        .task {
            do { detail = try await model.api.nutrientDetail(key: key, date: date) }
            catch { self.error = error.localizedDescription }
        }
        .sheet(isPresented: $editing, onDismiss: { Task { await saveTarget() } }) {
            if let detail { NutrientTargetSheet(detail: detail, own: $own) }
        }
        .onChange(of: editing) { _, open in
            if open { own = detail?.custom == true ? detail?.target : nil; ownBefore = own }
        }
    }

    /// Saves an own target (nil: back to Auto) into the profile's
    /// nutrientTargets and loads the nutrient again.
    private func saveTarget() async {
        guard own != ownBefore, !model.demo else { return }
        do {
            var profile = try await model.api.profile()
            var targets: JSONObject = [:]
            if case .object(let saved)? = profile["nutrientTargets"] { targets = saved }
            targets[key] = own.map { .number($0) }
            profile["nutrientTargets"] = .object(targets.filter { $0.value != .null })
            try await model.api.saveProfile(profile)
            detail = try await model.api.nutrientDetail(key: key, date: date)
            await model.refreshFood()
        } catch { self.error = error.localizedDescription }
    }
}

struct NutrientDetailContent: View {
    let detail: NutrientDetail
    /// Opens the Target sheet; nil shows no Target row.
    var editTarget: (() -> Void)? = nil

    private var low: Bool { !detail.limit && (detail.percent ?? 100) <= 50 }
    private var over: Bool { detail.limit && (detail.eaten ?? 0) > (detail.target ?? .infinity) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .lastTextBaseline, spacing: 12) {
                Text(NutrientItem.amount(detail.eaten ?? 0)).font(Typo.number(84)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.5)
                if let target = detail.target {
                    Text(L10n.f(detail.limit ? "max %@" : "z %@", NutrientItem.amount(target)) + "\n" + detail.unit)
                        .font(Typo.small).foregroundStyle(Palette.muted)
                }
            }
            .padding(.top, 26)
            ProgressLine(fraction: (detail.eaten ?? 0) / max(detail.target ?? 1, 0.001), color: low || over ? Palette.rust : Palette.green, height: 4)
                .padding(.top, 8)
            if let week = detail.weekPercent {
                Text(L10n.f("Průměr za 7 dní: %@ %%", Fmt.int(week))).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 10)
            }
            if let editTarget, detail.target != nil {
                Button(action: editTarget) {
                    SettingsRow(title: "Denní cíl", value: NutrientTargetSheet.value(detail))
                        .cardSurface(cornerRadius: 22)
                }
                .buttonStyle(.plain)
                .padding(.top, 20)
            }
            if !detail.sources.isEmpty {
                SectionLabel(text: "Dnes z").padding(.top, 26).padding(.bottom, 2)
                list(detail.sources.map { ($0.name, NutrientItem.amount($0.amount) + " " + detail.unit) }, number: true)
            }
            if !detail.rich.isEmpty, let title = detail.richTitle {
                SectionLabel(text: title).padding(.top, 26).padding(.bottom, 2)
                list(detail.rich.map { ($0.name, NutrientItem.amount($0.per100) + " " + detail.unit + " / 100 g") }, number: false)
            }
        }
    }

    private func list(_ rows: [(String, String)], number: Bool) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                HStack {
                    Text(verbatim: row.0).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    Spacer(minLength: 12)
                    Text(verbatim: row.1).font(number ? Typo.number(16) : Typo.caption).foregroundStyle(number ? Palette.ink : Palette.muted)
                }
                .padding(.vertical, 13)
            }
        }
    }
}

/// The top of the Živiny pages, like Pití dnes and a meal's detail: back, the
/// title as a section label in the middle, and an optional action on the right.
struct NutrientsTopBar<Trailing: View>: View {
    let title: String
    var back: () -> Void
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack {
            BackSlot(action: back)
            Spacer()
            SectionLabel(text: title).lineLimit(1)
            Spacer()
            trailing().frame(minWidth: 36, minHeight: 36, alignment: .trailing)
        }
    }
}

extension NutrientsTopBar where Trailing == EmptyView {
    init(title: String, back: @escaping () -> Void) {
        self.init(title: title, back: back) { EmptyView() }
    }
}

/// Živiny → Upravit: up to three nutrients shown on Jídlo under the macros.
struct NutrientFavoritesView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let items: [NutrientItem]
    @State var chosen: [String]

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: "Na obrazovce Jídlo", back: { dismiss() })
                    NutrientFavoritesList(items: items, chosen: $chosen).padding(.top, 24)
                }
                .padding(24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: "Na obrazovce Jídlo") { dismiss() }
        .navBarVisibility(.hidden)
        .onChange(of: chosen) { _, keys in
            Task {
                try? await model.api.saveNutrientFavorites(keys)
                await model.refreshFood()
            }
        }
    }
}

struct NutrientFavoritesList: View {
    let items: [NutrientItem]
    @Binding var chosen: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: L10n.f("Oblíbené · %@ ze 3", String(chosen.count))).padding(.bottom, 2)
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                let on = chosen.contains(item.key)
                Button {
                    if on { chosen.removeAll { $0 == item.key } } else if chosen.count < 3 { chosen.append(item.key) }
                } label: {
                    HStack {
                        Text(item.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Spacer()
                        if on {
                            Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(Palette.onButton)
                                .frame(width: 24, height: 24).background(Palette.button, in: Circle())
                        } else {
                            Circle().stroke(Palette.ink.opacity(0.25), lineWidth: 1.5).frame(width: 24, height: 24)
                        }
                    }
                    .padding(.vertical, 13)
                    .contentShape(Rectangle())
                    .opacity(!on && chosen.count >= 3 ? 0.4 : 1)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// Cíl of one nutrient: Auto (Aurin's own, higher for plant iron and zinc)
/// or one's own (Aurin Pro), never above the safe upper limit (EFSA).
struct NutrientTargetSheet: View {
    let detail: NutrientDetail
    @Binding var own: Double?
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    /// "Auto · vegetariánsky · 20 mg" or "Vlastní · 25 mg".
    static func value(_ detail: NutrientDetail) -> String {
        let amount = NutrientItem.amount(detail.target ?? 0) + " " + detail.unit
        if detail.custom == true { return L10n.tr("Vlastní") + " · " + amount }
        if let basis = detail.autoBasis { return "Auto · " + L10n.tr(basis == "vegan" ? "vegansky" : "vegetariánsky") + " · " + amount }
        return "Auto · " + amount
    }

    private var auto: Double { detail.autoTarget ?? detail.target ?? 1 }
    private var step: Double { auto >= 100 ? 10 : auto >= 10 ? 1 : 0.1 }
    private var top: Double { detail.upperLimit ?? max(auto * 10, step * 10) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(L10n.f("Cíl: %@", detail.name)).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                }
                .padding(.bottom, 6)
                Button { own = nil } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "Auto").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(verbatim: autoHint).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "checkmark").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                            .frame(width: 18).opacity(own == nil ? 1 : 0)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 13)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(own == nil ? Palette.ink.opacity(0.7) : .clear, lineWidth: 1.5)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(own == nil ? .isSelected : [])
                Text(L10n.tr("Nebo nastav vlastní")).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4).padding(.top, 8)
                if detail.pro == true {
                    NumberStepper(title: "Za den", value: Binding(get: { own ?? auto }, set: { own = $0 }),
                                  range: step...top, step: step, unit: detail.unit, digits: step < 1 ? 1 : 0)
                } else {
                    Button { Paywall.present(model) } label: {
                        SettingsRow(title: "Vlastní cíl", chevron: false)
                            .overlay(alignment: .trailing) {
                                HStack(spacing: 3) { Image(systemName: "lock.fill").scaledFont(10); Text(verbatim: "Pro") }
                                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted).padding(.trailing, 18)
                            }
                            .cardSurface(cornerRadius: 22)
                    }
                    .buttonStyle(.plain)
                }
                if let upper = detail.upperLimit {
                    Text(L10n.f("Bezpečná horní hranice je %@ (EFSA). Aurin nad ni nejde.", NutrientItem.amount(upper) + " " + detail.unit))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                        .padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(20)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    /// "20 mg · vegetariánsky, rostlinné železo se vstřebá hůř".
    private var autoHint: String {
        let amount = NutrientItem.amount(auto) + " " + detail.unit
        guard detail.autoBasis != nil else { return amount }
        return amount + " · " + L10n.tr(detail.key == "zn" ? "z rostlin se zinek vstřebá hůř" : "z rostlin se železo vstřebá hůř")
    }
}
