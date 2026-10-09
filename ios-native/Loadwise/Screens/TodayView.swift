import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var model
    var openSettings: () -> Void = {}
    var openCoach: () -> Void = {}

    var body: some View {
        NavigationStack(path: model.path(.today)) {
            screen
                .toolbar(.hidden, for: .navigationBar)
                .appRoutes()
        }
    }

    private var screen: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            if let today = model.today {
                ScrollView {
                    TodayContent(today: today, openSettings: openSettings, openCoach: openCoach)
                        .padding(.bottom, 100)
                }
                .refreshable { await model.refresh() }
            } else if let message = model.errorMessage {
                VStack(spacing: 16) {
                    Text(message).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                    Button("Zkusit znovu") { Task { await model.refresh() } }.font(Typo.bodyStrong)
                }
                .padding(32)
            } else {
                ProgressView()
            }
        }
        .task { if model.today == nil { await model.refresh() } }
    }
}

/// The Today screen without the scroll view, so tests can render it whole.
struct TodayContent: View {
    let today: TodaySnapshot
    var openSettings: () -> Void = {}
    var openCoach: () -> Void = {}
    /// The widgets hidden in "Upravit přehled" (comma-separated TodayWidget).
    @AppStorage("todayHidden") private var hidden = ""
    @State private var editing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                DayNavigator(date: today.date)
                Spacer()
                CircleButton(systemImage: "bubble.left.and.text.bubble.right", label: "Kouč", action: openCoach)
                Button(action: openSettings) {
                    Text("P").font(.footnote.weight(.medium))
                        .frame(width: 36, height: 36)
                        .overlay(Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
                .foregroundStyle(Palette.ink)
                .accessibilityLabel("Profil a nastavení")
            }

            RouteLink(route: .readiness) {
                ReadinessHero(readiness: today.readiness, nightMissing: today.sleep == nil, isToday: today.steps.hour != nil)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .padding(.top, 40)

            KeyNumbers(today: today)
                .padding(.top, 28)

            if let summary = today.summary, summary.text != nil || summary.recommendation != nil {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        SectionLabel(text: "Co to znamená pro dnešek")
                        Spacer()
                        Button(action: openCoach) {
                            Label("Zeptat se", systemImage: "bubble.left").font(.footnote.weight(.medium)).foregroundStyle(Palette.muted)
                        }
                    }
                    summaryText(summary)
                        .font(Typo.sentence(22))
                        .foregroundStyle(Palette.ink)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 32)
            }

            VStack(spacing: 12) {
                if shows(.food) { TabLinkCard(tab: .food) { FoodWidget(nutrition: today.nutrition) } }
                if shows(.plan) {
                    if !today.plan.isEmpty { PlanWidget(items: today.plan, today: today.date) }
                    if today.tonight == nil, today.steps.hour != nil {
                        RouteLink(route: .sleepSettings) { BedtimeSetupCard() }
                    }
                }
                if shows(.steps) { StepsWidget(steps: today.steps) }
                if shows(.heart), today.restingHR != nil || today.hrv != nil {
                    WidgetRow {
                        if let rhr = today.restingHR { RouteLink(route: .heart) { RestingHRWidget(restingHR: rhr) } } else { Color.clear }
                    } right: {
                        if let hrv = today.hrv { RouteLink(route: .heart) { HRVWidget(hrv: hrv) } } else { Color.clear }
                    }
                }
                if shows(.weight), let weight = today.weight { RouteLink(route: .weight) { WeightWidget(weight: weight) } }
            }
            .padding(.top, 28)

            Button { editing = true } label: {
                Label("Upravit přehled", systemImage: "slider.horizontal.3")
                    .font(Typo.bodyStrong)
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 18)
                    .frame(height: 40)
                    .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 28)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .sheet(isPresented: $editing) { TodayLayoutSheet(hidden: $hidden) }
    }

    private func shows(_ widget: TodayWidget) -> Bool {
        !hidden.split(separator: ",").contains(Substring(widget.rawValue))
    }

    private func summaryText(_ s: TodaySnapshot.Summary) -> Text {
        var text = Text(s.text ?? "")
        if let rec = s.recommendation {
            text = text + Text(s.text == nil ? "" : " ") + Text(rec).font(Typo.sentenceItalic(22)).foregroundColor(Palette.green)
        }
        return text
    }
}

/// "‹ ČTVRTEK 8. ŘÍJNA ›": a day back, a day forward (not past today).
struct DayNavigator: View {
    @Environment(AppModel.self) private var model
    let date: String

    var body: some View {
        HStack(spacing: 6) {
            Button { Task { await model.showDay(offset: -1) } } label: {
                Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold)).frame(width: 28, height: 36)
            }
            .accessibilityLabel("Předchozí den")
            SectionLabel(text: Fmt.dayHeading(date))
            if model.selectedDate != nil {
                Button { Task { await model.showDay(offset: 1) } } label: {
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).frame(width: 28, height: 36)
                }
                .accessibilityLabel("Další den")
                Button { Task { await model.showToday() } } label: {
                    Text("Dnes").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 10).frame(height: 28)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
            }
        }
        .foregroundStyle(Palette.muted)
        .disabled(model.demo || model.loading)
    }
}

