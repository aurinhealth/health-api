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
                PageScroll {
                    TodayContent(today: today, openSettings: openSettings, openCoach: openCoach)
                        .padding(.bottom, 100)
                }
                .refreshable { await model.refresh(announce: true) }
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
        .task {
            await model.refreshIfStale(.today)
            await DeviceLocation.refreshIfFollowing(model)
        }
    }
}

/// The Today screen without the scroll view, so tests can render it whole.
struct TodayContent: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot
    var openSettings: () -> Void = {}
    var openCoach: () -> Void = {}
    /// The account's first letter on the settings button (GET /app/api/me).

    /// "Upravit přehled": the cards below wiggle and can be moved, removed and added.
    @State private var editing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !editing {
                header
            }

            WidgetBoard(panel: .today,
                        data: WidgetData(panel: .today, today: today, health: model.health, training: model.training, food: model.food),
                        editing: $editing,
                        editTitle: "Upravit přehled")
                .padding(.top, editing ? 0 : 28)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
    }

    /// Everything above the widgets: the day, readiness, weather and the coach.
    @ViewBuilder private var header: some View {
        HStack(spacing: 10) {
            DayNavigator(date: today.date)
            Spacer()
            CircleButton(systemImage: "bubble.left.and.text.bubble.right", label: L10n.tr("Kouč"), action: openCoach)
            Button(action: openSettings) { AvatarView(size: 36) }
                .buttonStyle(.plain)
            .accessibilityLabel("Profil a nastavení")
        }

        if model.selectedDate == nil && !model.demo {
            DataAgePill()
            ConnectionProblemCard()
        }

        RouteLink(route: .readiness) {
            ReadinessHero(readiness: today.readiness, nightMissing: today.sleep == nil, isToday: today.steps.hour != nil)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .padding(.top, 40)

        if model.selectedDate == nil {
            MorningCheckinCard(feeling: today.checkin, top: 20)
            // Cycle tracking: the morning question, or the day's log.
            if let cycle = today.cycle, cycle.ask || cycle.flow > 0 {
                TodayCycleCard(cycle: cycle, date: today.date).padding(.top, 12)
            }
            // Deník: the morning questions about yesterday, and "Nový objev".
            JournalTodayCard()
        }

        // Today's weather at the week plan's place (or the offer to set
        // it) with the athlete's status, above the key numbers.
        if model.selectedDate == nil {
            TodayWeatherCard(weather: today.weather).padding(.top, 28)
        }

        KeyNumbers(today: today)
            .padding(.top, model.selectedDate == nil ? 12 : 28)

        // Doporučení trenéra: the day's activity from anything (CoachPick.swift).
        if model.selectedDate == nil { CoachPickCard().padding(.top, 16) }

        if model.selectedDate == nil {
            if let plan = today.trainingPlan {
                Label(([plan.name, plan.paused == true ? L10n.tr("pozastaveno") : L10n.f("týden %@/%@", String(plan.week), String(plan.weeksCount))] + (plan.paused == true ? [] : plan.phaseLabel.map { [$0] } ?? [])).joined(separator: " · "), systemImage: "flag")
                    .font(Typo.small).foregroundStyle(Palette.secondary)
                    .padding(.top, 24)
            }
            if today.trainingPlan?.paused == true {
                PlanPausedCard().padding(.top, 10)
            } else if let proposal = today.trainingPlan?.proposal {
                PlanProposalCard(proposal: proposal).padding(.top, 10).id(proposal.type + proposal.text)
            }
            CoachCheckInCard(openCoach: openCoach).padding(.top, today.trainingPlan == nil ? 24 : 10)
            WeekRevisionCard().padding(.top, 12)
            ThresholdCheckCard().padding(.top, 12)
        }

        CoachTextCard(screen: "today", fallbackText: today.summary?.text, fallbackAdvice: today.summary?.recommendation, live: model.selectedDate == nil).padding(.top, 32)
        RecoveryTodayCard(today: today).padding(.top, 12)
    }
}

