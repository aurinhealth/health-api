import Foundation
import WatchConnectivity

/// The coach on the watch: the question goes to the iPhone, which asks the
/// server in the app's chat (WatchShared/WatchCoach.swift); what it is doing
/// and the answer come back as messages. Without the iPhone in reach, the
/// watch asks the server on its own internet (WatchAPI).
@MainActor
final class CoachStore: ObservableObject {
    static let shared = CoachStore()
    private static let chatKey = "coachChat"

    struct Turn: Identifiable, Equatable {
        let id: String
        let question: String
        var answer: String?
        var failed = false
        var proposal = false
    }

    @Published private(set) var turns: [Turn] = []
    @Published private(set) var progress: String?
    @Published private(set) var waiting = false

    /// The chat the watch continues, for the rest of the day.
    private var chatId: Int? {
        get {
            let saved = UserDefaults.standard.dictionary(forKey: Self.chatKey)
            guard saved?["date"] as? String == WatchStore.localDate(Date()) else { return nil }
            return saved?["id"] as? Int
        }
        set {
            if let newValue {
                UserDefaults.standard.set(["id": newValue, "date": WatchStore.localDate(Date())], forKey: Self.chatKey)
            }
        }
    }

    func ask(_ text: String, view: String = "today") {
        let question = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !waiting else { return }
        let id = UUID().uuidString
        turns.append(Turn(id: id, question: question))
        waiting = true
        progress = nil
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isReachable,
              let data = WatchCoach.Ask(id: id, text: question, chatId: chatId, view: view).encoded() else {
            askServer(id, question, view: view)
            return
        }
        WCSession.default.sendMessage([WatchCoach.askKey: data], replyHandler: { _ in }, errorHandler: { _ in
            Task { @MainActor in CoachStore.shared.askServer(id, question, view: view) }
        })
    }

    /// Without the iPhone: the watch asks the server itself (WatchAPI).
    private func askServer(_ id: String, _ question: String, view: String) {
        guard WatchAPI.signedIn else {
            fail(id, W.tr("Hodinky nejsou přihlášené. Otevři jednou Aurin v iPhonu.", "The watch isn't signed in. Open Aurin on your iPhone once."))
            return
        }
        progress = W.tr("Ptám se kouče přes internet hodinek…", "Asking the coach over the watch's internet…")
        Task {
            do {
                var chat = chatId
                if chat == nil { chat = await WatchAPI.recentChat() }
                let result = try await WatchAPI.askCoach(question, chatId: chat, view: view)
                guard let data = WatchCoach.Answer(id: id, text: result.text, chatId: result.chatId ?? chat,
                                                   failed: false, proposal: result.proposal).encoded() else { return }
                received(answer: data)
            } catch let failure as WatchAPI.Failure {
                fail(id, failure.text)
            } catch {
                fail(id, W.tr("Kouč teď neodpověděl.", "The coach didn't answer just now."))
            }
        }
    }

    func received(progress text: String) {
        guard waiting else { return }
        progress = text
    }

    func received(answer data: Data) {
        guard let answer = WatchCoach.Answer.decode(data), let index = turns.firstIndex(where: { $0.id == answer.id }) else { return }
        turns[index].answer = answer.text
        turns[index].failed = answer.failed
        turns[index].proposal = answer.proposal
        if let chat = answer.chatId { chatId = chat }
        waiting = false
        progress = nil
    }

    private func fail(_ id: String, _ text: String) {
        if let index = turns.firstIndex(where: { $0.id == id }) {
            turns[index].answer = text
            turns[index].failed = true
        }
        waiting = false
        progress = nil
    }

    func clear() {
        guard !waiting else { return }
        turns = []
    }
}
