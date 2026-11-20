import SwiftUI
import UserNotifications

/// "Dokonči nastavení" (onboarding concept v38, part O): the setup ends after
/// "O tobě", and what it asked after that waits on Today in one card, right
/// under the readiness: the goal, the training days, where one lifts (only
/// with Gym ticked) and the notifications. Each row opens the same screen as
/// in Settings and ticks itself off; the card goes once all are done, and the
/// "První dny" card follows (FirstDaysCard).
enum FinishSetup {
    static let sinceKey = "finishSetup.since"
    static let goalKey = "finishSetup.goal"
    static let timeKey = "finishSetup.time"
    static let liftKey = "finishSetup.lift"

    /// The setup finished (SetupFlowView): the card starts.
    static func start() {
        let defaults = UserDefaults.standard
        defaults.set(Date().timeIntervalSince1970, forKey: sinceKey)
        for key in [goalKey, timeKey, liftKey] { defaults.removeObject(forKey: key) }
    }

    /// Signed out: the next account starts from its own setup.
    static func forget() {
        for key in [sinceKey, goalKey, timeKey, liftKey] { UserDefaults.standard.removeObject(forKey: key) }
    }

    /// The card is still on Today (FirstDaysCard waits for it).
    static var open: Bool { UserDefaults.standard.double(forKey: sinceKey) > 0 }

    static func close() { UserDefaults.standard.removeObject(forKey: sinceKey) }
}

struct FinishSetupCard: View {
    let today: TodaySnapshot
    @Environment(AppModel.self) private var model
    @AppStorage(FinishSetup.sinceKey) private var since: Double = 0
    @AppStorage(FinishSetup.goalKey) private var goal = false
    @AppStorage(FinishSetup.timeKey) private var time = false
    @AppStorage(FinishSetup.liftKey) private var lift = false
    @State private var notifications = false
    @State private var lifts = false
    @State private var store: SettingsStore?
    @State private var editingGoal = false
    @State private var editingTime = false
    @State private var editingLift = false

    /// lifts: Gym is ticked before the profile loads (the snapshot test).
    init(today: TodaySnapshot, lifts: Bool = false) {
        self.today = today
        _lifts = State(initialValue: lifts)
    }

    private var steps: [Bool] { [goal, time] + (lifts ? [lift] : []) + [notifications] }
    private var doneCount: Int { steps.filter { $0 }.count }

    var body: some View {
        if since > 0 {
            Card {
                HStack {
                    Text("Dokonči nastavení").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Text(L10n.f("%@ z %@", String(doneCount), String(steps.count))).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                VStack(spacing: 0) {
                    Button { editingGoal = true } label: {
                        row("Nastav svůj cíl", "Kondice, závod, nebo hubnutí", done: goal)
                    }
                    .buttonStyle(PressableCardStyle())
                    Divider().overlay(Palette.hairline)
                    Button { editingTime = true } label: {
                        row("Vyber dny na trénink", "Dny a hodiny týdně", done: time)
                    }
                    .buttonStyle(PressableCardStyle())
                    if lifts {
                        Divider().overlay(Palette.hairline)
                        Button { editingLift = true } label: {
                            row("Kde posiluješ", "Posilovna, doma, nebo obojí", done: lift)
                        }
                        .buttonStyle(PressableCardStyle())
                    }
                    Divider().overlay(Palette.hairline)
                    Button { Task { await allowNotifications() } } label: {
                        row("Zapni oznámení", notificationsNote, done: notifications, translated: true)
                    }
                    .buttonStyle(PressableCardStyle())
                    .disabled(notifications)
                }
            }
            .task { await load() }
            .onChange(of: doneCount) { _, done in
                if done == steps.count { withAnimation(.snappy) { FinishSetup.close() } }
            }
            .sheet(isPresented: $editingGoal, onDismiss: { Task { await goalSaved() } }) {
                NavigationStack {
                    if let store {
                        GoalsSettingsView(store: store)
                            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { editingGoal = false } } }
                    } else {
                        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            .sheet(isPresented: $editingTime) {
                let monday = WeekPlanView.monday(), day = APIClient.localToday()
                WeekPlanSettingsView(monday: monday, today: day, calendar: model.calendar) { generate in
                    guard generate else { return }
                    time = true
                    Task {
                        _ = await WeekPlanGenerator.replan(model, weeks: [monday, ISODay.shift(monday, 7)], today: day, calendar: model.calendar)
                        await model.refreshTraining()
                    }
                }
            }
            .sheet(isPresented: $editingLift, onDismiss: { lift = true }) {
                NavigationStack { EquipmentView() }
            }
        }
    }

    /// Without a watch or ring the morning readiness never comes (audit 14.6).
    private var notificationsNote: String {
        if model.noWearable { return L10n.tr("Kouč, když je potřeba změnit plán, a kdy jít spát") }
        let seven = ClockText.format("7:00")
        if (today.readiness.pastNights ?? 0) > 0 { return L10n.f("Připravenost v %@ a kouč, když se mění plán", seven) }
        return L10n.f("Připravenost v %@ a dnes večer připomínka nasadit hodinky", seven)
    }

    /// Whether iOS was asked already, and whether Gym is one of the sports.
    private func load() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        notifications = status != .notDetermined
        guard !model.demo else { return }
        let s = SettingsStore(api: model.api, demo: model.demo)
        await s.loadProfile()
        store = s
        lifts = SportsChoice(profile: s.profile).kinds.contains("strength")
    }

    /// iOS asks once; whatever the answer, the row is done (Nastavení → Oznámení changes it later).
    private func allowNotifications() async {
        _ = await Reminders.requestPermission()
        await PushRegistration.refresh(api: model.api)
        notifications = true
    }

    /// The goal counts once it was saved (Goals sends the main goal with every save).
    private func goalSaved() async {
        guard let store else { return }
        await store.loadProfile()
        if !(store.profile["goalType"]?.string ?? "").isEmpty { goal = true }
        lifts = SportsChoice(profile: store.profile).kinds.contains("strength")
    }

    private func row(_ title: String, _ note: String, done: Bool, translated: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .scaledFont(24, weight: .regular)
                .foregroundStyle(done ? Palette.green : Palette.faint)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(done ? Palette.muted : Palette.ink)
                    .strikethrough(done, color: Palette.muted)
                Text(translated ? note : L10n.tr(note)).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            if !done {
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(done ? L10n.tr("hotovo") : "")
    }
}
