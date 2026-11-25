import SwiftUI
import WatchKit

/// The alarm, from the button at the top left of Readiness (watch concept 08):
/// the next morning on a 24-hour dial, the night from bedtime to the wake
/// time in the iPhone's sleep colours (amber to mint), the crown moves the wake
/// time in 5 minutes, then every work (weekend) day or "Just once" saves it on the iPhone. Swiping left shows the next mornings
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
            AlarmDial(bed: bedMinutes, wake: Int(minutes), on: set, size: edited || result != nil ? 92 : 116) {
                Text(set ? W.clock(minutes: minutes) : "–")
                    .font(W.serif(edited ? 28 : 34))
                    .foregroundStyle(W.num)
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
                .foregroundStyle(W.ink)
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
            // Under each other across the width, 38 pt each (watch concept 08, point 3).
            VStack(spacing: 4) {
                choice(weekend ? W.tr("Celý víkend", "All weekend") : W.tr("Všední dny", "All weekdays"),
                       scope: weekend ? "weekend" : "work", primary: true)
                if first && alarm.evening != nil {
                    choice(W.tr("Jen jednou", "Just once"), scope: "once", primary: false)
                }
            }
        } else if set {
            Text(Self.hours(sleepMinutes) + W.tr(" spánku", " of sleep"))
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
                .watchFont(15, .semibold)
                .foregroundStyle(primary ? .black : W.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, minHeight: 38)
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

    /// "7 h 20 min", as durations read everywhere (Petr 2026-11-23).
    static func hours(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    /// "6:45" or "06:45" as minutes after midnight.
    static func minutes(_ text: String) -> Int? {
        let parts = text.prefix(5).split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
    }
}

/// The night on a 24-hour dial with midnight at the top: from bedtime to the
/// wake time from amber to mint, as the sleep planner and the night's arc on
/// the iPhone, a dot at bedtime (watch concept 08, point 1).
private struct AlarmDial<Content: View>: View {
    let bed: Int
    let wake: Int
    let on: Bool
    var size: CGFloat = 116
    @ViewBuilder var content: Content

    var body: some View {
        let ring = size - 14
        let start = angle(bed)
        let span = (angle(wake) - start + 360).truncatingRemainder(dividingBy: 360)
        ZStack {
            Circle().stroke(W.track, lineWidth: 6).frame(width: ring, height: ring)
            if on {
                Night(start: start, end: start + span)
                    .stroke(AngularGradient(colors: [W.lightAmber, W.lightMint], center: .center,
                                            startAngle: .degrees(start), endAngle: .degrees(start + max(span, 1))),
                            style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .frame(width: ring, height: ring)
                let radians = start * .pi / 180
                Circle().fill(W.num)
                    .overlay(Circle().stroke(W.rim, lineWidth: 2))
                    .frame(width: 10, height: 10)
                    .offset(x: cos(radians) * ring / 2, y: sin(radians) * ring / 2)
            }
            VStack(spacing: 0) { content }
        }
        .frame(width: size, height: size)
        .animation(.easeOut(duration: 0.2), value: size)
        .accessibilityElement(children: .combine)
    }

    private func angle(_ minutes: Int) -> Double { Double(minutes) / 1440 * 360 - 90 }

    private struct Night: Shape {
        let start: Double
        let end: Double

        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width / 2,
                        startAngle: .degrees(start), endAngle: .degrees(end), clockwise: false)
            return path
        }
    }
}

/// Under the gear (watch concept 08, point 4): whether the watch wakes, with
/// the iPhone's backup said in words, and Wrist taps on a page of its own.
private struct AlarmSettings: View {
    @ObservedObject private var alarm = WatchAlarm.shared

