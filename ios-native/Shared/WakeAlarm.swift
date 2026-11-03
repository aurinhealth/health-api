#if canImport(AlarmKit)
import AlarmKit
import AppIntents
import Foundation

/// The alarm from Nastavení → Spánek (App/SystemAlarm.swift). The app and the
/// widget extension both need this type: iOS shows the ringing alarm, also its
/// expanded Dynamic Island, through the extension's Live Activity
/// (AurinWidgets/WakeAlarmWidget.swift). No data travels with the alarm.
@available(iOS 26, *)
struct WakeAlarm: AlarmMetadata {}

/// "I'm up" in the alarm's Live Activity: stops it (a repeating one waits for its next day).
/// Runs in the app's process (LiveActivityIntent).
@available(iOS 26, *)
struct WakeAlarmStopIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Vypnout budík"
    static let isDiscoverable = false

    @Parameter(title: "Budík")
    var alarmID: String

    init() { alarmID = "" }
    init(alarmID: UUID) { self.alarmID = alarmID.uuidString }

    func perform() throws -> some IntentResult {
        if let id = UUID(uuidString: alarmID) { try AlarmManager.shared.stop(id: id) }
        return .result()
    }
}

/// "Snooze": rings again after SystemAlarm.snooze, as the Clock app's alarm.
@available(iOS 26, *)
struct WakeAlarmSnoozeIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Odložit budík"
    static let isDiscoverable = false

    @Parameter(title: "Budík")
    var alarmID: String

    init() { alarmID = "" }
    init(alarmID: UUID) { self.alarmID = alarmID.uuidString }

    func perform() throws -> some IntentResult {
        if let id = UUID(uuidString: alarmID) { try AlarmManager.shared.countdown(id: id) }
        return .result()
    }
}
#endif
