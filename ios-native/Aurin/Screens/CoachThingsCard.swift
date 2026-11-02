import SwiftUI

// One coach card on Today (Petr, 2026-11-02): the check-in, the review after a
// workout, the week check, the threshold test and the plan's proposal used to
// be five cards one under another. Now "Coach · 3 things today": the most
// important one open at the top, the others as rows. A tap opens a row in the
// card with the same texts and buttons; a thing answered goes and the next
// one moves up. A number (FTP) still changes only with Uložit.

/// What the coach asks on Today, loaded by CoachThingsCard and changed by the
/// answers in it.
@MainActor @Observable
final class CoachThings {
    var advice: CoachCheckIn.Advice?
    /// After "Přepnout na Nemoc": until when, and how many sessions went.
    var switched: Switched?
    var revision: WeekRevision?
    var check: WeekCheck?
    var threshold: ThresholdCheck?

    struct Switched: Equatable {
        let until: String?
        let cancelled: Int
    }

    /// How long an answered thing shows its confirmation ("Upraveno i v
    /// kalendáři") before it goes and the next one moves up.
    static let settleDelay: Duration = .seconds(2.5)
}

/// A card's content as it is, or (plain) the same stack without the card, for
/// a thing inside the coach's card.
struct MaybeCard<Content: View>: View {
    var plain: Bool
    @ViewBuilder var content: Content

    var body: some View {
        if plain {
            VStack(alignment: .leading, spacing: 12) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Card { content }
        }
    }
}

struct CoachThingsCard: View {
    @Environment(AppModel.self) private var model
    /// The plan's question (a missed session, last week again), from Today's snapshot.
    let proposal: TodaySnapshot.PlanProposal?
    var openCoach: () -> Void = {}
    /// The gap above the card, only while it shows.
    var top: CGFloat = 0
    @State private var things = CoachThings()
    /// The thing opened by a tap; nil (or a thing gone) shows the first one open.
    @State private var open: String?
    @ScaledMetric(relativeTo: .caption) private var labelWidth: CGFloat = 104

    struct Item: Identifiable {
        let id: String
        /// The row's small label: "Check-in", "This week", "FTP".
        let label: String
        /// The row's one line.
        let summary: String
        let content: AnyView
    }

    var body: some View {
        let items = self.items
        // A stack, not a Group: on an empty Group the tasks never run.
        VStack(spacing: 0) {
            if !items.isEmpty {
                Card {
                    header(count: items.count)
                    if let opened = items.first(where: { $0.id == open }) {
                        ForEach(items) { item in
                            if item.id == opened.id { expanded(item) } else { row(item) }
                        }
                    } else {
                        items[0].content
                        ForEach(items.dropFirst()) { row($0) }
                    }
                }
                .padding(.top, top)
            }
        }
        // Each asks the server on its own, so a slow one does not hold the others.
        .task {
            guard !model.demo else { return }
            things.advice = try? await model.api.coachCheckIn()
        }
        .task {
            guard !model.demo else { return }
            // One decided earlier showed its confirmation then; only an open one comes back.
            let revision = try? await model.api.weekRevision()
            things.revision = revision?.status == "applied" ? nil : revision
        }
        .task {
            guard !model.demo else { return }
            let check = try? await model.api.weekCheck()
            things.check = check?.status == "applied" ? nil : check
        }
        .task {
            guard !model.demo else { return }
            if let kept = ThresholdCheckMemory.kept, Date().timeIntervalSince(kept.at) < 15 * 60 { things.threshold = kept.check; return }
            let fresh = try? await model.api.thresholdCheck()
            things.threshold = fresh
            if fresh != nil { ThresholdCheckMemory.kept = (fresh, Date()) }
        }
    }

    /// In the order they matter: the body first, then the workout just done,
    /// the week's calendar, the threshold and the plan.
    private var items: [Item] {
        var out: [Item] = []
        if things.switched != nil || things.advice != nil {
            let summary = things.switched != nil
                ? L10n.tr("Stav Nemoc")
                : things.advice?.headline ?? things.advice?.message ?? things.advice?.reasons?.first ?? ""
            out.append(Item(id: "check-in", label: L10n.tr("Kouč se ptá"), summary: summary,
                            content: AnyView(CoachCheckInCard(things: things, openCoach: openCoach))))
        }
        if let revision = things.revision, let summary = revision.summary {
            out.append(Item(id: "revision", label: L10n.tr("Po tréninku"), summary: summary,
                            content: AnyView(WeekRevisionCard(things: things))))
        }
        if let check = things.check, !(check.changes ?? []).isEmpty {
            out.append(Item(id: "week-check", label: L10n.tr("Tento týden"), summary: check.summary ?? L10n.tr("Kontrola týdne"),
                            content: AnyView(WeekCheckCard(things: things))))
        }
        for entry in ThresholdCheckCard.entries(things.threshold) {
            let card = ThresholdCheckCard(entry: entry, things: things)
            let summary = card.summary
            // A result with no value has nothing to save (the card showed nothing for it).
            guard !summary.isEmpty else { continue }
            // By sport: an opened FTP stays open from the offer to the planned test and its result.
            out.append(Item(id: "threshold." + entry.sport, label: card.label, summary: summary, content: AnyView(card)))
        }
        if let proposal {
            out.append(Item(id: "plan", label: L10n.tr("Plán"), summary: proposal.text,
                            content: AnyView(PlanProposalCard(proposal: proposal, plain: true).id(proposal.type + proposal.text))))
        }
        return out
    }

    private func header(count: Int) -> some View {
        let title = count > 1 ? L10n.tr("Kouč") + " · " + L10n.plural("%lld věcí dnes", count) : L10n.tr("Kouč")
        return HStack(spacing: 6) {
            Image(systemName: "sparkles").scaledFont(12, weight: .semibold)
            Text(verbatim: title.uppercased(with: Fmt.locale)).font(.caption.weight(.semibold)).tracking(1.2)
        }
        .foregroundStyle(Palette.indigo)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func caps(_ text: String) -> Text {
        Text(verbatim: text.uppercased(with: Fmt.locale)).font(.caption.weight(.medium)).tracking(1.2)
    }

    /// A closed thing: its label and one line; a tap opens it here.
    private func row(_ item: Item) -> some View {
        Button { withAnimation(.snappy) { open = item.id } } label: {
            HStack(alignment: .center, spacing: 12) {
                caps(item.label).foregroundStyle(Palette.muted)
                    .lineLimit(2)
                    .frame(width: labelWidth, alignment: .leading)
                Text(verbatim: item.summary).font(Typo.body).foregroundStyle(Palette.ink)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
            }
            .padding(.top, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text(verbatim: L10n.tr("Rozbalit")))
    }

    /// An opened thing: its label (a tap closes it) and the whole content.
    private func expanded(_ item: Item) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { withAnimation(.snappy) { open = nil } } label: {
                HStack {
                    caps(item.label).foregroundStyle(Palette.indigo)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.up").font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted)
                }
                .padding(.top, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text(verbatim: L10n.tr("Sbalit")))
            item.content
        }
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }
}
