import SwiftUI

// The coach beyond the chat: the morning check-in, the review after a
// workout, the review of a day and the records.

// MARK: - Check-in

/// The coach speaks first when several signs say the body needs a break.
struct CoachCheckInCard: View {
    @Environment(AppModel.self) private var model
    var openCoach: () -> Void = {}
    @State private var advice: CoachCheckIn.Advice?

    var body: some View {
        // A stack, not a Group: on an empty Group the task never runs.
        VStack(spacing: 0) {
            if let advice {
                Card {
                    WidgetHeader(title: "Kouč", color: Palette.amberBar)
                    if let headline = advice.headline {
                        Text(headline).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(advice.reasons ?? [], id: \.self) { reason in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•").foregroundStyle(Palette.faint)
                            Text(reason).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if let message = advice.message {
                        Text(message).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: 10) {
                        PrimaryButton(title: "Probrat", systemImage: "bubble.left.and.text.bubble.right", action: openCoach)
                        SecondaryButton(title: "Teď ne") { Task { await dismiss(advice) } }
                    }
                }
            }
        }
        .task {
            guard !model.demo else { return }
            advice = try? await model.api.coachCheckIn()
        }
    }

    private func dismiss(_ advice: CoachCheckIn.Advice) async {
        withAnimation { self.advice = nil }
        if let id = advice.id { try? await model.api.dismissAdvice(id: id) }
    }
}

// MARK: - Revize po tréninku

/// After a finished ride or run the coach says how it went and proposes
/// changes to the next sessions; they change only with "Upravit".
struct WeekRevisionCard: View {
    @Environment(AppModel.self) private var model
    @State private var revision: WeekRevision?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        // A stack, not a Group: on an empty Group the task never runs.
        VStack(spacing: 0) {
            if let revision, let summary = revision.summary {
                let changes = revision.changes ?? []
                let applied = revision.status == "applied"
                Card {
                    HStack(spacing: 7) {
                        Image(systemName: changes.isEmpty || applied ? "checkmark.circle.fill" : "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(changes.isEmpty || applied ? Palette.green : Palette.amber)
                        Text("Revize po tréninku").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                    }
                    Text(summary).font(Typo.sentence(19)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    ForEach(changes) { change in row(change, applied: applied) }
                    if let error {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                    }
                    if applied {
                        if changes.contains(where: { $0.applied == true }) {
                            Label("Upraveno i v kalendáři", systemImage: "calendar.badge.checkmark").font(Typo.small).foregroundStyle(Palette.green)
                        }
                    } else if !changes.isEmpty {
                        HStack(spacing: 10) {
                            SecondaryButton(title: "Nechat") { Task { await decide(revision, apply: false) } }
                            PrimaryButton(title: busy ? "Upravuji…" : "Upravit", busy: busy) { Task { await decide(revision, apply: true) } }
                        }
                        .disabled(busy || model.demo)
                    }
                }
            }
        }
        .task {
            guard !model.demo else { return }
            revision = try? await model.api.weekRevision()
        }
    }

    private func row(_ c: WeekRevision.Change, applied: Bool) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(Fmt.capitalized(Fmt.weekdayShort(c.date))).font(Typo.small.weight(.medium)).foregroundStyle(Palette.muted).frame(width: 30, alignment: .leading)
            Image(systemName: c.sport == "run" ? "figure.run" : "bicycle").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.amber)
                .frame(width: 30, height: 30).background(Palette.amberSoft, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.line(c.from)).font(Typo.small).foregroundStyle(Palette.faint).strikethrough()
                Text(Self.line(c.to)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            }
            Spacer(minLength: 0)
            if applied && c.applied == false {
                Image(systemName: "exclamationmark.circle").foregroundStyle(Palette.rust)
                    .accessibilityLabel(L10n.tr("Tento trénink se nepodařilo změnit."))
            }
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }

    private static func line(_ side: WeekRevision.Side?) -> String {
        [side?.name, side?.minutes.map { Fmt.duration($0) }].compactMap { $0 }.joined(separator: " · ")
    }

    private func decide(_ r: WeekRevision, apply: Bool) async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            let next = try await model.api.decideRevision(date: r.date, apply: apply)
            withAnimation { revision = apply ? next : nil }
            if apply {
                await model.refreshTraining()
                if next?.changes?.contains(where: { $0.applied == false }) == true {
                    error = L10n.tr("Některý trénink se mezitím změnil, ten zůstal beze změny.")
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Review of a day

/// "Posoudit den": the AI reads the day's plan, readiness and load and says
/// whether to keep it, and what to change and why.
struct DayReviewView: View {
    @Environment(AppModel.self) private var model
    var date = AppModel.localDate(Date())
    @State private var review: DayReviewResponse.Review?
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: "Kouč") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: L10n.tr("Kouč") + " · " + Fmt.dayHeading(date)).padding(.top, 24)
                if loading {
                    HStack(spacing: 8) { ProgressView(); Text("Kouč čte tvůj den…").font(Typo.small).foregroundStyle(Palette.muted) }.padding(.top, 30)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let review {
                    content(review)
                }
            }
        }
        .task { if review == nil { await load() } }
    }

