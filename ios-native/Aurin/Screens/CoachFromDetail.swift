import SwiftUI

/// What the athlete asks the coach about from a detail screen ("Zeptat se
/// kouče"): a done activity, a planned session, a gym exercise, a health
/// value or the gym workout under way in Režim tréninku. It goes to the server as appContext.subject
/// (src/assistant-app-context.js), which finds its numbers in storage; the
/// chat shows it on a card with questions to try.
struct CoachSubject: Equatable {
    enum Kind: String { case activity, planned, exercise, metric, workout }
    let kind: Kind
    /// The line above the title on the card.
    var label = "Ptáš se na"
    var id: String? = nil
    /// The title on the card ("Kolo · tempo").
    let title: String
    /// The line under it ("Út 13. 10. · 1:12 · 34,6 km · 74 TSS").
    var line: String? = nil
    /// A health value: hrv, restingHR, sleep… (HealthMetric).
    var metric: String? = nil
    /// The day it belongs to (the selected day for the server).
    var date: String? = nil
    /// ride, run or gym (assistantAppContext sport).
    var sport: String? = nil
    var exercise: String? = nil
    /// The screen the coach is opened from (assistantAppContext view).
    var view = "training"
    let symbol: String
    let color: Color
    /// Czech keys, translated where they are shown and sent.
    let questions: [String]
    /// Režim tréninku: where in the workout the athlete is (assistantAppContext live).
    var live: JSONObject? = nil

    var appContext: JSONObject {
        var subject: JSONObject = ["kind": .string(kind.rawValue), "title": .string(title)]
        if let id { subject["id"] = .string(id) }
        if let metric { subject["metric"] = .string(metric) }
        var context: JSONObject = ["view": .string(view), "date": .string(date ?? AppModel.localDate(Date())), "subject": .object(subject)]
        if let sport { context["sport"] = .string(sport) }
        if let exercise { context["exercise"] = .string(exercise) }
        if let live { context["live"] = .object(live) }
        return context
    }

    /// The server's sport for the app's (strength is the gym).
    private static func serverSport(_ sport: String) -> String? {
        switch sport {
        case "ride", "run": return sport
        case "strength": return "gym"
        default: return nil
        }
    }

    private static func symbol(_ sport: String) -> String {
        switch sport {
        case "ride": return "bicycle"
        case "run": return "figure.run"
        case "strength": return "dumbbell"
        case "walk": return "figure.walk"
        default: return "figure.mixed.cardio"
        }
    }

    private static func color(_ sport: String) -> Color {
        switch sport {
        case "ride": return Palette.amber
        case "run": return Palette.rust
        case "strength": return Palette.indigo
        default: return Palette.green
        }
    }

