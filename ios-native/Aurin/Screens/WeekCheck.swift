import SwiftUI

// "Kontrola týdne" (src/week-check.js): the coach weighs the athlete's state
// and the load ahead and proposes changes to the week: a session moved,
// cancelled, made easier or swapped for stretching. On Today it checks the
// calendar every morning (WeekCheckCard); in Plán týdne the week just built
// (WeekPlanView). Nothing changes until "Upravit"; "Nechat" keeps the plan.

struct WeekCheckResponse: Decodable {
    let check: WeekCheck?
}

struct WeekCheck: Decodable, Equatable {
    let date: String?
    /// "pending" or "applied" on Today; nil for a check of the week being built.
    let status: String?
    let summary: String?
    /// The state behind it: "Připravenost 52", "Forma v neděli −27".
    let chips: [String]?
    let changes: [Change]?

    struct Change: Decodable, Equatable, Identifiable {
        /// The calendar session ("planned:…") or the built session's key.
        let id: String
        let date: String
        let sport: String
        /// "move", "cancel", "ease" or "recovery" (stretching in its place).
        let type: String
        let from: Side?
        let to: Target?
        let applied: Bool?
    }

    struct Side: Decodable, Equatable {
        let name: String?
        let minutes: Int?

        enum CodingKeys: String, CodingKey { case name, minutes }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = try? c.decodeIfPresent(String.self, forKey: .name)
            minutes = (try? c.decodeIfPresent(Double.self, forKey: .minutes)).flatMap { $0 }.map { Int($0.rounded()) }
        }
    }

    struct Target: Decodable, Equatable {
        /// The day a moved session goes to.
        let date: String?
        /// The kind of an eased session (src/week-ai.js KINDS).
        let kind: String?
        let minutes: Int?
        /// The workout built for an eased calendar session.
        let name: String?

        enum CodingKeys: String, CodingKey { case date, kind, minutes, name }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = try? c.decodeIfPresent(String.self, forKey: .date)
            kind = try? c.decodeIfPresent(String.self, forKey: .kind)
            name = try? c.decodeIfPresent(String.self, forKey: .name)
            minutes = (try? c.decodeIfPresent(Double.self, forKey: .minutes)).flatMap { $0 }.map { Int($0.rounded()) }
        }
    }
}

extension APIClient {
    /// Today's check of the next seven days; nil when the week is fine.
    func weekCheck() async throws -> WeekCheck? {
        let r: WeekCheckResponse = try await get("/app/api/coach/week-check")
        return r.check
    }

    /// "Upravit" (apply) or "Nechat" (keep) on Today.
    func decideWeekCheck(date: String, apply: Bool) async throws -> WeekCheck? {
        let body: JSONObject = ["date": .string(date), "decision": .string(apply ? "apply" : "keep")]
        let r: WeekCheckResponse = try await send("/app/api/coach/week-check", method: "POST", body: body)
        return r.check
    }

    /// The check of a week built in Plán týdne before it is saved.
    func weekCheckDraft(start: String, sessions: [WeekSessionDraft]) async throws -> WeekCheck? {
        let list: [JSONValue] = sessions.filter { $0.built && ["ride", "run", "gym"].contains($0.sport) }.map { s in
            var x: JSONObject = ["key": .string(s.id.uuidString), "date": .string(s.date), "sport": .string(s.sport),
                                 "minutes": .number(Double(s.minutes)), "name": .string(s.title)]
            if let kind = s.kind { x["kind"] = .string(kind) }
            if let system = s.workout?.primary_system { x["system"] = .string(system) }
            if let role = s.role { x["role"] = .string(role) }
            return .object(x)
        }
        let body: JSONObject = ["start": .string(start), "sessions": .array(list)]
        let r: WeekCheckResponse = try await send("/app/api/coach/week-check/draft", method: "POST", body: body)
        return r.check
    }

    /// Stretching into a day's plan (not done yet).
    func addStretching(date: String) async throws {
        let body: JSONObject = ["date": .string(date), "kind": .string("stretch")]
        let _: JSONValue = try await send("/app/api/recovery", method: "POST", body: body)
    }
}

/// The card's content, the same on Today and in Plán týdne.
struct WeekCheckContent: View {
    let check: WeekCheck
    var today: String
    var applied = false
    var appliedText: String? = nil
    var busy = false
    var error: String? = nil
    var onKeep: () -> Void
    var onApply: () -> Void

