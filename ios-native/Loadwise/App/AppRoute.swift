import SwiftUI

/// Every screen a card, a widget on the home screen or a notification can open.
/// Each tab has its own navigation stack; a card pushes its detail onto the
/// stack of the tab it sits on, so "Zpět" returns to where the user was.
enum AppRoute: Hashable {
    case readiness
    case sleep
    case heart
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
    case gym(String)
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
    /// Doporučení trenéra: every option for today (Today's card, + Trénink dne).
    case coachPick
    /// Knihovna → Moje tréninky and Od přátel (MyWorkouts.swift).
    case myWorkouts
    case friendWorkouts
    /// A friend's link opened in the app (aurin.health/t/<id>).
    case sharedWorkout(String)
    /// A saved or received workout planned for a day with the athlete's own weights.
    case planTemplate(TemplatePlanRequest)

    /// The tab a deep link (loadwise://open/sleep) opens the route on.
    var tab: AppTab {
        switch self {
        case .readiness, .sleep, .heart, .weight: return .health
        case .sleepSettings, .dayReview, .steps, .strain, .coachPick: return .today
        default: return .training
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
        case "heart": self = .heart
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
        case .readiness, .sleep, .heart, .weight:
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
        case .gym(let date): GymSessionView(date: date)
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
        case .coachPick: CoachPickView()
        case .myWorkouts: MyWorkoutsView(friends: false)
        case .friendWorkouts: MyWorkoutsView(friends: true)
        case .sharedWorkout(let id): SharedWorkoutView(id: id)
        case .planTemplate(let request): GymBuilderView(date: request.date ?? AppModel.localDate(Date()), template: request)
        }
    }
}

/// The Health details also open from Today and from widgets, before the
/// Health screen has loaded: they load its data first.
struct HealthRoute: View {
    @Environment(AppModel.self) private var model
    let route: AppRoute

    var body: some View {
        if let health = model.health {
            switch route {
            case .readiness:
                // Today's check-in stays changeable here once Today hides it.
                DetailScreen(glow: Palette.Glow.health) {
                    ReadinessDetailContent(health: health, checkin: model.selectedDate == nil && !model.demo && model.today != nil ? .some(model.today?.checkin) : nil)
                }
            case .heart: DetailScreen(glow: Palette.Glow.health) { HeartDetailContent(health: health) }
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