    private static func line(_ parts: [String?]) -> String {
        parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Trénink → a done activity.
    static func activity(_ s: WeekSession) -> CoachSubject {
        let questions: [String]
        switch s.sport {
        case "ride": questions = ["Jak se mi tahle jízda povedla?", "Proč jsem měl tak vysoký tep?", "Co mám dát zítra po ní?"]
        case "run": questions = ["Jak se mi tenhle běh povedl?", "Bylo tempo na mě rozumné?", "Co mám dát zítra po něm?"]
        case "strength": questions = ["Jak se mi tahle posilovna povedla?", "Kolik mám dát příště?", "Co mám dát zítra?"]
        default: questions = ["Jak se mi tahle aktivita povedla?", "Jak moc mě unavila?", "Co mám dát zítra?"]
        }
        return CoachSubject(kind: .activity, id: s.activityId ?? s.watch?.id ?? s.id, title: s.title,
                            line: line([Fmt.capitalized(Fmt.weekdayShort(s.date)) + " " + Fmt.dayMonth(s.date), s.minutes.map { Fmt.duration($0) },
                                        s.distanceKm.map { Units.distanceText($0) }, s.tss.map { Fmt.int($0) + " TSS" }]),
                            date: s.date, sport: serverSport(s.sport), symbol: symbol(s.sport), color: color(s.sport), questions: questions)
    }

    /// Trénink → a session still in the plan.
    static func planned(_ s: WeekSession) -> CoachSubject {
        var questions = ["Jak na tenhle trénink?"]
        questions.append((s.minutes ?? 0) > 50 ? "Mám jen 45 minut, co s tím?" : "Můžu ho dát jiný den?")
        switch s.sport {
        case "ride": questions.append("Prší, můžu ho dát na trenažéru?")
        case "run": questions.append("Můžu ho dát na pásu?")
        case "strength": questions.append("Čím nahradit cvik, na který nemám stroj?")
        default: questions.append("Co sníst před ním?")
        }
        let today = AppModel.localDate(Date())
        return CoachSubject(kind: .planned, id: s.eventId ?? s.id, title: s.title,
                            line: line([Fmt.capitalized(Fmt.relativeDay(s.date, today: today)) + (s.time.map { " " + ClockText.format($0) } ?? ""),
                                        s.minutes.map { Fmt.duration($0) }, s.tss.map { Fmt.int($0) + " TSS" }]),
                            date: s.date, sport: serverSport(s.sport), symbol: symbol(s.sport), color: color(s.sport), questions: questions)
    }

    /// Režim tréninku → "Kouč" by the plan: the whole workout and where in it
    /// the athlete is. Doing a set, resting between the sets of an exercise, or
    /// resting before the next one (`exercise` is the one on the screen, which
    /// after the last set of an exercise is already the next one). The server
    /// reads the sets done so far from the saved day.
    @MainActor static func workout(_ day: GymDay, exercise: GymExercise, resting: Bool, restSeconds: Int, date: String) -> CoachSubject {
        let done: Int = day.exercises.reduce(0) { $0 + $1.doneCount }
        let total: Int = day.exercises.reduce(0) { $0 + $1.workCount }
        let title = (day.planName?.nilIfBlank ?? L10n.tr("Posilovna")) + " · " + L10n.f("%@ z %@ sérií", String(done), String(total))
        let set = exercise.sets.first { !$0.done }
        let setNumber = set.flatMap { $0.work ? Int($0.number) : nil }
        let setLine = setNumber.map { L10n.f("série %@ z %@", String($0), String(exercise.workCount)) }
        let phase = !resting ? "set" : exercise.sets.contains(where: \.done) ? "rest" : "restBeforeExercise"
        let previous = day.exercises.last { $0.name != exercise.name && $0.sets.contains(where: \.done) }?.name
        let line: String
        let questions: [String]
        switch phase {
        case "set":
            line = Self.line([exercise.name, setLine.map(Fmt.capitalized), set.map { GymLiveActivity.load($0, in: exercise) }])
            questions = ["Jak na tenhle cvik správně?", "Bolí mě při něm, co místo něj?", "Čím nahradit tenhle cvik?"]
        case "rest":
            line = L10n.tr("Pauza") + " · " + L10n.f("další: %@", Self.line([exercise.name, setLine]))
            questions = ["Stačí mi tahle pauza?", "Mám v další sérii přidat?", "Bolí mě při něm, co místo něj?"]
        default:
            line = L10n.tr("Pauza") + " · " + L10n.f("další: %@", Self.line([exercise.name, set.map { GymLiveActivity.load($0, in: exercise) }]))
            questions = [L10n.f("Kolik mám dát na %@?", exercise.name), L10n.f("Můžu dnes %@ vynechat?", exercise.name),
                         previous.map { L10n.f("Byla váha u %@ správná?", $0) } ?? "Jak se mi zatím trénink daří?"]
        }
        var live: JSONObject = ["phase": .string(phase), "exercise": .string(exercise.name)]
        if let setNumber { live["set"] = .number(Double(setNumber)) }
        if resting, restSeconds > 0 { live["restSeconds"] = .number(Double(restSeconds)) }
        if let previous { live["previousExercise"] = .string(previous) }
        return CoachSubject(kind: .workout, label: "Probíhá trénink", title: title, line: line, date: date, sport: "gym", exercise: exercise.name,
                            view: "workouts", symbol: "dumbbell", color: Palette.indigo, questions: questions, live: live)
    }

    /// Zdraví → a value's detail; `low` when it is under the athlete's normal.
    static func metric(_ metric: HealthMetric, line: String?, low: Bool = false, date: String?) -> CoachSubject {
        let questions: [String]
        switch metric {
        case .hrv: questions = [low ? "Proč mám nízké HRV?" : "Co mi říká moje HRV?", "Mám dnes trénovat?", "Co s tím do večera?"]
        case .restingHR: questions = [low ? "Proč mám klidový tep výš než obvykle?" : "Co mi říká můj klidový tep?", "Mám dnes trénovat?", "Jak klidový tep snížit?"]
        case .respiration: questions = ["Co znamená můj dech ve spánku?", "Co ho ovlivňuje?", "Mám dnes trénovat?"]
        case .temperature: questions = ["Co znamená teplota zápěstí?", "Co ji ovlivňuje?", "Mám dnes trénovat?"]
        case .oxygen: questions = ["Je můj kyslík v krvi v pořádku?", "Co ho ovlivňuje?", "Mám dnes trénovat?"]
        case .bodyFat: questions = ["Jak se mi vyvíjí tělesný tuk?", "Jak upravit jídlo?", "Jak upravit trénink?"]
        case .muscle: questions = ["Jak se mi vyvíjí svalová hmota?", "Mám jíst víc bílkovin?", "Jak upravit posilovnu?"]
        }
        return CoachSubject(kind: .metric, title: L10n.tr(metric.title), line: line, metric: metric.rawValue, date: date, view: "health",
                            symbol: "waveform.path.ecg", color: Palette.green, questions: questions)
    }

    /// Trénink → Únava svalů.
    static func muscles(date: String?) -> CoachSubject {
        CoachSubject(kind: .metric, title: MuscleFatigue.title, metric: "muscles", date: date, view: "training",
                     symbol: "figure.strengthtraining.traditional", color: Palette.indigo,
                     questions: ["Které svaly můžu dnes trénovat?", "Kdy budu zase odpočatý?", "Co mám dnes dát v posilovně?"])
    }

    /// Dnes or Trénink → Námaha.
    static func strain(date: String?) -> CoachSubject {
        CoachSubject(kind: .metric, title: L10n.tr("Námaha"), metric: "strain", date: date, view: "training",
                     symbol: "flame", color: Palette.amber,
                     questions: ["Je moje dnešní námaha v pořádku?", "Mám dnes ještě trénovat?", "Jak naložit zbytek týdne?"])
    }

    /// Zdraví → Spánek.
    static func sleep(line: String?, date: String?) -> CoachSubject {
        CoachSubject(kind: .metric, title: L10n.tr("Spánek"), line: line, metric: "sleep", date: date, view: "health",
                     symbol: "moon", color: Palette.indigo, questions: ["Jak jsem se vyspal?", "Jak spát lépe?", "Mám dnes trénovat?"])
    }
}

/// "✦ Kouč" in a detail's header: opens the coach about what the screen shows.
struct CoachPill: View {
    @Environment(AppModel.self) private var model
    let subject: CoachSubject
    /// 34 beside the chips of Režim tréninku.
    var height: CGFloat = 32
    @State private var open = false

