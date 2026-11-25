import SwiftUI
import StoreKit

enum AppTab: Hashable {
    case today, training, food, health
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var showAdd = false
    @State private var showSettings = false
    @State private var showCoach = false
    /// Sdílet in the header of Trénink, Jídlo and Zdraví (Dnes has its own).
    @State private var showShare = false
    @State private var showSyncStatus = false
    /// Přidat jídlo and Vyfotit jídlo from the icon's menu.
    @State private var quickFood: FoodStart?
    /// The meal a meal reminder's "Log lunch" adds to (Reminders); nil: the one of now.
    @State private var quickMeal: String?
    /// A "+" action's sheet, opened here once the card closed (PlusCard.present).
    @State private var plusSheet: PlusSheet?
    @State private var quickActions = QuickActions.shared
    /// A food the owner fixed, opened from its push (FoodPush).
    @State private var foodPush = FoodPush.shared
    @State private var fixedFood: FoodProduct?
    /// The coach's chat answered from a push, opened from its notification (CoachPush).
    @State private var coachPush = CoachPushOpen.shared
    @State private var coachChat: CoachChatRef?
    /// Scrolled down: the tab bar is only the open section's icon and "+".
    @State private var compactBar = false
    /// Opened with a tap while the page still glides: it stays open until the
    /// page is dragged again, so the glide does not fold it under the finger.
    @State private var barHeld = false
    @State private var tabTaps = 0
    /// Tabs opened since sign-in, kept built (screens) and whether each is scrolled down.
    @State private var visited: Set<AppTab> = []
    @State private var scrolledTabs: Set<AppTab> = []
    /// The open tab's widgets are being edited: "Synced" steps aside for "+" and "Hotovo" (617 #22).
    @State private var editingWidgets = false
    /// iPhone Duo open, or a wide window beside another app: two columns (WideLayout).
    @State private var wide = false
    private static let tabs: [AppTab] = [.today, .training, .food, .health]
    @Environment(\.scenePhase) private var scenePhase
    /// Not capped yet: the screens below cap it (textSizes).
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if model.updateRequired {
            UpdateRequiredView()
        } else {
            screens
                .onGeometryChange(for: Bool.self) { $0.size.width >= WideLayout.minWidth } action: { wide = $0 }
                .environment(\.wideLayout, wide)
                .environment(\.fullTypeSize, typeSize)
        }
    }

    /// No tab bar in a full-screen flow nor on a detail: the detail has its
    /// back button and the edge swipe, and the bar would lie over its last rows.
    private var barHidden: Bool {
        model.immersive || !(model.paths[model.tab] ?? []).isEmpty || model.coveredRoots.contains(model.tab)
    }

    /// Toasts sit above the tab bar and the hidden-workout bar, whichever show.
    private var toastInset: CGFloat {
        if model.immersive { return 16 }
        return (barHidden ? 16 : 88) + (model.minimizedGym == nil ? 0 : 64)
    }

    /// The tabs, the tab bar and the sheets grow with the text size up to a cap.
    private static let textSizes: PartialRangeThrough<DynamicTypeSize> = ...DynamicTypeSize.screenCap

    /// The open tab as the coach's screen (src/assistant-app-context.js), so
    /// "tenhle trénink" means the day and section the athlete is looking at.
    private var coachView: String {
        switch model.tab {
        case .today: "today"
        case .training: "training"
        case .food: "nutrition"
        case .health: "health"
        }
    }

    @ViewBuilder private func tabScreen(_ tab: AppTab) -> some View {
        // Every page of a tab takes the tab's tint (concept rule D-TMAVY-1).
        switch tab {
        case .today: TodayView(openSettings: { showSettings = true }, openCoach: { showCoach = true }).environment(\.tabActions, tabActions)
            .environment(\.tabGlow, Palette.Glow.today)
        case .training: TrainingView().environment(\.tabActions, tabActions)
            .environment(\.tabGlow, Palette.Glow.training)
        case .food: FoodView().environment(\.tabActions, tabActions).environment(\.tabGlow, Palette.Glow.food)
        case .health: HealthView().environment(\.tabActions, tabActions).environment(\.tabGlow, Palette.Glow.health)
        }
    }

    /// The tabs wait under the setup and, after a new sign-in, until the server
    /// said whether the setup (and the consent to health data) is still owed:
    /// Today never loads or syncs before that consent, and VoiceOver finds only
    /// the setup's pages (Tapwright onboarding test 2026-11-19).
    private var tabsShown: Bool {
        !model.needsSetup && (model.setupChecked || UserDefaults.standard.bool(forKey: AppModel.setupDoneKey))
    }

    private var tabActions: TabActions {
        TabActions(share: { showShare = true }, coach: { showCoach = true }, settings: { showSettings = true })
    }

    @ViewBuilder private var screens: some View {
        switch model.phase {
        case .signedOut:
            LoginView().dynamicTypeSize(Self.textSizes)
        case .signedIn where model.healthPaused && !model.demo:
            // Health data paused (AppModel+HealthPause): the paused screen; its
            // "Zapnout znovu" opens the consent of the setup.
            HealthPausedView()
                .dynamicTypeSize(Self.textSizes)
                .fullScreenCover(isPresented: Binding(get: { model.needsSetup }, set: { model.needsSetup = $0 })) { SetupFlowView().dynamicTypeSize(Self.textSizes) }
                .task {
                    async let setup: Void = model.checkSetup()
                    async let account: Void = model.loadAccountInitial()
                    _ = await (setup, account)
                }
        case .signedIn:
            ZStack(alignment: .bottom) {
                // A tab once opened stays built behind the open one, so coming
                // back does not lay out its whole screen again.
                ZStack {
                    // The app's background alone while the tabs wait.
                    if !tabsShown {
                        ScreenBackground()
                        if !model.needsSetup { ProgressView() }
                    }
                    ForEach(Self.tabs.filter { tabsShown && ($0 == model.tab || visited.contains($0)) }, id: \.self) { tab in
                        let open = tab == model.tab
                        tabScreen(tab)
                            .environment(\.tabShown, open)
                            .opacity(open ? 1 : 0)
                            .allowsHitTesting(open)
                            .accessibilityHidden(!open)
                            .zIndex(open ? 1 : 0)
                            .environment(\.scrollReport, { (offset: CGFloat) in
                                let compact = offset > 60
                                if compact != scrolledTabs.contains(tab) {
                                    if compact { scrolledTabs.insert(tab) } else { scrolledTabs.remove(tab) }
                                }
                                guard tab == model.tab else { return }
                                if !compact { barHeld = false }
                                if compact != compactBar, !barHeld { withMotion(.snappy) { compactBar = compact } }
                            })
                            .environment(\.scrollDragReport, {
                                if tab == model.tab { barHeld = false }
                            })
                            .environment(\.widgetEditingReport, { (editing: Bool) in
                                if tab == model.tab, editing != editingWidgets { editingWidgets = editing }
                            })
                    }
                }
                .dynamicTypeSize(Self.textSizes)
                .onDisappear { visited = []; scrolledTabs = [] }
                .onChange(of: model.paths, initial: true) { _, paths in
                    ScreenTrail.visit(model.tab, paths[model.tab]?.last)
                }
                .onChange(of: model.tab) { old, tab in
                    // Tabs stay built when switched, so a tab left mid-edit does not hide "Synced" elsewhere.
                    editingWidgets = false
                    ScreenTrail.visit(tab, model.paths[tab]?.last)
                    visited.insert(old)
                    // A tab built earlier: only its data is checked, like on its first visit.
                    guard visited.contains(tab) else { return }
                    Task {
                        await model.refreshIfStale(tab)
                        if tab == .today { await DeviceLocation.refreshIfFollowing(model) }
                    }
                }
                if model.offline || !model.outbox.isEmpty || model.outboxNote != nil || model.notice != nil || model.syncStatus != nil {
                    VStack(spacing: 6) {
                        if let status = model.syncStatus, !model.offline, !editingWidgets {
                            SyncPill(status: status) {
                                model.dismissSyncFailure()
                                Task { await model.refresh(announce: true) }
                            }
                            .motionTransition(.opacity.combined(with: .scale(scale: 0.9)))
                        }
                        if model.offline || !model.outbox.isEmpty {
                            OfflineBanner(offline: model.offline, waiting: model.outbox.count)
                        }
                        if let note = model.outboxNote {
                            OutboxNote(text: note) { model.outboxNote = nil }
                        }
                        if let notice = model.notice {
                            OutboxNote(text: notice) { model.notice = nil }
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 8)
                    .animation(.snappy, value: model.syncStatus)
                }
                // A done activity sent to the apps from Zdroje dat (Aurin posílá) (SyncViews.swift).
                // Over a workout only a failed one (its Zkusit znovu), above the pinned
                // Zavřít, never on it (Petr 2026-11-24); "sent" is left out there.
                if let report = model.syncReport, !showSyncStatus, !model.immersive || report.failed {
                    SyncToastView(report: report) { showSyncStatus = true }
                        .padding(.horizontal, 16)
                        .padding(.bottom, model.immersive ? 100 : toastInset)
                        .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                        .zIndex(1)
                }
                // A food read from its label went to the owner for the common catalogue (AppModel.suggestNewFood).
                if let thanks = model.thanks {
                    ThanksToast(text: thanks) { model.thanks = nil }
                        .padding(.horizontal, 16)
                        .padding(.bottom, toastInset)
                        .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                        .zIndex(1)
                }
                // An AI lookup that ended after "Co přidáme?" closed: a tap shows it in Jídlo (AppModel+PendingFood.swift).
                if let ready = model.foodReady {
                    ThanksToast(text: ready.text, symbol: ready.found ? "checkmark" : "exclamationmark.circle", tint: ready.found ? Palette.green : Palette.rust) {
                        model.foodReady = nil
                        model.tab = .food
                        model.paths[.food] = []
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, toastInset)
                    .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(1)
                }
                // A deletion with its "Vrátit" (AppModel.deleteLater).
                if let toast = model.undoToast {
                    PlanToastView(toast: toast) {
                        model.undoToast = nil
                        if let undo = toast.settle(undo: true) { Task { await undo() } }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, toastInset)
                    .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(2)
                }
                // "+" open: the page blurs and dims a little under its card
                // (concept 14-plus B, 602 point 41); a tap there closes it.
                if showAdd && !model.immersive {
                    Rectangle().fill(.regularMaterial)
                        .overlay(Color.black.opacity(0.12))
                        .ignoresSafeArea()
                        .contentShape(Rectangle())
                        .onTapGesture { closeAdd() }
                        .accessibilityHidden(true)
                        .transition(.opacity)
                        .zIndex(3)
                }
                if !model.immersive {
                    VStack(spacing: 8) {
                        // The "+" card floats above the bar (PlusCard.swift).
                        if showAdd {
                            PlusCard(close: closeAdd, openCoach: {
                                closeAdd()
                                showCoach = true
                            }, present: { sheet in
                                closeAdd()
                                plusSheet = sheet
                            })
                            .frame(maxWidth: wide ? WideLayout.tabBarWidth : .infinity)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 4)
                            .dynamicTypeSize(Self.textSizes)
                            .motionTransition(.scale(scale: 0.92, anchor: .bottom).combined(with: .opacity))
                        }
                        // A workout hidden with its arrow (TrainingModeView): back to it.
                        if let gym = model.minimizedGym {
                            MinimizedGymBar(gym: gym, live: LiveWorkout.shared, open: { model.open(.trainingMode(gym.date)) },
                                            skip: { TrainingModeView.minimizedAction(.skip, model: model) })
                                .frame(maxWidth: wide ? WideLayout.tabBarWidth : .infinity)
                                .padding(.horizontal, 20)
                                .padding(.bottom, 4)
                                .dynamicTypeSize(Self.textSizes)
                                .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                        }
                        // Details have no tab bar; a hidden workout stays reachable there.
                        if !barHidden && tabsShown {
                            TabBar(tab: Binding(get: { model.tab }, set: { select($0) }), compact: compactBar,
                                   onExpand: {
                                       barHeld = true
                                       withMotion(.snappy) { compactBar = false }
                                   }, addOpen: showAdd, onAdd: { showAdd ? closeAdd() : openAdd() })
                                .frame(maxWidth: wide ? WideLayout.tabBarWidth : .infinity)
                                .padding(.horizontal, 20)
                                .padding(.bottom, 8)
                                .dynamicTypeSize(Self.textSizes)
                                .sensoryFeedback(.impact(weight: .light), trigger: tabTaps)
                                .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .motionTransition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.snappy, value: model.minimizedGym == nil)
                    .zIndex(showAdd ? 4 : 0)
                    // Open, the card and the bar are all VoiceOver reads; escape closes.
                    .accessibilityAddTraits(showAdd ? .isModal : [])
                }
            }
            .sheet(isPresented: $showSettings) { SettingsView().fullTextSize() }
            .onChange(of: openSheet) { _, sheet in
                if let sheet { ScreenTrail.visit(sheet) } else { ScreenTrail.visit(model.tab, model.paths[model.tab]?.last) }
            }
            // AI off by its consent: the coach asks for it, never answers with an error (AppModel.aiOff).
            .sheet(isPresented: $showCoach) {
                Group {
                    if model.aiOff && !model.demo { AIConsentAsk { showCoach = true } } else { CoachView(view: coachView, date: model.selectedDate) }
                }
                .dynamicTypeSize(Self.textSizes)
            }
            .sheet(isPresented: $showShare) {
                if let today = model.today {
                    ShareSheet(source: .today(today), start: model.tab == .food ? .food : model.tab == .training ? .activity : nil)
                        .dynamicTypeSize(Self.textSizes)
                }
            }
            .sheet(item: $coachChat) { ref in CoachView(openChat: ref.id).dynamicTypeSize(Self.textSizes) }
            .sheet(isPresented: $showSyncStatus, onDismiss: { model.syncReport = nil }) { SyncStatusSheet().dynamicTypeSize(Self.textSizes) }
            .sheet(item: $plusSheet) { sheet in
                Group {
                    switch sheet {
                    case .food(let start): AddFoodSheet(meal: MealSlot.now(slots: model.food?.mealSlots), start: start)
                    case .weight: WeightEntrySheet()
                    case .workout: ManualWorkoutSheet()
                    case .drink: DrinkSheet(kind: "water") { ml, kind in _ = await model.addDrink(ml: ml, kind: kind) }
                    case .period: PeriodLogSheet()
                    case .status: AthleteStatusSheet(current: model.athleteStatus ?? .active)
                    }
                }
                .dynamicTypeSize(Self.textSizes)
            }
            // What "+" adds goes to today, also while the screens show another day:
            // set here once, as the card closes before its sheet opens.
            .onChange(of: showAdd || plusSheet != nil) { _, open in model.writesToday = open }
            .sheet(item: $quickFood) { start in
                AddFoodSheet(meal: quickMeal ?? MealSlot.now(slots: model.food?.mealSlots), start: start)
                    .dynamicTypeSize(Self.textSizes)
                    // Food from the icon goes to today, like "+".
                    .onAppear { model.writesToday = true }
                    .onDisappear { model.writesToday = false }
            }
            .onChange(of: quickActions.pick, initial: true) { _, pick in
                guard let pick else { return }
                quickActions.pick = nil
                run(pick.id)
            }
            .sheet(item: $fixedFood) { product in
                NavigationStack {
                    FoodAmountView(product: product, meal: MealSlot.now(slots: model.food?.mealSlots), fixed: true, done: { fixedFood = nil })
                }
                .dynamicTypeSize(Self.textSizes)
                .presentationBackground(Palette.background)
                // Added from the push goes to today, like "+".
                .onAppear { model.writesToday = true }
                .onDisappear { model.writesToday = false; model.addDay = nil }
            }
            .onChange(of: coachPush.chat, initial: true) { _, chat in
                guard let chat else { return }
                coachPush.chat = nil
                closeSheets { coachChat = CoachChatRef(id: chat) }
            }
            .onChange(of: foodPush.product, initial: true) { _, product in
                guard let product else { return }
                foodPush.product = nil
                closeSheets { fixedFood = product }
            }
            .animation(.snappy, value: model.thanks)
            .task(id: model.thanks) {
                guard let shown = model.thanks else { return }
                try? await Task.sleep(for: .seconds(4))
                if model.thanks == shown { model.thanks = nil }
            }
            .task(id: model.foodReady?.id) {
                guard let shown = model.foodReady?.id else { return }
                try? await Task.sleep(for: .seconds(4))
                if model.foodReady?.id == shown { model.foodReady = nil }
            }
            .animation(.snappy, value: model.foodReady?.id)
            .animation(.snappy, value: model.syncReport?.id)
            .animation(.snappy, value: model.undoToast?.id)
            .animation(.snappy, value: barHidden)
            // Without "Zpět" in 6 s the deletion goes through; also when another
            // toast took its place.
            .task(id: model.undoToast?.id) {
                guard let current = model.undoToast else { return }
                try? await Task.sleep(for: PlanToast.shownFor)
                if model.undoToast?.id == current.id { model.undoToast = nil }
                // Its own task: hiding the toast ends this one, which cut the
                // deletion short and left "zrušeno" on top.
                if let commit = current.settle(undo: false) { Task { await commit() } }
            }
            // A failure on top goes away on its own after a while, or with a tap.
            .task(id: model.notice) {
                guard let shown = model.notice else { return }
                try? await Task.sleep(for: .seconds(6))
                if model.notice == shown { model.notice = nil }
            }
            // The toast goes away on its own unless its sheet is open, or an app
            // did not get the activity: that stays until it is tapped (Zkusit znovu).
            .task(id: model.syncReport?.id) {
                guard let shown = model.syncReport?.id, model.syncReport?.failed == false else { return }
                try? await Task.sleep(for: .seconds(7))
                if !showSyncStatus && model.syncReport?.id == shown { model.syncReport = nil }
            }
            // The next start after the first e-mail sign-in: a passkey for next time.
            .sheet(isPresented: Binding(get: { model.passkeyOffer }, set: { model.passkeyOffer = $0 })) { PasskeyOfferSheet().dynamicTypeSize(Self.textSizes) }
            // Cycle tracking on from before its own consent: asked for it, and paused until then.
            .sheet(isPresented: Binding(get: { model.cycleConsentAsk && !model.passkeyOffer && !model.needsSetup }, set: { model.cycleConsentAsk = $0 })) {
                CycleTrackingConsentSheet { Task { try? await model.saveCycleSettings(["enabled": .bool(true), "consent": .bool(true)]) } }
                    .dynamicTypeSize(Self.textSizes)
            }
            .fullScreenCover(isPresented: Binding(get: { model.needsSetup && !model.passkeyOffer }, set: { model.needsSetup = $0 })) { SetupFlowView().dynamicTypeSize(Self.textSizes) }
            .task {
                if !model.demo { AppleHealth.shared.start(api: model.api) }
                async let setup: Void = model.checkSetup()
                async let account: Void = model.loadAccountInitial()
                async let google: Void = model.loadGoogleSync()
                _ = await (setup, account, google)
                if PasskeyOfferLater.due && !model.needsSetup && !model.demo {
                    PasskeyOfferLater.forget()
                    if ServerChoice.current.passkeys && !PasskeyService.mayHaveOne { model.passkeyOffer = true }
                }
                // A fresh install takes back the settings the account kept.
                if !model.demo { await SettingsBackup.restore(api: model.api) }
            }
            // Back in the app: new data, and what waited for signal (and water
            // added from the widget) goes out.
            // The gym started on the Apple Watch: Training mode opens here too.
            .onChange(of: LiveWorkout.shared.openFromWatch, initial: true) { _, date in
                guard let date else { return }
                LiveWorkout.shared.openFromWatch = nil
                guard !model.demo, !model.immersive else { return }
                // Training mode for that day is on the screen already (opened, not started):
                // it stays as it is and runs with the watch, instead of opening over itself.
                guard !model.paths.values.contains(where: { $0.last == .trainingMode(date) }) else { return }
                model.open(.trainingMode(date))
            }
            // A workout or a night synced while the app is open (TestFlight 606:
            // the second walk on Training, not on Today and Food).
            .onChange(of: AppleHealth.shared.newInApp) { Task { await model.followNewHealthData() } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background, !model.demo {
                    BackgroundRefresh.schedule()
                    // The settings changed here go to the account (SettingsBackup.swift).
                    let api = model.api
                    Task {
                        let time = FinishInBackground("settings")
                        await SettingsBackup.send(api: api)
                        time.end()
                    }
                }
                // The icon's menu in the language and order of the moment.
                if phase == .background { QuickActions.update(model.today); model.left() }
                guard phase == .active else { return }
                model.cameBack()
                // Tomorrow's own wake time has passed: the usual alarm again (SystemAlarm.swift).
                if !model.demo { Task { await SystemAlarm.restoreAfterOnce(api: model.api) } }
                // Mid-workout (a look at the lock screen, another app between
                // sets) the screen stays as it is; the workout's end refreshes.
                guard !model.immersive, !LiveWorkout.shared.running else { return }
                Task {
                    // Today loaded a moment ago stays as it is (no sync pill, no redraw).
                    // A Today that failed to load (yesterday's dropped offline) tries again.
                    if model.today != nil || model.errorMessage != nil || !model.outbox.isEmpty { await model.refreshOnReturn() }
                    // The open tab too, so Health or Food are not a day behind Today.
                    if model.tab != .today { await model.refreshIfStale(model.tab) }
                }
            }
        }
    }

    /// An item of the icon's menu (QuickActions): what it opens, over
    /// whatever sheet was open.
    private func run(_ id: String) {
        closeSheets { Task { await open(id) } }
    }

    private func openAdd() { withMotion(.snappy) { showAdd = true } }
    private func closeAdd() { withMotion(.snappy) { showAdd = false } }

    /// The sheet on top of the tabs, for ScreenTrail; nil on the tab itself.
    private var openSheet: String? {
        if model.needsSetup { return "setup" }
        if showCoach || coachChat != nil { return "coach" }
        if showSettings { return "settings" }
        if showAdd { return "add" }
        if showShare { return "share" }
        if showSyncStatus { return "syncStatus" }
        if quickFood != nil { return "addFood" }
        if let plusSheet { return plusSheet.id.hasPrefix("food") ? "addFood" : plusSheet.id }
        if fixedFood != nil { return "foodAmount" }
        return nil
    }

    /// Closes whatever sheet was open, then opens the next thing.
    private func closeSheets(then next: @escaping () -> Void) {
        let covered = showAdd || showSettings || showCoach || showSyncStatus || quickFood != nil || plusSheet != nil || fixedFood != nil || coachChat != nil
        showAdd = false
        showSettings = false
        showCoach = false
        showSyncStatus = false
        quickFood = nil
        quickMeal = nil
        plusSheet = nil
        fixedFood = nil
        coachChat = nil
        // One sheet at a time: the new one opens once the old has closed.
        DispatchQueue.main.asyncAfter(deadline: .now() + (covered ? 0.45 : 0)) { next() }
    }

    private func open(_ id: String) async {
        let today = AppModel.localDate(Date())
        switch id {
        case "today":
            if model.today == nil { await model.refresh() }
            // Today's workout not done yet, else Aktivita dne.
            let next = model.today?.plan.first { $0.kind == "workout" && !$0.done }
            if let session = next?.session, let route = WeekSessionsList.destination(session) {
                model.open(route)
            } else {
                model.open(.coachPick(false))
            }
        case "coach": showCoach = true
        case "food": quickFood = .search
        case "photo": quickFood = .photo
        case "water":
            model.tab = .food
            model.paths[.food] = []
            model.writesToday = true
            _ = await model.addDrink(ml: QuickAction.glassMl, kind: "water")
            model.writesToday = false
        case "readiness": model.open(.readiness)
        case "liveGym": model.open(.liveGym(today, false))
        case "weekPlan": model.open(.weekPlan)
        case "sleep": model.open(.sleep)
        case let meal where meal.hasPrefix("meal."):
            quickMeal = String(meal.dropFirst(5))
            quickFood = .search
        default: break
        }
    }

    /// The tab again: back to its first screen.
    private func select(_ tab: AppTab) {
        if showAdd { closeAdd() }
        // A tab kept from before shows where it was scrolled.
        let compact = model.tab != tab && scrolledTabs.contains(tab) && (model.paths[tab] ?? []).isEmpty
        if model.tab != tab { barHeld = false }
        withMotion(.snappy) { compactBar = compact }
        if model.tab == tab {
            model.paths[tab] = []
        } else {
            tabTaps += 1
            // Leaving a tab closes its details, so coming back shows its main
            // screen; a workout being logged or built keeps its place.
            if !(model.paths[model.tab] ?? []).contains(where: \.keepsPlace) { model.paths[model.tab] = [] }
        }
        model.tab = tab
    }
}

