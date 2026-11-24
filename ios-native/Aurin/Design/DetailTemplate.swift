import SwiftUI

/// The page of one value in the new design (redesign Z2): the page header
/// (PageHeader, 617 #14) pinned on top with back, the title centred in spaced
/// capitals and the coach with the "i" in one 44 pt row that stays while the
/// page scrolls, then the page. The sections build the page from the parts
/// below: SiblingCells, DetailHeadline, a Card with DetailChart, TrendTable and
/// HowMeasuredCard.
struct DetailTemplate<Content: View>: View {
    let title: String
    var glow: Color = Palette.Glow.health
    let coach: CoachEntry
    @ViewBuilder var content: Content
    @Environment(\.tabGlow) private var tabGlow
    @Environment(\.dismiss) private var dismiss

    init(title: String, glow: Color = Palette.Glow.health, coach: () -> CoachEntry, @ViewBuilder content: () -> Content) {
        self.title = title
        self.glow = glow
        self.coach = coach()
        self.content = content()
    }

    var body: some View {
        ZStack {
            ScreenBackground(glow: tabGlow ?? glow)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    BackSlot { dismiss() }
                    content
                }
                .padding(.horizontal, PageGrid.margin)
                .padding(.top, 24)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: title, pinTitle: true, spacedTitle: true, coach: coach) { dismiss() }
        .navBarVisibility(.hidden)
    }
}

/// The detail's top row: back, the centred title ("RESTING HR"), the trailing slot.
struct DetailTitleRow<Trailing: View>: View {
    let title: String
    var back: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        ZStack {
            Text(verbatim: L10n.tr(title).uppercased(with: Fmt.locale))
                .scaledFont(13, weight: .medium, cap: .denseCap)
                .tracking(3)
                .foregroundStyle(Palette.ink)
                .lineLimit(2).minimumScaleFactor(0.85)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 96)
                .accessibilityAddTraits(.isHeader)
            HStack {
                BackSlot(action: back)
                Spacer(minLength: 0)
                trailing
            }
        }
        .frame(minHeight: 44)
    }
}

/// One sibling of the page in the cells on top ("Resting HR 53 bpm"): a tap
/// switches the same page to it. A switch, not a widget: no dots, no
/// coloured borders, the chosen one outlined and named in the title.
struct SiblingCell: Identifiable, Equatable {
    let id: String
    let title: String
    let value: String
    var unit: String? = nil
    /// The state in words for VoiceOver ("in your usual range"); colour never carries it.
    var spokenState: String? = nil
}

struct SiblingCells: View {
    let cells: [SiblingCell]
    let selected: String
    let pick: (String) -> Void

    var body: some View {
        ScrollViewReader { reader in
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(cells) { cell in
                    let on = cell.id == selected
                    Button { pick(cell.id) } label: {
                        VStack(spacing: 2) {
                            Text(verbatim: L10n.tr(cell.title)).font(.caption)
                                .foregroundStyle(on ? Palette.ink : Palette.muted)
                                .lineLimit(1)
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                Text(verbatim: cell.value).font(Typo.number(24)).foregroundStyle(Palette.ink)
                                if let unit = cell.unit { Text(verbatim: L10n.tr(unit)).font(.caption2).foregroundStyle(Palette.faint) }
                            }
                            .lineLimit(1)
                        }
                        .frame(minWidth: 88)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Palette.track.opacity(0.6), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .strokeBorder(on ? Palette.ink : .clear, lineWidth: 1.5)
                        }
                        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel([L10n.tr(cell.title), cell.value + (cell.unit.map { " " + L10n.tr($0) } ?? ""), cell.spokenState].compactMap { $0 }.joined(separator: ", "))
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .id(cell.id)
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
        .padding(.horizontal, -16)
        // The chosen sibling in view, in the middle as in the concept.
        .onAppear { reader.scrollTo(selected, anchor: .center) }
        .onChange(of: selected) { withAnimation { reader.scrollTo(selected, anchor: .center) } }
        }
    }
}

/// A value against the athlete's usual range, as the server worked it out
/// (S1: within 1 SD "within", up to 2 SD "slightly", beyond "far"). Only
/// "in / above / below / far above / far below your usual range", never
/// normal, abnormal, high or low (plan, Health texts).
enum MetricState: Equatable {
    case within
    case off(above: Bool)
    case far(above: Bool)

    init?(state: String?, side: String?) {
        let above = side == "above"
        switch state {
        case "within": self = .within
        case "slightly": self = .off(above: above)
        case "far": self = .far(above: above)
        default: return nil
        }
    }

    var words: String {
        switch self {
        case .within: return L10n.tr("v tvém obvyklém rozmezí")
        case .off(let above): return L10n.tr(above ? "nad tvým obvyklým rozmezím" : "pod tvým obvyklým rozmezím")
        case .far(let above): return L10n.tr(above ? "hodně nad tvým obvyklým rozmezím" : "hodně pod tvým obvyklým rozmezím")
        }
    }

    var color: Color {
        switch self {
        case .within: return Palette.Status.good
        case .off: return Palette.Status.warn
        case .far: return Palette.Status.bad
        }
    }
}

/// The main number of a detail, centred: a label over it only when it says
/// something the title doesn't (a time window, "Last night"; Petr's rule
/// 2026-11-16), the serif number with its unit, the state in words and
/// colour, and the usual range.
struct DetailHeadline: View {
    var label: String? = nil
    let value: String
    var unit: String? = nil
    var state: MetricState? = nil
    /// "Usual range 50 to 56 bpm".
    var usual: String? = nil
    /// What VoiceOver says for the number when the digits read badly ("7 hours 12 minutes").
    var spoken: String? = nil

    var body: some View {
        VStack(spacing: 6) {
            if let label {
                Text(verbatim: L10n.tr(label)).font(Typo.body).foregroundStyle(Palette.muted)
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(verbatim: value).font(Typo.number(64)).foregroundStyle(Palette.ink)
                if let unit { Text(verbatim: L10n.tr(unit)).font(Typo.body).foregroundStyle(Palette.faint) }
            }
            .lineLimit(1).minimumScaleFactor(0.6)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken ?? (value + (unit.map { " " + L10n.tr($0) } ?? "")))
            if let state {
                Text(verbatim: state.words).font(Typo.bodyStrong).foregroundStyle(state.color)
            }
            if let usual {
                Text(verbatim: L10n.tr(usual)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .accessibilityElement(children: .combine)
    }
}

/// "How it's measured" at the bottom of a detail: a sentence, then rows such
/// as "Data from" and "Compared with" (VO2max, Petr decision 4).
struct HowMeasuredCard: View {
    let text: String
    var rows: [(String, String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(text: "Jak se to měří")
            Card {
                Text(verbatim: L10n.tr(text)).font(Typo.body).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(verbatim: L10n.tr(row.0)).font(Typo.body).foregroundStyle(Palette.muted)
                            Spacer(minLength: 12)
                            Text(verbatim: L10n.tr(row.1)).font(Typo.body).foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.trailing)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: L10n.tr(row.0)).font(Typo.body).foregroundStyle(Palette.muted)
                            Text(verbatim: L10n.tr(row.1)).font(Typo.body).foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}
