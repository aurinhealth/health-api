import SwiftUI

/// Every screen a card, a widget on the home screen or a notification can open.
/// Each tab has its own navigation stack; a card pushes its detail onto the
/// stack of the tab it sits on, so "Zpět" returns to where the user was.
enum AppRoute: Hashable {
    case readiness
    case sleep
    /// A value of Zdraví with its own detail (MetricDetails.swift).
    case metric(HealthMetric)
    case weight
    case form
    case vo2max
    /// Active energy day by day with the day's activities (Training → Aktivní výdej).
    case activeEnergy
    /// Minutes in the heart-rate zones week by week (Training → Aktivní minuty v zónách).
    case zones
    /// Steps today, this week and over 30 days (Today → Pohyb).
    case steps
    /// The day's strain, what it is made of and the form forecast (Today → Zátěž).
    case strain
    /// A past day's Námaha (Training → the day chosen in the calendar).
    case strainDay(String)
    /// Regenerace from the coach's card on Today (RecoveryViews.swift).
    case recoveryTime
    case gym(String)
    /// The day's gym sheet opened from one of its done lifting activities: a
    /// day can have several, and ⋯ Smazat aktivitu deletes this one.
    case gymSession(WeekSession)
    case activity(WeekSession)
    case planned(WeekSession)
    case sleepSettings
    case gymBuilder
    case exerciseLibrary
    /// The library with the choice of sports; .workoutLibrary opens one sport.
    case library
    case workoutLibrary(String)
    case equipment
    case trainingMode(String)
    /// Posilovna naživo (GymLive.swift): the day, and whether it starts with the last workout's exercises.
    case liveGym(String, Bool)
    /// The coach's sessions for the rest of the week, the review of today, the records.
    case weekPlan
    case dayReview
    case insights
    /// Trénink → Svaly: how tired each muscle is (MuscleViews.swift).
    case muscles
    /// Svaly → one muscle (its id in /app/api/muscles): strength and how often.
    case muscle(String)
    /// The exercise catalogue on one muscle chip (BodyFigure id).
    case exercises(String)
    /// Cycle tracking's calendar (Health → Cyklus).
    case cycle
    /// Aktivita dne: Další možnosti from Today's card (false), every option
    /// with the day's activity from + (true).
    case coachPick(Bool)
    /// Knihovna → Moje tréninky and Od přátel (MyWorkouts.swift).
    case myWorkouts
    case friendWorkouts
    /// A friend's link opened in the app (aurin.health/t/<id>).
    case sharedWorkout(String)
    /// A saved or received workout planned for a day with the athlete's own weights.
    case planTemplate(TemplatePlanRequest)
    /// Deník for a day (Today's card), Co na tebe působí, and one item's detail (key, metric).
    case journal(String)
    case journalImpact
    case journalItem(String, String)

    /// The tab a deep link (loadwise://open/sleep) opens the route on.
    var tab: AppTab {
        switch self {
        case .readiness, .sleep, .metric, .weight, .cycle: return .health
        case .sleepSettings, .dayReview, .steps, .strain, .recoveryTime, .coachPick, .journal, .journalImpact, .journalItem: return .today
        default: return .training
        }
    }

    /// A screen with work in progress (a workout being logged, built or
    /// planned): switching tabs keeps it open instead of going back.
    var keepsPlace: Bool {
        switch self {
        case .gym, .gymSession, .gymBuilder, .trainingMode, .liveGym, .planTemplate: return true
        default: return false
        }
    }

    /// Hosts of shared workout links: aurin.health, older links on petrfitnessdata.eu.
    static let linkHosts: Set<String> = ["aurin.health", "www.aurin.health", "petrfitnessdata.eu", "www.petrfitnessdata.eu"]

    /// loadwise://open/<name>: the home-screen widgets link here. A shared
    /// workout's link opens here too, as a universal link or from its web page.
    init?(url: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "https", Self.linkHosts.contains(url.host() ?? "") {
            guard parts.count == 2, parts[0] == "t", Self.isShareId(parts[1]) else { return nil }
            self = .sharedWorkout(parts[1])
            return
        }
        guard url.scheme == "loadwise", url.host() == "open" else { return nil }
        switch parts.first {
        case "readiness": self = .readiness
        case "sleep": self = .sleep
        case "heart", "hrv": self = .metric(.hrv)
        case "metric" where parts.count > 1: guard let metric = HealthMetric(rawValue: parts[1]) else { return nil }; self = .metric(metric)
        case "weight": self = .weight
        case "form": self = .form
        case "vo2max": self = .vo2max
        case "active-energy": self = .activeEnergy
        case "zones": self = .zones
        case "steps": self = .steps
        case "strain": self = .strain
        case "library": self = parts.count > 1 ? .workoutLibrary(parts[1]) : .library
        case "gym": self = .gym(parts.count > 1 ? parts[1] : AppModel.localDate(Date()))
        case "sleep-settings": self = .sleepSettings
        case "gym-builder": self = .gymBuilder
        case "exercises": self = .exerciseLibrary
        case "week-plan": self = .weekPlan
        case "day-review": self = .dayReview
        case "records": self = .insights
        case "muscles": self = .muscles
        case "muscle" where parts.count > 1: self = .muscle(parts[1])
        case "cycle": self = .cycle
        case "journal": self = .journal(parts.count > 1 ? parts[1] : AppModel.shift(AppModel.localDate(Date()), by: -1) ?? AppModel.localDate(Date()))
        case "my-workouts": self = .myWorkouts
        case "friend-workouts": self = .friendWorkouts
        case "share" where parts.count > 1 && Self.isShareId(parts[1]): self = .sharedWorkout(parts[1])
        default: return nil
        }
    }

