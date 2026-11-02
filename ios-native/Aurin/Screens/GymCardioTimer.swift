import SwiftUI

// Cardio without a set time: by default the time just runs (a stopwatch) and
// Stop keeps how long it took and when it ended. A length chosen in Nastavení →
// Posilovna → Délka kardia (or a favourite time tapped before Start) counts
// down instead, +5 min adds more. Server side: src/stretching.js cardioFor.

/// The cardio stopped in a workout: its seconds and its end, per day and part,
/// kept on the phone for the last week (like the ticked moves).
enum GymCardioLog {
    static let storageKey = "gym.cardio.log"

    struct Entry: Codable, Equatable {
        var seconds: Int
        var end: Date

        /// "7 min · 18:07".
        var summary: String {
            let minutes = max(1, Int((Double(seconds) / 60).rounded()))
            return "\(minutes) min · " + end.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale))
        }
    }

    static func entry(_ stored: String, date: String, id: String) -> Entry? {
        all(stored)[date + ":" + id]
    }

    static func saving(_ entry: Entry, date: String, id: String, into stored: String) -> String {
        var entries = all(stored)
        entries[date + ":" + id] = entry
        let oldest = Calendar.current.date(byAdding: .day, value: -7, to: Date()).map { isoDay.string(from: $0) } ?? ""
        entries = entries.filter { String($0.key.prefix(10)) >= oldest }
        guard let data = try? JSONEncoder().encode(entries) else { return stored }
        return String(decoding: data, as: UTF8.self)
    }

    private static func all(_ stored: String) -> [String: Entry] {
        guard let data = stored.data(using: .utf8) else { return [:] }
        return (try? JSONDecoder().decode([String: Entry].self, from: data)) ?? [:]
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

/// "Výchozí  Bez limitu" and a slider in 1-minute steps: Bez limitu (0) … 60 min.
struct CardioLengthSlider: View {
    @Binding var minutes: Int
    var title: String = "Výchozí"
    /// The slider let go: the value is final (Settings saves it then).
    var onCommit: (Int) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                Spacer()
                Text(verbatim: GymCardio.length(minutes)).font(Typo.sentence(24, relativeTo: .title3)).foregroundStyle(Palette.ink)
                    .monospacedDigit()
            }
            Slider(value: Binding(get: { Double(minutes) }, set: { minutes = Int($0.rounded()) }), in: 0...60, step: 1,
                   onEditingChanged: { editing in if !editing { onCommit(minutes) } })
            .tint(Palette.amber)
            .accessibilityLabel(Text(title))
            .accessibilityValue(Text(verbatim: GymCardio.length(minutes)))
            HStack {
                Text("Bez limitu")
                Spacer()
                Text(verbatim: "15")
                Spacer()
                Text(verbatim: "30")
                Spacer()
                Text(verbatim: "45")
                Spacer()
                Text(verbatim: "60 min")
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
            .accessibilityHidden(true)
        }
    }
}

/// Bez limitu and the favourite times as chips; the chosen one filled.
struct CardioTimeChips: View {
    let favourites: [Int]
    @Binding var minutes: Int

    var body: some View {
        ChipFlow(items: choices, label: { GymCardio.length($0) }, isOn: { $0 == minutes }, toggle: { minutes = $0 })
    }

    /// No limit, the favourites, and a time chosen elsewhere that is not one of them.
    private var choices: [Int] {
        var list = [0] + favourites.filter { $0 > 0 }.sorted()
        if minutes > 0, !list.contains(minutes) { list.append(minutes) }
        return list
    }
}

/// Přidat čas: a favourite cardio time, 1–60 min.
struct CardioTimeSheet: View {
    var onAdd: (Int) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var minutes = 25

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Stepper(value: $minutes, in: 1...60) {
                    HStack {
                        Text("Délka").font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        Text(verbatim: "\(minutes) min").font(Typo.bodyStrong).foregroundStyle(Palette.ink).monospacedDigit()
                    }
                }
                .padding(.horizontal, 16).frame(minHeight: 52)
                .cardSurface(cornerRadius: 22)
                Slider(value: Binding(get: { Double(minutes) }, set: { minutes = Int($0.rounded()) }), in: 1...60, step: 1)
                    .tint(Palette.amber)
                    .accessibilityHidden(true)
                Spacer()
            }
            .padding(20)
            .background(Palette.background)
            .navigationTitle("Přidat čas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Přidat") { onAdd(minutes); dismiss() } }
            }
        }
        .presentationDetents([.medium])
    }
}

/// Spustit on the cardio: the machine, no limit or a time (the favourites as
/// chips), then Start. Without a limit the time runs up until Stop; with one it
/// counts down to the end (+5 min adds more). Stop keeps the length and the end.
struct CardioTimerView: View {
    let item: GymStretching.Item
    let date: String
    var onDone: () -> Void
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @AppStorage(GymCardioLog.storageKey) private var logs = ""
    @State private var minutes = 0
    @State private var favourites = GymCardio.favourites
    @State private var started: Date?
    /// Minutes added with +5 min.
    @State private var added = 0
    @State private var stopped: GymCardioLog.Entry?
    /// The countdown's end tones planned on the sound's clock (GymSignals.planRest).
    @State private var planned = false