/// "data ze včera 21:10 · obnovit" under the day when Apple Health last
/// reached the server more than 3 hours ago; nothing while it is fresh.
/// A tap syncs and reloads Today.
struct DataAgePill: View {
    @Environment(AppModel.self) private var model
    private var health: AppleHealth { AppleHealth.shared }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 300)) { context in
            if health.enabled, let last = health.lastSync, let text = Self.text(last: last, now: context.date) {
                Button { Task { await model.refresh() } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "clock").font(.system(size: 11, weight: .semibold))
                        Text(verbatim: text + L10n.tr(" · obnovit"))
                    }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Palette.amber)
                    .padding(.horizontal, 10)
                    .frame(height: 26)
                    .background(Palette.amberSoft, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(model.loading || health.syncing)
                // Under the day's name, past its back arrow.
                .padding(.leading, 34)
                .padding(.top, 2)
            }
        }
    }

    /// "data z 6:42", "data ze včera 21:10" or "data z 9. 10. 21:10" once the
    /// last sync is over 3 hours old; nil before.
    static func text(last: Date, now: Date, calendar: Calendar = .current) -> String? {
        guard now.timeIntervalSince(last) > 3 * 3600 else { return nil }
        let time = ClockText.format(last)
        if calendar.isDate(last, inSameDayAs: now) { return L10n.f("data z %@", time) }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(last, inSameDayAs: yesterday) {
            return L10n.f("data ze včera %@", time)
        }
        let day = DateFormatter()
        day.locale = Fmt.locale
        day.timeZone = calendar.timeZone
        day.dateFormat = L10n.isEnglish ? "MMM d" : "d. M."
        return L10n.f("data z %@", day.string(from: last) + " " + time)
    }
}

/// "‹ ČTVRTEK 8. ŘÍJNA ›": a day back, a day forward (not past today; Food
/// goes two weeks ahead for planned and copied meals).
struct DayNavigator: View {
    @Environment(AppModel.self) private var model
    let date: String
    var ahead = false

    private var canGoForward: Bool {
        guard ahead else { return model.selectedDate != nil }
        let last = AppModel.shift(AppModel.localDate(Date()), by: AppModel.foodDaysAhead) ?? date
        return date < last
    }

