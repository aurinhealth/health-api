import SwiftUI

/// Two sessions of a day joined, one right after the other: a brick (the run
/// straight off the bike) or a pair the athlete joined with "Hned po". The
/// server keeps the link (src/planned-links.js): the first leg's time sets the
/// second's (+5 min to change), and steady legs go to the Apple Watch as one
/// multisport workout (PlannedSendSheet). "Zvlášť" splits them, each at its own time.
enum PlanLinks {
    static let endurance: Set<String> = ["ride", "run", "swim"]

    /// "Hned po kole": the line under the second leg.
    static func afterText(_ sport: String) -> String {
        switch sport {
        case "ride": return L10n.tr("Hned po kole")
        case "run": return L10n.tr("Hned po běhu")
        case "swim": return L10n.tr("Hned po plavání")
        default: return L10n.tr("Hned po předchozím")
        }
    }

    /// The change between the legs: shoes after a ride, the wetsuit after a swim.
    static func changeText(_ sport: String) -> String {
        sport == "swim" ? L10n.tr("Převléknout") : L10n.tr("Přezout")
    }

    /// Only the app's own sessions still ahead link (an Intervals.icu event has no place for it).
    static func linkable(_ s: WeekSession) -> Bool {
        s.kind == "planned" && s.status == "planned" && endurance.contains(s.sport) && s.eventId?.hasPrefix("planned:local-") == true
    }

    /// The sessions of the day this one can go right after.
    static func candidates(for s: WeekSession, in sessions: [WeekSession]) -> [WeekSession] {
        guard linkable(s), s.after == nil, s.next == nil else { return [] }
        return sessions.filter { $0.id != s.id && $0.date == s.date && linkable($0) && $0.next == nil && $0.after == nil }
    }

    /// The list with each second leg right under its first.
    static func joined(_ list: [WeekSession]) -> [WeekSession] {
        let followers = Set(list.filter { s in s.after.map { a in list.contains { $0.eventId == a } } ?? false }.map(\.id))
        var out: [WeekSession] = []
        for s in list where !followers.contains(s.id) {
            out.append(s)
            var current = s
            while let n = current.next, let f = list.first(where: { $0.eventId == n && $0.after == current.eventId }),
                  !out.contains(where: { $0.id == f.id }) {
                out.append(f)
                current = f
            }
        }
        return out + list.filter { s in !out.contains { $0.id == s.id } }
    }

    /// The first leg of a joined session and the second, from either.
    static func pair(of s: WeekSession, in sessions: [WeekSession]) -> (WeekSession, WeekSession)? {
        if let a = s.after, let first = sessions.first(where: { $0.eventId == a }) { return (first, s) }
        if let n = s.next, let second = sessions.first(where: { $0.eventId == n }) { return (s, second) }
        return nil
    }
}

