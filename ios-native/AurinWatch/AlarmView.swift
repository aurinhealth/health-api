import SwiftUI
import WatchKit

/// The alarm, from the button at the top left of Readiness: the next morning
/// on a 24-hour dial (the moon at bedtime, the sun at the wake time), the
/// crown moves the wake time in 5 minutes, then "Just tomorrow" or every work
/// (weekend) day saves it on the iPhone. Swiping left shows the next mornings
/// with their work day or weekend time. The gear holds the watch's own settings.
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
        .tabViewStyle(.page(indexDisplayMode: .never))
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
    @State private var sending = false
    @FocusState private var focused: Bool

    private var weekend: Bool { WatchAlarm.weekend(morning) }
    private var wakeText: String? { WatchAlarm.wake(on: morning, alarm) }
    private var edited: Bool { Int(minutes) != saved }
    /// Minutes from bedtime to the wake time: tonight's plan, else the sleep it plans and a quarter hour to fall asleep.
    private var inBed: Int { alarm.inBed ?? ((alarm.sleep ?? 480) + 15) }
    private var sleepMinutes: Int { alarm.sleep ?? max(inBed - 15, 0) }

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(W.secondary)
            AlarmDial(bed: bedMinutes, wake: Int(minutes), on: saved != nil || edited) {
                Text(saved == nil && !edited ? "–" : W.clock(minutes: minutes))
                    .font(W.serif(34))
                    .foregroundStyle(W.ink)
                    .contentTransition(.numericText())
                Text(saved == nil && !edited ? W.tr("bez budíku", "no alarm") : W.tr("budík", "alarm"))
                    .font(.system(size: 10))
                    .foregroundStyle(W.muted)
            }
            .focusable()
            .focused($focused)
            // Detents: only whole 5-minute steps, never 7:03 while turning.
            .digitalCrownRotation(detent: $minutes, from: 0, through: 1435, by: 5, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
            if edited {
                HStack(spacing: 4) {
                    if first && alarm.evening != nil {
                        choice(W.tr("Jen zítra", "Just once"), scope: "once")
                    }
                    choice(weekend ? W.tr("Celý víkend", "All weekend") : W.tr("Všední dny", "All weekdays"),
                           scope: weekend ? "weekend" : "work")
                }
                .disabled(sending)
            } else {
                Text(W.duration(minutes: Double(sleepMinutes)) + W.tr(" spánku", " of sleep"))
                    .font(.system(size: 12))
                    .foregroundStyle(W.muted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            fill()
            focused = shown
        }
        .onChange(of: shown) { _, now in focused = now }
        .onChange(of: alarm) { _, _ in if !edited { fill() } }
    }

    private var title: String {
        let name = first ? W.tr("Zítra", "Tomorrow") : W.dayName(morning).capitalized(with: W.locale)
        return name + (weekend ? W.tr(" · víkend", " · weekend") : "")
    }

    private var bedMinutes: Int {
        if first, !edited, let bedtime = alarm.bedtime, let bed = Self.minutes(bedtime) { return bed }
        return ((Int(minutes) - inBed) % 1440 + 1440) % 1440
    }

    private func fill() {
        saved = wakeText.flatMap(Self.minutes)
        minutes = Double(saved ?? 420)
    }

    private func choice(_ label: String, scope: String) -> some View {
        Button {
            sending = true
            let text = String(format: "%02d:%02d", Int(minutes) / 60, Int(minutes) % 60)
            Task {
                if await WatchAlarm.shared.move(wake: text, scope: scope, evening: alarm.evening) { saved = Int(minutes) }
                sending = false
            }
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(scope == "once" ? W.ink : .black)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(scope == "once" ? W.tile : W.indigo, in: Capsule())
        }
        .buttonStyle(.plain)
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
            .font(.system(size: 9, weight: .bold))
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
            Image(systemName: "sun.max.fill").font(.system(size: 22)).foregroundStyle(W.amber)
            Text(W.tr("Dobré ráno", "Good morning")).font(W.serif(22)).foregroundStyle(W.ink)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(context.date, format: .dateTime.hour().minute())
                    .font(W.serif(40))
                    .foregroundStyle(W.ink)
            }
            HStack(spacing: 6) {
                Button(W.tr("Odložit", "Snooze")) { alarm.snoozeNow() }
                    .tint(W.tile)
                Button(W.tr("Vypnout", "Stop")) { alarm.stop() }
                    .tint(W.amber)
                    .foregroundStyle(.black)
            }
            .font(.system(size: 14, weight: .semibold))
        }
        .containerBackground(W.glow(W.Glow.strain), for: .navigation)
    }
}
