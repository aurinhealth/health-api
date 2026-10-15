import AppIntents
import Foundation

/// Siri and the Shortcuts app: today's readiness, water and a weigh-in, without
/// opening the app. The intents run in the app's process (launched in the
/// background when needed), so they reuse the signed-in model when it is there.
/// The phrases are Czech here; Shared/en.lproj/AppShortcuts.strings has the
/// English. Siri itself speaks no Czech: a Czech phone's Siri in English uses
/// the English phrases, the Shortcuts app and Spotlight show the Czech ones.
struct AurinShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: ReadinessTodayIntent(), phrases: [
            "Připravenost dnes v aplikaci \(.applicationName)",
            "Jakou mám dnes připravenost v aplikaci \(.applicationName)",
            "\(.applicationName) připravenost"
        ], shortTitle: "Připravenost dnes", systemImageName: "waveform.path.ecg")
        AppShortcut(intent: AddWaterIntent(), phrases: [
            "Zapsat vodu v aplikaci \(.applicationName)",
            "Přidat sklenici vody v aplikaci \(.applicationName)",
            "\(.applicationName) voda"
        ], shortTitle: "Zapsat vodu", systemImageName: "drop")
        AppShortcut(intent: LogWeightIntent(), phrases: [
            "Zapsat váhu v aplikaci \(.applicationName)",
            "Zapiš moji váhu do aplikace \(.applicationName)",
            "\(.applicationName) váha"
        ], shortTitle: "Zapsat váhu", systemImageName: "scalemass")
    }
}

/// "Připravenost dnes": the number and its word from Today, read aloud.
struct ReadinessTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "Připravenost dnes"
    static var description = IntentDescription("Řekne dnešní připravenost a co s ní dnes dělat.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let model = AppModel.live
        let api = model?.api ?? APIClient()
        let signedIn = model.map { $0.phase == .signedIn } ?? api.hasSession
        guard signedIn else {
            return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut))
        }
        let day = AppModel.localDate(Date())
        // Today as the app last showed it; the server only when that has no
        // number yet (the night may have come in since).
        var today = [model?.today, SnapshotCache.load(TodaySnapshot.self, key: "today")?.value]
            .compactMap { $0 }.first { $0.date == day }
        if today?.readiness.score == nil, let fresh = try? await api.today(), fresh.date == day {
            WidgetBridge.update(fresh)
            today = fresh
        }
        let text = SiriAnswer.readiness(score: today?.readiness.score, zone: today?.readiness.zone,
                                        advice: today?.summary?.recommendation)
        return .result(dialog: SiriAnswer.dialog(text))
    }
}

/// "Zapsat váhu": a weigh-in the way Zdraví → Váha saves it (the outbox
/// without signal, Apple Health when switched on in Synchronizace). The number
/// is in the app's units, kg or lb, like the sheet there.
struct LogWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "Zapsat váhu"
    static var description = IntentDescription("Zapíše dnešní váhu.")

    /// What Zdraví → Váha accepts, in kg.
    static let range: ClosedRange<Double> = 30...300

    @Parameter(title: "Váha", requestValueDialog: IntentDialog("Kolik vážíš?"))
    var weight: Double

    init() {}

    init(weight: Double) {
        self.weight = weight
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let kg = Units.kg(weight)
        guard Self.range.contains(kg) else {
            let text = L10n.f("Váha musí být mezi %@ a %@.", Units.weightText(Self.range.lowerBound, digits: 0), Units.weightText(Self.range.upperBound, digits: 0))
            return .result(dialog: SiriAnswer.dialog(text))
        }
        let sent: Bool
        do {
            if let model = AppModel.live {
                guard model.phase == .signedIn else { return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut)) }
                sent = try await model.addWeight(kg: kg, reload: false)
            } else {
                sent = try await Self.sendWithoutModel(kg: kg)
            }
        } catch APIError.unauthorized {
            return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut))
        } catch {
            return .result(dialog: SiriAnswer.dialog(L10n.f("Neuloženo – %@: %@", L10n.tr("Váha"), error.localizedDescription)))
        }
        return .result(dialog: SiriAnswer.dialog(SiriAnswer.weight(kg: kg, sent: sent)))
    }

    /// The app's process without its model (not seen so far, kept as a fallback):
    /// the same request, and without signal the same outbox file the app sends
    /// from when it opens. No model holds that file in memory meanwhile.
    @MainActor
    private static func sendWithoutModel(kg: Double) async throws -> Bool {
        let api = APIClient()
        guard api.hasSession else { throw APIError.unauthorized }
        let date = AppModel.localDate(Date())
        let item = AppModel.weightItem(kg: kg, date: date)
        Task { await AppleHealthExport.shared.saveWeight(kg: kg, date: date) }
        do {
            _ = try await api.sendQueued(item)
            return true
        } catch where Outbox.isNoConnection(error) {
            OutboxStore.save(OutboxStore.load() + [item])
            return false
        }
    }
}

/// What Siri says, in the app's language (L10n), like the widgets.
enum SiriAnswer {
    static var signedOut: String { L10n.tr("Nejdřív se přihlas v aplikaci Aurin.") }

    /// "Připravenost je dnes 78, vysoká." and Today's advice when there is one.
    static func readiness(score: Int?, zone: String?, advice: String?) -> String {
        guard let score else {
            return L10n.tr("Dnešní připravenost zatím není. Ukáže se, až hodinky nahrají dnešní spánek.")
        }
        let word: String? = switch zone {
        case "green": "vysoká"
        case "yellow": "střední"
        case "red": "nízká"
        default: nil
        }
        var text = word.map { L10n.f("Připravenost je dnes %d, %@.", score, L10n.tr($0)) } ?? L10n.f("Připravenost je dnes %d.", score)
        if let advice = advice?.trimmingCharacters(in: .whitespacesAndNewlines), !advice.isEmpty { text += " " + advice }
        return text
    }

    /// "Zapsáno 82,4 kg." in the app's units.
    static func weight(kg: Double, sent: Bool) -> String {
        let text = L10n.f("Zapsáno %@.", Units.weightText(kg))
        return sent ? text : text + " " + L10n.tr("Odešle se, až bude signál.")
    }

    /// The text as it is: interpolated, so it is never looked up as a key.
    static func dialog(_ text: String) -> IntentDialog {
        IntentDialog("\(text)")
    }
}
