import SwiftUI

// MARK: - Plan colours

/// How a session of the week stands against the plan (Training → Tréninky
/// týdne). The server sends adherence for the done ones (src/app-training.js):
/// "good" within 85–115 % of the plan, with the percent itself (compliance).
enum PlanState: CaseIterable {
    case good, off, missed, upcoming, offPlan

    init(_ session: WeekSession) {
        if session.status == "missed" {
            self = .missed
        } else if session.status != "done" {
            self = .upcoming
        } else if session.adherence == "off" {
            self = .off
        } else if session.adherence == "offplan" {
            self = .offPlan
        } else {
            self = .good
        }
    }

    /// A whole day of the training calendar, from the server's state for it
    /// (src/app-training.js dayPlanState); nil for a day without sessions.
    init?(day: CalendarDay?) {
        guard let day else { return nil }
        switch day.plan {
        case "good": self = .good
        case "off": self = .off
        case "missed": self = .missed
        case "planned": self = .upcoming
        case "offplan": self = .offPlan
        default:
            // An older server sends no state: done counts as outside the plan.
            if day.count > 0 {
                self = .offPlan
            } else if day.planned > 0 {
                self = .upcoming
            } else {
                return nil
            }
        }
    }

    var color: Color {
        switch self {
        case .good: return Palette.green
        case .off: return Palette.amberBar
        case .missed: return Palette.rust
        case .upcoming: return Palette.faint
        case .offPlan: return Palette.blue
        }
    }

    /// Czech keys, translated with L10n.tr.
    var title: String {
        switch self {
        case .good: return "Podle plánu"
        case .off: return "Odchylka od plánu"
        case .missed: return "Neodjeto"
        case .upcoming: return "Čeká"
        case .offPlan: return "Mimo plán"
        }
    }

    var detail: String {
        switch self {
        case .good: return "85–115 % plánu"
        case .off: return "méně nebo víc, než byl plán"
        case .missed: return "plán bez aktivity"
        case .upcoming: return "naplánováno dopředu"
        case .offPlan: return "aktivita navíc, třeba chůze"
        }
    }
}

/// "Splnění plánu": the percent of a planned workout that was done, coloured
/// the same both ways from the plan (src/plan-compliance.js complianceBand).
enum ComplianceScale {
    /// Lower bound, upper bound, colour, word; both ways from the plan.
    static let bands: [(ClosedRange<Int>, Color, String)] = [
        (0...49, Palette.red, "Zlomek plánu"), (50...69, Palette.rust, "Výrazně méně"), (70...84, Palette.amber, "Méně než plán"),
        (85...115, Palette.green, "Podle plánu"),
        (116...130, Palette.amber, "Víc než plán"), (131...150, Palette.rust, "Výrazně víc"), (151...Int.max, Palette.red, "Přes plán")
    ]

    static func color(_ percent: Int) -> Color {
        bands.first { $0.0.contains(max(0, percent)) }?.1 ?? Palette.red
    }

    /// "Podle plánu", "Výrazně víc"…, in the app language.
    static func word(_ percent: Int) -> String {
        L10n.tr(bands.first { $0.0.contains(max(0, percent)) }?.2 ?? "Přes plán")
    }

    /// "50–69 %", "pod 50 %", "nad 150 %".
    static func rangeText(_ range: ClosedRange<Int>) -> String {
        if range.lowerBound == 0 { return L10n.f("pod %@ %%", String(range.upperBound + 1)) }
        if range.upperBound == Int.max { return L10n.f("nad %@ %%", String(range.lowerBound - 1)) }
        return "\(range.lowerBound)–\(range.upperBound)" + Fmt.percentSign
    }
}

/// The sport in a soft-filled circle with a 2 pt ring in the state's colour;
/// a session still ahead has a dashed grey ring.
struct PlanStateIcon: View {
    let symbol: String
    let state: PlanState
    var size: CGFloat = 36
    /// A done session's percent of the plan: its colour instead of the state's.
    var percent: Int? = nil

    var body: some View {
        let color: Color = (state == .good || state == .off) ? percent.map(ComplianceScale.color) ?? state.color : state.color
        let dash: [CGFloat] = state == .upcoming ? [3, 3] : []
        Image(systemName: symbol)
            .font(.system(size: size * 0.42, weight: .medium))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(Circle().fill(color.opacity(state == .upcoming ? 0.06 : 0.14)))
            .overlay(Circle().strokeBorder(color, style: StrokeStyle(lineWidth: 2, dash: dash)))
    }
}

/// "Tréninky týdne" with the "i" that explains the colours.
struct WeekSessionsHeader: View {
    @State private var legend = false

