import SwiftUI

/// The top of Spánek: tonight on a 24-hour dial with the bedtime (moon) and the
/// wake time (sun) as handles, the two times as tiles, "Dnes chci" (how long to
/// sleep tonight) and why tonight's need is what it is.
///
/// Dragging the sun moves tomorrow's wake time (the bedtime follows), dragging
/// the moon changes how long to sleep. Both save when the finger lifts.
struct SleepPlanner: View {
    let tonight: HealthSnapshot.Tonight
    /// The usual bedtime of the last nights ("23:48"), a dot on the dial.
    let usual: String?
    let saving: Bool
    /// Tomorrow is a Saturday or Sunday: the wake sheet offers every weekend day.
    let weekendMorning: Bool
    /// Tonight's own length (nil = the whole need) and wake time (nil = the alarm).
    let onChoose: (Int?, Int?) -> Void
    /// A new alarm for every work day (false) or weekend day (true).
    let onEveryDay: (Int, Bool) -> Void

    @State private var wake = 0
    @State private var sleep = 0
    @State private var dragging = false
    @State private var editingWake = false

    private var need: Int { tonight.need }
    /// Asleep per minute in bed, from the server's plan (time to fall asleep and wake-ups).
    private var efficiency: Double {
        guard let s = tonight.sleep, let b = tonight.inBed, b > 0, s > 0 else { return 0.9 }
        return min(0.97, max(0.8, Double(s) / Double(b)))
    }
    private func inBed(_ minutes: Int) -> Int { Int((Double(minutes) / efficiency / 5).rounded()) * 5 }
    private var bed: Int { SleepPlanner.wrap(wake - inBed(sleep)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(spacing: 14) {
                SleepDial(bed: bed, wake: wake, sleep: sleep, usual: usual.flatMap(Reminders.minutes),
                          onWake: { wake = $0; dragging = true },
                          onBed: { newBed in
                              dragging = true
                              let asleep = Double(SleepPlanner.wrap(wake - newBed)) * efficiency
                              sleep = min(720, max(300, Int((asleep / 5).rounded()) * 5))
                          },
                          onEnd: commit)
                    .frame(maxWidth: 300)
                    .frame(maxWidth: .infinity)
                    .opacity(saving ? 0.6 : 1)

                HStack(spacing: 10) {
                    tile(title: "Do postele", symbol: "moon.fill", color: Palette.indigo, time: bed, note: nil)
                    Button { editingWake = true } label: {
                        tile(title: "Vstávání", symbol: "sun.max.fill", color: Palette.amber, time: wake,
                             note: tonight.wakeOnce == true ? L10n.tr("jen zítra") : nil, chevron: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Změní čas vstávání")
                }
            }

            if !levels.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    caption("Dnes chci")
                    HStack(spacing: 8) {
                        ForEach(levels, id: \.minutes) { level in
                            chip(level)
                        }
                    }
                }
            }

            if !reasons.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    caption(L10n.f("Proč %@", SleepPlanner.short(need)))
                    VStack(spacing: 0) {
                        ForEach(Array(reasons.enumerated()), id: \.offset) { i, r in
                            if i > 0 { SettingsDivider() }
                            HStack {
                                Text(r.title).font(.body).foregroundStyle(Palette.ink)
                                Spacer(minLength: 8)
                                Text(r.value).font(.body.weight(.medium)).monospacedDigit()
                                    .foregroundStyle(r.tone)
                            }
                            .padding(.horizontal, 16).frame(minHeight: 46)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .cardSurface(cornerRadius: 22)
                }
            }
        }
        .onAppear(perform: load)
        .onChange(of: tonight) { _, _ in if !dragging { load() } }
        .sheet(isPresented: $editingWake) {
            WakeSheet(wake: wake, sleep: sleep, efficiency: efficiency, weekend: weekendMorning) { minutes, every in
                wake = minutes
                if every { onEveryDay(minutes, weekendMorning) } else { onChoose(tonight.chosen, minutes) }
            }
        }
    }

    private func load() {
        wake = tonight.wake.flatMap(Reminders.minutes) ?? 7 * 60
        sleep = tonight.sleep ?? need
    }

    /// The finger lifted: tonight's own length (none when it is the need) and
    /// the wake time (none when it is the alarm's).
    private func commit() {
        dragging = false
        let original = tonight.wake.flatMap(Reminders.minutes)
        let ownWake: Int? = wake == original && tonight.wakeOnce != true ? nil : wake
        onChoose(sleep == need ? nil : sleep, ownWake)
    }

