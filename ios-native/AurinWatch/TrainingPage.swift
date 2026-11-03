import HealthKit
import SwiftUI
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
                HStack {
                    Text(W.tr("Trénink", "Training"))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(W.amber)
                    Spacer()
                    if day != today {
                        Text(day == tomorrow ? W.tr("ZÍTRA", "TOMORROW") : W.dayName(day).uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(W.amber, in: Capsule())
                    }
                }
                WeekRow(days: weekDays, today: today, shown: day, sessions: sessions) { picked = $0 }
                    .padding(.top, 6)
                    // Where the sample day's screenshot scrolls to (-week): the
                    // week just under the clock, Continue whole above the edge.
                    .overlay(alignment: .top) { Color.clear.frame(height: 1).padding(.top, 16).id("week") }
                content(day)
                if day == today, noGymToday { noGym }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task {
            // The sample day's screenshot (-week): the week and Continue both whole.
            guard WatchDemo.flag("-week") else { return }
            try? await Task.sleep(for: .milliseconds(400))
            proxy.scrollTo("week", anchor: .top)
        }
        }
        // Each turn of the crown to this page shows it again: the plan only
        // when there is none for today or it is older than 10 minutes (the
        // iPhone sends every change it saves on its own).
        .onAppear { store.loadIfStale() }
        .task(id: day) {
            if day == today { preview = nil } else { preview = await store.preview(date: day) }
        }
        .fullScreenCover(isPresented: $running, onDismiss: { WatchReport.visit("training") }) {
            GymSessionView().onAppear { WatchReport.visit("gym") }
        }
        .containerBackground(W.glow(W.Glow.strain), for: .tabView)
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

    /// Repeat last workout, Build from rested, Empty workout: the iPhone puts
    /// it in the day (an empty one starts here alone too) and it opens.
    private var noGym: some View {
        let settings = watch.settings
        return VStack(alignment: .leading, spacing: 5) {
            Text(W.tr("Posilovna není v plánu", "No gym planned"))
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(W.ink)
            if let last = settings.lastGym {
                Text(W.tr("Minule: ", "Last: ") + W.dayName(last) + (settings.lastGymExercises.map { " · " + Self.exercises($0) } ?? ""))
                    .font(.system(size: 12)).foregroundStyle(W.secondary)
            }
            if store.starting {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 6)
            } else {
                if settings.lastGym != nil {
                    startButton(.repeatLast, W.tr("Zopakovat minulý", "Repeat last workout"), prominent: true)
                }
                startButton(.rested, W.tr("Sestavit z odpočatých", "Build from rested"), prominent: settings.lastGym == nil)
                startButton(.empty, W.tr("Prázdný trénink", "Empty workout"), prominent: false)
            }
        }
        .padding(.top, 12)
    }

    private func startButton(_ kind: WatchGym.Start.Kind, _ title: String, prominent: Bool) -> some View {
        Button {
            Task { if await store.start(kind) { running = true } }
        } label: {
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(prominent ? .black : W.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(prominent ? W.ink : W.tile)
        .padding(.top, 3)
    }

    /// "5 cviků", "5 exercises".
    static func exercises(_ count: Int) -> String {
        guard !W.english else { return count == 1 ? "1 exercise" : "\(count) exercises" }
        return "\(count) " + (count == 1 ? "cvik" : (2...4).contains(count) ? "cviky" : "cviků")
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

    /// Monday to Sunday of this week.
    private var weekDays: [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: WatchDemo.now)?.start ?? WatchDemo.now
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start).map(WatchStore.localDate) }
    }

    @ViewBuilder private func content(_ day: String) -> some View {
        let planned = Self.joined(sessions.filter { $0.date == day && !$0.done })
        let done = sessions.filter { $0.date == day && $0.done }
        let gym = day == today ? store.gym : preview
        let gymPlanned = gym.map { !$0.exercises.isEmpty } ?? false
        if let race = RaceDay(planned) {
            // Race day (mockup hodinky-zavod): the race as one card, anything else of the day
            // under it as it would show on its own (a ride or run with its start, the gym with Start).
            let others = planned.filter { !race.legs.contains($0) }
            raceCard(race)
            ForEach(Array(others.enumerated()), id: \.offset) { _, other in
                if other.sport != "strength", other.eventId != nil {
                    NavigationLink(value: other) { planCard(other) }
                        .buttonStyle(.plain)
                        .padding(.top, 6)
                } else {
                    sideCard(other, day: day, gym: gym)
                }
            }
            if gymPlanned, !others.contains(where: { $0.sport == "strength" }), !done.contains(where: { $0.sport == "strength" }) {
                sideCard(WatchSnapshot.Session(date: day, title: W.tr("Posilovna", "Gym"), sport: "strength", minutes: gym?.minutes, done: false), day: day, gym: gym)
            }
        } else if planned.count > 1 {
            // Two or more (mockup 23): each its own card, the picked one open
            // with its steps or exercises and its button, a tap picks another.
            let pick = min(chosen[day] ?? 0, planned.count - 1)
            ForEach(Array(planned.enumerated()), id: \.offset) { index, session in
                if index == pick {
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
            NavigationLink(value: main) { planCard(main) }
                .buttonStyle(.plain)
                .padding(.top, 8)
        } else if let main = planned.first ?? (gymPlanned && done.isEmpty ? WatchSnapshot.Session(date: day, title: W.tr("Posilovna", "Gym"), sport: "strength", minutes: gym?.minutes, done: false) : nil) {
            single(main, day: day, gym: gym)
        } else if let first = done.first {
            HStack {
                header(first)
                Spacer(minLength: 4)
                Image(systemName: "checkmark").foregroundStyle(W.green)
            }
            ForEach(Array(done.dropFirst().enumerated()), id: \.offset) { _, other in
                Text(Self.name(other) + (other.minutes.map { " · \($0) min" } ?? ""))
                    .font(.system(size: 12)).foregroundStyle(W.secondary).padding(.top, 2)
            }
        } else if day == today, let s = watch.snapshot, s.date != today {
            // Yesterday's Today: no word on today's plan yet, so not "Rest day".
            Text(W.tr("Čekám na dnešek", "Waiting for today"))
                .font(.system(size: 17, weight: .semibold)).foregroundStyle(W.ink).padding(.top, 4)
            Text(W.tr("Dnešní plán přijde z iPhonu nebo serveru.", "Today's plan comes from your iPhone or the server."))
                .font(.system(size: 12)).foregroundStyle(W.secondary)
        } else {
            Text(day == today ? W.tr("Dnes volno", "Rest day") : W.tr("Nic naplánováno", "Nothing planned"))
                .font(.system(size: 17, weight: .semibold)).foregroundStyle(W.ink).padding(.top, 4)
            if sessions.isEmpty, watch.snapshot == nil || store.failed {
                Text(W.tr("Trénink hodinky dostanou z iPhonu.", "Your watch gets training from your iPhone."))
                    .font(.system(size: 12)).foregroundStyle(W.secondary)
            }
        }
    }

    /// One workout: its name and when, the gym's exercises with Start today,
    /// or where a ride or run without steps starts.
    @ViewBuilder private func single(_ main: WatchSnapshot.Session, day: String, gym: WatchGym?) -> some View {
        header(main)
        Text(subtitle(main, day: day)).font(.system(size: 12)).foregroundStyle(W.secondary).padding(.top, 1)
        if main.sport == "strength", let gym, !gym.exercises.isEmpty {
            exercises(gym)
            if day == today {
                if gym.allDone {
                    Label(W.tr("Hotovo", "Done"), systemImage: "checkmark")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(W.green)
                        .frame(maxWidth: .infinity).padding(.top, 8)
                } else {
                    Button { running = true } label: {
                        Text(gym.started ? W.tr("Pokračovat", "Continue") : W.tr("Začít", "Start"))
                            .font(.system(size: 16, weight: .semibold)).foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(W.green)
                    .padding(.top, 8)
                }
            }
        } else if main.sport == "strength", day == today, store.loading {
            ProgressView().frame(maxWidth: .infinity).padding(.top, 8)
        } else if main.sport != "strength", day == today {
            Text(W.tr("Spustíš v aplikaci Cvičení.", "Start it in the Workout app."))
                .font(.system(size: 12)).foregroundStyle(W.muted).padding(.top, 6)
        }
    }

    /// Another workout on race day, open on its own tile.
    private func sideCard(_ s: WatchSnapshot.Session, day: String, gym: WatchGym?) -> some View {
        VStack(alignment: .leading, spacing: 0) { single(s, day: day, gym: gym) }
            .padding(.horizontal, 10).padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(W.tile, in: RoundedRectangle(cornerRadius: 14))
            .padding(.top, 6)
    }

    /// The picked one of a day's workouts, open, with an amber edge.
    @ViewBuilder private func pickedCard(_ s: WatchSnapshot.Session, day: String, gym: WatchGym?) -> some View {
        if s.sport != "strength", s.eventId != nil {
            NavigationLink(value: s) { planCard(s, picked: true) }
                .buttonStyle(.plain)
                .padding(.top, 6)
        } else {
            VStack(alignment: .leading, spacing: 0) { single(s, day: day, gym: gym) }
                .padding(.horizontal, 10).padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(W.tile, in: RoundedRectangle(cornerRadius: 14))
                .overlay { RoundedRectangle(cornerRadius: 14).stroke(W.amber, lineWidth: 1.5) }
                .padding(.top, 6)
        }
    }

    /// Another of the day's workouts, folded to one line: tap to pick it.
    private func foldedCard(_ s: WatchSnapshot.Session) -> some View {
        HStack(spacing: 6) {
            Image(systemName: W.sportSymbol(s.sport)).font(.system(size: 13)).foregroundStyle(W.amber)
            VStack(alignment: .leading, spacing: 0) {
                Text(Self.name(s)).font(.system(size: 13, weight: .semibold)).foregroundStyle(W.ink).lineLimit(1)
                if let after = afterText(s) {
                    Text(after).font(.system(size: 10, weight: .semibold)).foregroundStyle(W.amber).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            if let minutes = s.minutes { Text("\(minutes) min").font(.system(size: 11)).foregroundStyle(W.muted) }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 14))
        .contentShape(Rectangle())
    }

    private func header(_ s: WatchSnapshot.Session) -> some View {
        HStack(spacing: 5) {
            Image(systemName: W.sportSymbol(s.sport)).font(.system(size: 13)).foregroundStyle(W.amber)
            Text(Self.name(s))
                .font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink)
                .lineLimit(2).minimumScaleFactor(0.7)
        }
        .padding(.top, 2)
    }

    /// A ride or run (mockup 4): when and how long, its name, its steps as
    /// bars, and today Open in Workout with the plan's steps.
    private func planCard(_ s: WatchSnapshot.Session, picked: Bool = false) -> some View {
        let plan = s.eventId.flatMap { plans.plans[$0] }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(subtitle(s, day: s.date, length: false)).font(.system(size: 11, weight: .semibold)).foregroundStyle(W.amber)
                Spacer(minLength: 4)
                if let minutes = s.minutes { Text("\(minutes) min").font(.system(size: 11)).foregroundStyle(W.muted) }
            }
            HStack(spacing: 6) {
                Image(systemName: W.sportSymbol(s.sport)).font(.system(size: 15)).foregroundStyle(W.amber)
                Text(Self.name(s)).font(.system(size: 17, weight: .semibold)).foregroundStyle(W.ink)
                    .lineLimit(2).minimumScaleFactor(0.75)
            }
            .padding(.top, 3)
            if let leg = nextLeg(s) {
                HStack(spacing: 4) {
                    Image(systemName: W.sportSymbol(s.sport))
                    Image(systemName: "arrow.right").font(.system(size: 9, weight: .bold)).foregroundStyle(W.muted)
                    Image(systemName: W.sportSymbol(leg.sport))
                    Text(W.tr("hned po sobě", "back to back")).font(.system(size: 10, weight: .semibold)).foregroundStyle(W.muted)
                }
                .font(.system(size: 11))
                .foregroundStyle(W.amber)
                .padding(.top, 3)
            }
            Group {
                if let plan, !plan.steps.isEmpty {
                    PlanBars(plan: plan)
                } else {
                    RoundedRectangle(cornerRadius: 3).fill(W.track)
                }
            }
            .frame(height: 26)
            .padding(.top, 7)
            if let plan, canStart(s, plan: plan) {
                Button {
                    Task { await start(s, plan: plan) }
                } label: {
                    Label(W.tr("Otevřít ve Cvičení", "Open in Workout"), systemImage: "play.fill")
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(W.green)
                .padding(.top, 8)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(W.tile, in: RoundedRectangle(cornerRadius: 14))
        .overlay { if picked { RoundedRectangle(cornerRadius: 14).stroke(W.amber, lineWidth: 1.5) } }
        .onAppear {
            plans.load(s)
            // The next leg's plan only for the multisport start: the complication keeps this one's.
            if let leg = nextLeg(s) { plans.load(leg, shelf: false) }
        }
    }

    /// A race (mockup hodinky-zavod): when and how long, its name, each leg
    /// with its distance and time, and today one start for the whole race.
    private func raceCard(_ race: RaceDay) -> some View {
        NavigationLink(value: race) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(subtitle(race.first, day: race.first.date, length: false)).font(.system(size: 11, weight: .semibold)).foregroundStyle(W.amber)
                    Spacer(minLength: 4)
                    if let minutes = race.minutes { Text(RaceDay.length(minutes)).font(.system(size: 11)).foregroundStyle(W.muted) }
                }
                HStack(spacing: 6) {
                    Image(systemName: race.legs.count == 1 ? W.sportSymbol(race.first.sport) : "flag.fill")
                        .font(.system(size: 14)).foregroundStyle(W.amber)
                    Text(race.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(W.ink)
                        .lineLimit(2).minimumScaleFactor(0.75)
                }
                .padding(.top, 3)
                VStack(spacing: 0) {
                    ForEach(Array(race.legs.enumerated()), id: \.offset) { index, leg in
                        if index > 0 { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
                        HStack(spacing: 7) {
                            Image(systemName: W.sportSymbol(leg.sport)).font(.system(size: 12))
                                .foregroundStyle(RaceDay.color(leg.sport)).frame(width: 16)
                            Text(RaceDay.distance(leg) ?? RaceDay.sportName(leg.sport))
                                .font(.system(size: 13, weight: .medium)).foregroundStyle(W.ink).lineLimit(1)
                            Spacer(minLength: 4)
                            if let minutes = leg.minutes { Text(RaceDay.length(minutes)).font(.system(size: 12)).foregroundStyle(W.muted) }
                        }
                        .padding(.vertical, 5)
                    }
                }
                .padding(.top, 4)
                // One leg (an open-water race): its target right on the card.
                if race.legs.count == 1, let target = RaceDay.target(race.first.eventId.flatMap { plans.plans[$0] }, sport: race.first.sport) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(target.value).font(W.news(22)).foregroundStyle(W.ink)
                        Text(target.unit).font(.system(size: 11)).foregroundStyle(W.muted)
                    }
                }
                if canStart(race) {
                    Button {
                        Task { await start(race) }
                    } label: {
                        Label(W.tr("Otevřít ve Cvičení", "Open in Workout"), systemImage: "play.fill")
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(W.green)
                    .padding(.top, 6)
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(W.tile, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .padding(.top, 8)
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
    private func start(_ race: RaceDay) async {
        let legs = race.legs.compactMap { leg in leg.eventId.flatMap { plans.plans[$0] }.map { (sport: leg.sport, plan: $0) } }
        var workout: WorkoutPlan?
        if race.legs.count > 1, legs.count == race.legs.count { workout = WorkoutOpener.multisport(legs, name: race.name) }
        if workout == nil, let first = race.first.eventId.flatMap({ plans.plans[$0] }) {
            workout = WorkoutOpener.workout(first, sport: race.first.sport, name: race.legs.count == 1 ? race.name : Self.name(race.first))
        }
        guard let workout else { return }
        try? await workout.openInWorkoutApp()
    }

    /// Open in Workout shows today once what it starts is known: a brick
    /// waits for its next leg's plan, and a leg without steps goes only with it.
    private func canStart(_ s: WatchSnapshot.Session, plan: WatchPlan) -> Bool {
        guard s.date == today else { return false }
        guard let id = nextLeg(s)?.eventId else { return !plan.steps.isEmpty }
        guard let legPlan = plans.plans[id] else { return plans.failed.contains(id) && !plan.steps.isEmpty }
        return !plan.steps.isEmpty || (plan.steady && legPlan.steady)
    }

    /// A brick of steady legs as one multisport workout (as the iPhone sends
    /// it, WatchWorkout.multisport), else the leg itself with its steps.
    private func start(_ s: WatchSnapshot.Session, plan: WatchPlan) async {
        var multi: WorkoutPlan?
        if let leg = nextLeg(s), let legPlan = leg.eventId.flatMap({ plans.plans[$0] }), plan.steady, legPlan.steady {
            multi = WorkoutOpener.multisport([(s.sport, plan), (leg.sport, legPlan)], name: Self.name(s) + " + " + Self.name(leg))
        }
        guard let workout = multi ?? WorkoutOpener.workout(plan, sport: s.sport, name: Self.name(s)) else { return }
        try? await workout.openInWorkoutApp()
    }

    /// The not yet done leg that follows this one right after (a brick).
    private func nextLeg(_ s: WatchSnapshot.Session) -> WatchSnapshot.Session? {
        guard let next = s.next else { return nil }
        return sessions.first { $0.eventId == next && !$0.done }
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

    /// "dnes · 17:30", "sobota · 9:00"; the length too unless the card shows it apart.
    private func subtitle(_ s: WatchSnapshot.Session, day: String, length: Bool = true) -> String {
        let name = day == today ? W.tr("Dnes", "Today") : day == tomorrow ? W.tr("Zítra", "Tomorrow") : W.dayName(day).capitalized
        // A brick's second leg starts when the first ends, not at a time of its own.
        let when = afterText(s).map { " · " + $0.lowercased() } ?? s.time.map { " · " + W.clockText($0) } ?? ""
        return name + when + (length ? s.minutes.map { " · \($0) min" } ?? "" : "")
    }

    static func name(_ s: WatchSnapshot.Session) -> String { s.name }

    private func exercises(_ gym: WatchGym) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(Array(gym.exercises.prefix(3).enumerated()), id: \.offset) { _, e in
                Text(GymText.line(e)).lineLimit(1)
            }
            if gym.exercises.count > 3 {
                let more = gym.exercises.count - 3
                Text(W.tr("+ \(more) \(more < 5 ? "další cviky" : "dalších cviků")", "+ \(more) more"))
                    .foregroundStyle(W.muted)
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(W.secondary)
        .padding(.top, 4)
    }
}

/// Monday to Sunday (mockup 14): green a day with a workout done, an orange
/// ring today's plan, dashed the days to come (orange with a plan), dark a
/// past day without one; the day shown has a white ring.
struct WeekRow: View {
    let days: [String]
    let today: String
    let shown: String
    let sessions: [WatchSnapshot.Session]
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(days, id: \.self) { day in
                Button { pick(day) } label: {
                    VStack(spacing: 3) {
                        dot(day)
                            .frame(width: 18, height: 18)
                            .padding(2)
                            .overlay { Circle().stroke(day == shown ? W.ink : .clear, lineWidth: 1.5) }
                        Text(W.dayLetter(day)).font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(day == today ? W.ink : W.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private func dot(_ day: String) -> some View {
        let done = sessions.contains { $0.date == day && $0.done }
        let planned = sessions.contains { $0.date == day && !$0.done }
        if done {
            Circle().fill(W.green)
        } else if day == today, planned {
            Circle().stroke(W.amber, lineWidth: 2)
        } else if day > today {
            Circle().stroke(planned ? W.amber : W.dim, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2.5]))
        } else {
            Circle().fill(W.track)
        }
    }
}

/// A planned ride, run or swim in Apple's Workout app (WorkoutKit), its steps by
/// time (a pool swim by metres): zone 3 and up as work, the rest as recovery, repeats as one block.
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
                current.append(IntervalStep(kind, goal: .time(max(step.seconds, 5), .seconds)))
            }
        }
        flush()
        guard !blocks.isEmpty else { return nil }
        let custom = CustomWorkout(activity: activity, location: location, displayName: name, blocks: blocks)
        return WorkoutPlan(.custom(custom))
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

    /// "77,5 kg" or "171 lb", by Settings → Units on the iPhone.
    static func weight(_ kg: Double) -> String {
        Self.kg(W.weight(kg)) + " " + W.weightUnit
    }

    /// 2140 kg as "2,1 t", or "4,718 lb".
    static func volume(_ kg: Double) -> String {
        if W.imperial { return W.number(W.weight(kg)) + " lb" }
        return kg >= 1000 ? W.number(kg / 1000, digits: 1) + " t" : W.number(kg) + " kg"
    }

    /// "97,5 × 6", "12 op." with body weight: a set from the history, in the athlete's units.
    static func lift(_ set: WatchGym.Last) -> String {
        guard let kg = set.kg, kg > 0 else { return W.tr("\(set.reps) op.", "\(set.reps) reps") }
        return Self.kg(W.weight(kg)) + " × \(set.reps)"
    }

    /// Under the exercise's name: "Minule 97,5 × 6 · cíl: těžká" (Training
    /// mode's "Minule" and the set's planned letter); nil with neither.
    static func info(_ lift: WatchGym.Lift) -> String? {
        guard lift.work else { return nil }
        var parts: [String] = []
        if let last = lift.last { parts.append(W.tr("Minule ", "Last time ") + Self.lift(last)) }
        if let letter = lift.intensity, let aim = aim(letter) {
            parts.append((parts.isEmpty ? W.tr("Cíl: ", "Aim: ") : W.tr("cíl: ", "aim: ")) + aim)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
        return Text(letter).font(.system(size: 10, weight: .bold)).foregroundStyle(color)
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
