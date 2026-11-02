import AVFoundation
import AudioToolbox
import CoreHaptics
import SwiftUI

/// Sound and vibration in Režim tréninku: the end of a rest and the moves of
/// warm-up and stretching, with a countdown of the last seconds. Chosen in
/// Nastavení → Posilovna and in the workout's Vibrace button.
@MainActor enum GymSignals {
    static let vibrationKey = "gym.signals.vibration"
    static let soundKey = "gym.signals.sound"
    static let countdownKey = "gym.signals.countdown"
    /// Off, the last 3 s or the last 5 s.
    static let countdowns = [0, 3, 5]

    static var vibration: Bool { UserDefaults.standard.object(forKey: vibrationKey) as? Bool ?? true }
    static var sound: Bool { UserDefaults.standard.bool(forKey: soundKey) }
    static var countdown: Int { UserDefaults.standard.object(forKey: countdownKey) as? Int ?? 3 }

    enum Signal {
        /// One of the last seconds.
        case tick
        /// A move begins.
        case start
        /// The rest or the move is over.
        case end
    }

    /// `withSound` false: the tones are already planned (`planRest`).
    static func play(_ signal: Signal, withSound: Bool = true) {
        if vibration { vibrate(signal) }
        if sound, withSound { beep(signal) }
    }

    /// A tick in the countdown when `left` seconds remain.
    static func counts(_ left: Int) -> Bool { left > 0 && left <= countdown }

    // MARK: Vibration

    /// Full vibrations, not the light taps of a button: the phone lies on a
    /// bench or the floor and is felt (and heard) from there too.
    private static var engine: CHHapticEngine?

    private static func vibrate(_ signal: Signal) {
        let pulses: [(at: Double, length: Double)] = switch signal {
        case .tick: [(0, 0.12)]
        case .start: [(0, 0.4)]
        case .end: [(0, 0.4), (0.6, 0.4)]
        }
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics, let engine = startedEngine() else {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            return
        }
        let events = pulses.map { pulse in
            CHHapticEvent(eventType: .hapticContinuous, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
            ], relativeTime: pulse.at, duration: pulse.length)
        }
        do {
            let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameters: []))
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        }
    }

    private static func startedEngine() -> CHHapticEngine? {
        if engine == nil {
            guard let made = try? CHHapticEngine() else { return nil }
            made.playsHapticsOnly = true
            made.isAutoShutdownEnabled = true
            // iOS stops it (the app in the background, a call): the next signal starts it again.
            made.resetHandler = { [weak made] in try? made?.start() }
            engine = made
        }
        try? engine?.start()
        return engine
    }

    // MARK: Sound

    private static let audio = AVAudioEngine()
    private static let player = AVAudioPlayerNode()
    private static let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)
    private static var release = 0

    /// A short tone over the music, which goes quieter for a moment.
    private static func beep(_ signal: Signal) {
        let tones: [(at: Double, hz: Double, length: Double)] = switch signal {
        case .tick: [(0, 880, 0.08)]
        case .start: [(0, 1_175, 0.25)]
        case .end: [(0, 1_320, 0.3), (0.5, 1_320, 0.3)]
        }
        let session = AVAudioSession.sharedInstance()
        // A planned rest is playing: its own tones say it.
        guard !resting, let format, let buffer = buffer(tones, format: format) else { return }
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers, .duckOthers])
            try session.setActive(true)
            if !audio.attachedNodes.contains(player) {
                audio.attach(player)
                audio.connect(player, to: audio.mainMixerNode, format: format)
            }
            if !audio.isRunning { try audio.start() }
        } catch {
            return
        }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        player.play()
        // The music comes back up once the signals stop for a while.
        release += 1
        let call = release
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            guard call == release, !resting else { return }
            player.stop()
            audio.stop()
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    /// The rest's countdown and end planned on the sound's own clock, so they
    /// sound with the phone locked too (the app may play audio in the
    /// background). Over the music without making it quieter: a rest is long.
    /// False when nothing was planned (sound off): the caller sounds the end itself.
    @discardableResult
    static func planRest(until end: Date) -> Bool {
        stopRest()
        let left = end.timeIntervalSinceNow
        guard sound, left > 0.3, let format else { return false }
        var tones: [(at: Double, hz: Double, length: Double)] = []
        for second in stride(from: countdown, through: 1, by: -1) where Double(second) < left {
            tones.append((left - Double(second), 880, 0.08))
        }
        tones += [(left, 1_320, 0.3), (left + 0.5, 1_320, 0.3)]
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            if !audio.attachedNodes.contains(player) {
                audio.attach(player)
                audio.connect(player, to: audio.mainMixerNode, format: format)
            }
            if !audio.isRunning { try audio.start() }
        } catch {
            return false
        }
        player.stop()
        for tone in tones {
            // Each tone alone, at its time from the start of the player.
            guard let buffer = buffer([(0, tone.hz, tone.length)], format: format) else { continue }
            player.scheduleBuffer(buffer, at: AVAudioTime(sampleTime: AVAudioFramePosition(tone.at * format.sampleRate), atRate: format.sampleRate))
        }
        player.play()
        resting = true
        plannedEnd = end
        release += 1
        let call = release
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(left + 2))
            guard call == release else { return }
            stopRest()
        }
        return true
    }

    /// The rest skipped or changed: its planned tones stop. With `end`, only
    /// that rest's (a newer rest may already be planned).
    static func stopRest(_ end: Date? = nil) {
        guard resting, end == nil || end == plannedEnd else { return }
        resting = false
        plannedEnd = nil
        release += 1
        player.stop()
        audio.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static var resting = false
    private static var plannedEnd: Date?

    /// The tones with the silence between them, as one sound.
    private static func buffer(_ tones: [(at: Double, hz: Double, length: Double)], format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let rate = format.sampleRate
        let total = tones.map { $0.at + $0.length }.max() ?? 0
        let frames = AVAudioFrameCount(total * rate)
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames), let samples = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frames
        for i in 0..<Int(frames) { samples[i] = 0 }
        for tone in tones {
            let from = Int(tone.at * rate), count = Int(tone.length * rate)
            let fade = Double(min(441, count / 4))
            for i in 0..<count where from + i < Int(frames) {
                // Soft edges, so the tone doesn't click.
                let edge = min(1, Double(i) / fade, Double(count - i) / fade)
                samples[from + i] = Float(sin(2 * .pi * tone.hz * Double(i) / rate) * 0.5 * edge)
            }
        }
        return buffer
    }
}

