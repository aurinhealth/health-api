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
            ConnectionProblemCard()
        }

        RouteLink(route: .readiness) {
            ReadinessHero(readiness: today.readiness, nightMissing: today.sleep == nil, isToday: today.steps.hour != nil)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .padding(.top, 40)

        // Today's weather at the week plan's place (or the offer to set
        // it) with the athlete's status, above the key numbers.
        if model.selectedDate == nil {
            TodayWeatherCard(weather: today.weather).padding(.top, 28)
        }

        KeyNumbers(today: today)
            .padding(.top, model.selectedDate == nil ? 12 : 28)

        if model.selectedDate == nil {
            CoachCheckInCard(openCoach: openCoach).padding(.top, 24)
        }

        CoachTextCard(screen: "today", fallbackText: today.summary?.text, fallbackAdvice: today.summary?.recommendation, live: model.selectedDate == nil).padding(.top, 32)
        RecoveryTodayCard(today: today).padding(.top, 12)
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
            RouteLink(route: .sleep) { cell("Spánek", Fmt.hoursMinutes(today.sleep?.minutes), today.sleep?.index.map { L10n.f("index %@", "\($0)") }, Palette.indigo) }
            Divider().overlay(Palette.hairline)
            RouteLink(route: .strain) {
                cell("Zátěž", Fmt.decimal(today.strain.score), today.strain.planned.map { L10n.f("plán ~%@", Fmt.decimal($0)) }, Palette.amber)
            }
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

// MARK: - Connections

/// A data source that stopped working (Google or Intervals.icu refused the
/// stored access, or Google permissions are missing), with a way to connect
/// it again right here. Loads the connections itself, like the coach's check-in.
struct ConnectionProblemCard: View {
    @Environment(AppModel.self) private var model
    @State private var problems: [ConnectionsResponse.Provider] = []
    @State private var working: String?
    @State private var message: String?
    @State private var googleDisclosure = false
    @State private var intervalsKey = false

    var body: some View {
        Group {
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
                                Group {
                                    if working == provider.id { ProgressView().tint(Palette.onButton) } else { Text("Připojit znovu") }
                                }
                                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                                .padding(.horizontal, 14).frame(height: 34)
                                .background(Palette.button, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .disabled(working != nil)
                        }
                    }
                    if let message {
                        Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 20)
            }
        }
        .task(id: model.loading) {
            guard !model.loading else { return }
            await load()
        }
        .sheet(isPresented: $googleDisclosure) { GoogleDisclosureSheet {
            googleDisclosure = false
            // The browser sheet opens once this one has closed.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { connect("google") }
        } }
        .sheet(isPresented: $intervalsKey) { IntervalsKeySheet { await load() } }
    }

    private func load() async {
        guard !model.demo, let response = try? await model.api.connections() else { return }
        withAnimation { problems = response.providers.filter(\.needsAttention) }
    }

    /// Google first shows what Loadwise does with the data (Google's policy).
    private func start(_ provider: String) {
        if provider == "google" { googleDisclosure = true } else { connect(provider) }
    }

    private func connect(_ provider: String) {
        Task {
            working = provider
            defer { working = nil }
            do {
                guard let event = try await model.connect(provider: provider) else { return }
                switch event {
                case "google", "intervals": message = nil
                case "intervals-failed": intervalsKey = true
                case "expired": message = L10n.tr("Odkaz vypršel, zkus to znovu.")
                default: message = L10n.tr("Připojení se nedokončilo.")
                }
                await load()
            } catch {
                message = error.localizedDescription
            }
        }
    }
}
