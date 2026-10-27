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
    @State private var draft = ""
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
                        HStack(spacing: 6) {
                            ProgressView().frame(width: 18, height: 18)
                            Text(coach.progress ?? W.tr("Kouč přemýšlí…", "The coach is thinking…"))
                                .font(W.news(14))
                                .foregroundStyle(W.secondary)
                                .lineLimit(3)
                        }
                        .id("waiting")
                    } else {
                        input
                        if coach.turns.isEmpty {
                            ForEach(ideas, id: \.self) { idea in
                                Button { coach.ask(idea, view: view) } label: {
                                    Text(idea)
                                        .font(.system(size: 13))
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
        ZStack {
            VStack(spacing: 4) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(width: 58, height: 58)
                    .background(W.amber, in: Circle())
                Text(coach.turns.isEmpty ? W.tr("Zeptej se kouče", "Ask the coach") : W.tr("Další otázka", "Ask again"))
                    .font(.system(size: 12))
                    .foregroundStyle(W.muted)
            }
            .frame(maxWidth: .infinity)
            TextField(W.tr("Zeptej se kouče", "Ask the coach"), text: $draft)
                .textFieldStyle(.plain)
                .opacity(0.02)
                .frame(height: 80)
                .onSubmit {
                    coach.ask(draft, view: view)
                    draft = ""
                }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct TurnView: View {
    let turn: CoachStore.Turn
    let speaker: CoachSpeaker

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(turn.question)
                .font(.system(size: 12))
                .foregroundStyle(W.muted)
            if let answer = turn.answer {
                Text(answer)
                    .font(W.news(17))
                    .foregroundStyle(turn.failed ? W.amber : W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if turn.proposal {
                    Label(W.tr("Návrh potvrdíš v iPhonu u kouče.", "Confirm the proposal on your iPhone."), systemImage: "iphone")
                        .font(.system(size: 11))
                        .foregroundStyle(W.secondary)
                }
                if !turn.failed {
                    Button { speaker.read(answer) } label: {
                        Label(W.tr("Přečíst", "Read aloud"), systemImage: "speaker.wave.2.fill")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .tint(W.amber)
                }
            }
        }
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
