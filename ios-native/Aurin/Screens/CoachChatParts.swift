import SwiftUI

// Coach chat parts of the redesign (concept 09-kouc-chat, part C): the
// coach's words bare on the background under the two lights, the athlete's
// words in a quiet grey bubble, the opening with the day, the prompts above
// the field and the app's own lines (the week's messages, offline, an error)
// in its own voice, not the coach's.

/// The athlete's message: a grey bubble on the right, its last corner tight.
struct CoachUserBubble<Content: View>: View {
    @ViewBuilder var content: Content

    private var shape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: 22, bottomLeadingRadius: 22, bottomTrailingRadius: 7, topTrailingRadius: 22, style: .continuous)
    }

    var body: some View {
        content
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 16).padding(.vertical, 11)
            .background(Palette.ink.opacity(0.05), in: shape)
            .overlay(shape.strokeBorder(Palette.ink.opacity(0.08), lineWidth: 1))
    }
}

/// The coach's words: no bubble, the two lights above them.
struct CoachWords: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            TwoLights(size: 20)
                .padding(.leading, -3)
            CoachMarkdown(text: text).equatable()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A line of the app itself in the chat (the week's messages, offline):
/// small, grey and centred, without the coach's symbol.
struct CoachSystemLine: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .font(Typo.small).foregroundStyle(Palette.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
    }
}

/// The open chat before the first message: the coach's greeting (the
/// approved serif exception, the question in green italic) and the day.
struct CoachOpening: View {
    /// The server's line about the day ("Morning run is done, upper body is on tonight.").
    let headline: String?
    let sessions: [WeekSession]
    /// Opened from a detail: what it is about, instead of the day.
    let subject: CoachSubject?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TwoLights(size: 24).padding(.leading, -4).padding(.bottom, 4)
            VStack(alignment: .leading, spacing: 8) {
                if let headline, !headline.isEmpty {
                    Text(verbatim: headline).font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                }
                Text("Co potřebuješ?").font(Typo.sentenceItalic(28, relativeTo: .title)).foregroundStyle(Palette.green)
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("coach.opening")
            if let subject {
                CoachSubjectCard(subject: subject).padding(.top, 22)
            } else {
                SectionLabel(text: "Dnes").padding(.top, 26).padding(.leading, 8).padding(.bottom, 10)
                CoachTodayCard(sessions: sessions)
            }
        }
    }
}

/// TODAY on the opening: the day's workouts, done and planned, or a rest day.
struct CoachTodayCard: View {
    let sessions: [WeekSession]

    var body: some View {
        VStack(spacing: 0) {
            if sessions.isEmpty {
                row(symbol: "circle.fill", color: Palette.faint, title: L10n.tr("Den volna"), line: nil, minutes: nil, rest: true)
            }
            ForEach(Array(sessions.enumerated()), id: \.element.id) { i, s in
                if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 50) }
                row(symbol: SportIcon.symbol(s.sport == "gym" ? "strength" : s.sport, type: s.type), color: Palette.Sport.color(s.sport),
                    title: s.title, line: Self.line(s), minutes: s.minutes, rest: false)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .cardSurface(cornerRadius: 22)
    }

    private func row(symbol: String, color: Color, title: String, line: String?, minutes: Int?, rest: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .scaledFont(rest ? 8 : 15, weight: .semibold, cap: .denseCap)
                .foregroundStyle(color)
                .frame(width: 36, height: 36)
                .background(color.opacity(rest ? 0.12 : 0.14), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: title).font(Typo.body).foregroundStyle(Palette.ink)
                if let line { Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            if let minutes, minutes > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(verbatim: "\(minutes)").font(Typo.number(20)).foregroundStyle(Palette.ink)
                    Text("min").font(Typo.caption).foregroundStyle(Palette.muted)
                }
                .dynamicTypeSize(...DynamicTypeSize.denseCap)
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }

    /// "Done", "Done at 7:02", "Tonight at 17:30", "Planned", "Missed".
    static func line(_ s: WeekSession) -> String {
        let at = s.time.map { ClockText.format($0) }
        switch s.status {
        case "done": return at.map { L10n.f("Hotovo v %@", $0) } ?? L10n.tr("Hotovo")
        case "missed": return L10n.tr("Nesplněno")
        default: return at.map { L10n.f("V %@", $0) } ?? L10n.tr("Naplánováno")
        }
    }
}