struct ReadinessHero: View {
    let readiness: TodaySnapshot.Readiness
    var nightMissing = false
    var isToday = true

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Připravenost").font(Typo.body).foregroundStyle(Palette.muted)
            if let score = readiness.score {
                HStack(alignment: .lastTextBaseline, spacing: 14) {
                    Text(String(score))
                        .font(Typo.number(132))
                        .foregroundStyle(Palette.ink)
                    if let pill = pill {
                        Pill(text: pill.text, foreground: pill.fg, background: pill.bg)
                    }
                }
            } else {
                Text(nightMissing && isToday ? "Čeká na dnešní noc" : "Zatím bez čísla")
                    .font(Typo.sentence(34, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 8)
                Text(nightMissing && isToday
                     ? "Ukáže se, až hodinky nahrají dnešní spánek. Předchozí den najdeš šipkou vlevo nahoře."
                     : "Připravenost potřebuje aspoň 14 dní HRV nebo klidového tepu.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var pill: (text: String, fg: Color, bg: Color)? {
        switch readiness.zone {
        case "green": return ("vysoká", Palette.green, Palette.greenSoft)
        case "yellow": return ("střední", Palette.amber, Palette.amberSoft)
        case "red": return ("nízká", Palette.rust, Palette.rust.opacity(0.14))
        default: return nil
        }
    }
}

/// Sleep · Strain · HRV under the readiness number.
struct KeyNumbers: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot

    var body: some View {
        HStack(spacing: 0) {
            RouteLink(route: .sleep) { cell("Spánek", Fmt.hoursMinutes(today.sleep?.minutes), today.sleep?.index.map { "index \($0)" }, Palette.indigo) }
            Divider().overlay(Palette.hairline)
            Button { model.tab = .training } label: {
                cell("Zátěž", Fmt.decimal(today.strain.score), today.strain.planned.map { "plán ~" + Fmt.decimal($0) }, Palette.amber)
            }
            .buttonStyle(PressableCardStyle())
            Divider().overlay(Palette.hairline)
            RouteLink(route: .heart) { cell("HRV", Fmt.int(today.hrv?.value), hrvDelta, hrvColor) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
    }

    private var hrvDifference: Double? {
        guard let value = today.hrv?.value, let base = today.hrv?.baseline else { return nil }
        return (value - base).rounded()
    }

    private var hrvDelta: String? {
        guard let d = hrvDifference else { return nil }
        return (d >= 0 ? "↑ " : "↓ ") + Fmt.int(abs(d)) + " ms"
    }

    private var hrvColor: Color { (hrvDifference ?? 0) >= 0 ? Palette.green : Palette.rust }

    private func cell(_ title: String, _ value: String, _ note: String?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(30)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(note ?? " ").font(Typo.caption).foregroundStyle(color).lineLimit(1)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The widgets "Upravit přehled" can hide.
enum TodayWidget: String, CaseIterable {
    case food, plan, steps, heart, weight

    var title: String {
        switch self {
        case .food: return "Jídlo a pití"
        case .plan: return "Plán dne a večerka"
        case .steps: return "Pohyb"
        case .heart: return "Klidový tep a HRV"
        case .weight: return "Váha"
        }
    }
}

struct TodayLayoutSheet: View {
    @Binding var hidden: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Upravit přehled") {
                SettingsGroup(footer: "Skryté karty najdeš dál v sekcích Trénink, Jídlo a Zdraví.") {
                    ForEach(Array(TodayWidget.allCases.enumerated()), id: \.element) { index, widget in
                        if index > 0 { SettingsDivider() }
                        SettingsToggle(title: widget.title, isOn: binding(widget))
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Hotovo") { dismiss() }.font(.subheadline.weight(.semibold)) }
            }
        }
        .tint(Palette.ink)
        .presentationDetents([.medium, .large])
    }

    private func binding(_ widget: TodayWidget) -> Binding<Bool> {
        Binding(get: { !hidden.split(separator: ",").contains(Substring(widget.rawValue)) },
                set: { on in
                    var set = Set(hidden.split(separator: ",").map(String.init))
                    if on { set.remove(widget.rawValue) } else { set.insert(widget.rawValue) }
                    hidden = TodayWidget.allCases.map(\.rawValue).filter(set.contains).joined(separator: ",")
                })
    }
}

/// A whole card that opens another tab (Jídlo on Today).
struct TabLinkCard<Label: View>: View {
    @Environment(AppModel.self) private var model
    let tab: AppTab
    @ViewBuilder var label: Label

    var body: some View {
        Button { model.tab = tab } label: { label }
            .buttonStyle(PressableCardStyle())
    }
}

/// "Plán dne" without a bedtime: no alarm and no recorded nights yet.
struct BedtimeSetupCard: View {
    var body: some View {
        Card {
            HStack(spacing: 12) {
                Image(systemName: "moon.zzz").font(.system(size: 20)).foregroundStyle(Palette.indigo)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Kdy jít spát?").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text("Nastav si budík a cíl spánku, večerka se pak ukáže v plánu dne.").font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
    }
}
