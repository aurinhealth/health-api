import SwiftUI
import UserNotifications

/// "Dokonči nastavení" (onboarding concept v38, part O): the setup ends after
/// "O tobě", and what it asked after that waits on Today in one card, right
/// under the readiness: the goal, the training days, where one lifts (only
/// with Gym ticked) and the notifications. Each row opens its screen and ticks
/// itself off; the card goes once all are done, when hidden, or after a week,
/// and the "První dny" card follows (FirstDaysCard).
enum FinishSetup {
    static let sinceKey = "finishSetup.since"
    static let goalKey = "finishSetup.goal"
    static let timeKey = "finishSetup.time"
    static let liftKey = "finishSetup.lift"
    /// A week on Today at most: what is left stays in Settings.
    static let days = 7

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

    /// The card shows: started and not yet a week old.
    static func showing(_ since: Double) -> Bool {
        since > 0 && Date().timeIntervalSince1970 - since < Double(days) * 86_400
    }

    static func close() { UserDefaults.standard.removeObject(forKey: sinceKey) }
}

struct FinishSetupCard: View {
    let today: TodaySnapshot
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(FinishSetup.sinceKey) private var since: Double = 0
    @AppStorage(FinishSetup.goalKey) private var goal = false
    @AppStorage(FinishSetup.timeKey) private var time = false
    @AppStorage(FinishSetup.liftKey) private var lift = false
    @State private var notifications = false
    @State private var lifts: Bool
    @State private var profile: JSONObject?
    @State private var focus = SetupFocus()
    @State private var editingGoal = false
    @State private var editingTime = false
    @State private var editingLift = false
    @State private var savingGoal = false
    @State private var goalError: String?

    /// lifts: Gym is ticked before the profile loads (the snapshot test).
    init(today: TodaySnapshot, lifts: Bool = false) {
        self.today = today
        _lifts = State(initialValue: lifts)
    }

    private var steps: [Bool] { [goal, time] + (lifts ? [lift] : []) + [notifications] }
    private var doneCount: Int { steps.filter { $0 }.count }
    private var allDone: Bool { doneCount == steps.count }

