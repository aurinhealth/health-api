import SwiftUI

// The coach beyond the chat: the morning
// check-in, the review of a day and the records.

// MARK: - Check-in

/// The coach speaks first when several signs say the body needs a break.
struct CoachCheckInCard: View {
    @Environment(AppModel.self) private var model
    var openCoach: () -> Void = {}
    @State private var advice: CoachCheckIn.Advice?

    var body: some View {
        Group {
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
        DetailScreen(glow: Palette.Glow.today) {
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
    @State private var error: String?

    private static let cardio: [(String, String)] = [
        ("longestRide", "Nejdelší jízda"), ("longestRideTime", "Nejdelší jízda časem"), ("mostElevation", "Nejvíc nastoupáno"),
        ("bestRidePower", "Nejlepší výkon (20+ min)"), ("longestRun", "Nejdelší běh"), ("fastestRun5k", "Nejrychlejší tempo na 5+ km")
    ]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · rekordy").padding(.top, 24)
                Text("Rekordy a zaměření").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if let insights {
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
        }
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