    static let haptics: [(id: String, cs: String, en: String)] = [
        ("gentle", "Jemné", "Gentle"), ("rising", "Stoupající", "Rising"), ("strong", "Výrazné", "Strong")
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle(W.tr("Budit na hodinkách", "Wake me on the watch"), isOn: $alarm.onWatch)
                } footer: {
                    Text(W.tr("Zvoní iPhone, když má budík zapnutý.", "Your iPhone rings when its alarm is on.")
                         + (alarm.onWatch ? W.tr(" Když zaspíš, iPhone zazvoní o 5 min později.", " If you sleep through, your iPhone rings 5 min later.") : ""))
                }
                if alarm.onWatch {
                    Section {
                        NavigationLink {
                            AlarmTaps()
                        } label: {
                            HStack {
                                Text(W.tr("Vibrace", "Wrist taps"))
                                Spacer(minLength: 4)
                                Text(Self.name(alarm.haptic)).foregroundStyle(W.secondary)
                            }
                        }
                    } footer: {
                        Text(W.tr("Měj hodinky v noci na ruce, hodinky na nabíječce tě nevzbudí.", "Wear your watch to bed, a charging watch can't wake you."))
                    }
                }
            }
        }
    }

    static func name(_ id: String) -> String {
        haptics.first { $0.id == id }.map { W.tr($0.cs, $0.en) } ?? ""
    }
}

/// Wrist taps: Gentle, Rising, Strong; a tap plays it.
private struct AlarmTaps: View {
    @ObservedObject private var alarm = WatchAlarm.shared

    var body: some View {
        List(AlarmSettings.haptics, id: \.id) { item in
            Button {
                alarm.haptic = item.id
                WKInterfaceDeviceTap.play(item.id)
            } label: {
                HStack {
                    Text(W.tr(item.cs, item.en))
                    Spacer()
                    if alarm.haptic == item.id { Image(systemName: "checkmark").foregroundStyle(W.green) }
                }
            }
        }
        .navigationTitle(W.tr("Vibrace", "Wrist taps"))
    }
}

/// A sample of the alarm's taps.
enum WKInterfaceDeviceTap {
    @MainActor static func play(_ haptic: String) {
        WKInterfaceDevice.current().play(haptic == "gentle" ? .click : haptic == "strong" ? .failure : .notification)
    }
}

/// The alarm rings (watch concept 08, point 6): Good morning, the time big
/// in the serif, Snooze with its 9 min under it and Stop, 46 pt high. Snoozed
/// (new): when it rings again and Stop alarm.
struct AlarmRinging: View {
    @ObservedObject private var alarm = WatchAlarm.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let until = alarm.snoozedUntil, !alarm.ringing {
                Text(W.tr("Odloženo", "Snoozed")).watchFont(13, .semibold).foregroundStyle(W.indigo)
                clock
                Text(W.tr("Zazvoní znovu za ", "Rings again in ") + Self.minutesLeft(until))
                    .watchFont(14).foregroundStyle(W.secondary)
                Spacer(minLength: 6)
                Button { alarm.stop() } label: {
                    Text(W.tr("Vypnout budík", "Stop alarm")).watchFont(15, .semibold).foregroundStyle(W.ink)
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.bordered)
            } else {
                Text(W.tr("Dobré ráno", "Good morning")).font(W.serif(20)).foregroundStyle(W.num)
                clock
                Spacer(minLength: 6)
                HStack(spacing: 6) {
                    // Double Tap snoozes, never stops: a half-awake tap can't end the alarm.
                    Button { alarm.snoozeNow() } label: {
                        VStack(spacing: 0) {
                            Text(W.tr("Odložit", "Snooze")).watchFont(15, .semibold).foregroundStyle(W.ink)
                            Text("9 min").watchFont(12).foregroundStyle(W.secondary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 46)
                    }
                    .buttonStyle(.bordered)
                    .doubleTap()
                    Button { alarm.stop() } label: {
                        Text(W.tr("Vypnout", "Stop")).watchFont(17, .semibold).foregroundStyle(.black)
                            .frame(maxWidth: .infinity, minHeight: 46)
                    }
                    .mainButton()
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(W.glow(W.Glow.sleep), for: .navigation)
    }

    private var clock: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            Text(context.date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute())
                .font(W.serif(W.small ? 52 : 60))
                .foregroundStyle(W.num)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    /// "9 min" until the snoozed alarm rings again.
    static func minutesLeft(_ until: Date) -> String {
        "\(max(1, Int((until.timeIntervalSinceNow / 60).rounded(.up)))) min"
    }
}
