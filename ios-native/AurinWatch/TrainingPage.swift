import HealthKit
import SwiftUI
import WatchKit
import WorkoutKit

/// The second page by the crown (mockups 14 and 16): the day's training from
/// the iPhone, today, or tomorrow in the evening or once today is done, with
/// the gym's exercises and Start (Začít, today only), a ride's or run's steps
/// with Open in Workout, and the week's row of days (tap one to see it).
struct TrainingPage: View {
    @EnvironmentObject private var watch: WatchStore
    @ObservedObject private var store = GymStore.shared
    @State private var running = false
    /// The sample day's screenshots show today at any hour (WatchDemo).
    @State private var picked: String? = WatchDemo.on ? WatchStore.localDate(WatchDemo.now) : nil
    @State private var preview: WatchGym?
    /// Which of a day's workouts is open, by day (the first until a tap).
    @State private var chosen: [String: Int] = [:]
    @ObservedObject private var plans = PlanStore.shared
    /// Train anyway? open (concept 04, the three choices).
    @State private var options = false

    private var today: String { WatchStore.localDate(WatchDemo.now) }
    private var sessions: [WatchSnapshot.Session] {
        guard let s = watch.snapshot, s.date == today else { return [] }
        return s.week ?? []
    }

    var body: some View {
        let day = shownDay
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // No row of week days (watch concept 04 point 7): the week
                // lives on the iPhone, the watch shows today at a glance.
                if day == tomorrow {
                    // Today's done or a rest day: today first, then tomorrow (points 3 and 5).
                    sectionLabel(W.tr("Dnes", "Today"))
                    todayDone
                    sectionLabel(W.tr("Zítra", "Tomorrow")).padding(.top, 10)
                } else {
                    sectionLabel(dayLabel(day))
                }
                content(day)
                // Race day offers no gym (the race card is the day).
                if day == today, noGymToday, !raceDay(day) { noGym }
                // The last button a little above the screen's rounded bottom edge.
                Color.clear.frame(height: 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // Clear of the screen's rounded edges, as Food and Today are.
            .padding(.horizontal, 6)
        }
        .task {
            // The sample day's screenshots: -race the race card from its top with Open in Workout.
            if WatchDemo.race {
                try? await Task.sleep(for: .milliseconds(400))
                proxy.scrollTo("race", anchor: .top)
            }
        }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: ReadinessHome.Page.coach) { WatchCoachLights() }
                    .accessibilityLabel(W.tr("Kouč", "Coach"))
            }
        }
        .sheet(isPresented: $options) { trainAnyway }
        // Each turn of the crown to this page shows it again: the plan only
        // when there is none for today or it is older than 10 minutes (the
        // iPhone sends every change it saves on its own).
        .onAppear {
            Task {
                await store.endLeftover()
                store.loadIfStale()
            }
        }
        .task(id: day) {
            if day == today { preview = nil } else { preview = await store.preview(date: day) }
        }
        .fullScreenCover(isPresented: $running, onDismiss: { WatchReport.visit("training") }) {
            GymSessionView().onAppear { WatchReport.visit("gym") }
        }
        // Dark green as Training on the iPhone, not brown (concept 04 point 1).
        .containerBackground(W.glow(W.Glow.readiness), for: .tabView)
        .alert(W.tr("Trénink se nepodařilo sestavit", "Couldn't put the workout together"), isPresented: $store.failedStart) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(W.tr("Sestaví ho iPhone. Měj ho u sebe a zkus to znovu.", "Your iPhone puts it together. Keep it close and try again."))
        }
    }

    // MARK: No gym planned today (mockup "jen hodinky" 6)

    /// Today's Today is here and has no gym in it, planned or done, and the
    /// watch has none with exercises.
    private var noGymToday: Bool {
        guard let s = watch.snapshot, s.date == today else { return false }
        if sessions.contains(where: { $0.date == today && $0.sport == "strength" }) { return false }
        if let gym = store.gym, gym.date == today, !gym.exercises.isEmpty { return false }
        return true
    }

    /// A rest day of the coach's plan: the week has workouts, today none at
    /// all (a ride day or a week with no plan isn't one).
    private var restDay: Bool {
        sessions.contains { $0.date != today } && !sessions.contains { $0.date == today }
    }

    /// Train anyway? (concept 04): one glass button under the day, the
    /// three choices on their own screen.
    private var noGym: some View {
        Button { options = true } label: {
            Text(W.tr("Přesto trénovat?", "Train anyway?"))
                .watchFont(16, .semibold).foregroundStyle(W.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .padding(.top, 12)
    }

    /// Repeat last workout (with which one it is), Build from rested, Empty
    /// workout: the iPhone puts it in the day (an empty one starts here alone
    /// too) and it opens. Without the iPhone the two it builds are off.
    private var trainAnyway: some View {
        let settings = watch.settings
        let near = watch.phoneNear || WatchDemo.on
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(W.tr("Přesto trénovat?", "Train anyway?"))
                    .font(W.serif(19)).foregroundStyle(W.num)
                    .padding(.bottom, 4)
                if store.starting {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 8)
                } else {
                    if let last = settings.lastGym {
                        option(.repeatLast, W.tr("Zopakovat minulý", "Repeat last workout"),
                               W.dayName(last).capitalized + (settings.lastGymExercises.map { ", " + Self.exercises($0) } ?? ""), off: !near)
                    }
                    option(.rested, W.tr("Sestavit z odpočatých", "Build from rested"), W.tr("Svaly, které jsou odpočaté", "Muscles that are fresh"), off: !near)
                    option(.empty, W.tr("Prázdný trénink", "Empty workout"), W.tr("Cviky přidáš za pochodu", "Add exercises as you go"))
                    if !near {
                        Text(W.tr("Potřebuje iPhone poblíž", "Needs your iPhone nearby"))
                            .watchFont(13).foregroundStyle(W.muted)
                            .padding(.top, 10)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .containerBackground(W.glow(W.Glow.readiness), for: .navigation)
    }

    private func option(_ kind: WatchGym.Start.Kind, _ title: String, _ note: String, off: Bool = false) -> some View {
        VStack(spacing: 0) {
            Rectangle().fill(W.hair).frame(height: 1)
            Button {
                Task {
                    if await store.start(kind) {
                        options = false
                        running = true
                    }
                }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).watchFont(15, .medium).foregroundStyle(W.ink)
                    Text(note).watchFont(13).foregroundStyle(W.muted).lineLimit(2)
                }
                .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
                .padding(.vertical, 5)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(off)
            .opacity(off ? 0.45 : 1)
        }
    }

    /// "5 cviků", "5 exercises".
    static func exercises(_ count: Int) -> String {
        guard !W.english else { return count == 1 ? "1 exercise" : "\(count) exercises" }
        return "\(count) " + (count == 1 ? "cvik" : (2...4).contains(count) ? "cviky" : "cviků")
    }

    /// The day has a race (its legs as one card).
    private func raceDay(_ day: String) -> Bool {
        RaceDay(Self.joined(sessions.filter { $0.date == day && !$0.done })) != nil
    }

    // MARK: The day shown

    private var tomorrow: String {
        WatchStore.localDate(Calendar.current.date(byAdding: .day, value: 1, to: WatchDemo.now) ?? WatchDemo.now)
    }

    /// Today; in the evening (from 18:00) or with today done, tomorrow when it has a plan.
    private var shownDay: String {
        if let picked { return picked }
        let todays = sessions.filter { $0.date == today }
        let open = todays.contains { !$0.done } || (store.gym.map { $0.date == today && !$0.exercises.isEmpty && !$0.allDone } ?? false)
        let evening = Calendar.current.component(.hour, from: WatchDemo.now) >= 18
        let next = sessions.contains { $0.date == tomorrow && !$0.done }
        if next, evening || (!open && !todays.isEmpty) { return tomorrow }
        return today
    }

    @ViewBuilder private func content(_ day: String) -> some View {
        let planned = Self.joined(sessions.filter { $0.date == day && !$0.done })
        let done = sessions.filter { $0.date == day && $0.done }
        // Today's own plan: a gym kept from an earlier day shows only while its workout still runs.
        let gym = day == today ? store.gym.flatMap { $0.date == today || GymWorkout.shared.running ? $0 : nil } : preview
        let gymPlanned = gym.map { !$0.exercises.isEmpty } ?? false
        if let race = RaceDay(planned) {
            // Race day (mockup hodinky-zavod): the race as one card, anything else of the day
            // under it as it would show on its own (a ride or run with its start, the gym with Start).
            let others = planned.filter { !race.legs.contains($0) }
            raceCard(race)
            ForEach(Array(others.enumerated()), id: \.offset) { _, other in
                if other.sport != "strength", other.eventId != nil {
                    planCard(other)
                        .padding(.top, 6)
                } else {
                    sideCard(other, day: day, gym: gym)
                }
            }
            if gymPlanned, !others.contains(where: { $0.sport == "strength" }), !done.contains(where: { $0.sport == "strength" }) {
                sideCard(WatchSnapshot.Session(date: day, title: W.tr("Posilovna", "Gym"), sport: "strength", minutes: gym?.minutes, done: false), day: day, gym: gym)
            }
        } else if planned.count > 1 || (day == today && !done.isEmpty && !planned.isEmpty) {
            // Two in a day (concept 04): the done one on top with its tick.
            ForEach(Array(done.enumerated()), id: \.offset) { _, session in
                doneCard(session, gym: nil).padding(.top, 6)
            }
            // Two or more (mockup 23): each its own card, the picked one open
            // with its steps or exercises and its button, a tap picks another.
            let pick = min(chosen[day] ?? 0, planned.count - 1)
            ForEach(Array(planned.enumerated()), id: \.offset) { index, session in
                if index == pick || planned.count == 1 {
                    pickedCard(session, day: day, gym: gym)
                } else {
                    // A brick's second leg stays right under the first (mockup plavani-triatlon 6).
                    let follows = index > 0 && session.after != nil && session.after == planned[index - 1].eventId
                    Button { chosen[day] = index } label: { foldedCard(session) }
                        .buttonStyle(.plain)
                        .padding(.top, follows ? 2 : 6)
                }
            }
        } else if let main = planned.first, main.sport != "strength", main.eventId != nil {
            planCard(main)
                .padding(.top, 8)
        } else if let main = planned.first ?? (gymPlanned && done.isEmpty ? WatchSnapshot.Session(date: day, title: W.tr("Posilovna", "Gym"), sport: "strength", minutes: gym?.minutes, done: false) : nil) {
            single(main, day: day, gym: gym)
        } else if !done.isEmpty {
            ForEach(Array(done.enumerated()), id: \.offset) { _, session in
                doneCard(session, gym: day == today ? gym : nil).padding(.top, 6)
            }
        } else if day == today, let s = watch.snapshot, s.date != today {
            // Yesterday's Today: no word on today's plan yet, so not "Rest day".
            Text(W.tr("Čekám na dnešek", "Waiting for today"))
                .watchFont(17, .semibold).foregroundStyle(W.ink).padding(.top, 4)
            Text(W.tr("Dnešní plán přijde z iPhonu nebo serveru.", "Today's plan comes from your iPhone or the server."))
                .watchFont(12).foregroundStyle(W.secondary)
        } else if day == today, restDay {
            restSentence
            if let next = sessions.first(where: { $0.date == tomorrow && !$0.done }) {
                sectionLabel(W.tr("Zítra", "Tomorrow")).padding(.top, 10)
                rowCard(next, line: when(next))
            }
        } else {
            Text(day == today ? W.tr("Dnes volno", "Rest day") : W.tr("Nic naplánováno", "Nothing planned"))
                .font(W.serif(19)).foregroundStyle(W.num).padding(.top, 4)
            if sessions.isEmpty, watch.snapshot == nil || store.failed {
                Text(W.tr("Trénink hodinky dostanou z iPhonu.", "Your watch gets training from your iPhone."))
                    .watchFont(12).foregroundStyle(W.secondary)
            }
        }
    }

    /// One workout: its name and when, the gym's exercises with Start today,
    /// or where a ride or run without steps starts.
    @ViewBuilder private func single(_ main: WatchSnapshot.Session, day: String, gym: WatchGym?) -> some View {
        if main.sport == "strength", let gym, !gym.exercises.isEmpty {
            // The iPhone's workout card (concept 04): the sport's disc, the
            // name in the serif, when, and the label over each number.
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    SportDisc(sport: main.sport)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(Self.name(main)).font(W.serif(19)).foregroundStyle(W.num)
                            .lineLimit(2).minimumScaleFactor(0.75)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(subtitle(main, day: day, length: false)).watchFont(13).foregroundStyle(W.muted).lineLimit(1)
                    }
                }
                HStack(alignment: .top, spacing: 0) {
                    stat(W.tr("Čas", "Time"), (gym.minutes ?? main.minutes).map(String.init) ?? "–", unit: "min")
                    stat(W.tr("Cviky", "Exercises"), String(gym.exercises.count))
                    stat(W.tr("Série", "Sets"), String(Self.sets(gym)))
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .watchCard()
            if day == today {
                if gym.allDone {
                    Label(W.tr("Hotovo", "Done"), systemImage: "checkmark")
                        .watchFont(15, .semibold).foregroundStyle(W.green)
                        .frame(maxWidth: .infinity).padding(.top, 8)
                } else {
                    Button { running = true } label: {
                        Text(gym.started ? W.tr("Pokračovat", "Continue") : W.tr("Začít", "Start"))
                            .watchFont(16, .semibold).foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                    }
                    .mainButton()
                    .padding(.top, 8)
                }
            }
        } else {
            rowCard(main, line: when(main)).padding(.top, 6)
            if main.sport == "strength", day == today, store.loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 8)
            } else if main.sport == "strength", day == today {
                // No exercises here yet and nothing loading: say where they come from (KRIT-21).
                Text(W.tr("Cviky hodinky dostanou z iPhonu.", "The exercises come from your iPhone."))
                    .watchFont(12).foregroundStyle(W.muted).padding(.top, 6)
                Button { store.load() } label: {
                    Text(W.tr("Zkusit znovu", "Try again")).watchFont(15, .semibold).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .padding(.top, 4)
            } else if main.sport != "strength", day == today {
                Text(W.tr("Spustíš v aplikaci Cvičení.", "Start it in the Workout app."))
                    .watchFont(12).foregroundStyle(W.muted).padding(.top, 6)
            }
        }
    }

    /// Another workout on race day, open on its own tile.
    private func sideCard(_ s: WatchSnapshot.Session, day: String, gym: WatchGym?) -> some View {
        VStack(alignment: .leading, spacing: 0) { single(s, day: day, gym: gym) }
            .padding(.top, 6)
    }

    /// The picked one of a day's workouts, open, with an amber edge.
    @ViewBuilder private func pickedCard(_ s: WatchSnapshot.Session, day: String, gym: WatchGym?) -> some View {
        if s.sport != "strength", s.eventId != nil {
            planCard(s, picked: true)
                .padding(.top, 6)
        } else {
            VStack(alignment: .leading, spacing: 0) { single(s, day: day, gym: gym) }
                .padding(.top, 6)
        }
    }

    /// Another of the day's workouts, folded to one line: tap to pick it.
    private func foldedCard(_ s: WatchSnapshot.Session) -> some View {
        rowCard(s, line: when(s))
            .contentShape(Rectangle())
    }

    /// A ride or run (mockup 4): when and how long, its name, its steps as
    /// bars (a tap opens the detail), and today Open in Workout with the plan's
    /// steps, outside the link so a tap on it never opens the detail.
    private func planCard(_ s: WatchSnapshot.Session, picked: Bool = false) -> some View {
        let plan = s.eventId.flatMap { plans.plans[$0] }
        return VStack(alignment: .leading, spacing: 0) {
            NavigationLink(value: s) { planInfo(s, plan: plan) }
                .buttonStyle(.plain)
            if let plan, canStart(s, plan: plan) {
                OpenInWorkoutButton { try await start(s, plan: plan) }
                    .padding(.top, 8)
            }
        }
        .onAppear {
            plans.load(s)
            // The next leg's plan only for the multisport start: the complication keeps this one's.
            if let leg = nextLeg(s) { plans.load(leg, shelf: false) }
        }
    }

    /// The iPhone's workout card for a ride, run or swim (concept 05): the
    /// sport's disc, the name in the serif, when, Time and the strain it adds
    /// (an estimate); a tap opens its steps.
    private func planInfo(_ s: WatchSnapshot.Session, plan: WatchPlan?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                SportDisc(sport: s.sport)
                VStack(alignment: .leading, spacing: 3) {
                    Text(Self.name(s)).font(W.serif(19)).foregroundStyle(W.num)
                        .lineLimit(2).minimumScaleFactor(0.75)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(subtitle(s, day: s.date, length: false)).watchFont(13).foregroundStyle(W.muted).lineLimit(1)
                }
            }
            if let leg = nextLeg(s) {
                HStack(spacing: 4) {
                    Image(systemName: W.sportSymbol(s.sport))
                    Image(systemName: "arrow.right").foregroundStyle(W.muted)
                    Image(systemName: W.sportSymbol(leg.sport))
                    Text(W.tr("hned po sobě", "back to back")).foregroundStyle(W.muted)
                }
                .watchFont(12, .semibold)
                .foregroundStyle(SportDisc.color(s.sport))
            }
            HStack(alignment: .top, spacing: 0) {
                if let minutes = s.minutes ?? plan?.minutes {
                    stat(W.tr("Čas", "Time"), Self.length(minutes), unit: "min")
                }
                if let added = addedStrain(s) {
                    stat(W.tr("Námaha", "Strain"), W.number(added, digits: 1), unit: W.tr("odh.", "est."))
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .watchCard()
        .contentShape(Rectangle())
    }

    /// "1 h 30" on a card, "45" under an hour (the unit beside it says min).
    static func length(_ minutes: Int) -> String {
        minutes < 60 ? String(minutes) : "\(minutes / 60) h " + String(format: "%02d", minutes % 60)
    }

    /// What this workout adds to today's strain: the next one's, from Today.
    private func addedStrain(_ s: WatchSnapshot.Session) -> Double? {
        guard s.date == today, let strain = watch.snapshot?.strain, let planned = strain.planned, planned > 0,
              strain.nextTitle == s.title else { return nil }
        return planned
    }

    /// A race (mockup hodinky-zavod): when and how long, its name, each leg
    /// with its distance and time, and today one start for the whole race.
    private func raceCard(_ race: RaceDay) -> some View {
        VStack(alignment: .leading, spacing: 0) {
        NavigationLink(value: race) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(subtitle(race.first, day: race.first.date, length: false)).watchFont(12, .semibold).foregroundStyle(W.amber)
                    Spacer(minLength: 4)
                    if let minutes = race.minutes { Text(RaceDay.length(minutes)).watchFont(12).foregroundStyle(W.muted) }
                }
                HStack(spacing: 6) {
                    Image(systemName: race.legs.count == 1 ? W.sportSymbol(race.first.sport) : "flag.fill")
                        .watchFont(14).foregroundStyle(W.amber)
                    Text(race.name).watchFont(17, .semibold).foregroundStyle(W.ink)
                        .lineLimit(2).minimumScaleFactor(0.75)
                }
                .padding(.top, 3)
                VStack(spacing: 0) {
                    ForEach(Array(race.legs.enumerated()), id: \.offset) { index, leg in
                        if index > 0 { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
                        HStack(spacing: 7) {
                            Image(systemName: W.sportSymbol(leg.sport)).watchFont(12)
                                .foregroundStyle(RaceDay.color(leg.sport)).frame(width: 16)
                            Text(RaceDay.distance(leg) ?? RaceDay.sportName(leg.sport))
                                .watchFont(13, .medium).foregroundStyle(W.ink).lineLimit(1)
                            Spacer(minLength: 4)
                            if let minutes = leg.minutes { Text(RaceDay.length(minutes)).watchFont(12).foregroundStyle(W.muted) }
                        }
                        .padding(.vertical, 5)
                    }
                }
                .padding(.top, 4)
                // One leg (an open-water race): its target right on the card.
                if race.legs.count == 1, let target = RaceDay.target(race.first.eventId.flatMap { plans.plans[$0] }, sport: race.first.sport) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(target.value).font(W.news(22)).foregroundStyle(W.ink)
                        Text(target.unit).watchFont(12).foregroundStyle(W.muted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if canStart(race) {
            OpenInWorkoutButton { try await start(race) }
                .padding(.top, 6)
        }
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 14))
        .padding(.top, 8)
        .id("race")
        // The first leg's plan also for the complication; the others only for the start.
        .onAppear { for (index, leg) in race.legs.enumerated() { plans.load(leg, shelf: index == 0) } }
    }

    /// Today, once every leg's plan is known (one that won't load leaves the race to its first leg).
    private func canStart(_ race: RaceDay) -> Bool {
        guard race.first.date == today, let first = race.first.eventId, plans.plans[first] != nil else { return false }
        return race.legs.allSatisfy { leg in leg.eventId.map { plans.plans[$0] != nil || plans.failed.contains($0) } ?? false }
    }

    /// The whole race as one multisport workout: the Workout app times each
    /// leg and each change. One leg, or sports this watch can't put in this
    /// order, opens the first leg with its steps.
    private func start(_ race: RaceDay) async throws {
        let legs = race.legs.compactMap { leg in leg.eventId.flatMap { plans.plans[$0] }.map { (sport: leg.sport, plan: $0) } }
        var workout: WorkoutPlan?
        if race.legs.count > 1, legs.count == race.legs.count { workout = WorkoutOpener.multisport(legs, name: race.name) }
        if workout == nil, let first = race.first.eventId.flatMap({ plans.plans[$0] }) {
            workout = WorkoutOpener.workout(first, sport: race.first.sport, name: race.legs.count == 1 ? race.name : Self.name(race.first))
        }
        guard let workout else { throw WorkoutOpener.Failed() }
        try await workout.openInWorkoutApp()
    }

    private func canStart(_ s: WatchSnapshot.Session, plan: WatchPlan) -> Bool {
        WorkoutOpener.canStart(s, plan: plan, today: today, sessions: sessions)
    }

    private func start(_ s: WatchSnapshot.Session, plan: WatchPlan) async throws {
        try await WorkoutOpener.start(s, plan: plan, sessions: sessions)
    }

    private func nextLeg(_ s: WatchSnapshot.Session) -> WatchSnapshot.Session? {
        WorkoutOpener.nextLeg(s, in: sessions)
    }

    /// "Hned po kole" / "Right after the ride": a brick's second leg.
    private func afterText(_ s: WatchSnapshot.Session) -> String? {
        guard let after = s.after, let leg = sessions.first(where: { $0.eventId == after }) else { return nil }
        switch leg.sport {
        case "ride": return W.tr("Hned po kole", "Right after the ride")
        case "run": return W.tr("Hned po běhu", "Right after the run")
        case "swim": return W.tr("Hned po plavání", "Right after the swim")
        default: return nil
        }
    }

    /// A brick's legs in order, each right after the one it follows, whatever
    /// the server's order; the rest as the server lists them.
    static func joined(_ list: [WatchSnapshot.Session]) -> [WatchSnapshot.Session] {
        let ids = Set(list.compactMap(\.eventId))
        var placed = Set<Int>()
        var out: [WatchSnapshot.Session] = []
        func add(_ i: Int) {
            guard placed.insert(i).inserted else { return }
            out.append(list[i])
            guard let id = list[i].eventId else { return }
            for j in list.indices where list[j].after == id { add(j) }
        }
        // A leg whose first is in the list waits for it.
        for i in list.indices where !(list[i].after.map(ids.contains) ?? false) { add(i) }
        for i in list.indices { add(i) }
        return out
    }

    /// "dnes, 17:30", "sobota, 9:00"; the length too unless the card shows it apart.
    private func subtitle(_ s: WatchSnapshot.Session, day: String, length: Bool = true) -> String {
        let name = day == today ? W.tr("Dnes", "Today") : day == tomorrow ? W.tr("Zítra", "Tomorrow") : W.dayName(day).capitalized
        // A brick's second leg starts when the first ends, not at a time of its own.
        let when = afterText(s).map { ", " + $0.lowercased() } ?? s.time.map { W.tr(" v ", " at ") + W.clockText($0) } ?? ""
        return name + when + (length ? s.minutes.map { ", " + W.duration(minutes: Double($0)) } ?? "" : "")
    }

    static func name(_ s: WatchSnapshot.Session) -> String { s.name }

    /// "17:30, 45 min" under a name on a card.
    private func when(_ s: WatchSnapshot.Session) -> String {
        [afterText(s) ?? s.time.map(W.clockText), s.minutes.map { W.duration(minutes: Double($0)) }].compactMap { $0 }.joined(separator: ", ")
    }

    /// The gym's sets, warm-ups left out.
    static func sets(_ gym: WatchGym) -> Int {
        gym.exercises.reduce(0) { $0 + $1.lifts.filter { !$0.warmup }.count }
    }

    // MARK: The page's parts (concept 04)

    /// "Today", "Tomorrow", "Today, 2 sessions" over the cards.
    private func sectionLabel(_ text: String) -> some View {
        Text(text).watchFont(13, .medium).foregroundStyle(W.muted).padding(.horizontal, 3)
    }

    private func dayLabel(_ day: String) -> String {
        if day == today {
            let count = sessions.filter { $0.date == today }.count
            return count > 1 ? W.tr("Dnes, \(count) tréninky", "Today, \(count) sessions") : W.tr("Dnes", "Today")
        }
        return day == tomorrow ? W.tr("Zítra", "Tomorrow") : W.dayName(day).capitalized
    }

    /// Today above tomorrow: what was done, or the rest day's sentence.
    @ViewBuilder private var todayDone: some View {
        let done = sessions.filter { $0.date == today && $0.done }
        if done.isEmpty {
            if restDay { restSentence }
        } else {
            ForEach(Array(done.enumerated()), id: \.offset) { _, session in
                doneCard(session, gym: store.gym.flatMap { $0.date == today ? $0 : nil }).padding(.top, 6)
            }
        }
    }

    /// The rest day's words from the iPhone's widget, the second half in green italics.
    private var restSentence: some View {
        (Text(W.tr("Den volna. ", "Rest day. ")).foregroundColor(W.num)
            + Text(W.tr("Klidně se projdi.", "Easy walk if you like.")).italic().foregroundColor(W.green))
            .font(W.serif(21))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 2)
            .padding(.horizontal, 3)
    }

    /// A workout on one row: its disc, its name and when.
    private func rowCard(_ s: WatchSnapshot.Session, line: String, done: Bool = false) -> some View {
        HStack(spacing: 8) {
            SportDisc(sport: s.sport, size: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.name(s)).watchFont(15, .medium).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.8)
                Text(line).watchFont(13).foregroundStyle(W.muted).lineLimit(1).minimumScaleFactor(0.8)
            }
            Spacer(minLength: 2)
            if done {
                Image(systemName: "checkmark").watchFont(12, .bold).foregroundStyle(W.green)
                    .frame(width: 24, height: 24)
                    .background(W.green.opacity(0.16), in: Circle())
            }
        }
        .padding(.horizontal, 9).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .watchCard()
        .accessibilityElement(children: .combine)
    }

    /// A done workout: "42 min, 23 sets, done" for the gym.
    private func doneCard(_ s: WatchSnapshot.Session, gym: WatchGym?) -> some View {
        var parts = [s.minutes.map { W.duration(minutes: Double($0)) }]
        if s.sport == "strength", let gym, gym.date == s.date { parts.append(W.tr("\(Self.sets(gym)) sérií", "\(Self.sets(gym)) sets")) }
        let line = parts.compactMap { $0 }.joined(separator: ", ")
        return rowCard(s, line: line.isEmpty ? W.tr("hotovo", "done") : line + W.tr(", hotovo", ", done"), done: true)
    }

    /// A number with its label over it, as on the iPhone's workout card.
    private func stat(_ label: String, _ value: String, unit: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).watchFont(12, .medium).foregroundStyle(W.muted).lineLimit(1).minimumScaleFactor(0.6)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value).font(W.serif(19)).foregroundStyle(W.num)
                if let unit { Text(unit).font(.system(size: 12, weight: .medium)).foregroundStyle(W.muted) }
            }
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Room between the labels: "Exercises" ran into "Sets" (CI shot).
        .padding(.trailing, 6)
        .accessibilityElement(children: .combine)
    }

}