    var body: some View {
        Card {
            HStack(spacing: 7) {
                Image(systemName: applied ? "checkmark.circle.fill" : "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(applied ? Palette.green : Palette.amber)
                Text("Kontrola týdne").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
            }
            if let summary = applied ? (appliedText ?? check.summary) : check.summary {
                Text(summary).font(Typo.sentence(19)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            }
            if !applied, let chips = check.chips, !chips.isEmpty {
                FlowChips(chips: chips)
            }
            if !applied {
                ForEach(check.changes ?? []) { change in row(change) }
            }
            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
            }
            if !applied {
                HStack(spacing: 10) {
                    SecondaryButton(title: "Nechat") { onKeep() }
                    PrimaryButton(title: busy ? "Upravuji…" : "Upravit", busy: busy) { onApply() }
                }
                .disabled(busy)
            }
        }
    }

    private func row(_ c: WeekCheck.Change) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(c.date == today ? L10n.tr("Dnes") : Fmt.weekdayShort(c.date)).font(Typo.small.weight(.medium)).foregroundStyle(Palette.muted)
                .frame(width: 38, alignment: .leading)
            Image(systemName: Self.symbol(c.sport)).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.amber)
                .frame(width: 30, height: 30).background(Palette.amberSoft, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text([c.from?.name, c.from?.minutes.map { Fmt.duration($0) }].compactMap { $0 }.joined(separator: " · "))
                    .font(Typo.small).foregroundStyle(Palette.faint).strikethrough().lineLimit(1)
                Text(Self.line(c)).font(Typo.bodyStrong).foregroundStyle(Self.tone(c)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if c.applied == false {
                Image(systemName: "exclamationmark.circle").foregroundStyle(Palette.rust)
                    .accessibilityLabel(L10n.tr("Tento trénink se nepodařilo změnit."))
            }
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }

    static func symbol(_ sport: String) -> String {
        ["ride": "bicycle", "run": "figure.run", "gym": "dumbbell.fill"][sport] ?? "figure.mixed.cardio"
    }

    /// What the session becomes, in the card's words.
    static func line(_ c: WeekCheck.Change) -> String {
        switch c.type {
        case "move": return L10n.f("Přesunout na %@", c.to?.date.map { Fmt.weekdayName($0) } ?? "")
        case "cancel": return L10n.tr("Zrušit")
        case "recovery": return L10n.f("Místo toho protažení · %@", Fmt.duration(c.to?.minutes ?? 12))
        default:
            let what = c.to?.name ?? c.to?.kind.flatMap { kindName($0) } ?? L10n.tr("Lehčí trénink")
            return [what, c.to?.minutes.map { Fmt.duration($0) }].compactMap { $0 }.joined(separator: " · ")
        }
    }

    static func kindName(_ kind: String) -> String? {
        ["recovery": "Regenerace", "endurance": "Vytrvalost", "long": "Dlouhý trénink", "tempo": "Tempo",
         "sweet_spot": "Sweet spot", "threshold": "Práh", "vo2max": "VO₂max"][kind].map { L10n.tr($0) }
    }

    private static func tone(_ c: WeekCheck.Change) -> Color {
        if c.type == "recovery" || (c.type == "ease" && c.to?.kind == "recovery") { return Palette.green }
        return c.type == "cancel" ? Palette.amber : Palette.ink
    }
}

/// The state behind the check as small capsules, wrapping to the next line.
private struct FlowChips: View {
    let chips: [String]

    var body: some View {
        WrapLayout(spacing: 6) {
            ForEach(chips, id: \.self) { chip in
                Text(chip).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.amber)
                    .padding(.horizontal, 10).frame(height: 26)
                    .background(Palette.hairline, in: Capsule())
            }
        }
    }
}

/// Lays its views out in rows, starting a new row when one is full.
private struct WrapLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { y += row + spacing; x = 0; row = 0 }
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { y += row + spacing; x = bounds.minX; row = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
    }
}

/// On Today: the morning check of the calendar. It shows only when the coach
/// proposes a change, and for an hour after "Upravit".
struct WeekCheckCard: View {
    @Environment(AppModel.self) private var model
    @State private var check: WeekCheck?
    @State private var busy = false
    @State private var error: String?
    var top: CGFloat = 0

    var body: some View {
        // A stack, not a Group: on an empty Group the task never runs.
        VStack(spacing: 0) {
            if let check, !(check.changes ?? []).isEmpty {
                let applied = check.status == "applied"
                WeekCheckContent(check: check, today: AppModel.localDate(Date()), applied: applied,
                                 appliedText: applied ? appliedText(check) : nil, busy: busy, error: error,
                                 onKeep: { Task { await decide(check, apply: false) } },
                                 onApply: { Task { await decide(check, apply: true) } })
                    .disabled(model.demo)
                    .padding(.top, top)
            }
        }
        .task {
            guard !model.demo else { return }
            check = try? await model.api.weekCheck()
        }
    }

    private func appliedText(_ c: WeekCheck) -> String {
        (c.changes ?? []).contains(where: { $0.applied == false })
            ? L10n.tr("Některé tréninky se nepodařilo změnit, zůstaly beze změny.")
            : L10n.tr("Upraveno i v kalendáři.")
    }

    private func decide(_ c: WeekCheck, apply: Bool) async {
        guard let date = c.date else { return }
        busy = true
        defer { busy = false }
        error = nil
        do {
            let next = try await model.api.decideWeekCheck(date: date, apply: apply)
            withAnimation { check = apply ? next : nil }
            if apply {
                await model.refreshTraining()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
