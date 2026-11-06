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
    /// The nutrient whose Target sheet is open (its gear), and the one loading for it.
    @State private var target: NutrientDetail?
    @State private var loadingTarget: String?

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: "Živiny", back: { dismiss() })
                    if let page {
                        NutrientsContent(page: page, week: $week, date: date, loadingTarget: loadingTarget,
                                         editTarget: { item in Task { await openTarget(item) } })
                            .padding(.top, 20)
                        if let error {
                            Text(error).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 16)
                        }
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
                      trailing: page?.pro == true ? ChromeAction(systemImage: "slider.horizontal.3", label: "Upravit živiny na Jídle", text: "Upravit") { editing = true } : nil,
                      pinTitle: true) { dismiss() }
        .navBarVisibility(.hidden)
        .navigationDestination(isPresented: $editing) { NutrientFavoritesView(items: page?.items ?? [], chosen: page?.favorites ?? []) }
        .task(id: week) { await load() }
        .nutrientTargetEditing($target, saved: { await load() }, failed: { error = $0 })
    }

    private func load() async {
        do { page = try await model.api.nutrients(date: date, days: week ? 7 : 1); error = nil }
        catch { self.error = error.localizedDescription }
    }

    /// The gear of a row: the nutrient's Target sheet, with what it needs
    /// (Auto, the own target, the safe upper limit) from its detail.
    private func openTarget(_ item: NutrientItem) async {
        guard loadingTarget == nil else { return }
        loadingTarget = item.key
        defer { loadingTarget = nil }
        do { target = try await model.api.nutrientDetail(key: item.key, date: date); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

/// The page without loading, so tests can render it.
struct NutrientsContent: View {
    let page: NutrientsPage
    @Binding var week: Bool
    let date: String
    /// The row whose gear is loading its Target sheet.
    var loadingTarget: String? = nil
    /// The gear of a row; nil shows none.
    var editTarget: ((NutrientItem) -> Void)? = nil

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
            if page.days > 1, let logged = page.loggedDays, logged < page.days {
                // A day with nothing logged is missing data, not a day without iron.
                Text(L10n.f("Průměr za %@.", L10n.plural("%lld zapsaných dní", logged)))
                    .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 16)
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
                HStack(spacing: 4) {
                    NavigationLink { NutrientDetailView(key: item.key, date: date) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            NutrientRow(item: item, week: page.days > 1)
                            // Fibre, sugar and salt are not on every label: how many meals have them.
                            if item.group == "main", item.known == true, let count = item.count, count < page.meals {
                                Text(L10n.f("Hodnotu má %@ z %@ jídel.", String(count), String(page.meals)))
                                    .font(Typo.caption).foregroundStyle(Palette.muted).padding(.leading, 108)
                            }
                        }
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                    if let editTarget, item.target != nil { gear(item, editTarget) }
                }
            }
        }
    }

    /// The row's settings: its daily target (Auto or one's own) in a sheet.
    private func gear(_ item: NutrientItem, _ action: @escaping (NutrientItem) -> Void) -> some View {
        Button { action(item) } label: {
            ZStack {
                if loadingTarget == item.key {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "gearshape").scaledFont(15).foregroundStyle(Palette.muted)
                }
            }
            .frame(width: 32, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(loadingTarget != nil)
        .accessibilityLabel(L10n.f("Cíl: %@", item.name))
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

/// "Železo ——— 9 / 18 mg": green when met, amber on the way, rust only when
/// something is wrong: over a limit, or the 7-day average under half. A day
/// still going (nothing eaten yet in the morning) stays white.
/// Fibre stays green and sugar and salt amber, like Jídlo.
struct NutrientRow: View {
    let item: NutrientItem
    /// The 7-day average, not one day.
    var week = false

    private var warn: Bool { item.over || (week && item.low) }

    private var color: Color {
        if warn { return Palette.rust }
        switch item.key {
        case "fiber": return Palette.green
        case "sugar", "salt": return Palette.amberBar
        default: return (item.percent ?? 0) < 85 ? Palette.amberBar : Palette.green
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(item.name).font(Typo.caption).foregroundStyle(Palette.muted).frame(width: 96, alignment: .leading)
            ProgressLine(fraction: (item.eaten ?? 0) / max(item.target ?? 1, 0.001), color: color, height: 3)
            Text(item.text).font(Typo.number(16)).foregroundStyle(warn ? Palette.rust : Palette.ink).lineLimit(1)
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
    /// The nutrient while its Target sheet is open.
    @State private var editing: NutrientDetail?

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.food)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    NutrientsTopBar(title: detail?.name ?? "", back: { dismiss() })
                    if let detail {
                        NutrientDetailContent(detail: detail, editTarget: { editing = detail })
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
        .floatingBack(title: detail?.name, pinTitle: true) { dismiss() }
        .navBarVisibility(.hidden)
        .task {
            do { detail = try await model.api.nutrientDetail(key: key, date: date) }
            catch { self.error = error.localizedDescription }
        }
        .nutrientTargetEditing($editing, saved: {
            do { detail = try await model.api.nutrientDetail(key: key, date: date) }
            catch { self.error = error.localizedDescription }
        }, failed: { error = $0 })
    }
}

/// The Target sheet of one nutrient, from Živiny's gear or the detail's
/// Target row. When it closes, an own target (nil: back to Auto) is saved into
/// the profile's nutrientTargets, then `saved` loads the page again.
private struct NutrientTargetEditing: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var editing: NutrientDetail?
    let saved: () async -> Void
    let failed: (String) -> Void
    /// The own target in the sheet; nil is Auto.
    @State private var own: Double?
    @State private var ownBefore: Double?
    @State private var key: String?

    func body(content: Content) -> some View {
        content
            .sheet(item: $editing, onDismiss: { Task { await save() } }) { detail in
                NutrientTargetSheet(detail: detail, own: $own)
            }
            .onChange(of: editing?.key) { _, open in
                guard open != nil, let detail = editing else { return }
                key = detail.key
                own = detail.custom == true ? detail.target : nil
                ownBefore = own
            }
    }

    private func save() async {
        guard let key, own != ownBefore, !model.demo else { return }
        do {
            var profile = try await model.api.profile()
            var targets: JSONObject = [:]
            if case .object(let stored)? = profile["nutrientTargets"] { targets = stored }
            targets[key] = own.map { .number($0) }
            profile["nutrientTargets"] = .object(targets.filter { $0.value != .null })
            try await model.api.saveProfile(profile)
            ownBefore = own
            await saved()
            await model.refreshFood()
        } catch { failed(error.localizedDescription) }
    }
}

extension View {
    /// Opens the Target sheet while `editing` holds a nutrient and saves it on close.
    func nutrientTargetEditing(_ editing: Binding<NutrientDetail?>, saved: @escaping () async -> Void,
                               failed: @escaping (String) -> Void) -> some View {
        modifier(NutrientTargetEditing(editing: editing, saved: saved, failed: failed))
    }
}

struct NutrientDetailContent: View {
    let detail: NutrientDetail
    /// Opens the Target sheet; nil shows no Target row.
    var editTarget: (() -> Void)? = nil

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
            ProgressLine(fraction: (detail.eaten ?? 0) / max(detail.target ?? 1, 0.001), color: over ? Palette.rust : Palette.green, height: 4)
                .padding(.top, 8)
            if let week = detail.weekPercent {
                // Over the days something was logged on.
                let text = (detail.weekDays ?? 7) < 7 ? L10n.f("Průměr za %@: %@ %%", L10n.plural("%lld zapsaných dní", detail.weekDays ?? 0), Fmt.int(week))
                    : L10n.f("Průměr za 7 dní: %@ %%", Fmt.int(week))
                Text(text).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 10)
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
/// Under a pinned bar (floatingBack) the bar holds the title, so it shows once.
struct NutrientsTopBar<Trailing: View>: View {
    let title: String
    var back: () -> Void
    @ViewBuilder var trailing: () -> Trailing
    @Environment(\.floatingBack) private var floating

    var body: some View {
        if floating {
            // The pinned bar holds back, the title and the action; this keeps only its place.
            BackSlot(action: back)
        } else {
            HStack {
                BackSlot(action: back)
                Spacer()
                SectionLabel(text: title).lineLimit(1)
                Spacer()
                trailing().frame(minWidth: 36, minHeight: 36, alignment: .trailing)
            }
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
        .floatingBack(title: "Na obrazovce Jídlo", pinTitle: true) { dismiss() }
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