/// The server no longer serves this build: data would not load or would come
/// out wrong, so the app asks for the new version instead of the screens.
struct UpdateRequiredView: View {
    @Environment(\.openURL) private var openURL
    /// The app's page in the App Store; TestFlight and Xcode builds have no App Store id, so TestFlight opens.
    @State private var updateURL = URL(string: "itms-beta://")

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.down.app")
                .scaledFont(44, weight: .light)
                .foregroundStyle(Palette.ink)
            Text(L10n.tr("Je potřeba nová verze")).font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            Text(L10n.tr("Server se změnil a tahle verze aplikace už jeho data nepřečte správně. Aktualizuj Aurin na nejnovější verzi. Data zůstávají uložená na serveru."))
                .font(.subheadline)
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
            if let updateURL {
                PrimaryButton(title: L10n.tr("Aktualizovat")) { openURL(updateURL) }
                    .padding(.top, 8)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.background)
        .task {
            if case .verified(let app)? = try? await AppTransaction.shared, let id = app.appID {
                updateURL = URL(string: "itms-apps://apps.apple.com/app/id\(id)")
            }
        }
    }
}

/// "Bez připojení": the screens show what was saved on the phone, and how
/// many writes wait for signal (Outbox).
struct OfflineBanner: View {
    var offline = true
    var waiting = 0

