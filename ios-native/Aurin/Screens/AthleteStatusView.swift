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
            .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.f("Stav sportovce: %@, %@", kind.title, AthleteStatusSheet.untilText(status.statusUntil)))
        .sheet(isPresented: $editing) { AthleteStatusSheet(current: status) }
    }
}

/// The first row of Today's weather card: the state's icon and name in its colour,
/// then for a state other than Aktivní how long it lasts ("do 17. 10.",
/// "do změny") and an injury's note. No frame; a tap changes it.
struct AthleteStatusRow: View {
    @Environment(AppModel.self) private var model
    @State private var editing = false

    var body: some View {
        let status = model.athleteStatus ?? .active
        let kind = AthleteStatusKind.from(status.status)
        Button { editing = true } label: {
            HStack(spacing: 8) {
                // The state's icon, not a dot: a coloured dot read as "live".
                Image(systemName: kind.symbol).scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(kind.color)
                    .frame(width: 18)
                Text(kind.title).font(.subheadline.weight(.semibold)).foregroundStyle(kind.color)
                if let detail = Self.detail(status, kind) {
                    Text(verbatim: "· " + detail).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 8)
                // It opens a choice below, not a page: a quiet downward chevron.
                Image(systemName: "chevron.down").scaledFont(10, weight: .semibold).foregroundStyle(Palette.faint.opacity(0.7))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.f("Stav sportovce: %@, %@", kind.title, AthleteStatusSheet.untilText(status.statusUntil)))
        .sheet(isPresented: $editing) { AthleteStatusSheet(current: status) }
    }

    /// "koleno · do 20. 10.", "do změny"; nil while active.
    static func detail(_ status: AthleteStatus, _ kind: AthleteStatusKind) -> String? {
        guard kind != .active else { return nil }
        let until = status.statusUntil.map { L10n.f("do %@", Fmt.dayMonth(ISODay.shift($0, -1))) } ?? L10n.tr("do změny")
        let note = kind == .injured ? status.note?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfBlank : nil
        return [note, until].compactMap { $0 }.joined(separator: " · ")
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

    var body: some View {
        NavigationStack {
            PageScroll {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(AthleteStatusKind.allCases) { option in
                        Button { kind = option } label: {
                            HStack(spacing: 12) {
                                Image(systemName: option.symbol)
                                    .scaledFont(16, weight: .semibold, cap: .denseCap)
                                    .foregroundStyle(Palette.onAccent)
                                    .frame(width: 40, height: 40)
                                    .background(option.color, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.title).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                                    Text(option.subtitle).font(.footnote).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                                Image(systemName: kind == option ? "largecircle.fill.circle" : "circle")
                                    .scaledFont(20).foregroundStyle(kind == option ? Palette.ink : Palette.faint)
                            }
                            .padding(12)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(kind == option ? Palette.ink.opacity(0.25) : .clear, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(kind == option ? .isSelected : [])
                    }

                    if kind != .active {
                        HStack {
                            Label("Ponechat stav", systemImage: "clock.arrow.circlepath").font(.subheadline).foregroundStyle(Palette.ink)
                            Spacer()
                            Menu {
                                ForEach(Self.durations, id: \.label) { d in Button(L10n.tr(d.label)) { days = d.days } }
                            } label: {
                                HStack(spacing: 4) {
                                    Text(durationLabel).font(.subheadline).foregroundStyle(Palette.muted)
                                    Image(systemName: "chevron.up.chevron.down").scaledFont(10).foregroundStyle(Palette.faint)
                                }
                            }
                        }
                        .padding(.horizontal, 14).frame(minHeight: 48)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .padding(.top, 6)
                        if kind == .injured {
                            TextField("Co tě omezuje, třeba „bolí koleno, žádné skoky“", text: $note, axis: .vertical)
                                .lineLimit(2...4)
                                .padding(14)
                                .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }

                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    PrimaryButton(title: saving ? "Ukládám…" : "Uložit", busy: saving) { Task { await save() } }
                        .disabled(saving || !changed)
                        .opacity(changed ? 1 : 0.5)
                        .padding(.top, 8)
                }
                .padding(20)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
            }
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle("Stav sportovce")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").scaledFont(14, weight: .semibold) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
        // Only as tall as the choice (plus the title bar), not the whole screen.
        .presentationDetents([.height(contentHeight + 64)])
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
