import SwiftUI
import AVFoundation

/// The coach, from the button at the top right of Readiness (and the rest
/// screen of the gym): a big microphone to say the question (the keyboard and
/// scribble are in the same input), a few questions to tap under it, then
/// what the coach is doing and its answer in large type with Read aloud. The
/// chat is the one in the app on the iPhone.
struct CoachView: View {
    var view = "today"
    @ObservedObject private var coach = CoachStore.shared
    @State private var speaker = CoachSpeaker()

    private var ideas: [String] {
        view == "gym"
            ? [W.tr("Čím nahradit tenhle cvik?", "What can I swap this exercise for?"), W.tr("Mám přidat váhu?", "Should I add weight?")]
            : [W.tr("Co mám dnes trénovat?", "What should I train today?"), W.tr("Jaký byl můj spánek?", "How did I sleep?"),
               W.tr("Co mám ještě sníst?", "What should I still eat?")]
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(coach.turns) { turn in
                        TurnView(turn: turn, speaker: speaker).id(turn.id)
                    }
                    if coach.waiting {
                        WaitRow(text: coach.progress ?? W.tr("Kouč přemýšlí…", "The coach is thinking…"), since: coach.askedAt)
                            .id("waiting")
                    } else {
                        input
                        if coach.turns.isEmpty {
                            ForEach(ideas, id: \.self) { idea in
                                Button { coach.ask(idea, view: view) } label: {
                                    Text(idea)
                                        .watchFont(13)
                                        .foregroundStyle(W.ink)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 8)
                                        .background(W.tile, in: RoundedRectangle(cornerRadius: 12))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: coach.turns) { _, turns in
                guard let last = turns.last else { return }
                withAnimation { proxy.scrollTo(last.id, anchor: .top) }
            }
        }
        .navigationTitle(W.tr("Kouč", "Coach"))
        .containerBackground(W.glow(W.Glow.coach), for: .navigation)
        .onDisappear { speaker.stop() }
    }

    /// The microphone: a tap opens the watch's input (dictation first, then
    /// scribble or the keyboard), and the question goes when it closes.
    private var input: some View {
        TextFieldLink(prompt: Text(W.tr("Zeptej se kouče", "Ask the coach"))) {
            VStack(spacing: 4) {
                Image(systemName: "mic.fill")
                    .watchFont(24, .semibold)
                    .foregroundStyle(.black)
                    .frame(width: 58, height: 58)
                    .background(W.indigo, in: Circle())
                Text(coach.turns.isEmpty ? W.tr("Zeptej se kouče", "Ask the coach") : W.tr("Další otázka", "Ask again"))
                    .watchFont(12)
                    .foregroundStyle(W.muted)
            }
            .frame(maxWidth: .infinity)
        } onSubmit: { text in
            let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !question.isEmpty else { return }
            coach.ask(question, view: view)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(W.tr("Zeptej se kouče", "Ask the coach"))
    }
}

private struct TurnView: View {
    let turn: CoachStore.Turn
    let speaker: CoachSpeaker

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(turn.question)
                .watchFont(12)
                .foregroundStyle(W.muted)
            if let answer = turn.answer {
                if let seconds = turn.seconds, !turn.failed {
                    Text(W.tr("Odpověď za \(seconds) s", "Answered in \(seconds) s"))
                        .watchFont(12)
                        .foregroundStyle(W.muted)
                }
                Text(answer)
                    .font(W.news(17))
                    .foregroundStyle(turn.failed ? W.amber : W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if turn.proposal {
                    Label(W.tr("Návrh potvrdíš v iPhonu u kouče.", "Confirm the proposal on your iPhone."), systemImage: "iphone")
                        .watchFont(12)
                        .foregroundStyle(W.secondary)
                }
                if turn.failed {
                    // Watch audit G3: the question again, without dictating it anew.
                    Button { CoachStore.shared.retry(turn.id) } label: {
                        Label(W.tr("Zkusit znovu", "Try again"), systemImage: "arrow.clockwise")
                            .watchFont(13, .medium)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button { speaker.read(answer) } label: {
                        Label(W.tr("Přečíst", "Read aloud"), systemImage: "speaker.wave.2.fill")
                            .watchFont(13, .medium)
                    }
                    .tint(W.indigo)
                }
            }
        }
    }
}

/// What the coach is doing, as on the iPhone: the dots, the step and "· 4 s"
/// from 3 s. VoiceOver reads the step only.
private struct WaitRow: View {
    let text: String
    let since: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let still = reduceMotion || ProcessInfo.processInfo.isLowPowerModeEnabled
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            TimelineView(.animation(minimumInterval: 1.0 / 20, paused: still)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { i in
                        Circle().fill(W.ink).frame(width: 5, height: 5)
                            .opacity(still ? 0.55 : Self.opacity(t, i))
                    }
                }
            }
            .fixedSize()
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let seconds = since.map { Int(context.date.timeIntervalSince($0)) } ?? 0
                (Text(verbatim: text).foregroundColor(W.secondary)
                    + Text(verbatim: seconds >= 3 ? " · \(seconds) s" : "").foregroundColor(W.muted))
                    .font(W.news(14))
                    .lineLimit(3)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    /// Each dot brightens in turn, once a second (CoachDots in the app).
    private static func opacity(_ t: TimeInterval, _ i: Int) -> Double {
        let phase = (t - Double(i) * 0.18).truncatingRemainder(dividingBy: 1.0)
        return 0.25 + 0.75 * max(0, sin(phase * .pi))
    }
}

/// Reads an answer aloud in the app's language; a second answer stops the first.
@MainActor
final class CoachSpeaker {
    private let synthesizer = AVSpeechSynthesizer()

    func read(_ text: String) {
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: W.english ? "en-US" : "cs-CZ")
        synthesizer.speak(utterance)
    }

    func stop() { synthesizer.stopSpeaking(at: .immediate) }
}
