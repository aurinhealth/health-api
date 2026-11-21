import SwiftUI

/// Stav sportovce, as Bevel's Activity Status: one of four states, until
/// changed or for a while. Not active, the coach plans no regular training
/// and suggests rest (src/athlete-state.js, training-status.js).
enum AthleteStatusKind: String, CaseIterable, Identifiable {
    case active, sick, injured, on_break
    var id: String { rawValue }

    var title: String {
        switch self {
        case .active: return L10n.tr("Aktivní")
        case .sick: return L10n.tr("Nemoc")
        case .injured: return L10n.tr("Zranění")
        case .on_break: return L10n.tr("Pauza")
        }
    }

    /// One line under the state in the sheet, as Bevel's Activity Status has.
    var subtitle: String {
        switch self {
        case .active: return L10n.tr("Trénuješ a jsi v pořádku")
        case .sick: return L10n.tr("Odpočíváš, než se uzdravíš")
        case .injured: return L10n.tr("Zotavuješ se ze zranění")
        case .on_break: return L10n.tr("Dáváš si od tréninku volno")
        }
    }

    var symbol: String {
        switch self {
        case .active: return "figure.run"
        case .sick: return "bed.double.fill"
        case .injured: return "bandage.fill"
        case .on_break: return "beach.umbrella.fill"
        }
    }

    var color: Color {
        switch self {
        case .active: return Palette.green
        case .sick: return Palette.gold
        case .injured: return Palette.rust
        case .on_break: return Palette.blue
        }
    }

    static func from(_ value: String?) -> AthleteStatusKind { AthleteStatusKind(rawValue: value ?? "") ?? .active }
}

/// On Today under the date: the state and how long it lasts; a tap changes it.
struct AthleteStatusPill: View {
    @Environment(AppModel.self) private var model
    /// A small coloured tag (the weather card on Today) instead of the full pill.
    var compact = false
    @State private var editing = false

    var body: some View {
        let status = model.athleteStatus ?? .active
        let kind = AthleteStatusKind.from(status.status)
        if compact {
            Button { editing = true } label: {
                HStack(spacing: 5) {
                    Circle().fill(kind.color).frame(width: 7, height: 7)
                    Text(kind.title).font(.caption.weight(.semibold)).foregroundStyle(kind.color)
                }
                .padding(.horizontal, 10).frame(height: 26)
                .background(kind.color.opacity(0.14), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.f("Stav sportovce: %@, %@", kind.title, AthleteStatusSheet.untilText(status.statusUntil)))
            .sheet(isPresented: $editing) { AthleteStatusSheet(current: status) }
        } else {
            full(status, kind)
        }
    }

    private func full(_ status: AthleteStatus, _ kind: AthleteStatusKind) -> some View {
        Button { editing = true } label: {
            HStack(spacing: 10) {
                Image(systemName: kind.symbol)
                    .scaledFont(13, weight: .semibold, cap: .denseCap)
                    .foregroundStyle(Palette.onAccent)
                    .frame(width: 30, height: 30)
                    .background(kind.color, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 0) {
                    Text(kind.title).font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                    Text(AthleteStatusSheet.untilText(status.statusUntil)).font(.caption2).foregroundStyle(Palette.muted)
                }
                Image(systemName: "chevron.down").scaledFont(10, weight: .semibold).foregroundStyle(Palette.faint)
                    .padding(.leading, 4)
            }
            .padding(.leading, 6).padding(.trailing, 14).padding(.vertical, 6)
            .background(Palette.card, in: Capsule())
            .overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.f("Stav sportovce: %@, %@", kind.title, AthleteStatusSheet.untilText(status.statusUntil)))
        .sheet(isPresented: $editing) { AthleteStatusSheet(current: status) }
    }
}

/// On Today to the right of "Připravenost" (Petr, 2026-11-02), with the
/// weather capsule (`trailing`) at the right edge (weather concept round 4,
/// Petr 2026-11-13): the state's icon and name in its colour, never cut. An
/// injury's note takes a second line, under the first letter of the name when
/// it fits, else from under the icon, cut with "…" only after that. The note
/// never moves the number below; "until" is in the sheet and VoiceOver.
struct AthleteStatusRow<Trailing: View>: View {
    @Environment(AppModel.self) private var model
    /// The note only under a readiness number: a title without one (learning,
    /// no watch) sits where the note would.
    var showsNote = true
    @ViewBuilder var trailing: Trailing
    @State private var editing = false
    @ScaledMetric(relativeTo: .footnote) private var icon: CGFloat = 14
    /// The note's line under the 44 pt row.
    @ScaledMetric(relativeTo: .footnote) private var noteDrop: CGFloat = 34