    private var isStart: Bool { item.id == "cardio-start" }
    private var total: Int { (minutes + added) * 60 }
    private var end: Date? { started.map { $0.addingTimeInterval(TimeInterval(total)) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Spacer()
                if stopped == nil { GymSignalsMenu() }
                Button { close() } label: {
                    Image(systemName: "xmark").scaledFont(16, weight: .semibold, cap: .denseCap).frame(width: 36, height: 36)
                }
                .foregroundStyle(Palette.ink)
                .accessibilityLabel(L10n.tr("Zavřít"))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: L10n.tr("Kardio") + " · " + L10n.tr(isStart ? "Začátek" : "Konec"))
                    .font(.caption.weight(.semibold)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.amber)
                Text(verbatim: item.name).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
            }
            if let stopped {
                Spacer()
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").scaledFont(64).foregroundStyle(Palette.green)
                    Text(GymRoutineKind.cardio.doneTitle).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Text(verbatim: item.name + " · " + stopped.summary).font(.subheadline).foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity)
                Spacer()
                PrimaryButton(title: L10n.tr("Hotovo")) { dismiss() }
            } else if let started {
                Spacer()
                TimelineView(.periodic(from: started, by: 1)) { context in
                    VStack(spacing: 6) {
                        Text(verbatim: clock(at: context.date)).font(Typo.number(76)).monospacedDigit()
                            .foregroundStyle(minutes > 0 && GymSignals.counts(left(at: context.date)) ? Palette.amber : Palette.ink)
                        Text(verbatim: status).font(.subheadline).foregroundStyle(Palette.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
                Spacer()
                if minutes > 0 {
                    SecondaryButton(title: "+5 min") { extend() }
                }
                PrimaryButton(title: L10n.tr("Zastavit"), systemImage: "stop.fill") { stop(at: Date()) }
                    .accessibilityHint(Text("Uloží délku a konec kardia"))
            } else {
                Spacer()
                Text(verbatim: GymCardio.length(minutes)).font(Typo.sentence(54, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity)
                CardioTimeChips(favourites: favourites, minutes: $minutes)
                    .frame(maxWidth: .infinity)
                Spacer()
                PrimaryButton(title: L10n.tr("Spustit kardio"), systemImage: "play.fill") { start() }
                SecondaryButton(title: "Přeskočit") { onDone(); dismiss() }
            }
        }
        .padding(20)
        .background { Palette.background.ignoresSafeArea() }
        .task { await load() }
        .task(id: started) { await watch() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            if let end { GymSignals.stopRest(end) }
            // Ticked only now: in Režim tréninku a done part's card goes away, and this screen with it.
            if stopped != nil { onDone() }
        }
    }

    /// "běží · 124 bpm" while the time runs.
    private var status: String {
        var parts = [L10n.tr(minutes > 0 ? "zbývá" : "běží")]
        if let bpm = LiveWorkout.shared.heartRate { parts.append("\(Int(bpm.rounded())) bpm") }
        return parts.joined(separator: " · ")
    }

    /// Seconds left of a set time (0 without one).
    private func left(at now: Date) -> Int {
        guard let end, minutes > 0 else { return 0 }
        return max(0, Int(end.timeIntervalSince(now).rounded(.up)))
    }

    /// The time run (no limit) or left (a set time), "7:12" or "1:02:05".
    private func clock(at now: Date) -> String {
        let seconds = minutes > 0 ? left(at: now) : max(0, Int(now.timeIntervalSince(started ?? now)))
        let h = seconds / 3600, m = seconds / 60 % 60, s = seconds % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    /// The athlete's default length and favourite times (Nastavení → Posilovna);
    /// the day's own choice (Dnešní trénink → Kardio) when it has one.
    private func load() async {
        minutes = max(0, item.seconds / 60)
        guard !model.demo, let prefs = try? await model.api.gymPreferences() else { return }
        if let saved = prefs.cardioFavourites { favourites = saved }
    }

    private func start() {
        started = Date()
        added = 0
        GymSignals.play(.start)
        planEnd()
    }

    private func extend() {
        if let end { GymSignals.stopRest(end) }
        added += 5
        planEnd()
    }

    /// With a set time, its last seconds and its end sound with the phone locked too.
    private func planEnd() {
        guard minutes > 0, let end else { planned = false; return }
        planned = GymSignals.planRest(until: end)
    }

    /// The set time's countdown on screen: ticks in the last seconds, Stop at the end.
    private func watch() async {
        guard started != nil else { return }
        var last = -1
        while !Task.isCancelled, stopped == nil, minutes > 0, let end {
            let now = Date(), remaining = left(at: now)
            if remaining != last {
                if GymSignals.counts(remaining) { GymSignals.play(.tick, withSound: !planned) }
                last = remaining
            }
            if now >= end {
                GymSignals.play(.end, withSound: !planned)
                stop(at: end)
                return
            }
            try? await Task.sleep(for: .milliseconds(250))
        }
    }

    /// The length and the end kept; the cardio is done.
    private func stop(at time: Date) {
        guard let started, stopped == nil else { return }
        if minutes == 0 { GymSignals.play(.end) } else if time < (end ?? time) { GymSignals.stopRest(end) }
        let entry = GymCardioLog.Entry(seconds: max(0, Int(time.timeIntervalSince(started).rounded())), end: time)
        logs = GymCardioLog.saving(entry, date: date, id: item.id, into: logs)
        stopped = entry
    }

    /// Closed while the time runs: what ran so far is kept, as with Stop.
    private func close() {
        if started != nil, stopped == nil { stop(at: Date()) }
        dismiss()
    }
}