    var body: some View {
        if !model.demo {
            Button { open = true } label: {
                Label("Kouč", systemImage: "sparkles")
                    .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.green)
                    .padding(.horizontal, 12).frame(height: height)
                    .background(Palette.greenSoft, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("Zeptat se kouče"))
            .sheet(isPresented: $open) {
                CoachView(view: subject.view, date: subject.date, subject: subject, openChat: WorkoutCoachChat.id(for: subject),
                          keepChat: { WorkoutCoachChat.keep($0, for: subject) })
            }
        }
    }
}

/// Režim tréninku: the chat with the coach goes on where it was when the
/// athlete closes it to log a set and opens it again, for the whole day's
/// workout (also after the app was closed).
enum WorkoutCoachChat {
    private static let key = "workoutCoachChat"

    static func id(for subject: CoachSubject) -> Int? {
        guard subject.kind == .workout, let date = subject.date,
              let saved = UserDefaults.standard.dictionary(forKey: key), saved["date"] as? String == date else { return nil }
        return saved["chatId"] as? Int
    }

    static func keep(_ chatId: Int, for subject: CoachSubject) {
        guard subject.kind == .workout, let date = subject.date else { return }
        UserDefaults.standard.set(["date": date, "chatId": chatId], forKey: key)
    }
}

/// "Ptáš se na" on top of a chat opened from a detail.
struct CoachSubjectCard: View {
    let subject: CoachSubject

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: subject.symbol).scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(subject.color)
                .frame(width: 34, height: 34).background(subject.color.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: L10n.tr(subject.label)).font(Typo.caption).foregroundStyle(Palette.muted)
                Text(subject.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                if let line = subject.line, !line.isEmpty {
                    Text(line).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// "Zkus třeba" when the coach opens from the bar or Dnes: questions about
/// the day, first what just happened (a done workout), then how the body is
/// (low readiness), then what comes (tomorrow's hard session).
enum CoachSuggestions {
    static let fallback = ["Jak mám dnes trénovat?", "Necítím se dobře, uprav mi týden.", "Co sníst před večerním tréninkem?", "Proč mám nízkou připravenost?"]

    static func forDay(today: TodaySnapshot?, sessions: [WeekSession], date: String) -> [String] {
        var out: [String] = []
        let tomorrow = AppModel.shift(date, by: 1) ?? ""
        if let done = sessions.last(where: { $0.date == date && $0.status == "done" && ["ride", "run", "strength"].contains($0.sport) }) {
            switch done.sport {
            case "ride": out.append(L10n.tr("Jak se mi povedla dnešní jízda?"))
            case "run": out.append(L10n.tr("Jak se mi povedl dnešní běh?"))
            default: out.append(L10n.tr("Jak se mi povedla dnešní posilovna?"))
            }
            out.append(L10n.tr("Co mám dát zítra?"))
            out.append(L10n.tr("Co sníst po tréninku?"))
        }
        if let zone = today?.readiness.zone, zone == "red" || zone == "yellow" {
            out.append(L10n.tr("Proč mám nízkou připravenost?"))
            if sessions.contains(where: { $0.date == date && $0.status == "planned" }) { out.append(L10n.tr("Mám dnešní trénink zkrátit?")) }
            out.append(L10n.tr("Necítím se dobře, uprav mi týden."))
        }
        if let key = sessions.first(where: { $0.date == tomorrow && $0.status == "planned" && hard($0) }) {
            out.append(L10n.f("Jak na zítřejší %@?", key.title))
            out.append(L10n.tr("Co sníst dnes večer?"))
        }
        for q in fallback.map(L10n.tr) where !out.contains(q) { out.append(q) }
        var seen = Set<String>()
        return Array(out.filter { seen.insert($0).inserted }.prefix(3))
    }

    /// A long or intense session: the night before it matters.
    static func hard(_ s: WeekSession) -> Bool {
        if (s.tss ?? 0) >= 80 || (s.minutes ?? 0) >= 120 { return true }
        let name = s.title.lowercased()
        return ["vo2", "práh", "prah", "interval", "sweet spot", "threshold", "tempo", "závod", "race", "dlouh", "long"].contains { name.contains($0) }
    }
}
