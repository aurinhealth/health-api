import SwiftUI

// The coach beyond the chat: the morning check-in, the review after a
// workout, the review of a day and the records.

// MARK: - Check-in

/// The coach speaks first when several signs say the body needs a break, when
/// several night values are outside the usual range (an easier day fits), or
/// when a pain it remembers may have passed, or when Nemoc or Zranění has been on for days. A thing in the coach's card on
/// Today (CoachThingsCard).
struct CoachCheckInCard: View {
    @Environment(AppModel.self) private var model
    let things: CoachThings
    var openCoach: () -> Void = {}
    @State private var swapError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let advice = things.advice {
                if let headline = advice.headline {
                    Text(headline).font(Typo.sentence(20)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                if advice.kind == "easier_day", let message = advice.message {
                    Text(message).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                // Each value against the usual, in ink: a description, never a warning (MDR).
                ForEach(advice.rows ?? []) { row in
                    HStack {
                        Text(row.label).font(Typo.small).foregroundStyle(Palette.secondary)
                        Spacer()
                        Text(row.value).font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink)
                    }
                    .padding(.vertical, 6)
                    .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                }
                ForEach(advice.reasons ?? [], id: \.self) { reason in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Palette.faint)
                        Text(reason).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if advice.kind != "easier_day", let message = advice.message {
                    Text(message).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                if advice.kind == "swap" || advice.kind == "easier_day", let from = advice.from, let to = advice.to {
                    let easier = advice.kind == "easier_day"
                    // "VO2max 5×4 · 75 min → Lehká jízda · 45 min", as the push offered it.
                    HStack(spacing: 8) {
                        if easier { Text("Dnes:").foregroundStyle(Palette.muted) }
                        Text(verbatim: from).strikethrough(!easier).foregroundStyle(Palette.muted)
                        Image(systemName: "arrow.right").font(.caption.weight(.semibold)).foregroundStyle(Palette.faint)
                        Text(verbatim: to).fontWeight(.semibold).foregroundStyle(Palette.ink)
                    }
                    .font(Typo.small)
                    .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        PrimaryButton(title: L10n.tr(easier ? "Ulehčit dnešek" : "Vyměnit")) { Task { await answerSwap(advice, swap: true) } }
                        SecondaryButton(title: easier ? "Nechat plán" : "Nechat") { Task { await answerSwap(advice, swap: false) } }
                    }
                    if let swapError {
                        Text(swapError).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                    }
                } else if advice.kind == "status_check" {
                    // Nemoc or Zranění for days without an end day: back to Active, or ask again in a few days.
                    HStack(spacing: 10) {
                        PrimaryButton(title: L10n.tr("Už jsem v pořádku")) { Task { await backToActive() } }
                        SecondaryButton(title: "Ještě ne") { Task { await dismiss(advice) } }
                    }
                    if let swapError {
                        Text(swapError).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                    }
                } else if advice.kind == "memory_check", let memory = advice.memory {
                    // A pain or an illness the coach remembers: still true, or forget it.
                    HStack(spacing: 10) {
                        PrimaryButton(title: L10n.tr("Už neplatí")) { Task { await settle(memory, keep: false) } }
                        SecondaryButton(title: "Pořád platí") { Task { await settle(memory, keep: true) } }
                    }
                } else {
                    HStack(spacing: 10) {
                        PrimaryButton(title: L10n.tr("Probrat"), systemImage: "bubble.left.and.text.bubble.right", action: openCoach)
                        SecondaryButton(title: "Teď ne") { Task { await dismiss(advice) } }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Vyměnit puts the easier session in the plan, Nechat keeps the plan.
    private func answerSwap(_ advice: CoachCheckIn.Advice, swap: Bool) async {
        guard let date = advice.date else { return }
        swapError = nil
        do {
            _ = try await model.api.answerCoachNudge(date: date, decision: swap ? "swap" : "keep")
            withAnimation { things.advice = nil }
            if swap { await model.refresh() }
        } catch {
            swapError = error.localizedDescription
        }
    }

    private func settle(_ memory: String, keep: Bool) async {
        withAnimation { things.advice = nil }
        if keep { _ = try? await model.api.keepMemory(memory) } else { _ = try? await model.api.forgetMemory(memory, toPast: true) }
    }

    /// "Už jsem v pořádku": Active again; the coach offers the cancelled sessions back.
    private func backToActive() async {
        swapError = nil
        do {
            try await model.setAthleteStatus("active", until: nil, note: nil)
            withAnimation { things.advice = nil }
        } catch {
            swapError = error.localizedDescription
        }
    }

    private func dismiss(_ advice: CoachCheckIn.Advice) async {
        withAnimation { things.advice = nil }
        if let id = advice.id { try? await model.api.dismissAdvice(id: id) }
    }
}

// MARK: - Revize po tréninku

/// After a finished ride or run the coach says how it went and proposes
/// changes to the next sessions; they change only with "Upravit". A thing in
/// the coach's card on Today (CoachThingsCard).
struct WeekRevisionCard: View {
    @Environment(AppModel.self) private var model
    let things: CoachThings
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let revision = things.revision, let summary = revision.summary {
                let changes = revision.changes ?? []
                let applied = revision.status == "applied"
                HStack(spacing: 7) {
                    Image(systemName: changes.isEmpty || applied ? "checkmark.circle.fill" : "sparkles")
                        .scaledFont(14, weight: .semibold)
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
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ c: WeekRevision.Change, applied: Bool) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(Fmt.capitalized(Fmt.weekdayShort(c.date))).font(Typo.small.weight(.medium)).foregroundStyle(Palette.muted).frame(width: 30, alignment: .leading)
            Image(systemName: c.sport == "run" ? "figure.run" : "bicycle").scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.amber)
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

    /// "Endurance · 90 min": a name that already ends in its minutes gets no second length.
    private static func line(_ side: WeekRevision.Side?) -> String {
        let named = side?.name?.range(of: #"·\s*\d+\s*min\s*$"#, options: .regularExpression) != nil
        return [side?.name, named ? nil : side?.minutes.map { Fmt.duration($0) }].compactMap { $0 }.joined(separator: " · ")
    }

    private func decide(_ r: WeekRevision, apply: Bool) async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            let next = try await model.api.decideRevision(date: r.date, apply: apply)
            withAnimation { things.revision = apply ? next : nil }
            if apply {
                await model.refreshTraining()
                if next?.changes?.contains(where: { $0.applied == false }) == true {
                    error = L10n.tr("Některé tréninky se nepodařilo změnit, zůstaly beze změny.")
                } else {
                    // "Upraveno i v kalendáři" for a moment, then the next thing moves up.
                    try? await Task.sleep(for: CoachThings.settleDelay)
                    if things.revision?.date == r.date { withAnimation(.snappy) { things.revision = nil } }
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
                    CoachThinking(text: L10n.tr("Kouč čte tvůj den…")).padding(.top, 24)
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