/// Open in Workout (watch audit B1): one button for the Training page's cards
/// and a ride's, run's or swim's detail, outside any link; when the Workout
/// app doesn't open, a failure tap and a line say so.
struct OpenInWorkoutButton: View {
    let open: () async throws -> Void
    @State private var opening = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                opening = true
                Task {
                    do {
                        try await open()
                        failed = false
                    } catch {
                        failed = true
                        WKInterfaceDevice.current().play(.failure)
                    }
                    opening = false
                }
            } label: {
                // "Start in Workout": says another app opens (concept 05 point 1).
                Text(W.tr("Spustit ve Cvičení", "Start in Workout"))
                    .watchFont(16, .semibold).foregroundStyle(.black)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity)
            }
            .mainButton()
            .disabled(opening)
            if failed {
                Text(W.tr("Aplikace Cvičení se neotevřela. Plán tu zůstává, zkus to znovu.", "Couldn't open the Workout app. Your plan is still here, try again."))
                    .watchFont(12).foregroundStyle(W.amber)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

extension WorkoutOpener {
    /// Nothing the Workout app can take (an activity this watch lacks).
    struct Failed: Error {}

    /// The not yet done leg that follows this one right after (a brick).
    static func nextLeg(_ s: WatchSnapshot.Session, in sessions: [WatchSnapshot.Session]) -> WatchSnapshot.Session? {
        guard let next = s.next else { return nil }
        return sessions.first { $0.eventId == next && !$0.done }
    }

    /// Open in Workout shows today once what it starts is known: a brick
    /// waits for its next leg's plan, and a leg without steps goes only with it.
    static func canStart(_ s: WatchSnapshot.Session, plan: WatchPlan, today: String, sessions: [WatchSnapshot.Session]) -> Bool {
        guard s.date == today else { return false }
        let plans = PlanStore.shared
        guard let id = nextLeg(s, in: sessions)?.eventId else { return !plan.steps.isEmpty }
        guard let legPlan = plans.plans[id] else { return plans.failed.contains(id) && !plan.steps.isEmpty }
        return !plan.steps.isEmpty || (plan.steady && legPlan.steady)
    }

    /// A brick of steady legs as one multisport workout (as the iPhone sends
    /// it, WatchWorkout.multisport), else the leg itself with its steps.
    static func start(_ s: WatchSnapshot.Session, plan: WatchPlan, sessions: [WatchSnapshot.Session]) async throws {
        var multi: WorkoutPlan?
        if let leg = nextLeg(s, in: sessions), let legPlan = leg.eventId.flatMap({ PlanStore.shared.plans[$0] }), plan.steady, legPlan.steady {
            multi = Self.multisport([(s.sport, plan), (leg.sport, legPlan)], name: TrainingPage.name(s) + " + " + TrainingPage.name(leg))
        }
        guard let opened = multi ?? Self.workout(plan, sport: s.sport, name: TrainingPage.name(s)) else { throw Failed() }
        try await opened.openInWorkoutApp()
    }
}

/// A planned ride, run or swim in Apple's Workout app (WorkoutKit), its steps by
/// time (a pool swim by metres): zone 3 and up as work, the rest as recovery, repeats as one block.
/// A ride or run step keeps its power, pace or heart-rate alert, as from the iPhone (WatchWorkout.swift).
@MainActor
enum WorkoutOpener {
    static func workout(_ plan: WatchPlan, sport: String, name: String) -> WorkoutPlan? {
        let activity: HKWorkoutActivityType
        switch sport {
        case "ride": activity = .cycling
        case "run": activity = .running
        case "swim": activity = .swimming
        default: return nil
        }
        guard CustomWorkout.supportsActivity(activity) else { return nil }
        var blocks: [IntervalBlock] = []
        var current: [IntervalStep] = []
        var repeats = 1
        func flush() {
            guard !current.isEmpty else { return }
            blocks.append(IntervalBlock(steps: current, iterations: max(1, min(repeats, 20))))
            current = []
        }
        // A swim in the pool goes by metres as from the iPhone (WatchWorkout.swift); the
        // watch asks for the pool length. Open water goes by time, without rests.
        let openWater = sport == "swim" && plan.openWater == true
        let location: HKWorkoutSessionLocationType = sport == "swim" ? (openWater ? .outdoor : .indoor) : plan.indoor == true ? .indoor : .outdoor
        for step in plan.steps {
            if step.first { flush(); repeats = step.repeats }
            if step.rest == true {
                if !openWater { current.append(IntervalStep(.recovery, goal: .time(max(step.seconds, 5), .seconds))) }
                continue
            }
            let kind: IntervalStep.Purpose = step.zone >= 3 ? .work : .recovery
            if !openWater, let meters = step.meters, CustomWorkout.supportsGoal(.distance(meters, .meters), activity: activity, location: location) {
                current.append(IntervalStep(kind, goal: .distance(meters, .meters)))
            } else {
                var interval = IntervalStep(kind, goal: .time(max(step.seconds, 5), .seconds))
                if sport != "swim" { interval.step.alert = alert(step) }
                current.append(interval)
            }
        }
        flush()
        guard !blocks.isEmpty else { return nil }
        let custom = CustomWorkout(activity: activity, location: location, displayName: name, blocks: blocks)
        return WorkoutPlan(.custom(custom))
    }

    /// The step's target as the iPhone sends it: watts, else the pace range, else the heart-rate zone.
    private static func alert(_ s: WatchPlan.Step) -> (any WorkoutAlert)? {
        if let low = s.wattsLow, low > 0 {
            let high = max(low, s.wattsHigh ?? low)
            return PowerRangeAlert(target: Measurement(value: low, unit: UnitPower.watts)...Measurement(value: high, unit: UnitPower.watts))
        }
        if let slow = s.paceSlow ?? s.paceFast, let fast = s.paceFast ?? s.paceSlow, slow > 0, fast > 0 {
            // Pace (s/km) as speed: the slower pace is the lower speed.
            let lowSpeed = 1000 / max(slow, fast), highSpeed = 1000 / min(slow, fast)
            return SpeedRangeAlert(target: Measurement(value: lowSpeed, unit: UnitSpeed.metersPerSecond)...Measurement(value: highSpeed, unit: UnitSpeed.metersPerSecond), metric: .current)
        }
        if let low = s.hrLow, let high = s.hrHigh, low > 0, high > low {
            return HeartRateRangeAlert(target: Measurement(value: low / 60, unit: UnitFrequency.hertz)...Measurement(value: high / 60, unit: UnitFrequency.hertz))
        }
        return nil
    }

    /// A brick as one multisport workout: the Workout app times each leg and
    /// the change; it carries no steps, so only steady legs go this way.
    static func multisport(_ legs: [(sport: String, plan: WatchPlan)], name: String) -> WorkoutPlan? {
        let activities: [SwimBikeRunWorkout.Activity] = legs.compactMap { leg in
            switch leg.sport {
            case "swim": return .swimming(leg.plan.openWater == true ? .openWater : .pool)
            case "run": return .running(leg.plan.indoor == true ? .indoor : .outdoor)
            case "ride": return .cycling(leg.plan.indoor == true ? .indoor : .outdoor)
            default: return nil
            }
        }
        guard activities.count == legs.count, activities.count >= 2, SwimBikeRunWorkout.supportsActivityOrdering(activities) else { return nil }
        return WorkoutPlan(.swimBikeRun(SwimBikeRunWorkout(activities: activities, displayName: String(name.prefix(60)))))
    }
}

/// Texts of the gym screens.
@MainActor
enum GymText {
    /// "Dřep 4 × 8".
    static func line(_ e: WatchGym.Exercise) -> String {
        let work = e.lifts.filter(\.work)
        let sets = Set(work.map(\.number)).count
        let reps = work.first?.plannedReps ?? work.first?.reps.map(String.init)
        return e.title + (sets > 0 ? " \(sets) × " + (reps ?? "–") : "")
    }

    /// 77.5 as "77,5" in Czech, 80 as "80".
    static func kg(_ value: Double) -> String {
        W.number(value, digits: value.rounded() == value ? 0 : 1)
    }

    /// "20 + 2,5 / stranu": the plates per side on a bar (in the chosen unit,
    /// WatchGym.Exercise.bar), only when they make the weight exactly.
    static func plates(_ kg: Double, bar: Double) -> String? {
        guard let side = PlateLoad.exact(W.weight(kg), bar: bar, sizes: W.imperial ? PlateLoad.lbSizes : PlateLoad.kgSizes) else { return nil }
        let text = side.map { W.number($0, digits: $0.rounded() == $0 ? 0 : ($0 * 2).rounded() == $0 * 2 ? 1 : 2) }
        return text.joined(separator: " + ") + W.tr(" / stranu", " / side")
    }

    /// "77,5 kg" or "171 lb", by Settings → Units on the iPhone, or "75 lb"
    /// on a machine in pounds while the app is in kilos.
    static func weight(_ kg: Double, machineLb: Bool = false) -> String {
        Self.kg(shown(kg, machineLb: machineLb)) + " " + (machineLb ? "lb" : W.weightUnit)
    }

    /// kg as the tiles show it. A machine in pounds (LiftUnits on the iPhone):
    /// pounds typed come back as typed, the plan's kilos to the nearest 5 lb, as on the iPhone.
    static func shown(_ kg: Double, machineLb: Bool) -> Double {
        guard machineLb else { return W.weight(kg) }
        let pounds = kg * 2.2046226218, half = (pounds * 2).rounded() / 2
        return abs(pounds - half) < 0.05 ? half : (pounds / 5).rounded() * 5
    }

    /// What the tiles show back in kg.
    static func kgOf(_ shown: Double, machineLb: Bool) -> Double {
        machineLb ? shown / 2.2046226218 : W.kg(shown)
    }

    /// 2140 kg as "2,1 t", or "4,718 lb".
    static func volume(_ kg: Double) -> String {
        if W.imperial { return W.number(W.weight(kg)) + " lb" }
        return kg >= 1000 ? W.number(kg / 1000, digits: 1) + " t" : W.number(kg) + " kg"
    }

    /// "97,5 × 6", "12 op." with body weight: a set from the history, in the athlete's units.
    static func lift(_ set: WatchGym.Last, machineLb: Bool = false) -> String {
        guard let kg = set.kg, kg > 0 else { return W.tr("\(set.reps) op.", "\(set.reps) reps") }
        return Self.kg(shown(kg, machineLb: machineLb)) + " × \(set.reps)"
    }

    /// Under the exercise's name: "Minule 97,5 × 6, cíl: těžká" (Training
    /// mode's "Minule" and the set's planned letter); nil with neither.
    /// "Last time 97.5 × 6"; the aim is the letter's pill beside the set (watch audit B5).
    static func info(_ lift: WatchGym.Lift, machineLb: Bool = false) -> String? {
        guard lift.work, let last = lift.last else { return nil }
        return W.tr("Minule ", "Last time ") + Self.lift(last, machineLb: machineLb)
    }

    /// The planned letter in words (GymIntensity.name on the iPhone); none for a warm-up or drop set.
    static func aim(_ letter: String) -> String? {
        switch letter {
        case "T": return W.tr("technika", "technique")
        case "E": return W.tr("snadná", "easy")
        case "M": return W.tr("střední", "medium")
        case "H": return W.tr("těžká", "hard")
        case "F": return W.tr("selhání", "failure")
        case "PR": return W.tr("osobní rekord", "personal record")
        default: return nil
        }
    }

    /// The colour of a letter, as on the iPhone (GymIntensity.color).
    static func intensityColor(_ letter: String) -> Color {
        switch letter {
        case "T": return W.blue
        case "E": return W.green
        case "M": return W.indigo
        case "H": return W.amber
        case "F": return W.red
        case "PR": return Color(hex: 0xE8C25A)
        case "D": return W.pink
        default: return W.muted
        }
    }

    /// The set's planned letter in a dashed box, as the iPhone's table shows a plan's letter.
    static func intensityPill(_ letter: String) -> some View {
        let color = intensityColor(letter)
        return Text(letter).watchFont(12, .bold).foregroundStyle(color)
            .lineLimit(1).fixedSize()
            .padding(.horizontal, 4)
            .frame(minWidth: 18, minHeight: 18)
            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(color, style: StrokeStyle(lineWidth: 1.2, dash: [2.5, 2])))
            .accessibilityLabel(W.tr("Cíl: ", "Aim: ") + (aim(letter) ?? letter))
    }

    static func elapsed(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// The sport's disc of the iPhone's cards (Design/SportDisc): the sport's
/// light colour on a dark tint of it, Ride, Run, Swim, Gym.
struct SportDisc: View {
    let sport: String
    var size: CGFloat = 32

    var body: some View {
        let color = Self.color(sport)
        Image(systemName: W.sportSymbol(sport))
            .font(.system(size: size * 0.55, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(Circle().fill(Color(hex: 0x111111)).overlay(Circle().fill(color.opacity(0.2))))
            .accessibilityHidden(true)
    }

    /// The dark mode sport colours (Ride B7A0F5, Run FF9238, Swim 5CC8E8, Gym 8FE6C4, Yoga F1CA47).
    static func color(_ sport: String) -> Color {
        switch sport {
        case "ride": Color(hex: 0xB7A0F5)
        case "run": Color(hex: 0xFF9238)
        case "swim": Color(hex: 0x5CC8E8)
        case "strength", "gym": Color(hex: 0x8FE6C4)
        case "yoga": Color(hex: 0xF1CA47)
        default: Color(hex: 0x9AA39F)
        }
    }
}

extension View {
    /// The watch concept's card: a dark gradient with a hairline rim.
    func watchCard(radius: CGFloat = 20) -> some View {
        background(LinearGradient(colors: [Color(hex: 0x1B1D1E), Color(hex: 0x151718)], startPoint: .top, endPoint: .bottom),
                   in: RoundedRectangle(cornerRadius: radius))
            .overlay { RoundedRectangle(cornerRadius: radius).stroke(Color.white.opacity(0.06), lineWidth: 1) }
    }
}
