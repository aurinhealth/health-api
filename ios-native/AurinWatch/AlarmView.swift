import SwiftUI
import WatchKit

/// The alarm, from the button at the top left of Readiness: the next morning
/// on a 24-hour dial (the moon at bedtime, the sun at the wake time), the
/// crown moves the wake time in 5 minutes, then "Just tomorrow" or every work
/// (weekend) day saves it on the iPhone. Swiping left shows the next mornings
/// with their work day or weekend time, the dots under them say how many.
/// The gear holds the watch's own settings.
struct AlarmView: View {
    @EnvironmentObject private var store: WatchStore
    @State private var settings = false
    /// The morning on the screen: only its dial takes the crown.
    @State private var page = 0

    var body: some View {
        let alarm = store.snapshot?.alarm ?? WatchSnapshot.Alarm()
        TabView(selection: $page) {
            ForEach(Array(Self.mornings(alarm).enumerated()), id: \.element) { index, morning in
                AlarmDay(morning: morning, first: index == 0, alarm: alarm, shown: page == index)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .automatic))
        .navigationTitle(W.tr("Budík", "Alarm"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { settings = true } label: { Image(systemName: "gearshape.fill") }
                    .accessibilityLabel(W.tr("Nastavení budíku", "Alarm settings"))
            }
        }
        .sheet(isPresented: $settings) { AlarmSettings() }
        .containerBackground(W.glow(W.Glow.sleep), for: .navigation)
    }

    /// The morning after tonight (or tomorrow) and the six after it.
    static func mornings(_ alarm: WatchSnapshot.Alarm, now: Date = Date()) -> [String] {
        let calendar = Calendar.current
        var first = calendar.date(byAdding: .day, value: 1, to: now) ?? now
        if let evening = alarm.evening, let day = W.day(evening), let after = calendar.date(byAdding: .day, value: 1, to: day),
           WatchStore.localDate(after) >= WatchStore.localDate(now) {
            first = after
        }
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: first).map(WatchStore.localDate) }
    }
}

private struct AlarmDay: View {
    let morning: String
    let first: Bool
    let alarm: WatchSnapshot.Alarm
    /// The page on the screen: the crown moves this morning's time, never a hidden one.
    let shown: Bool

    @State private var minutes: Double = 420
    @State private var saved: Int?
    /// The crown (or VoiceOver) moved the time: until then a morning without
    /// an alarm shows none, not 7:00 and a button to save it.
    @State private var touched = false
    @State private var sending = false
    /// After a save: what was saved for two seconds, or the scope to try again.
    @State private var result: SaveResult?
    @FocusState private var focused: Bool

    private enum SaveResult: Equatable {
        case saved(String)
        case failed(scope: String)
    }