/// The prompts above the field on the opening: one tap sends one.
struct CoachPrompts: View {
    let prompts: [String]
    var send: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(prompts, id: \.self) { prompt in
                Button { send(prompt) } label: {
                    Text(verbatim: prompt)
                        .font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.leading)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .frame(minHeight: 44)
                        .cardSurface(cornerRadius: 22)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The week's messages are used up: what still works, and more messages
/// when they are on sale. No number for the limit (Petr, step 5 decision 5).
struct CoachUsedUpCard: View {
    var more: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tvůj plán jede dál").font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
            Text("Co funguje i bez zpráv").font(Typo.caption).foregroundStyle(Palette.muted)
            Text("Karty kouče dál potvrdíš a plán na týden přijde jako obvykle.")
                .font(Typo.small).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            if let more {
                Button(action: more) {
                    Text("Získat další zprávy").font(.body.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(minHeight: 50)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 26)
    }
}

/// Under the athlete's message when no answer came: what happened and Try again.
struct CoachFailedLine: View {
    let text: String
    var retry: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: retry) {
                Text("Zkusit znovu").font(Typo.small.weight(.semibold)).foregroundStyle(Palette.ink)
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

/// One changed value on a coach card: the name, what it is now and what it
/// becomes ("Day  Sat 14  Sun 15"). Only rows that change are shown.
struct CoachChangeRow: Equatable {
    let name: String
    let now: String
    let new: String

    /// The rows a proposal changes, from the fields the server sends with it.
    static func rows(_ a: CoachAction) -> [CoachChangeRow] {
        let day = { (d: String) in Fmt.weekdayShort(d) + " " + Fmt.dayNumber(d) }
        switch a.type {
        case "move":
            guard let from = a.eventSnapshot?.date, let to = a.date, from != to else { return [] }
            return [CoachChangeRow(name: L10n.tr("Den"), now: day(from), new: day(to))]
        case "activity_time":
            guard let from = a.fromTime, let to = a.time else { return [] }
            return [CoachChangeRow(name: L10n.tr("Čas"), now: ClockText.format(from), new: ClockText.format(to))]
        case "activity_kcal":
            guard let to = a.kcal else { return [] }
            return [CoachChangeRow(name: L10n.tr("Kalorie"), now: a.fromKcal.map { Fmt.int($0) } ?? "–", new: Fmt.int(to))]
        case "gym_swap":
            guard let from = a.fromExercise, let to = a.toExercise else { return [] }
            return [CoachChangeRow(name: L10n.tr("Cvik"), now: from, new: to)]
        default: return []
        }
    }
}

/// NOW and NEW over the changed rows of a coach card.
struct CoachChangeTable: View {
    let rows: [CoachChangeRow]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Spacer()
                SectionLabel(text: "Teď")
                SectionLabel(text: "Nově").frame(minWidth: 56, alignment: .trailing)
            }
            .padding(.bottom, 4)
            .accessibilityHidden(true)
            ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(verbatim: row.name).font(Typo.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Text(verbatim: row.now).font(Typo.small).foregroundStyle(Palette.muted).multilineTextAlignment(.trailing)
                    Text(verbatim: row.new).font(Typo.heading(22)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.trailing)
                        .frame(minWidth: 56, alignment: .trailing)
                }
                .padding(.vertical, 9)
                .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(L10n.f("%@: teď %@, nově %@", row.name, row.now, row.new))
            }
        }
    }
}

/// "Plan around your knee?": the sports that load the sore part, each a
/// switch (ink disc with a tick when it rests); Confirm rests the ticked ones
/// while the coach remembers the pain (S3, T-KOUC-1).
struct PlanAroundBlock: View {
    let action: CoachAction
    @Binding var resting: Set<String>
    var decided: Bool

    /// The app's order of sports: Ride, Run, Swim, Gym.
    private var sports: [String] {
        let order = ["ride", "run", "swim", "gym", "strength"]
        return (action.sports ?? []).sorted { (order.firstIndex(of: $0) ?? 9) < (order.firstIndex(of: $1) ?? 9) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(verbatim: L10n.f(decided ? "Plánuji s ohledem na bolest %@" : "Plánovat s ohledem na bolest %@?", action.label ?? ""))
                .font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !decided {
                Text("Tyhle sporty si odpočinou, dokud to bolí:").font(Typo.small).foregroundStyle(Palette.secondary)
                HStack(spacing: 8) {
                    ForEach(sports, id: \.self) { sport in
                        let on = resting.contains(sport)
                        Button {
                            if on { resting.remove(sport) } else { resting.insert(sport) }
                        } label: {
                            VStack(spacing: 6) {
                                ZStack(alignment: .topTrailing) {
                                    Image(systemName: SportIcon.symbol(sport == "gym" ? "strength" : sport))
                                        .scaledFont(16, weight: .semibold, cap: .denseCap)
                                        .foregroundStyle(Palette.Sport.color(sport))
                                        .frame(width: 40, height: 40)
                                        .background(Palette.Sport.color(sport).opacity(0.14), in: Circle())
                                    if on {
                                        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.onButton)
                                            .frame(width: 20, height: 20).background(Palette.button, in: Circle())
                                            .offset(x: 6, y: -4)
                                    }
                                }
                                Text(verbatim: L10n.tr(Self.names[sport] ?? sport)).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink)
                                // The word says what the tick means, so an unticked sport never looks switched off.
                                Text(verbatim: on ? L10n.tr("Odpočívá") : L10n.tr("Jede dál")).font(Typo.caption).foregroundStyle(Palette.muted)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 10)
                            .background(Palette.ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L10n.tr(Self.names[sport] ?? sport))
                        .accessibilityValue(on ? L10n.tr("odpočívá") : L10n.tr("jede dál"))
                        .accessibilityAddTraits(.isButton)
                    }
                }
                Text(verbatim: summary).font(Typo.small).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "Běh si odpočine. Kolo jede dál.": what Confirm will do, live.
    private var summary: String {
        let rest = sports.filter { resting.contains($0) }.map { L10n.tr(Self.names[$0] ?? $0) }
        let go = sports.filter { !resting.contains($0) }.map { L10n.tr(Self.names[$0] ?? $0) }
        var parts: [String] = []
        if !rest.isEmpty { parts.append(L10n.f("Odpočívá: %@.", rest.joined(separator: ", "))) }
        if !go.isEmpty { parts.append(L10n.f("Jede dál: %@.", go.joined(separator: ", "))) }
        return parts.isEmpty ? L10n.tr("Vyber, co si odpočine.") : parts.joined(separator: " ")
    }

    static let names = ["ride": "Kolo", "run": "Běh", "swim": "Plavání", "gym": "Posilovna", "strength": "Posilovna"]
}