    var body: some View {
        if FinishSetup.showing(since) {
            Card {
                HStack(spacing: 8) {
                    HStack {
                        Text("Dokonči nastavení").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Spacer()
                        Text(L10n.f("%@ z %@", String(doneCount), String(steps.count))).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                    // Not now: the card goes, the rows stay in Settings.
                    Button { hide() } label: {
                        Image(systemName: "xmark").scaledFont(12, weight: .semibold).foregroundStyle(Palette.muted)
                            .tapTarget(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Skrýt kartu"))
                }
                VStack(spacing: 0) {
                    Button { editingGoal = true } label: {
                        row("Nastav svůj cíl", "Kondice, závod nebo hubnutí", done: goal)
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
                            row("Vyber, kde posiluješ", "Posilovna, doma nebo obojí", done: lift)
                        }
                        .buttonStyle(PressableCardStyle())
                    }
                    Divider().overlay(Palette.hairline)
                    Button { Task { await allowNotifications() } } label: {
                        row("Zapni oznámení", notificationsNote, done: notifications, translated: true, opens: !notifications)
                    }
                    .buttonStyle(PressableCardStyle())
                    .disabled(notifications)
                }
            }
            .sensoryFeedback(.success, trigger: allDone) { _, done in done }
            .task { await load() }
            // Back from iOS settings: allowed there, the row is done.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active && !notifications { Task { await recheckNotifications() } }
            }
            .onChange(of: allDone) { _, done in if done { Task { await finish() } } }
            .sheet(isPresented: $editingGoal) { goalSheet }
            .sheet(isPresented: $editingTime) {
                let monday = WeekPlanView.monday(), day = APIClient.localToday()
                // Done or Generate saved the days; only Generate replans.
                WeekPlanSettingsView(monday: monday, today: day, calendar: model.calendar) { days in
                    time = true
                    guard let days else { return }
                    Task {
                        _ = await WeekPlanGenerator.replan(model, weeks: [monday, ISODay.shift(monday, 7)], today: day, days: days.isEmpty ? nil : days, calendar: model.calendar)
                        await model.refreshTraining()
                    }
                }
            }
            .sheet(isPresented: $editingLift, onDismiss: { lift = true }) {
                NavigationStack { EquipmentView() }
            }
        }
    }

    /// The goal alone (the setup's own page), not the whole of Settings → Goals.
    private var goalSheet: some View {
        NavigationStack {
            ScrollView {
                SetupGoalPage(focus: $focus).padding(24)
                if let goalError {
                    Text(goalError).font(Typo.small).foregroundStyle(Palette.rust).padding(.horizontal, PageGrid.margin)
                }
            }
            .background { ScreenBackground(glow: Palette.Glow.today) }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zavřít") {
                        // What was not saved goes.
                        focus = SetupFocus(profile: profile ?? [:])
                        editingGoal = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Uložit") { Task { await saveGoal() } }
                        .disabled(focus.goal.isEmpty || savingGoal)
                }
            }
        }
    }

    /// Without a watch or ring the morning readiness never comes (audit 14.6);
    /// the evening line only where Reminders sends it (asksForWatch: Apple Watch).
    private var notificationsNote: String {
        if model.noWearable { return L10n.tr("Kouč, když je potřeba změnit plán, a kdy jít spát") }
        // The morning one comes once the night has synced, not at a set hour
        // (review 2026-11-25: "Readiness at 7:00 AM" vs Notifications).
        let watch = WatchBridge.shared.watchState.paired && (today.readiness.pastNights ?? 0) == 0
        return watch ? L10n.tr("Připravenost ráno po synchronizaci a dnes večer připomínka nasadit hodinky")
            : L10n.tr("Připravenost ráno po synchronizaci a kouč, když se mění plán")
    }

    /// Whether iOS was asked already, Gym is one of the sports and a goal was set (a start on the web).
    /// The profile first: with Gym ticked the card has four rows, never done at three.
    private func load() async {
        if !model.demo, let p = try? await model.api.profile() { use(p) }
        // Done when they are allowed, not when iOS was asked once: turned off
        // earlier, the row stays open (device test of build 602).
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        notifications = [.authorized, .provisional, .ephemeral].contains(status)
    }

    private func use(_ p: JSONObject) {
        profile = p
        focus = SetupFocus(profile: p)
        lifts = focus.sports.kinds.contains("strength")
        // Also a goal saved in Nastavení → Cíle in its own words (goalType),
        // as that page shows it chosen (device test of build 602).
        if !focus.goal.isEmpty || !(p["goalType"]?.string ?? "").isEmpty { goal = true }
    }

    private func recheckNotifications() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        guard [.authorized, .provisional, .ephemeral].contains(status) else { return }
        await PushRegistration.refresh(api: model.api)
        if let today = model.today { await Reminders.reschedule(from: today) }
        notifications = true
    }

    /// iOS asks once; whatever the answer, the row is done (Nastavení → Oznámení changes it later).
    private func allowNotifications() async {
        // Turned off before: iOS asks no more, so its settings for the app open.
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .denied, let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            await UIApplication.shared.open(url)
            return
        }
        _ = await Reminders.requestPermission()
        await PushRegistration.refresh(api: model.api)
        // Tonight's reminders are planned now, not on the next refresh.
        if let today = model.today { await Reminders.reschedule(from: today) }
        notifications = true
    }

    /// The goal into the profile, as the setup's goal page saved it.
    private func saveGoal() async {
        savingGoal = true
        defer { savingGoal = false }
        do {
            // Not loaded on Today (offline then): now.
            let base: JSONObject
            if let profile { base = profile } else { base = try await model.api.profile() }
            let next = focus.applied(to: base)
            try await model.api.saveProfile(next)
            self.profile = next
            goalError = nil
            goal = true
            editingGoal = false
        } catch {
            goalError = error.localizedDescription
        }
    }

    /// The last tick stays a moment, then the card goes and VoiceOver says so.
    private func finish() async {
        try? await Task.sleep(for: .milliseconds(800))
        AccessibilityNotification.Announcement(L10n.tr("Nastavení dokončeno")).post()
        hide()
    }

    private func hide() {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .snappy) { FinishSetup.close() }
    }

    private func row(_ title: String, _ note: String, done: Bool, translated: Bool = false, opens: Bool = true) -> some View {
        HStack(spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .scaledFont(24, weight: .regular)
                .foregroundStyle(done ? Palette.green : Palette.faint)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(done ? Palette.muted : Palette.ink)
                    .strikethrough(done, color: Palette.muted)
                Text(verbatim: translated ? note : L10n.tr(note)).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            if opens {
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
            }
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(done ? L10n.tr("hotovo") : "")
    }
}
