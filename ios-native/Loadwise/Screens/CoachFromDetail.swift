import SwiftUI

/// What the athlete asks the coach about from a detail screen ("Zeptat se
/// kouče"): a done activity, a planned session, a gym exercise or a health
/// value. It goes to the server as appContext.subject
/// (src/assistant-app-context.js), which finds its numbers in storage; the
/// chat shows it on a card with questions to try.
struct CoachSubject: Equatable {
    enum Kind: String { case activity, planned, exercise, metric }
    let kind: Kind
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

    var appContext: JSONObject {
        var subject: JSONObject = ["kind": .string(kind.rawValue), "title": .string(title)]
        if let id { subject["id"] = .string(id) }
        if let metric { subject["metric"] = .string(metric) }
        var context: JSONObject = ["view": .string(view), "date": .string(date ?? AppModel.localDate(Date())), "subject": .object(subject)]
        if let sport { context["sport"] = .string(sport) }
        if let exercise { context["exercise"] = .string(exercise) }
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

    /// Režim tréninku → the exercise being done; `set` is the next set.
    static func exercise(_ exercise: GymExercise, set: GymSet?, date: String) -> CoachSubject {
        let work = exercise.sets.filter(\.work)
        var parts: [String?] = []
        if let set, set.work, let n = Int(set.number) {
            parts.append(L10n.f("Série %@ z %@", String(n), String(Set(work.map(\.number)).count)))
        }
        if let set, let kg = set.kg ?? set.plannedKg, let reps = set.reps ?? set.plannedReps, !kg.isEmpty, !reps.isEmpty {
            parts.append(kg + " kg × " + reps)
        }
        return CoachSubject(kind: .exercise, title: exercise.name, line: line(parts), date: date, sport: "gym", exercise: exercise.name,
                            view: "workouts", symbol: "dumbbell", color: Palette.indigo,
                            questions: ["Čím nahradit tenhle cvik?", "Bolí mě při něm, co místo něj?", "Kolik mám dát příště?"])
    }

    /// Zdraví → a value's detail; `low` when it is under the athlete's normal.
    static func metric(_ metric: HealthMetric, line: String?, low: Bool = false, date: String?) -> CoachSubject {
        let questions: [String]
        switch metric {
        case .hrv: questions = [low ? "Proč mám nízké HRV?" : "Co mi říká moje HRV?", "Mám dnes trénovat?", "Co s tím do večera?"]
        case .restingHR: questions = [low ? "Proč mám klidový tep výš než obvykle?" : "Co mi říká můj klidový tep?", "Mám dnes trénovat?", "Jak klidový tep snížit?"]
        case .respiration: questions = ["Co znamená můj dech ve spánku?", "Může to být začínající nemoc?", "Mám dnes trénovat?"]
        case .temperature: questions = ["Co znamená teplota zápěstí?", "Může to být začínající nemoc?", "Mám dnes trénovat?"]
        case .oxygen: questions = ["Je můj kyslík v krvi v pořádku?", "Co ho ovlivňuje?", "Mám dnes trénovat?"]
        case .bodyFat: questions = ["Jak se mi vyvíjí tělesný tuk?", "Jak upravit jídlo?", "Jak upravit trénink?"]
        case .muscle: questions = ["Jak se mi vyvíjí svalová hmota?", "Mám jíst víc bílkovin?", "Jak upravit posilovnu?"]
        }
        return CoachSubject(kind: .metric, title: L10n.tr(metric.title), line: line, metric: metric.rawValue, date: date, view: "health",
                            symbol: "waveform.path.ecg", color: Palette.green, questions: questions)
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
    @State private var open = false

    var body: some View {
        if !model.demo {
            Button { open = true } label: {
                Label("Kouč", systemImage: "sparkles")
                    .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.green)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(Palette.greenSoft, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("Zeptat se kouče"))
            .sheet(isPresented: $open) { CoachView(view: subject.view, date: subject.date, subject: subject) }
        }
    }
}

/// The round button beside an exercise in Režim tréninku.
struct CoachCircleButton: View {
    @Environment(AppModel.self) private var model
    let subject: CoachSubject
    @State private var open = false

    var body: some View {
        if !model.demo {
            Button { open = true } label: {
                Image(systemName: "sparkles").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.green)
                    .frame(width: 36, height: 36)
                    .overlay(Circle().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
            }
            .accessibilityLabel(L10n.tr("Zeptat se kouče"))
            .sheet(isPresented: $open) { CoachView(view: subject.view, date: subject.date, subject: subject) }
        }
    }
}

/// "Ptáš se na" on top of a chat opened from a detail.
struct CoachSubjectCard: View {
    let subject: CoachSubject

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: subject.symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(subject.color)
                .frame(width: 34, height: 34).background(subject.color.opacity(0.14), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text("Ptáš se na").font(Typo.caption).foregroundStyle(Palette.muted)
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
