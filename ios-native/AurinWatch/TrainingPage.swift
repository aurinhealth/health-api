import SwiftUI

/// The second page by the crown (mockups 14 and 16): the day's training from
/// the iPhone, today, or tomorrow in the evening or once today is done, with
/// the gym's exercises and Start (Začít, today only), then the week's row of
/// days (tap one to see it) and the sessions still to come this week.
struct TrainingPage: View {
    @EnvironmentObject private var watch: WatchStore
    @ObservedObject private var store = GymStore.shared
    @State private var running = false
    @State private var picked: String?
    @State private var preview: WatchGym?

    private var today: String { WatchStore.localDate(Date()) }
    private var sessions: [WatchSnapshot.Session] {
        guard let s = watch.snapshot, s.date == today else { return [] }
        return s.week ?? []
    }

    var body: some View {
        let day = shownDay
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
                content(day)
                WeekRow(days: weekDays, today: today, shown: day, sessions: sessions) { picked = $0 }
                    .padding(.top, 10)
                later(after: day)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear { store.load() }
        .task(id: day) {
            if day == today { preview = nil } else { preview = await store.preview(date: day) }
        }
        .fullScreenCover(isPresented: $running) { GymSessionView() }
        .containerBackground(W.glow(W.Glow.strain), for: .tabView)
    }

    // MARK: The day shown

    private var tomorrow: String {
        WatchStore.localDate(Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())
    }

    /// Today; in the evening (from 18:00) or with today done, tomorrow when it has a plan.
    private var shownDay: String {
        if let picked { return picked }
        let todays = sessions.filter { $0.date == today }
        let open = todays.contains { !$0.done } || (store.gym.map { $0.date == today && !$0.exercises.isEmpty && !$0.allDone } ?? false)
        let evening = Calendar.current.component(.hour, from: Date()) >= 18
        let next = sessions.contains { $0.date == tomorrow && !$0.done }
        if next, evening || (!open && !todays.isEmpty) { return tomorrow }
        return today
    }

    /// Monday to Sunday of this week.
    private var weekDays: [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        let start = calendar.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start).map(WatchStore.localDate) }
    }

    @ViewBuilder private func content(_ day: String) -> some View {
        let planned = sessions.filter { $0.date == day && !$0.done }
        let done = sessions.filter { $0.date == day && $0.done }
        let gym = day == today ? store.gym : preview
        let gymPlanned = gym.map { !$0.exercises.isEmpty } ?? false
        if let main = planned.first ?? (gymPlanned && done.isEmpty ? WatchSnapshot.Session(date: day, title: W.tr("Posilovna", "Gym"), sport: "strength", minutes: gym?.minutes, done: false) : nil) {
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
            ForEach(Array(planned.dropFirst().enumerated()), id: \.offset) { _, other in
                Text("+ " + name(other) + (other.minutes.map { " · \($0) min" } ?? ""))
                    .font(.system(size: 12)).foregroundStyle(W.secondary).padding(.top, 4)
            }
        } else if let first = done.first {
            HStack {
                header(first)
                Spacer(minLength: 4)
                Image(systemName: "checkmark").foregroundStyle(W.green)
            }
            ForEach(Array(done.dropFirst().enumerated()), id: \.offset) { _, other in
                Text(name(other) + (other.minutes.map { " · \($0) min" } ?? ""))
                    .font(.system(size: 12)).foregroundStyle(W.secondary).padding(.top, 2)
            }
        } else {
            Text(day == today ? W.tr("Dnes volno", "Rest day") : W.tr("Nic naplánováno", "Nothing planned"))
                .font(.system(size: 17, weight: .semibold)).foregroundStyle(W.ink).padding(.top, 4)
            if sessions.isEmpty, watch.snapshot == nil || store.failed {
                Text(W.tr("Trénink hodinky dostanou z iPhonu.", "Your watch gets training from your iPhone."))
                    .font(.system(size: 12)).foregroundStyle(W.secondary)
            }
        }
    }

    private func header(_ s: WatchSnapshot.Session) -> some View {
        HStack(spacing: 5) {
            Image(systemName: W.sportSymbol(s.sport)).font(.system(size: 13)).foregroundStyle(W.amber)
            Text(name(s))
                .font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink)
                .lineLimit(2).minimumScaleFactor(0.7)
        }
        .padding(.top, 2)
    }

    /// "dnes · 17:30", "sobota · 9:00".
    private func subtitle(_ s: WatchSnapshot.Session, day: String) -> String {
        let name = day == today ? W.tr("dnes", "today") : day == tomorrow ? W.tr("zítra", "tomorrow") : W.dayName(day)
        return name + (s.time.map { " · " + W.clockText($0) } ?? "") + (s.minutes.map { " · \($0) min" } ?? "")
    }

    /// The title without the length the server's plan already ends it with
    /// ("Endurance with cadence drills · 60 min"), which the subtitle shows.
    private func name(_ s: WatchSnapshot.Session) -> String {
        guard let minutes = s.minutes else { return s.title }
        for suffix in [" · \(minutes) min", " – \(minutes) min", " (\(minutes) min)"] where s.title.hasSuffix(suffix) {
            return String(s.title.dropLast(suffix.count))
        }
        return s.title
    }

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

    /// The sessions still to come this week after the day shown.
    @ViewBuilder private func later(after day: String) -> some View {
        let next = sessions.filter { $0.date > day && !$0.done }
        if !next.isEmpty {
            Text(W.tr("Dál tento týden", "Later this week"))
                .font(.system(size: 11, weight: .semibold)).foregroundStyle(W.muted)
                .padding(.top, 12)
            ForEach(Array(next.enumerated()), id: \.offset) { _, s in
                Button { picked = s.date } label: {
                    HStack(spacing: 8) {
                        Image(systemName: W.sportSymbol(s.sport)).font(.system(size: 13)).foregroundStyle(W.amber).frame(width: 18)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(name(s))
                                .font(.system(size: 13, weight: .semibold)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
                            Text(subtitle(s, day: s.date)).font(.system(size: 11)).foregroundStyle(W.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(W.tile, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
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
                            .overlay(Circle().stroke(day == shown ? W.ink : .clear, lineWidth: 1.5))
                        Text(W.dayLetter(day)).font(.system(size: 9, weight: .semibold))
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

    /// 2140 kg as "2,1 t".
    static func volume(_ kg: Double) -> String {
        kg >= 1000 ? W.number(kg / 1000, digits: 1) + " t" : W.number(kg) + " kg"
    }

    static func elapsed(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}
