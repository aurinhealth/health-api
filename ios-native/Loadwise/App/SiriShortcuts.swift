import AppIntents
import Foundation

/// Siri and the Shortcuts app: today's readiness, workout, activity of the day
/// and sleep, a drink and a weigh-in, without opening the app. The intents run
/// in the app's process (launched in the background when needed), so they
/// reuse the signed-in model when it is there. The phrases are Czech here;
/// Shared/en.lproj/AppShortcuts.strings has the English. Siri itself speaks no
/// Czech: a Czech phone's Siri in English uses the English phrases, the
/// Shortcuts app and Spotlight show the Czech ones. At most 10 shortcuts.
struct AurinShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: ReadinessTodayIntent(), phrases: [
            "Připravenost dnes v aplikaci \(.applicationName)",
            "Jakou mám dnes připravenost v aplikaci \(.applicationName)",
            "\(.applicationName) připravenost"
        ], shortTitle: "Připravenost dnes", systemImageName: "waveform.path.ecg")
        AppShortcut(intent: WorkoutTodayIntent(), phrases: [
            "Jaký mám dnes trénink v aplikaci \(.applicationName)",
            "Trénink dnes v aplikaci \(.applicationName)",
            "\(.applicationName) trénink"
        ], shortTitle: "Trénink dnes", systemImageName: "figure.run")
        AppShortcut(intent: ActivityOfTheDayIntent(), phrases: [
            "Jaká je aktivita dne v aplikaci \(.applicationName)",
            "Aktivita dne v aplikaci \(.applicationName)",
            "\(.applicationName) aktivita dne"
        ], shortTitle: "Aktivita dne", systemImageName: "sparkles")
        AppShortcut(intent: SleepLastNightIntent(), phrases: [
            "Jak jsem dnes spal v aplikaci \(.applicationName)",
            "Spánek dnes v aplikaci \(.applicationName)",
            "\(.applicationName) spánek"
        ], shortTitle: "Spánek dnes", systemImageName: "moon.zzz")
        AppShortcut(intent: LogDrinkIntent(), phrases: [
            "Zapsat pití \(\.$drink) v aplikaci \(.applicationName)",
            "Zapsat pití v aplikaci \(.applicationName)",
            "\(.applicationName) pití \(\.$drink)"
        ], shortTitle: "Zapsat pití", systemImageName: "cup.and.saucer")
        AppShortcut(intent: AddWaterIntent(), phrases: [
            "Přidat sklenici vody v aplikaci \(.applicationName)",
            "\(.applicationName) sklenice vody"
        ], shortTitle: "Sklenice vody", systemImageName: "drop")
        AppShortcut(intent: LogWeightIntent(), phrases: [
            "Zapsat váhu v aplikaci \(.applicationName)",
            "Zapiš moji váhu do aplikace \(.applicationName)",
            "\(.applicationName) váha"
        ], shortTitle: "Zapsat váhu", systemImageName: "scalemass")
    }
}

/// Today for Siri: the signed-in model's (or the saved copy), the server's
/// when asked for or when there is none for today. nil when signed out.
@MainActor
enum SiriData {
    static var api: APIClient { AppModel.live?.api ?? APIClient() }

    static var signedIn: Bool {
        AppModel.live.map { $0.phase == .signedIn } ?? APIClient().hasSession
    }

    static func today(fresh: Bool) async -> TodaySnapshot? {
        let day = AppModel.localDate(Date())
        let shown = [AppModel.live?.today, SnapshotCache.load(TodaySnapshot.self, key: "today")?.value]
            .compactMap { $0 }.first { $0.date == day }
        guard fresh || shown == nil else { return shown }
        if let loaded = try? await api.today(), loaded.date == day {
            WidgetBridge.update(loaded)
            return loaded
        }
        return shown
    }

    /// A write when the app's process has no model (not seen so far, kept as a
    /// fallback): sent now, else into the outbox file the app sends from when
    /// it opens. No model holds that file in memory meanwhile.
    static func send(_ item: OutboxItem) async throws -> Bool {
        let api = APIClient()
        guard api.hasSession else { throw APIError.unauthorized }
        do {
            _ = try await api.sendQueued(item)
            return true
        } catch where Outbox.isNoConnection(error) {
            OutboxStore.save(OutboxStore.load() + [item])
            return false
        }
    }
}

