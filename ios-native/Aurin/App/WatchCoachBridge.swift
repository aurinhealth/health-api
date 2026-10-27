import Foundation
import WatchConnectivity

/// The watch's coach (WatchShared/WatchCoach.swift): the question goes to the
/// server as from the app, in the chat it continues (or the latest one from
/// the last hours, so the watch and the iPhone talk in one chat), and the
/// answer goes back as a message, or queued when the watch is out of reach.
extension WatchBridge {
    func askCoach(_ ask: WatchCoach.Ask) async {
        let api = AppModel.live?.api ?? APIClient()
        var chatId = ask.chatId
        if chatId == nil, let latest = try? await api.chats().first, Self.recent(latest.updatedAt) { chatId = latest.id }
        var answer = ""
        var lastProgress = Date.distantPast
        var result = WatchCoach.Answer(id: ask.id, text: "", chatId: chatId, failed: false, proposal: false)
        do {
            for try await event in api.askCoach(ask.text, chatId: chatId, view: ask.view) {
                switch event {
                case .progress(let text):
                    // A line every few seconds is enough for the wrist.
                    guard !text.isEmpty, Date().timeIntervalSince(lastProgress) > 2 else { continue }
                    lastProgress = Date()
                    sendCoach([WatchCoach.progressKey: text], queue: false)
                case .answer(let text): answer = text
                case .done(let done):
                    if let text = done.answer { answer = text }
                    if let chat = done.chatId { result.chatId = chat }
                    result.proposal = !(done.actions ?? []).isEmpty || done.kind == "food_draft"
                }
            }
            result.text = SiriAnswer.coach(answer, proposal: false)
        } catch APIError.aiConsentRequired {
            result.failed = true
            result.text = L10n.tr("Nejdřív v aplikaci povol AI kouče.")
        } catch APIError.subscriptionRequired {
            result.failed = true
            result.text = L10n.tr("Kouč je součástí Aurin Pro.")
        } catch {
            result.failed = true
            result.text = (error as? LocalizedError)?.errorDescription ?? L10n.tr("Kouč teď neodpověděl.")
        }
        if let data = result.encoded() { sendCoach([WatchCoach.answerKey: data], queue: true) }
    }

    private func sendCoach(_ message: [String: Any], queue: Bool) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in
                if queue { WCSession.default.transferUserInfo(message) }
            }
        } else if queue {
            session.transferUserInfo(message)
        }
    }

    /// The chat was written in during the last 6 hours.
    private static func recent(_ text: String?) -> Bool {
        guard let text else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
            ?? DateFormatter.sqlite.date(from: text)
        guard let date else { return false }
        return Date().timeIntervalSince(date) < 6 * 3600
    }
}

private extension DateFormatter {
    /// "2026-10-27 21:04:05" as D1 writes it, in UTC.
    static let sqlite: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()
}