    /// A link's id: ten letters and digits (src/workout-templates.js).
    static func isShareId(_ id: String) -> Bool {
        id.count == 10 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
    }
}

/// A whole tab opened by a deep link (loadwise://open/food).
enum TabLink {
    static func tab(_ url: URL) -> AppTab? {
        guard url.scheme == "loadwise", url.host() == "open" else { return nil }
        switch url.pathComponents.filter({ $0 != "/" }).first {
        case "today": return .today
        case "training": return .training
        case "food": return .food
        case "health": return .health
        default: return nil
        }
    }
}

extension View {
    /// The destinations of every route, for each tab's navigation stack.
    func appRoutes() -> some View {
        navigationDestination(for: AppRoute.self) { RouteScreen(route: $0) }
    }
}

struct RouteScreen: View {
    @Environment(AppModel.self) private var model
    let route: AppRoute

    var body: some View {
        switch route {
        case .readiness, .sleep, .metric, .weight:
            HealthRoute(route: route)
        case .form:
            if let training = model.training { FormDetailView(training: training) } else { LoadingScreen { await model.refreshTraining() } }
        case .vo2max:
            if let training = model.training { VO2maxDetailView(training: training) } else { LoadingScreen { await model.refreshTraining() } }
        case .activeEnergy:
            if let training = model.training { ActiveEnergyDetailView(training: training) } else { LoadingScreen { await model.refreshTraining() } }
        case .zones:
            if let training = model.training { ZonesDetailView(training: training) } else { LoadingScreen { await model.refreshTraining() } }
        case .steps: StepsDetailView()
        case .strain: StrainDetailView()
        case .strainDay(let date): StrainDetailView(date: date)
        case .recoveryTime: RecoveryTimeView()
        case .gym(let date): GymSessionView(date: date)
        case .gymSession(let session): GymSessionView(date: session.date, session: session)
        case .activity(let session): ActivityDetailView(session: session)
        case .planned(let session): PlannedWorkoutView(session: session)
        case .sleepSettings: SleepSettingsView()
        case .gymBuilder: GymBuilderView(date: AppModel.localDate(Date()))
        case .exerciseLibrary: ExerciseLibraryView()
        case .library: TrainingLibraryView()
        case .workoutLibrary(let sport): TrainingLibraryView(sport: sport)
        case .equipment: EquipmentView()
        case .trainingMode(let date): TrainingModeView(date: date)
        case .liveGym(let date, let repeatLast): LiveGymView(date: date, repeatLast: repeatLast)
        case .weekPlan: WeekPlanView()
        case .dayReview: DayReviewView()
        case .insights: InsightsView()
        case .muscles: MusclesView()
        case .muscle(let id): MuscleDetailView(id: id)
        case .exercises(let muscle): ExerciseLibraryView(muscle: muscle)
        case .cycle: CycleCalendarView()
        case .coachPick(let all): CoachPickView(all: all)
        case .myWorkouts: MyWorkoutsView(friends: false)
        case .friendWorkouts: MyWorkoutsView(friends: true)
        case .sharedWorkout(let id): SharedWorkoutView(id: id)
        case .planTemplate(let request): GymBuilderView(date: request.date ?? AppModel.localDate(Date()), template: request)
        case .journal(let date): JournalView(date: date)
        case .journalImpact: JournalImpactView()
        case .journalItem(let key, let metric): JournalItemView(key: key, metric: metric)
        }
    }
}

/// The Health details also open from Today and from widgets, before the
/// Health screen has loaded: they load its data first.
struct HealthRoute: View {
    @Environment(AppModel.self) private var model
    let route: AppRoute

    var body: some View {
        content
            // The saved copy shows at once; a stale one loads again (a detail
            // opened from Today before the Health screen was visited).
            .task { await model.refreshIfStale(.health) }
    }

    @ViewBuilder private var content: some View {
        if let health = model.health {
            switch route {
            case .readiness:
                // Today's check-in stays changeable here once Today hides it.
                DetailScreen(glow: Palette.Glow.health, title: "Připravenost") {
                    ReadinessDetailContent(health: health)
                }
            case .metric(let metric): MetricDetailView(metric: metric, health: health)
            case .weight: WeightDetailView(health: health)
            default: SleepDetailView(health: health)
            }
        } else {
            LoadingScreen(message: model.healthError) { await model.refreshHealth() }
        }
    }
}

/// A detail waiting for its data: a spinner, or the error with "Zkusit znovu".
struct LoadingScreen: View {
    var message: String? = nil
    var load: () async -> Void

    var body: some View {
        DetailScreen(glow: Palette.Glow.health) {
            VStack(spacing: 16) {
                if let message {
                    Text(message).font(Typo.sentence(20)).foregroundStyle(Palette.secondary).multilineTextAlignment(.center)
                    Button("Zkusit znovu") { Task { await load() } }.font(Typo.bodyStrong)
                } else {
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
        }
        .task { if message == nil { await load() } }
    }
}

/// A card that opens a route: the whole card is the button, with a chevron hint.
struct RouteLink<Label: View>: View {
    let route: AppRoute
    @ViewBuilder var label: Label

    var body: some View {
        NavigationLink(value: route) { label }
            .buttonStyle(PressableCardStyle())
            // The smoke test (LoadwiseUITests) finds a card by its route: "open.readiness".
            .accessibilityIdentifier("open.\(route)")
    }
}

/// Cards shrink a little while pressed, so it is clear they open something.
struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