/// "Připravenost dnes": the number and its word from Today, read aloud.
struct ReadinessTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "Připravenost dnes"
    static var description = IntentDescription("Řekne dnešní připravenost a co s ní dnes dělat.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard SiriData.signedIn else { return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut)) }
        // Today as the app last showed it; the server only when that has no
        // number yet (the night may have come in since).
        var today = await SiriData.today(fresh: false)
        if today?.readiness.score == nil { today = await SiriData.today(fresh: true) }
        let text = SiriAnswer.readiness(score: today?.readiness.score, zone: today?.readiness.zone,
                                        advice: today?.summary?.recommendation)
        return .result(dialog: SiriAnswer.dialog(text))
    }
}

/// "Trénink dnes": the day's planned workouts from Dnes, else Aktivita dne.
struct WorkoutTodayIntent: AppIntent {
    static var title: LocalizedStringResource = "Trénink dnes"
    static var description = IntentDescription("Řekne, jaký trénink máš dnes v plánu.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard SiriData.signedIn else { return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut)) }
        let today = await SiriData.today(fresh: true)
        let text = SiriAnswer.workout(plan: today?.plan ?? [], pick: CoachPick.stored?.best)
        return .result(dialog: SiriAnswer.dialog(text))
    }
}

/// "Aktivita dne": the coach's pick for today, as on the Dnes card.
struct ActivityOfTheDayIntent: AppIntent {
    static var title: LocalizedStringResource = "Aktivita dne"
    static var description = IntentDescription("Řekne, co ti kouč na dnes doporučuje.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard SiriData.signedIn else { return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut)) }
        var pick = CoachPick.stored
        if pick == nil { pick = try? await SiriData.api.coachPick() }
        return .result(dialog: SiriAnswer.dialog(SiriAnswer.activity(pick?.best)))
    }
}

/// "Spánek dnes": last night as Dnes shows it.
struct SleepLastNightIntent: AppIntent {
    static var title: LocalizedStringResource = "Spánek dnes"
    static var description = IntentDescription("Řekne, jak dlouho a jak dobře se ti dnes v noci spalo.")

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard SiriData.signedIn else { return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut)) }
        var today = await SiriData.today(fresh: false)
        if today?.sleep?.minutes == nil { today = await SiriData.today(fresh: true) }
        return .result(dialog: SiriAnswer.dialog(SiriAnswer.sleep(today?.sleep)))
    }
}

/// The drinks of Jídlo → Pití (DrinkKind.all), for Siri and Shortcuts.
enum SiriDrink: String, AppEnum {
    case water, tea, coffee, juice, milk, sport, soda, beer, wine, other

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Pití"
    static var caseDisplayRepresentations: [SiriDrink: DisplayRepresentation] = [
        .water: "Voda", .tea: "Čaj", .coffee: "Káva", .juice: "Džus", .milk: "Mléko",
        .sport: "Ionťák", .soda: "Limonáda", .beer: "Pivo", .wine: "Víno", .other: "Jiné"
    ]

    var name: String { DrinkKind.find(rawValue)?.label ?? "Jiné" }
}

/// "Zapsat pití": any drink in any unit Siri understands (ml, l, fl oz…),
/// today, the way Jídlo → Pití saves it.
struct LogDrinkIntent: AppIntent {
    static var title: LocalizedStringResource = "Zapsat pití"
    static var description = IntentDescription("Zapíše pití do dnešního dne.")

    /// What one drink may be, in ml.
    static let range: ClosedRange<Int> = 10...3000

    @Parameter(title: "Pití", default: .water)
    var drink: SiriDrink

    @Parameter(title: "Množství", defaultUnit: .milliliters, requestValueDialog: IntentDialog("Kolik?"))
    var amount: Measurement<UnitVolume>