    // MARK: Dnes chci

    struct Level { let title: String; let minutes: Int }

    /// The whole need, the need without the debt (when there is debt) and at
    /// least 7 hours (when the need is longer).
    private var levels: [Level] {
        var list = [Level(title: tonight.debt > 0 ? L10n.tr("Dospat") : L10n.tr("Celou potřebu"), minutes: need)]
        if tonight.debt > 0, need - tonight.debt > 420 { list.append(Level(title: L10n.tr("Normálně"), minutes: need - tonight.debt)) }
        if need > 420 { list.append(Level(title: L10n.tr("Aspoň"), minutes: 420)) }
        return list.count > 1 ? list : []
    }

    private func chip(_ level: Level) -> some View {
        let on = sleep == level.minutes
        return Button {
            sleep = level.minutes
            commit()
        } label: {
            VStack(spacing: 3) {
                Text(level.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(SleepPlanner.short(level.minutes)).font(Typo.caption).monospacedDigit().foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .background(on ? Palette.lilac : Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(on ? Palette.indigo : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(saving)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Proč

    struct Reason { let title: String; let value: String; let tone: Color }

    /// The goal and what tonight adds or takes; the last row closes the sum when
    /// the need stops at its limits (7–9 h by age, 6–10 h with an own goal).
    private var reasons: [Reason] {
        var list = [Reason(title: tonight.goalSet == true ? L10n.tr("Tvůj cíl") : L10n.tr("Cíl podle věku"), value: SleepPlanner.short(tonight.base), tone: Palette.ink)]
        func add(_ title: String, _ minutes: Int) {
            guard minutes != 0 else { return }
            list.append(Reason(title: L10n.tr(title), value: (minutes > 0 ? "+" : "−") + L10n.f("%@ min", String(abs(minutes))),
                               tone: minutes > 0 ? Palette.indigo : Palette.green))
        }
        add("Dnešní zátěž", tonight.strain)
        add("Nízká HRV", tonight.hrv)
        add("Spánkový dluh", tonight.debt)
        add("Odpolední šlofík", -tonight.naps)
        let rest = need - (tonight.base + tonight.strain + tonight.hrv + tonight.debt - tonight.naps)
        add(rest < 0 ? "Horní hranice" : "Dolní hranice", rest)
        return list.count > 1 ? list : []
    }

    // MARK: Parts

    private func tile(title: String, symbol: String, color: Color, time: Int, note: String?, chevron: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: symbol).scaledFont(12, weight: .semibold).foregroundStyle(color)
                Text(L10n.tr(title)).font(Typo.small).foregroundStyle(Palette.muted)
                Spacer(minLength: 0)
                if chevron { Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint) }
            }
            Text(ClockText.format(minutes: time)).font(Typo.number(36)).foregroundStyle(Palette.ink)
                .contentTransition(.numericText())
            if let note { Text(note).font(Typo.caption).foregroundStyle(Palette.muted) }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .accessibilityElement(children: .combine)
    }

    private func caption(_ text: String) -> some View {
        Text(L10n.tr(text)).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
            .padding(.horizontal, 4)
            .accessibilityAddTraits(.isHeader)
    }

    /// 510 → "8 h 30", 480 → "8 h 00".
    static func short(_ minutes: Int) -> String {
        "\(minutes / 60) h " + String(format: "%02d", minutes % 60)
    }

    static func wrap(_ minutes: Int) -> Int { ((minutes % 1440) + 1440) % 1440 }
}

/// A 24-hour dial (midnight at the top) with the night as an arc from the
/// bedtime to the wake time; both ends are handles.
struct SleepDial: View {
    let bed: Int
    let wake: Int
    let sleep: Int
    let usual: Int?
    let onWake: (Int) -> Void
    let onBed: (Int) -> Void
    let onEnd: () -> Void

    private let ring: CGFloat = 24

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let r = size / 2 - ring / 2 - 6
            let c = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                Circle().stroke(Palette.track, lineWidth: ring).frame(width: r * 2, height: r * 2).position(c)
                Circle()
                    .trim(from: 0, to: CGFloat(SleepPlanner.wrap(wake - bed)) / 1440)
                    .stroke(LinearGradient(colors: [Palette.indigo.opacity(0.75), Palette.indigo], startPoint: .topLeading, endPoint: .bottomTrailing),
                            style: StrokeStyle(lineWidth: ring, lineCap: .round))
                    .rotationEffect(.degrees(Double(bed) / 1440 * 360 - 90))
                    .frame(width: r * 2, height: r * 2).position(c)
                ForEach(Array(stride(from: 0, to: 24, by: 3)), id: \.self) { h in
                    Text("\(h)").font(.caption2).foregroundStyle(Palette.faint)
                        .position(point(h * 60, r - ring / 2 - 14, c))
                }
                if let usual {
                    Circle().fill(Palette.faint).frame(width: 6, height: 6).position(point(usual, r + ring / 2 + 5, c))
                        .accessibilityHidden(true)
                }
                VStack(spacing: 2) {
                    Text(SleepPlanner.short(sleep)).font(Typo.number(42)).foregroundStyle(Palette.ink)
                        .contentTransition(.numericText())
                    Text("spánek").font(Typo.small).foregroundStyle(Palette.muted)
                }
                .position(c)
                .accessibilityElement(children: .combine)
                handle(symbol: "moon.fill", color: Palette.indigo, at: bed, r: r, c: c, label: "Do postele", change: onBed)
                handle(symbol: "sun.max.fill", color: Palette.amber, at: wake, r: r, c: c, label: "Vstávání", change: onWake)
            }
            .coordinateSpace(name: "dial")
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func handle(symbol: String, color: Color, at minutes: Int, r: CGFloat, c: CGPoint, label: String, change: @escaping (Int) -> Void) -> some View {
        Image(systemName: symbol)
            .scaledFont(13, weight: .bold, cap: .denseCap)
            .foregroundStyle(color)
            .frame(width: 32, height: 32)
            .background(Circle().fill(Palette.card))
            .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
            .frame(width: 48, height: 48)
            .contentShape(Circle())
            .position(point(minutes, r, c))
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .named("dial"))
                    .onChanged { g in change(clockMinutes(at: g.location, c)) }
                    .onEnded { _ in onEnd() }
            )
            .accessibilityElement()
            .accessibilityLabel(L10n.tr(label))
            .accessibilityValue(ClockText.format(minutes: minutes))
            .accessibilityAdjustableAction { direction in
                change(SleepPlanner.wrap(minutes + (direction == .increment ? 5 : -5)))
                onEnd()
            }
    }