    private var text: String {
        let parts = [offline ? L10n.tr("Bez připojení, uložená data") : nil, waiting > 0 ? Self.waitingText(waiting) : nil]
        return parts.compactMap { $0 }.joined(separator: ", ")
    }

    static func waitingText(_ n: Int) -> String {
        L10n.plural("%lld zápisů čeká na signál", n)
    }

    var body: some View {
        Label(text, systemImage: offline ? "wifi.slash" : "arrow.triangle.2.circlepath")
            .font(.footnote.weight(.medium))
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 14).frame(height: 32)
            .chromeGlass(in: Capsule(), interactive: false)
            .allowsHitTesting(false)
    }
}

/// The sync after opening the app: "Synchronizuji…" with a spinner,
/// "Synchronizováno" for a moment, or a failure a tap tries again. It sits
/// where a detail's pinned bar has its title (PageHeader hides the title).
struct SyncPill: View {
    let status: AppModel.SyncStatus
    let retry: () -> Void

    var body: some View {
        Button(action: retry) {
            HStack(spacing: 8) {
                switch status {
                case .syncing:
                    ProgressView().controlSize(.small)
                    Text("Synchronizuji…")
                case .done:
                    Image(systemName: "checkmark").foregroundStyle(Palette.green)
                    Text("Synchronizováno")
                case .failed:
                    Image(systemName: "exclamationmark.circle")
                    Text("Nepodařilo se. Zkusit znovu")
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(status == .failed ? Palette.rust : Palette.ink)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .chromeGlass(in: Capsule(), interactive: status == .failed)
        .chromeShadow(0.08, radius: 8, y: 3)
        .allowsHitTesting(status == .failed)
    }
}

/// A waiting write the server turned down; a tap puts it away.
/// A short thank-you at the bottom, gone after a few seconds or a tap.
struct ThanksToast: View {
    let text: String
    var symbol = "checkmark"
    var tint = Palette.green
    let dismiss: () -> Void

    var body: some View {
        Button(action: dismiss) {
            HStack(spacing: 10) {
                Image(systemName: symbol).scaledFont(15, weight: .semibold).foregroundStyle(tint)
                Text(verbatim: text).font(Typo.bodyStrong).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16).frame(minHeight: 48)
            .chromeGlass(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .chromeShadow(0.14, radius: 16, y: 8)
        }
        .buttonStyle(.plain)
    }
}

struct OutboxNote: View {
    let text: String
    let dismiss: () -> Void

    var body: some View {
        Button(action: dismiss) {
            Label(text, systemImage: "exclamationmark.circle")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Palette.rust)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .chromeGlass(in: Capsule())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
    }
}

/// The floating pill at the bottom with the "+" in the middle. Scrolled down
/// it shrinks to the open section's icon on the left and "+" on the right;
/// a tap on the icon brings the whole bar back.
struct TabBar: View {
    @Binding var tab: AppTab
    var compact: Bool = false
    var onExpand: () -> Void = {}
    /// The "+" card is open: the button shows × and closes it.
    var addOpen = false
    var onAdd: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var glass

    var body: some View {
        // On iOS 26 the capsule morphs into the one icon and back.
        ChromeGlassGroup { bar }
    }

    @ViewBuilder private var bar: some View {
        if compact {
            HStack {
                Button(action: onExpand) {
                    Image(systemName: Self.symbol(tab))
                        .scaledFont(20, weight: .regular, cap: .denseCap)
                        .foregroundStyle(Palette.ink)
                        .frame(width: 52, height: 52)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .chromeGlass(in: Circle())
                .chromeGlassID("bar", in: glass)
                .chromeShadow(0.1, radius: 12, y: 6)
                .accessibilityLabel(L10n.tr("Rozbalit menu"))
                Spacer()
                plus(size: 52)
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 6)
            }
            .transition(.opacity)
        } else {
            HStack(spacing: 0) {
                item(.today, "Dnes")
                item(.training, "Trénink")
                plus(size: 44).frame(maxWidth: .infinity)
                item(.food, "Jídlo")
                item(.health, "Zdraví")
            }
            .frame(height: 60)
            .chromeGlass(in: Capsule())
            .chromeGlassID("bar", in: glass)
            .chromeShadow(0.1, radius: 15, y: 10)
            .transition(.opacity)
        }
    }

    static func symbol(_ tab: AppTab) -> String {
        switch tab {
        case .today: return "sun.max"
        case .training: return "figure.run"
        case .food: return "fork.knife"
        case .health: return "heart"
        }
    }

    private func plus(size: CGFloat) -> some View {
        Button(action: onAdd) {
            // Reduce Motion: × in place of the turn.
            Image(systemName: reduceMotion && addOpen ? "xmark" : "plus")
                .scaledFont(19, weight: .semibold, cap: .denseCap)
                .rotationEffect(.degrees(addOpen && !reduceMotion ? 45 : 0))
                .foregroundStyle(Palette.onButton)
                .frame(width: size, height: size)
                .background(Palette.button, in: Circle())
        }
        .accessibilityLabel(L10n.tr(addOpen ? "Zavřít" : "Přidat záznam"))
        .accessibilityIdentifier("tab.plus")
    }

    /// The icon with the section's name under it (Petr, 2026-10-24), in ink:
    /// grey on glass reads too faintly. The open one is the outline icon with
    /// its name in amber and bolder, no fill behind it (concept consistency
    /// rule "active tab = outline icon + amber label", 606).
    private func item(_ value: AppTab, _ label: String) -> some View {
        let open = tab == value
        return Button { tab = value } label: {
            VStack(spacing: 3) {
                Image(systemName: Self.symbol(value))
                    .scaledFont(19, weight: open ? .semibold : .regular, cap: .denseCap)
                    .frame(height: 22)
                Text(L10n.tr(label))
                    .scaledFont(10, weight: open ? .semibold : .regular)
                    .lineLimit(1).minimumScaleFactor(0.9)
            }
            .foregroundStyle(open ? Palette.amber : Palette.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // Long press shows the tab large, as the system tab bar does.
            .accessibilityShowsLargeContentViewer {
                Image(systemName: Self.symbol(value))
                Text(L10n.tr(label))
            }
            .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.tr(label))
        .accessibilityAddTraits(tab == value ? .isSelected : [])
    }
}

/// A tab's first page reports when a page is pushed over it, so the tab bar
/// hides on every detail, however it was opened (TestFlight 604: it stayed on
/// Stretch, Breakfast and Drinks).
private struct TabRootReport: ViewModifier {
    @Environment(AppModel.self) private var model
    let tab: AppTab

    func body(content: Content) -> some View {
        content
            .onAppear { model.coveredRoots.remove(tab) }
            .onDisappear { model.coveredRoots.insert(tab) }
    }
}

extension View {
    func tabRoot(_ tab: AppTab) -> some View { modifier(TabRootReport(tab: tab)) }
}