    init() {}

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ml = Int(amount.converted(to: .milliliters).value.rounded())
        guard Self.range.contains(ml) else {
            let text = L10n.f("Množství musí být mezi %@ a %@.", Units.volumeText(Double(Self.range.lowerBound)), Units.volumeText(Double(Self.range.upperBound)))
            return .result(dialog: SiriAnswer.dialog(text))
        }
        var sent = true
        do {
            if let model = AppModel.live {
                guard model.phase == .signedIn else { return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut)) }
                model.addDrinkToday(ml: ml, kind: drink.rawValue)
            } else {
                sent = try await SiriData.send(AppModel.drinkItem(ml: ml, kind: drink.rawValue, date: AppModel.localDate(Date())))
            }
        } catch APIError.unauthorized {
            return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut))
        } catch {
            return .result(dialog: SiriAnswer.dialog(L10n.f("Neuloženo – %@: %@", L10n.tr("Pití"), error.localizedDescription)))
        }
        return .result(dialog: SiriAnswer.dialog(SiriAnswer.drink(drink.name, ml: ml, sent: sent)))
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
                let date = AppModel.localDate(Date())
                Task { await AppleHealthExport.shared.saveWeight(kg: kg, date: date) }
                sent = try await SiriData.send(AppModel.weightItem(kg: kg, date: date))
            }
        } catch APIError.unauthorized {
            return .result(dialog: SiriAnswer.dialog(SiriAnswer.signedOut))
        } catch {
            return .result(dialog: SiriAnswer.dialog(L10n.f("Neuloženo – %@: %@", L10n.tr("Váha"), error.localizedDescription)))
        }
        return .result(dialog: SiriAnswer.dialog(SiriAnswer.weight(kg: kg, sent: sent)))
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

    /// "Dnes máš v plánu: Tempo 3 × 8 min, 1 hodina 5 minut, začátek v 17:30."
    /// Done: "Dnešní trénink máš hotový: …". Nothing planned: Aktivita dne.
    static func workout(plan: [TodaySnapshot.PlanItem], pick: CoachPick.Option?) -> String {
        let workouts = plan.filter { $0.kind == "workout" }
        let open = workouts.filter { !$0.done }
        if !open.isEmpty {
            let list = open.map { item in
                var parts = [item.title]
                if let minutes = item.session?.minutes, minutes > 0 { parts.append(spoken(minutes: minutes)) }
                if let time = item.time, !time.isEmpty { parts.append(L10n.f("začátek v %@", time)) }
                return parts.joined(separator: ", ")
            }
            return L10n.f("Dnes máš v plánu: %@.", list.joined(separator: "; "))
        }
        if !workouts.isEmpty {
            return L10n.f("Dnešní trénink máš hotový: %@.", workouts.map(\.title).joined(separator: ", "))
        }
        guard let pick else { return L10n.tr("Na dnes nemáš naplánovaný trénink.") }
        return L10n.tr("Na dnes nemáš naplánovaný trénink.") + " " + L10n.f("Aktivita dne doporučuje: %@.", pick.title)
    }

    /// "Aktivita dne: Kolo, lehká jízda. Proč: …"
    static func activity(_ pick: CoachPick.Option?) -> String {
        guard let pick else { return L10n.tr("Aktivitu dne zatím nemám. Zkus to za chvíli.") }
        var text = L10n.f("Aktivita dne: %@.", pick.title)
        if let reason = pick.reason?.trimmingCharacters(in: .whitespacesAndNewlines), !reason.isEmpty { text += " " + reason }
        return text
    }

    /// "Dnes v noci: 7 hodin 12 minut spánku, od 23:48 do 7:02. Index spánku 82."
    static func sleep(_ sleep: TodaySnapshot.Sleep?) -> String {
        guard let minutes = sleep?.minutes, minutes > 0 else {
            return L10n.tr("Dnešní spánek zatím není. Ukáže se, až hodinky nahrají noc.")
        }
        var text = L10n.f("Dnes v noci: %@ spánku.", spoken(minutes: Int(minutes.rounded())))
        if let start = sleep?.start, let end = sleep?.end {
            text = L10n.f("Dnes v noci: %@ spánku, od %@ do %@.", spoken(minutes: Int(minutes.rounded())), start, end)
        }
        if let index = sleep?.index { text += " " + L10n.f("Index spánku %d.", index) }
        if let need = sleep?.need, need > Int(minutes.rounded()) + 15 {
            text += " " + L10n.f("Potřeba byla %@.", spoken(minutes: need))
        }
        return text
    }

    /// "Zapsáno: Káva, 200 ml."
    static func drink(_ name: String, ml: Int, sent: Bool) -> String {
        let text = L10n.f("Zapsáno: %@, %@.", L10n.tr(name), Units.volumeText(Double(ml)))
        return sent ? text : text + " " + L10n.tr("Odešle se, až bude signál.")
    }

    /// "1 hodina 5 minut" / "1 hour, 5 minutes": written out, so Siri reads it well.
    static func spoken(minutes: Int) -> String {
        let format = DateComponentsFormatter()
        format.unitsStyle = .full
        format.allowedUnits = [.hour, .minute]
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = L10n.locale
        format.calendar = calendar
        return format.string(from: TimeInterval(minutes * 60)) ?? Fmt.duration(minutes)
    }

    /// The text as it is: interpolated, so it is never looked up as a key.
    static func dialog(_ text: String) -> IntentDialog {
        IntentDialog("\(text)")
    }
}