    private var weekend: Bool { WatchAlarm.weekend(morning) }
    private var wakeText: String? { WatchAlarm.wake(on: morning, alarm) }
    /// A time on the dial: the saved one, or one the crown set.
    private var set: Bool { saved != nil || touched }
    private var edited: Bool { touched && Int(minutes) != saved }
    /// Minutes from bedtime to the wake time: tonight's plan, else the sleep it plans and a quarter hour to fall asleep.
    private var inBed: Int { alarm.inBed ?? ((alarm.sleep ?? 480) + 15) }
    private var sleepMinutes: Int { alarm.sleep ?? max(inBed - 15, 0) }

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .watchFont(12, .medium)
                .foregroundStyle(W.secondary)
            AlarmDial(bed: bedMinutes, wake: Int(minutes), on: set) {
                Text(set ? W.clock(minutes: minutes) : "–")
                    .font(W.serif(34))
                    .foregroundStyle(W.ink)
                    .contentTransition(.numericText())
                Text(set ? W.tr("budík", "alarm") : W.tr("Bez budíku", "No alarm"))
                    .watchFont(12)
                    .foregroundStyle(W.muted)
            }
            .focusable()
            .focused($focused)
            // Detents: only whole 5-minute steps, never 7:03 while turning.
            .digitalCrownRotation(detent: $minutes, from: 0, through: 1435, by: 5, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
            // VoiceOver sets the time too: swipe up or down moves it 5 minutes.
            .accessibilityLabel(W.tr("Budík, ", "Alarm, ") + title)
            .accessibilityValue(set ? W.clock(minutes: minutes) : W.tr("Bez budíku", "No alarm"))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: minutes = (minutes + 5).truncatingRemainder(dividingBy: 1440)
                case .decrement: minutes = (minutes + 1435).truncatingRemainder(dividingBy: 1440)
                @unknown default: break
                }
                touched = true
            }
            footer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            fill()
            focused = shown
        }
        .onChange(of: shown) { _, now in focused = now }
        .onChange(of: alarm) { _, _ in if !edited { fill() } }
        .onChange(of: minutes) { _, value in
            // fill() puts the saved time (or 7:00) back: that is no turn.
            guard touched || Int(value) != (saved ?? 420) else { return }
            touched = true
            if case .failed = result { result = nil }
        }
    }

    /// Under the dial: saving, what was saved or why not, the save buttons
    /// after a turn, the night's sleep, or how to set a morning without an alarm.
    @ViewBuilder private var footer: some View {
        if sending {
            ProgressView().frame(height: 28)
        } else if case .failed(let scope) = result {
            Text(W.tr("Neuloženo. iPhone musí být poblíž.", "Not saved. Your iPhone needs to be nearby."))
                .watchFont(12, .medium)
                .foregroundStyle(W.amber)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            choice(W.tr("Zkusit znovu", "Try again"), scope: scope, primary: true)
        } else if case .saved(let text) = result {
            Label(text, systemImage: "checkmark")
                .watchFont(12, .semibold)
                .foregroundStyle(W.green)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        } else if edited {
            HStack(spacing: 4) {
                if first && alarm.evening != nil {
                    choice(W.tr("Jen zítra", "Just once"), scope: "once", primary: false)
                }
                choice(weekend ? W.tr("Celý víkend", "All weekend") : W.tr("Všední dny", "All weekdays"),
                       scope: weekend ? "weekend" : "work", primary: true)
            }
        } else if set {
            Text(W.duration(minutes: Double(sleepMinutes)) + W.tr(" spánku", " of sleep"))
                .watchFont(12)
                .foregroundStyle(W.muted)
        } else {
            Text(W.tr("Nastav otočením korunky", "Turn the crown to set"))
                .watchFont(12)
                .foregroundStyle(W.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    private var title: String {
        let name = first ? W.tr("Zítra", "Tomorrow") : W.dayName(morning).capitalized(with: W.locale)
        return name + (weekend ? W.tr(", víkend", ", weekend") : "")
    }

    private var bedMinutes: Int {
        if first, !edited, let bedtime = alarm.bedtime, let bed = Self.minutes(bedtime) { return bed }
        return ((Int(minutes) - inBed) % 1440 + 1440) % 1440
    }

    private func fill() {
        saved = wakeText.flatMap(Self.minutes)
        minutes = Double(saved ?? 420)
    }

    private func choice(_ label: String, scope: String, primary: Bool) -> some View {
        Button { save(scope) } label: {
            Text(label)
                .watchFont(12, .semibold)
                .foregroundStyle(primary ? .black : W.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                // The main choice white, as every main button (watch audit D2).
                .background(primary ? W.ink : W.tile, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Saves on the iPhone (the alarm lives there): a tap and "Saved:
    /// weekdays 6:45" for two seconds, or a failure tap and Try again.
    private func save(_ scope: String) {
        sending = true
        result = nil
        let wake = Int(minutes)
        Task {
            let ok = await WatchAlarm.shared.move(wake: String(format: "%02d:%02d", wake / 60, wake % 60), scope: scope, evening: alarm.evening)
            sending = false
            guard ok else {
                WKInterfaceDevice.current().play(.failure)
                result = .failed(scope: scope)
                AccessibilityNotification.Announcement(W.tr("Neuloženo. iPhone musí být poblíž.", "Not saved. Your iPhone needs to be nearby.")).post()
                return
            }
            saved = wake
            WKInterfaceDevice.current().play(.success)
            let text = W.tr("Uloženo: ", "Saved: ") + Self.scopeName(scope) + " " + W.clock(minutes: Double(wake))
            result = .saved(text)
            AccessibilityNotification.Announcement(text).post()
            try? await Task.sleep(for: .seconds(2))
            if result == .saved(text) { result = nil }
        }
    }

    /// "weekdays", "weekend" or "tomorrow" in "Saved, weekdays 6:45".
    static func scopeName(_ scope: String) -> String {
        switch scope {
        case "once": W.tr("zítra", "tomorrow")
        case "weekend": W.tr("víkend", "weekend")
        default: W.tr("všední dny", "weekdays")
        }
    }

    /// "6:45" or "06:45" as minutes after midnight.
    static func minutes(_ text: String) -> Int? {
        let parts = text.prefix(5).split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }
}

/// The night on a 24-hour dial with midnight at the top.
private struct AlarmDial<Content: View>: View {
    let bed: Int
    let wake: Int
    let on: Bool
    @ViewBuilder var content: Content

    private let size: CGFloat = 116

    var body: some View {
        ZStack {
            Circle().fill(W.disc)
            Circle().stroke(W.track, lineWidth: 7).frame(width: size - 18, height: size - 18)
            if on {
                Night(start: angle(bed), end: angle(wake))
                    .stroke(W.indigo, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .frame(width: size - 18, height: size - 18)
                mark("moon.fill", at: bed, color: W.indigo)
                mark("sun.max.fill", at: wake, color: W.amber)
            }
            VStack(spacing: 0) { content }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .combine)
    }

    private func angle(_ minutes: Int) -> Double { Double(minutes) / 1440 * 360 - 90 }

    private func mark(_ symbol: String, at minutes: Int, color: Color) -> some View {
        let radians = angle(minutes) * .pi / 180
        let r = (size - 18) / 2
        return Image(systemName: symbol)
            .watchFont(12, .bold)
            .foregroundStyle(.black)
            .frame(width: 16, height: 16)
            .background(color, in: Circle())
            .offset(x: cos(radians) * r, y: sin(radians) * r)
    }

    private struct Night: Shape {
        let start: Double
        let end: Double

        func path(in rect: CGRect) -> Path {
            var path = Path()
            let to = end >= start ? end : end + 360
            path.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width / 2,
                        startAngle: .degrees(start), endAngle: .degrees(to), clockwise: false)
            return path
        }
    }
}

/// Under the gear: whether the watch wakes (then the iPhone doesn't) and how it taps.
private struct AlarmSettings: View {
    @ObservedObject private var alarm = WatchAlarm.shared

    private let haptics: [(id: String, cs: String, en: String)] = [
        ("gentle", "Jemné", "Gentle"), ("rising", "Stoupající", "Rising"), ("strong", "Výrazné", "Strong")
    ]

    var body: some View {
        List {
            Section {
                Toggle(W.tr("Budit na hodinkách", "Wake me on the watch"), isOn: $alarm.onWatch)
            } footer: {
                Text(alarm.onWatch ? nextText : W.tr("Zvoní iPhone, když má budík zapnutý.", "Your iPhone rings when its alarm is on."))
            }
            if alarm.onWatch {
                Section(W.tr("Vibrace", "Taps")) {
                    ForEach(haptics, id: \.id) { item in
                        Button {
                            alarm.haptic = item.id
                            WKInterfaceDeviceTap.play(item.id)
                        } label: {
                            HStack {
                                Text(W.tr(item.cs, item.en))
                                Spacer()
                                if alarm.haptic == item.id { Image(systemName: "checkmark").foregroundStyle(W.indigo) }
                            }
                        }
                    }
                }
            }
        }
    }

    private var nextText: String {
        guard let next = alarm.next else {
            return W.tr("iPhone nezvoní. Bez času budíku hodinky nebudí.", "Your iPhone stays quiet. The watch needs a wake time.")
        }
        return W.tr("iPhone nezvoní. Další buzení: ", "Your iPhone stays quiet. Next: ") + W.dateFormatter("EEEE H:mm").string(from: next)
    }
}

/// A sample of the alarm's taps.
enum WKInterfaceDeviceTap {
    @MainActor static func play(_ haptic: String) {
        WKInterfaceDevice.current().play(haptic == "gentle" ? .click : haptic == "strong" ? .failure : .notification)
    }
}

/// The alarm rings: good morning, the time, Snooze and Stop.
struct AlarmRinging: View {
    @ObservedObject private var alarm = WatchAlarm.shared

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "sun.max.fill").watchFont(22).foregroundStyle(W.amber)
            Text(W.tr("Dobré ráno", "Good morning")).font(W.serif(22)).foregroundStyle(W.ink)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(context.date, format: .dateTime.hour().minute())
                    .font(W.serif(40))
                    .foregroundStyle(W.ink)
            }
            HStack(spacing: 6) {
                // Double Tap snoozes, never stops: a half-awake tap can't end the alarm.
                Button(W.tr("Odložit", "Snooze")) { alarm.snoozeNow() }
                    .buttonStyle(.bordered)
                    .doubleTap()
                Button { alarm.stop() } label: {
                    Text(W.tr("Vypnout", "Stop")).foregroundStyle(.black)
                }
                .mainButton()
            }
            .watchFont(14, .semibold)
        }
        .containerBackground(W.glow(W.Glow.strain), for: .navigation)
    }
}