/// The Vibrace button in Režim tréninku: what sounds, and the countdown.
struct GymSignalsMenu: View {
    /// Only the icon, when the row is too narrow for the word (its icon shows the mode).
    var compact = false
    @AppStorage(GymSignals.vibrationKey) private var vibration = true
    @AppStorage(GymSignals.soundKey) private var sound = false
    @AppStorage(GymSignals.countdownKey) private var countdown = 3

    var body: some View {
        Menu {
            Picker(selection: mode) {
                Label("Jen vibrace", systemImage: "iphone.radiowaves.left.and.right").tag("vibration")
                Label("Vibrace a zvuk", systemImage: "speaker.wave.2").tag("both")
                Label("Ticho", systemImage: "bell.slash").tag("silent")
            } label: {
                Text("Signály")
            }
            .pickerStyle(.inline)
            Picker(selection: $countdown) {
                ForEach(GymSignals.countdowns, id: \.self) { Text(GymSignalsGroup.label($0)).tag($0) }
            } label: {
                Text("Odpočet")
            }
            .pickerStyle(.inline)
        } label: {
            ToolChip(systemImage: icon, title: compact ? nil : L10n.tr(title))
        }
        .accessibilityLabel(L10n.tr("Zvuk a vibrace"))
    }

    private var mode: Binding<String> {
        Binding(get: { vibration ? (sound ? "both" : "vibration") : (sound ? "sound" : "silent") },
                set: { vibration = $0 == "vibration" || $0 == "both"; sound = $0 == "both" })
    }

    private var title: String {
        vibration ? (sound ? "Vibrace a zvuk" : "Vibrace") : (sound ? "Zvuk" : "Ticho")
    }

    private var icon: String {
        sound ? "speaker.wave.2" : vibration ? "iphone.radiowaves.left.and.right" : "bell.slash"
    }
}

/// A small outlined capsule with an icon and a word (the row under the header in Režim tréninku).
struct ToolChip: View {
    let systemImage: String
    var tint: Color = Palette.ink
    /// nil: only the icon, in a capsule at least 44 pt wide.
    var title: String?

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage).scaledFont(13, weight: .medium).foregroundStyle(tint)
            if let title {
                Text(verbatim: title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .frame(minWidth: 44)
        .frame(height: 34)
        .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
        .contentShape(Capsule())
    }
}

/// Nastavení → Posilovna: vibration, sound and the countdown.
struct GymSignalsGroup: View {
    @AppStorage(GymSignals.vibrationKey) private var vibration = true
    @AppStorage(GymSignals.soundKey) private var sound = false
    @AppStorage(GymSignals.countdownKey) private var countdown = 3

    var body: some View {
        SettingsGroup(title: "Zvuk a vibrace", footer: "Konec pauzy, rozcvička a protažení.") {
            SettingsToggle(title: "Vibrace", isOn: $vibration)
            SettingsDivider()
            SettingsToggle(title: "Zvuk", isOn: $sound)
            SettingsDivider()
            HStack {
                Text("Odpočet").font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Picker(L10n.tr("Odpočet"), selection: $countdown) {
                    ForEach(GymSignals.countdowns, id: \.self) { Text(Self.label($0)).tag($0) }
                }
                .pickerStyle(.menu)
                .tint(Palette.muted)
                .labelsHidden()
            }
            .padding(.leading, 16).padding(.trailing, 8).frame(minHeight: 50)
        }
    }

    static func label(_ seconds: Int) -> String {
        switch seconds {
        case 0: L10n.tr("Vypnuto")
        case 3: L10n.tr("Poslední 3 s")
        default: L10n.f("Posledních %@ s", "\(seconds)")
        }
    }
}