    var body: some View {
        let status = model.athleteStatus ?? .active
        let kind = AthleteStatusKind.from(status.status)
        let note = Self.note(status, kind)
        HStack(alignment: .center, spacing: 8) {
            Button { editing = true } label: {
                HStack(spacing: 6) {
                    // The state's icon, not a dot: a coloured dot read as "live".
                    Image(systemName: kind.symbol).scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(kind.color)
                        .frame(width: icon)
                    Text(kind.title).font(.footnote.weight(.semibold)).foregroundStyle(kind.color)
                        .fixedSize()
                    // It opens a choice below, not a page: a quiet downward chevron.
                    Image(systemName: "chevron.down").scaledFont(9, weight: .semibold).foregroundStyle(Palette.faint.opacity(0.7))
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.f("Stav sportovce: %@, %@", [kind.title, note].compactMap { $0 }.joined(separator: ", "), AthleteStatusSheet.untilText(status.statusUntil)))
            trailing
        }
        // The note under the row, as wide as the row, outside its layout.
        .overlay(alignment: .topLeading) {
            if let note, showsNote {
                Button { editing = true } label: {
                    ViewThatFits(in: .horizontal) {
                        noteText(note).fixedSize().padding(.leading, icon + 6)
                        noteText(note).lineLimit(1).truncationMode(.tail)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
                .offset(y: noteDrop)
            }
        }
        .sheet(isPresented: $editing) { AthleteStatusSheet(current: status) }
    }

    private func noteText(_ note: String) -> some View {
        Text(verbatim: note).font(.footnote).foregroundStyle(Palette.muted)
    }

    /// An injury's note ("Left knee"); nil for the other states and without one.
    static func note(_ status: AthleteStatus, _ kind: AthleteStatusKind) -> String? {
        kind == .injured ? status.note?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfBlank : nil
    }
}

struct AthleteStatusSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let current: AthleteStatus
    @State private var kind: AthleteStatusKind = .active
    /// Days the status lasts; nil: until changed.
    @State private var days: Int?
    @State private var initialDays: Int?
    @State private var note = ""
    @State private var saving = false
    @State private var error: String?
    @State private var contentHeight: CGFloat = 480

    static let durations: [(days: Int?, label: String)] = [(nil, "Do změny"), (1, "1 den"), (3, "3 dny"), (7, "1 týden"), (14, "2 týdny")]

    /// Concept b-podstranky-03/04: the serif title on the left with a line
    /// under it and the close button on the right, the four states as rows of
    /// one card, the chosen one with a check disc.
    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Tvůj stav").font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                            .accessibilityAddTraits(.isHeader)
                        Text("Kouč podle něj plánuje.").font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                }
                .padding(.bottom, 6)

                VStack(spacing: 0) {
                    ForEach(Array(AthleteStatusKind.allCases.enumerated()), id: \.element) { i, option in
                        if i > 0 { Divider().overlay(Palette.hairline).padding(.leading, 64) }
                        row(option)
                    }
                }
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                if kind != .active {
                    Menu {
                        ForEach(Self.durations, id: \.label) { d in Button(L10n.tr(d.label)) { days = d.days } }
                    } label: {
                        HStack(spacing: 6) {
                            Text("Platí do").font(.subheadline).foregroundStyle(Palette.muted)
                            Spacer()
                            Text(durationLabel).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 48)
                        .background(Palette.card, in: Capsule())
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    if kind == .injured {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel(text: "Poznámka pro kouče")
                            TextField("Co tě omezuje, třeba „bolí koleno, žádné skoky“", text: $note, axis: .vertical)
                                .lineLimit(2...4)
                                .padding(12)
                                .background(Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .padding(14)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: saving ? "Ukládám…" : "Uložit", busy: saving) { Task { await save() } }
                    .disabled(saving || !changed)
                    .opacity(changed ? 1 : 0.5)
                    .padding(.top, 4)
            }
            .padding(20)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .background { Palette.background.ignoresSafeArea() }
        .tint(Palette.ink)
        // Only as tall as the choice, not the whole screen.
        .presentationDetents([.height(contentHeight + 24)])
        .presentationDragIndicator(.visible)
        .onAppear {
            kind = AthleteStatusKind.from(current.status)
            note = current.note ?? ""
            // A status set for a while keeps its end: days from today to it.
            let today = AppModel.localDate(Date())
            days = current.statusUntil.flatMap { until in (1...60).first { ISODay.shift(today, $0) == until } }
            initialDays = days
        }
    }

    /// One state: its icon in ink on a grey square, name and line, and a
    /// check disc when chosen.
    private func row(_ option: AthleteStatusKind) -> some View {
        let on = kind == option
        return Button { kind = option } label: {
            HStack(spacing: 12) {
                Image(systemName: option.symbol)
                    .scaledFont(15, weight: .medium, cap: .denseCap)
                    .foregroundStyle(Palette.ink)
                    .frame(width: 38, height: 38)
                    .background(Palette.track, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.title).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                    Text(option.subtitle).font(.footnote).foregroundStyle(Palette.muted)
                }
                Spacer()
                ZStack {
                    if on {
                        Circle().fill(Palette.ink)
                        Image(systemName: "checkmark").scaledFont(11, weight: .bold, cap: .denseCap).foregroundStyle(Palette.background)
                    } else {
                        Circle().stroke(Palette.faint, lineWidth: 1.5)
                    }
                }
                .frame(width: 24, height: 24)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// "1 týden", or "do 17. 10." for a length not in the menu.
    private var durationLabel: String {
        if let d = Self.durations.first(where: { $0.days == days }) { return L10n.tr(d.label) }
        return Self.untilText(days.map { ISODay.shift(AppModel.localDate(Date()), $0) })
    }

    private var changed: Bool {
        kind != AthleteStatusKind.from(current.status) || days != initialDays || note != (current.note ?? "")
    }

    /// "Do změny" or "do 17. 10." (the last day it applies).
    static func untilText(_ until: String?) -> String {
        guard let until else { return L10n.tr("Do změny") }
        return L10n.f("do %@", Fmt.dayMonth(ISODay.shift(until, -1)))
    }

    private func save() async {
        saving = true
        defer { saving = false }
        // The server wants the first day the status no longer applies.
        let until = kind == .active ? nil : days.map { ISODay.shift(AppModel.localDate(Date()), $0) }
        do {
            try await model.setAthleteStatus(kind.rawValue, until: until, note: kind == .injured ? note.trimmingCharacters(in: .whitespacesAndNewlines) : nil)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