    var body: some View {
        HStack(spacing: 6) {
            Button { Task { await model.showDay(offset: -1) } } label: {
                Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold)).frame(width: 28, height: 36)
            }
            .accessibilityLabel("Předchozí den")
            SectionLabel(text: Fmt.dayHeading(date))
            if canGoForward {
                Button { Task { await model.showDay(offset: 1, ahead: ahead) } } label: {
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).frame(width: 28, height: 36)
                }
                .accessibilityLabel("Další den")
            }
            if model.selectedDate != nil {
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
                        .font(Typo.number(132)).lineLimit(1).minimumScaleFactor(0.5)
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

/// "Jak se dnes cítíš?" under the readiness: one tap (src/morning-checkin.js).
/// The answer can only lower the readiness, for Today and the coach alike.
/// Tapping the chosen one again clears it; "Nemocný" offers the status Nemoc.
/// On Today it goes away once answered; the readiness detail keeps it, so the
/// answer can be changed there.
struct MorningCheckinCard: View {
    @Environment(AppModel.self) private var model
    let feeling: String?
    var keepAnswered = false
    var top: CGFloat = 0
    @State private var chosen: String?
    @State private var saving = false
    @State private var offerSick = false
    @State private var answers = 0

    init(feeling: String?, keepAnswered: Bool = false, top: CGFloat = 0) {
        self.feeling = feeling
        self.keepAnswered = keepAnswered
        self.top = top
        _chosen = State(initialValue: feeling)
    }

    struct Option: Identifiable {
        let id: String
        let symbol: String
        let label: String
    }

    static let options: [Option] = [
        Option(id: "fresh", symbol: "⚡️", label: "Svěží"),
        Option(id: "normal", symbol: "🙂", label: "Normál"),
        Option(id: "tired", symbol: "🥱", label: "Unavený"),
        Option(id: "sick", symbol: "🤒", label: "Nemocný")
    ]

    var body: some View {
        if keepAnswered || chosen == nil || saving || offerSick {
            card.padding(.top, top)
        } else {
            // Holds onChange while the card is gone, so clearing the answer
            // elsewhere brings it back.
            Color.clear.frame(height: 0)
                .onChange(of: feeling) { _, new in chosen = new }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Jak se dnes cítíš?").font(Typo.small).foregroundStyle(Palette.muted)
            HStack(spacing: 8) {
                ForEach(Self.options) { (option: Option) in
                    let on: Bool = chosen == option.id
                    Button { Task { await choose(on ? nil : option.id) } } label: {
                        VStack(spacing: 4) {
                            Text(verbatim: option.symbol).font(.system(size: 22))
                            Text(L10n.tr(option.label)).font(.footnote.weight(.semibold))
                                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity).frame(height: 60)
                        .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
        .onChange(of: feeling) { _, new in chosen = new }
        .sensoryFeedback(.impact(weight: .light), trigger: answers)
        .alert("Přepnout stav na Nemoc?", isPresented: $offerSick) {
            Button("Přepnout") { Task { try? await model.setAthleteStatus("sick", until: nil, note: nil) } }
            Button("Teď ne", role: .cancel) {}
        } message: {
            Text("Kouč do té doby nebude plánovat trénink.")
        }
    }

    private func choose(_ id: String?) async {
        let before = chosen
        chosen = id
        saving = true
        answers += 1
        defer { saving = false }
        do {
            try await model.setMorningCheckin(id)
            if id == "sick", model.athleteStatus?.status != "sick" { offerSick = true }
        } catch {
            chosen = before
            model.notice = error.localizedDescription
        }
    }
}

/// Sleep · Strain · HRV under the readiness number.
struct KeyNumbers: View {
    @Environment(AppModel.self) private var model
    let today: TodaySnapshot

    var body: some View {
        HStack(spacing: 0) {
            RouteLink(route: .sleep) { cell("Spánek", Fmt.hoursMinutes(today.sleep?.minutes), today.sleep?.index.map { L10n.f("index %@", "\($0)") }, Palette.indigo) }
            Divider().overlay(Palette.hairline)
            RouteLink(route: .strain) {
                cell("Námaha", Fmt.decimal(today.strain.score), strainNote, today.strain.target != nil ? Palette.green : Palette.amber)
            }
            Divider().overlay(Palette.hairline)
            RouteLink(route: .heart) { cell("HRV", Fmt.int(today.hrv?.value), hrvDelta, hrvColor) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
    }

    private var strainNote: String? {
        // Whole numbers: "cíl 10,8–13,8" does not fit a third of the phone's width.
        if let t = today.strain.target { return L10n.f("cíl %@–%@", Fmt.int(t.low), Fmt.int(t.high)) }
        return today.strain.planned.map { L10n.f("plán ~%@", Fmt.decimal($0)) }
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
            Text(note ?? " ").font(Typo.caption).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.75)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
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
                Text("Kdy jít spát?").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
            }
        }
    }
}

// MARK: - Connections

/// A data source that stopped working (Google or Intervals.icu refused the
/// stored access, or Google permissions are missing), with a way to connect
/// it again right here. Loads the connections itself, like the coach's check-in.
struct ConnectionProblemCard: View {
    @Environment(AppModel.self) private var model
    @State private var problems: [ConnectionsResponse.Provider] = []
    @State private var connecting: ConnectTarget?

    var body: some View {
        // A stack, not a Group: on an empty Group the task never runs.
        VStack(spacing: 0) {
            if !problems.isEmpty {
                Card {
                    WidgetHeader(title: "Propojení", color: Palette.rust)
                    ForEach(problems) { provider in
                        HStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 16)).foregroundStyle(Palette.rust)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(provider.name ?? provider.id).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                if let problem = provider.problemText {
                                    Text(problem).font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                            }
                            Spacer(minLength: 8)
                            Button { start(provider.id) } label: {
                                Text("Připojit znovu")
                                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                                .padding(.horizontal, 14).frame(height: 34)
                                .background(Palette.button, in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.top, 20)
            }
        }
        .task(id: model.loading) {
            guard !model.loading else { return }
            await load()
        }
        .sheet(item: $connecting) { target in ServiceConnectSheet(target: target) { await load() } }
    }

    private func load() async {
        guard !model.demo, let response = try? await model.api.connections() else { return }
        withAnimation { problems = response.providers.filter(\.needsAttention) }
    }

    /// The service's connect screen (ServiceConnectSheet), the same as in Zdroje dat.
    private func start(_ provider: String) {
        connecting = ConnectTarget(id: provider)
    }
}