/// "Hned po sobě, nebo zvlášť" (mockups 2 and 3): the joined pair with the
/// start, or each leg at its own time.
struct BrickSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let first: WeekSession
    let second: WeekSession
    let onSaved: () -> Void

    @State private var together = true
    @State private var start: MovePlannedSheet.Slot = .any
    @State private var startExact = Date()
    @State private var secondSlot: MovePlannedSheet.Slot = .evening
    @State private var secondExact = Date()
    @State private var working = false
    @State private var error: String?

    private var total: Int { (first.minutes ?? 0) + (second.minutes ?? 0) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: first.title + " + " + second.title)
                    .font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: [Fmt.capitalized(Fmt.weekdayName(first.date)), total > 0 ? Fmt.duration(total) : nil].compactMap { $0 }.joined(separator: " · "))
                    .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 2)
                Picker("Jak", selection: $together) {
                    Text("Hned po sobě").tag(true)
                    Text("Zvlášť").tag(false)
                }
                .pickerStyle(.segmented)
                .padding(.top, 16)
                if together { togetherList } else { apartList }
                watchLine.padding(.top, 12)
                Text(verbatim: together
                     ? L10n.tr("Běh na unavených nohou je smysl bricku: nohy se učí přechod, který tě čeká v závodě.")
                     : L10n.tr("Zvlášť jdeš do druhé části odpočatý. Na nabitý den to stačí, kouč brick dá zase příště."))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                if let error {
                    Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                }
                Button { Task { await save() } } label: {
                    Text(verbatim: L10n.tr(working ? "Ukládám…" : "Uložit"))
                        .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(working || model.demo)
                .padding(.top, 18)
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
        .onAppear {
            start = Self.slot(of: first.time)
            startExact = Self.date(first.time) ?? Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) ?? Date()
            secondExact = Calendar.current.date(bySettingHour: 18, minute: 30, second: 0, of: Date()) ?? Date()
        }
    }

    private var togetherList: some View {
        VStack(spacing: 0) {
            slotRow(L10n.tr("Začátek"), slot: $start, exact: $startExact)
            divider
            legRow(first, trailing: first.minutes.map { Fmt.duration($0) })
            divider
            HStack(spacing: 12) {
                Rectangle().fill(Palette.amber).frame(width: 2, height: 22).frame(width: 30)
                Text(verbatim: PlanLinks.changeText(first.sport)).font(Typo.body).foregroundStyle(Palette.amber)
                Spacer()
                Text(verbatim: "≈ 5 min").font(Typo.body).foregroundStyle(Palette.muted)
            }
            .padding(.vertical, 10)
            divider
            legRow(second, trailing: [second.minutes.map { Fmt.duration($0) }, secondStart.map { "≈ " + ClockText.format($0) }].compactMap { $0 }.joined(separator: " · "))
        }
        .padding(.horizontal, 14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.top, 14)
    }

    private var apartList: some View {
        VStack(spacing: 0) {
            legRow(first, trailing: nil)
            slotRow(L10n.tr("Čas"), slot: $start, exact: $startExact)
            divider
            legRow(second, trailing: nil)
            slotRow(L10n.tr("Čas"), slot: $secondSlot, exact: $secondExact)
        }
        .padding(.horizontal, 14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.top, 14)
    }

    private var watchLine: some View {
        HStack(spacing: 12) {
            Image(systemName: "applewatch").scaledFont(17, weight: .medium, cap: .denseCap).foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36).background(Palette.track, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: "Apple Watch").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: together ? L10n.tr("Klidné části jako jeden multisport trénink, s intervaly dva tréninky po sobě")
                                        : L10n.tr("Dva tréninky, každý ve svůj čas"))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var divider: some View { Rectangle().fill(Palette.hairline).frame(height: 1) }

    private func legRow(_ s: WeekSession, trailing: String?) -> some View {
        HStack(spacing: 12) {
            Image(systemName: SportIcon.symbol(s.sport)).scaledFont(14, weight: .medium, cap: .denseCap).foregroundStyle(Palette.amber)
                .frame(width: 30, height: 30).background(Palette.amberSoft, in: Circle())
            Text(verbatim: s.title).font(Typo.body).foregroundStyle(Palette.ink).lineLimit(1)
            Spacer(minLength: 8)
            if let trailing { Text(verbatim: trailing).font(Typo.body).foregroundStyle(Palette.muted) }
        }
        .padding(.vertical, 10)
    }

    private func slotRow(_ title: String, slot: Binding<MovePlannedSheet.Slot>, exact: Binding<Date>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(verbatim: title).font(Typo.body).foregroundStyle(Palette.ink)
                Spacer()
                Picker(title, selection: slot) {
                    ForEach(MovePlannedSheet.Slot.allCases) { s in Text(verbatim: L10n.tr(s.label)).tag(s) }
                }
                .pickerStyle(.menu)
                .tint(Palette.muted)
            }
            if slot.wrappedValue == .exact {
                DatePicker(title, selection: exact, displayedComponents: .hourAndMinute)
                    .labelsHidden()
                    .environment(\.locale, Fmt.locale)
            }
        }
        .padding(.vertical, 8)
    }

    /// The second leg's start, as the server sets it: the first's end and five minutes.
    private var secondStart: String? {
        guard let begin = Self.clock(start, exact: startExact), !begin.isEmpty, let date = Self.date(begin) else { return nil }
        let end = date.addingTimeInterval(TimeInterval(((first.minutes ?? 0) + 5) * 60))
        return Self.format(end)
    }

    private func save() async {
        working = true
        error = nil
        defer { working = false }
        guard let firstId = first.eventId, let secondId = second.eventId else { return }
        do {
            if together {
                // The first leg's time; the server puts the second right after it.
                _ = try await model.api.reschedulePlanned(eventId: firstId, to: first.date, time: Self.clock(start, exact: startExact) ?? "")
            } else {
                try await model.api.linkPlanned(eventId: secondId, after: nil)
                _ = try await model.api.reschedulePlanned(eventId: firstId, to: first.date, time: Self.clock(start, exact: startExact) ?? "")
                _ = try await model.api.reschedulePlanned(eventId: secondId, to: second.date, time: Self.clock(secondSlot, exact: secondExact) ?? "")
            }
            dismiss()
            onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// "" for the day without a time, else "HH:MM".
    private static func clock(_ slot: MovePlannedSheet.Slot, exact: Date) -> String? {
        switch slot {
        case .any: return ""
        case .exact: return format(exact)
        default: return slot.clock
        }
    }

    private static func slot(of time: String?) -> MovePlannedSheet.Slot {
        guard let time else { return .any }
        return MovePlannedSheet.Slot.allCases.first { $0.clock == time } ?? .exact
    }

    private static func date(_ time: String?) -> Date? {
        guard let time, time.count == 5, let h = Int(time.prefix(2)), let m = Int(time.suffix(2)) else { return nil }
        return Calendar.current.date(bySettingHour: h, minute: m, second: 0, of: Date())
    }

    private static func format(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }
}