    @ViewBuilder
    private func content(_ review: DayReviewResponse.Review) -> some View {
        if let verdict = review.verdict {
            Pill(text: Self.verdictLabel(verdict), foreground: verdict == "go" ? Palette.green : Palette.amber,
                 background: verdict == "go" ? Palette.greenSoft : Palette.amberSoft)
                .padding(.top, 12)
        }
        if let headline = review.headline {
            Text(headline).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
        }
        if let reasons = review.reasons, !reasons.isEmpty {
            SectionLabel(text: "Proč").padding(.top, 22)
            ForEach(reasons, id: \.self) { r in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•").foregroundStyle(Palette.faint)
                    Text(r).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 6)
            }
        }
        if let changes = review.changes, !changes.isEmpty {
            SectionLabel(text: "Co změnit").padding(.top, 22)
            VStack(spacing: 10) {
                ForEach(changes, id: \.self) { change in
                    Card {
                        if let what = change.what { Text(what).font(Typo.bodyStrong).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true) }
                        if let why = change.why { Text(why).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
                    }
                }
            }
            .padding(.top, 8)
        }
        if let missing = review.missing?.nilIfBlank {
            Text(missing).font(Typo.caption).foregroundStyle(Palette.faint).fixedSize(horizontal: false, vertical: true).padding(.top, 16)
        }
    }

    static func verdictLabel(_ verdict: String) -> String {
        ["go": "Jak je v plánu", "keep": "Jak je v plánu", "adjust": "Upravit", "modify": "Upravit", "easier": "Ubrat", "rest": "Odpočinek", "swap": "Vyměnit"][verdict].map { L10n.tr($0) } ?? Fmt.capitalized(verdict)
    }

    private func load() async {
        guard !model.demo else { error = "V ukázce kouč den nehodnotí."; return }
        loading = true
        defer { loading = false }
        do { review = try await model.api.reviewDay(date: date); error = nil } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Records

/// Records and where the cardio went: the longest ride, the best power, the
/// fastest 5 km, the strongest lifts and the intensity split of the last weeks.
struct InsightsView: View {
    @Environment(AppModel.self) private var model
    @State private var insights: FitnessInsights?
    @State private var sides: [GymSideBalance.Item] = []
    @State private var error: String?

    private static let cardio: [(String, String)] = [
        ("longestRide", "Nejdelší jízda"), ("longestRideTime", "Nejdelší jízda časem"), ("mostElevation", "Nejvíc nastoupáno"),
        ("bestRidePower", "Nejlepší výkon (20+ min)"), ("longestRun", "Nejdelší běh"), ("fastestRun5k", "Nejrychlejší tempo na 5+ km")
    ]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Rekordy a zaměření") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · rekordy").padding(.top, 24)
                Text("Rekordy a zaměření").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let insights {
                    if !sides.isEmpty { sidesLink.padding(.top, 20) }
                    content(insights)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .task {
            guard insights == nil else { return }
            guard !model.demo else { error = "V ukázce se rekordy nenačítají."; return }
            do { insights = try await model.api.fitnessInsights() } catch { self.error = error.localizedDescription }
            sides = (try? await model.api.gymSides())?.sides ?? []
        }
    }

    /// One-sided exercises: Levá a pravá strana (GymSides.swift).
    private var sidesLink: some View {
        NavigationLink { GymSidesView(items: sides) } label: {
            HStack(spacing: 12) {
                Image(systemName: "figure.strengthtraining.functional").font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.onAccent).frame(width: 34, height: 34)
                    .background(Palette.blue, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text("Levá a pravá strana").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer(minLength: 4)
                if let weak = sides.first(where: { $0.weaker != nil }) {
                    Text(verbatim: weak.exercise).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func content(_ insights: FitnessInsights) -> some View {
        if let focus = insights.cardioFocus, let p = focus.percent {
            SectionLabel(text: L10n.f("Intenzita za %@ dní", String(focus.days ?? 28))).padding(.top, 24)
            Card {
                GeometryReader { geo in
                    let total = max(1, (p.low ?? 0) + (p.high ?? 0) + (p.anaerobic ?? 0))
                    HStack(spacing: 2) {
                        Rectangle().fill(Palette.green).frame(width: geo.size.width * (p.low ?? 0) / total)
                        Rectangle().fill(Palette.amberBar).frame(width: geo.size.width * (p.high ?? 0) / total)
                        Rectangle().fill(Palette.rust).frame(width: geo.size.width * (p.anaerobic ?? 0) / total)
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 10)
                HStack {
                    legend("Nízká", p.low, Palette.green)
                    Spacer()
                    legend("Vysoká", p.high, Palette.amberBar)
                    Spacer()
                    legend("Anaerobní", p.anaerobic, Palette.rust)
                }
                if let minutes = focus.minutes, let count = focus.activities {
                    Text("\(count) " + Fmt.plural(count, "aktivita", "aktivity", "aktivit") + " · " + Fmt.duration(minutes))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            .padding(.top, 8)
        }

        let cardio = cardioRecords(insights)
        if !cardio.isEmpty {
            SectionLabel(text: "Vytrvalost za rok").padding(.top, 24)
            Card {
                ForEach(Array(cardio.enumerated()), id: \.offset) { index, item in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    recordRow(item.0, value: Self.format(item.1), detail: item.1.date.map { Fmt.dayHeading($0) })
                }
            }
            .padding(.top, 8)
        }

        let lifts = (insights.records?.strength ?? []).filter { $0.e1rm != nil || $0.heaviest != nil }.prefix(8)
        if !lifts.isEmpty {
            SectionLabel(text: "Síla").padding(.top, 24)
            Card {
                ForEach(Array(lifts.enumerated()), id: \.element.id) { index, lift in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    let best = lift.heaviest
                    recordRow(Fmt.capitalized(lift.exercise),
                              value: best?.value.map { Units.weightText($0) } ?? "–",
                              detail: lift.e1rm?.value.map { L10n.f("odhad 1RM %@", Units.weightText($0, digits: 0)) },
                              fresh: !(lift.recent ?? []).isEmpty)
                }
            }
            .padding(.top, 8)
        }
    }

    private func cardioRecords(_ insights: FitnessInsights) -> [(String, FitnessInsights.Record)] {
        guard let map = insights.records?.cardio else { return [] }
        return Self.cardio.compactMap { key, title in
            guard let value = map[key], let record = value else { return nil }
            return (title, record)
        }
    }

    private func legend(_ title: String, _ value: Double?, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(verbatim: L10n.tr(title) + " " + Fmt.int(value) + " %").font(Typo.caption).foregroundStyle(Palette.secondary)
        }
    }

    private func recordRow(_ title: String, value: String, detail: String?, fresh: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(title).font(Typo.body).foregroundStyle(Palette.ink)
                    if fresh { Pill(text: "nový", foreground: Palette.green, background: Palette.greenSoft) }
                }
                if let detail { Text(detail).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            Text(value).font(Typo.number(20)).foregroundStyle(Palette.ink)
        }
        .padding(.vertical, 4)
    }

    private static func format(_ record: FitnessInsights.Record) -> String {
        guard let value = record.value else { return "–" }
        switch record.unit {
        case "s/km": return Units.paceText(value)
        case "km": return Units.distanceText(value)
        case "h": return Fmt.duration(Int(value * 60))
        case let unit?: return Fmt.decimal(value, digits: value.rounded() == value ? 0 : 1) + " " + unit
        case nil: return Fmt.decimal(value)
        }
    }
}
