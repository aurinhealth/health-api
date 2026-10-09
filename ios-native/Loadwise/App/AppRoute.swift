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
    case gym(String)
    case activity(WeekSession)
    case planned(WeekSession)
    case sleepSettings
    case gymBuilder
    case exerciseLibrary
    case workoutLibrary(String)
    case equipment
    case trainingMode(String)

    /// The tab a deep link (loadwise://open/sleep) opens the route on.
    var tab: AppTab {
        switch self {
        case .readiness, .sleep, .heart, .weight: return .health
        case .sleepSettings: return .today
        default: return .training
        }
    }

    /// loadwise://open/<name>: the home-screen widgets link here.
    init?(url: URL) {
        guard url.scheme == "loadwise", url.host() == "open" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch parts.first {
        case "readiness": self = .readiness
        case "sleep": self = .sleep
        case "heart": self = .heart
        case "weight": self = .weight
        case "form": self = .form
        case "gym": self = .gym(parts.count > 1 ? parts[1] : AppModel.localDate(Date()))
        case "sleep-settings": self = .sleepSettings
        case "gym-builder": self = .gymBuilder
        case "exercises": self = .exerciseLibrary
        default: return nil
        }
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
        case .gym(let date): GymSessionView(date: date)
        case .activity(let session): ActivityDetailView(session: session)
        case .planned(let session): PlannedWorkoutView(session: session)
        case .sleepSettings: SleepSettingsView()
        case .gymBuilder: GymBuilderView(date: AppModel.localDate(Date()))
        case .exerciseLibrary: ExerciseLibraryView()
        case .workoutLibrary(let sport): WorkoutLibraryView(sport: sport)
        case .equipment: EquipmentView()
        case .trainingMode(let date): TrainingModeView(date: date)
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
            case .readiness: DetailScreen(glow: Palette.Glow.health) { ReadinessDetailContent(health: health) }
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