    var body: some View {
        HStack(spacing: 8) {
            WidgetHeader(title: L10n.tr("Tréninky týdne"), color: Palette.amberBar)
            Button { legend = true } label: {
                Image(systemName: "info.circle")
                    .scaledFont(17, weight: .regular, cap: .denseCap)
                    .foregroundStyle(Palette.muted)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("Co znamenají barvy"))
        }
        .sheet(isPresented: $legend) { PlanColorsLegend() }
    }
}

/// "Co znamenají barvy": the five states, one line each.
struct PlanColorsLegend: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Co znamenají barvy")
                    .font(Typo.sentence(28, relativeTo: .title))
                    .foregroundStyle(Palette.ink)
                    .padding(.bottom, 12)
                ForEach(Array(PlanState.allCases.enumerated()), id: \.offset) { index, state in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    HStack(spacing: 14) {
                        PlanStateIcon(symbol: state == .offPlan ? "figure.walk" : "figure.outdoor.cycle", state: state, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: L10n.tr(state.title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Text(verbatim: L10n.tr(state.detail)).font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                }
                Text("Splnění plánu")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.top, 22).padding(.bottom, 4)
                ForEach(Array(ComplianceScale.bands.enumerated()), id: \.offset) { index, band in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    HStack(spacing: 12) {
                        Circle().fill(band.1).frame(width: 10, height: 10)
                        Text(verbatim: ComplianceScale.rangeText(band.0)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).frame(width: 96, alignment: .leading)
                        Text(verbatim: L10n.tr(band.2)).font(Typo.body).foregroundStyle(Palette.muted)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
    }
}

// MARK: - Move and cancel

/// A planned session still ahead moves to another day (and time) or is
/// cancelled. An Intervals.icu event goes through /app/api/planned/move and
/// delete; a gym plan saved only in the app through POST /app/api/gym.
enum PlanSessionActions {
    /// A planned session still ahead: it can move, change or be cancelled.
    static func upcoming(_ session: WeekSession) -> Bool {
        session.status == "planned" && (session.eventId != nil || session.kind == "gym")
    }

    /// time: nil keeps the time of day (a gym plan saved in the app has none),
    /// "" leaves the day without one, "HH:MM" sets it. Returns the server's note.
    @MainActor
    static func move(_ model: AppModel, session: WeekSession, to date: String, time: String?) async throws -> String? {
        if let eventId = session.eventId {
            let change: PlannedChange = try await model.api.reschedulePlanned(eventId: eventId, to: date, time: time)
            return change.note
        }
        try await model.api.moveGym(from: session.date, to: date)
        return nil
    }

    /// The undo of a move: back to the day and the time it had.
    @MainActor
    static func moveBack(_ model: AppModel, session: WeekSession, from date: String) async throws {
        if let eventId = session.eventId {
            let _: PlannedChange = try await model.api.reschedulePlanned(eventId: eventId, to: session.date, time: session.time ?? "")
        } else {
            try await model.api.moveGym(from: date, to: session.date)
        }
    }
}

/// The result of a move or a cancel at the bottom of Training, with "Vrátit".
/// A cancel reaches the server only when the toast goes away without the
/// undo (commit); a move is done at once and its undo moves it back.
final class PlanToast: Identifiable {
    let id = UUID()
    let title: String
    let note: String?
    let cancelled: Bool
    private let undoAction: () async -> Void
    private let commitAction: (() async -> Void)?
    private var settled = false

    init(title: String, note: String?, cancelled: Bool, undo: @escaping () async -> Void, commit: (() async -> Void)? = nil) {
        self.title = title
        self.note = note
        self.cancelled = cancelled
        self.undoAction = undo
        self.commitAction = commit
    }

    /// The undo or the commit, whichever comes first; after that nothing.
    func settle(undo: Bool) -> (() async -> Void)? {
        guard !settled else { return nil }
        settled = true
        if undo { return undoAction }
        return commitAction
    }
}

struct PlanToastView: View {
    let toast: PlanToast
    let onUndo: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: toast.cancelled ? "xmark" : "arrow.right")
                    .scaledFont(13, weight: .bold, cap: .denseCap)
                    .foregroundStyle(Palette.onAccent)
                    .frame(width: 30, height: 30)
                    .background(toast.cancelled ? Palette.rust : Palette.green, in: Circle())
                    .accessibilityHidden(true)
                Text(verbatim: toast.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 8)
                Button(action: onUndo) {
                    Label("Vrátit", systemImage: "arrow.uturn.backward")
                        .font(Typo.bodyStrong)
                        .foregroundStyle(Palette.amber)
                        .frame(minHeight: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let note = toast.note, !note.isEmpty {
                Text(verbatim: note)
                    .font(Typo.caption)
                    .foregroundStyle(Palette.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 18)
        .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
    }
}

/// "Přesunout trénink": a strip of the next seven days, the time of day and
/// a line on what the new day already holds.
struct MovePlannedSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let session: WeekSession
    let today: String
    /// After the move went through: the new day and the server's note.
    let onMoved: (String, String?) -> Void

    enum Slot: String, CaseIterable, Identifiable {
        case any, morning, afternoon, evening, exact
        var id: String { rawValue }

        var label: String {
            switch self {
            case .any: return "Kdykoli"
            case .morning: return "Ráno"
            case .afternoon: return "Odpoledne"
            case .evening: return "Večer"
            case .exact: return "Přesně"
            }
        }

        var clock: String? {
            switch self {
            case .morning: return "07:00"
            case .afternoon: return "14:00"
            case .evening: return "18:00"
            default: return nil
            }
        }
    }

    @State private var day = ""
    @State private var slot: Slot = .any
    @State private var exact = Date()
    @State private var working = false
    @State private var error: String?

    /// Seven days from today, without the day the session is on now.
    private var days: [String] {
        let all: [String] = (0...7).map { ISODay.shift(today, $0) }
        return Array(all.filter { $0 != session.date }.prefix(7))
    }

    /// Only an Intervals.icu event has a time of day; a gym plan saved in the app has just the day.
    private var timed: Bool { session.eventId != nil }

    /// "" for the day without a time, else "HH:MM".
    private var time: String {
        switch slot {
        case .any: return ""
        case .exact: return Self.clock(exact)
        default: return slot.clock ?? ""
        }
    }

    private var subtitle: String {
        let parts: [String?] = [session.title, session.minutes.map { Fmt.duration($0) }]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    /// What the new day already holds, from the week's list.
    private var coachLine: String {
        guard !day.isEmpty else { return "" }
        let when = Fmt.capitalized(Fmt.onWeekday(day))
        let known: [String] = (model.training?.days ?? []).map { $0.date }
        guard known.contains(day) else { return L10n.f("Trénink se přesune na %@, zbytek plánu zůstane.", Fmt.weekdayName(day)) }
        let others: [WeekSession] = (model.training?.sessions ?? []).filter { $0.date == day && $0.id != session.id }
        if let other = others.first { return L10n.f("%@ už máš %@.", when, other.title) }
        return L10n.f("%@ máš volno.", when)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Přesunout trénink").font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
            Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Palette.muted).lineLimit(1).padding(.top, 2)
            HStack(spacing: 6) {
                ForEach(days, id: \.self) { d in
                    Button { day = d } label: { dayCell(d) }
                        .buttonStyle(.plain)
                }
            }
            .padding(.top, 18)
            if timed {
                Text("ČAS")
                    .font(.caption.weight(.medium)).tracking(1.2)
                    .foregroundStyle(Palette.muted)
                    .padding(.top, 20)
                Picker("Čas", selection: $slot) {
                    ForEach(Slot.allCases) { s in
                        Text(verbatim: L10n.tr(s.label)).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.top, 8)
                if slot == .exact {
                    DatePicker("Přesný čas", selection: $exact, displayedComponents: .hourAndMinute)
                        .environment(\.locale, Fmt.locale)
                        .padding(.top, 10)
                }
            }
            Text(verbatim: coachLine)
                .font(Typo.sentence(17, relativeTo: .body))
                .foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 18)
            if let error {
                Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
            }
            Spacer(minLength: 16)
            Button { Task { await move() } } label: {
                Text(verbatim: working ? L10n.tr("Přesouvám…") : L10n.f("Přesunout na %@", Fmt.weekdayName(day)))
                    .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(working || day.isEmpty || model.demo)
        }
        .padding(24)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
        .onAppear {
            if day.isEmpty { day = days.first ?? today }
            exact = Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: Date()) ?? Date()
        }
    }

    private func dayCell(_ d: String) -> some View {
        let selected: Bool = d == day
        return VStack(spacing: 2) {
            Text(verbatim: Fmt.weekdayShort(d)).font(Typo.tiny)
            Text(verbatim: ISODay.day(d)).font(Typo.number(20))
        }
        .foregroundStyle(selected ? Palette.onAccent : Palette.ink)
        .frame(maxWidth: .infinity)
        .frame(height: 58)
        .background(selected ? Palette.amberBar : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.weekdayShort(d) + " " + Fmt.dayMonth(d))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func move() async {
        let target = day
        let newTime: String? = timed ? time : nil
        working = true
        defer { working = false }
        do {
            let note = try await PlanSessionActions.move(model, session: session, to: target, time: newTime)
            error = nil
            dismiss()
            onMoved(target, note)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private static func clock(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }
}