    private func point(_ minutes: Int, _ radius: CGFloat, _ c: CGPoint) -> CGPoint {
        let a = CGFloat(minutes) / 1440 * 2 * .pi - .pi / 2
        return CGPoint(x: c.x + radius * cos(a), y: c.y + radius * sin(a))
    }

    /// The time under the finger, in 5-minute steps.
    private func clockMinutes(at p: CGPoint, _ c: CGPoint) -> Int {
        var a = atan2(Double(p.y - c.y), Double(p.x - c.x)) + .pi / 2
        if a < 0 { a += 2 * .pi }
        return SleepPlanner.wrap(Int((a / (2 * .pi) * 1440 / 5).rounded()) * 5)
    }
}

/// Tomorrow's wake time: for tomorrow only, or for every work day (weekend
/// day) as the alarm. The bedtime under it follows the wheel.
struct WakeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let wake: Int
    let sleep: Int
    let efficiency: Double
    let weekend: Bool
    let done: (Int, Bool) -> Void

    @State private var time = Date()
    @State private var every = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Button("Zrušit") { dismiss() }.foregroundStyle(Palette.muted)
                Spacer()
                Text("Zítra vstávám").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Spacer()
                Button("Hotovo") { done(minutes, every); dismiss() }.fontWeight(.semibold).foregroundStyle(Palette.indigo)
            }
            DatePicker("Zítra vstávám", selection: $time, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .environment(\.locale, Fmt.locale)
                .frame(maxWidth: .infinity)
            Picker("", selection: $every) {
                Text("Jen zítra").tag(false)
                Text(weekend ? "Každý víkend" : "Každý pracovní den").tag(true)
            }
            .pickerStyle(.segmented)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("Do postele").font(Typo.small).foregroundStyle(Palette.muted)
                Text(ClockText.format(minutes: SleepPlanner.wrap(minutes - Int((Double(sleep) / efficiency / 5).rounded()) * 5)))
                    .font(Typo.number(36)).foregroundStyle(Palette.indigo)
                    .contentTransition(.numericText())
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.height(440)])
        .glassSheetBackground()
        .onAppear { time = SleepSettingsForm.clock(SleepSettingsForm.text(minutes: wake)) }
    }

    private var minutes: Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
}
