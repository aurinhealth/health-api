import Foundation
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

/// The alarm set in Nastavení → Spánek, rung by iOS itself (AlarmKit, iOS 26):
/// it sounds like the Clock app's alarm, also in silent mode and Focus. One
/// alarm repeats on work days, one at the weekend; changing the times replaces
/// them. Older iOS has no such API: the app only counts the bedtime from them.
enum SystemAlarm {
    private static let idsKey = "systemAlarmIDs"

    /// Whether this iPhone can have the app's alarm.
    static var supported: Bool {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) { return true }
        #endif
        return false
    }

    /// Sets the alarms ("07:00" on work days, "08:30" at the weekend, nil for
    /// none). Returns what went wrong, nil when it is set.
    static func sync(work: String?, weekend: String?) async -> String? {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) {
            do {
                let manager = AlarmManager.shared
                switch manager.authorizationState {
                case .denied: return L10n.tr("Budík nemá povolení. Zapni ho v Nastavení iPhonu → Loadwise → Budíky.")
                case .authorized: break
                default:
                    guard try await manager.requestAuthorization() == .authorized else {
                        return L10n.tr("Bez povolení budík nastavit nejde.")
                    }
                }
                cancelSaved(manager)
                var ids: [String] = []
                if let work, let id = try await schedule(manager, at: work, days: [.monday, .tuesday, .wednesday, .thursday, .friday], title: L10n.tr("Budík · pracovní den")) {
                    ids.append(id.uuidString)
                }
                if let weekend, let id = try await schedule(manager, at: weekend, days: [.saturday, .sunday], title: L10n.tr("Budík · víkend")) {
                    ids.append(id.uuidString)
                }
                UserDefaults.standard.set(ids, forKey: idsKey)
                return nil
            } catch {
                return L10n.f("Budík se nepodařilo nastavit: %@", error.localizedDescription)
            }
        }
        #endif
        return L10n.tr("Budík v iPhonu potřebuje iOS 26.")
    }

    /// Takes the app's alarms away.
    static func cancel() {
        #if canImport(AlarmKit)
        if #available(iOS 26, *) { cancelSaved(AlarmManager.shared) }
        #endif
        UserDefaults.standard.removeObject(forKey: idsKey)
    }

    #if canImport(AlarmKit)
    @available(iOS 26, *)
    private static func cancelSaved(_ manager: AlarmManager) {
        for text in UserDefaults.standard.stringArray(forKey: idsKey) ?? [] {
            if let id = UUID(uuidString: text) { try? manager.cancel(id: id) }
        }
    }

    @available(iOS 26, *)
    private static func schedule(_ manager: AlarmManager, at time: String, days: [Locale.Weekday], title: String) async throws -> UUID? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        let schedule = Alarm.Schedule.relative(.init(time: .init(hour: parts[0], minute: parts[1]), repeats: .weekly(days)))
        let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title),
                                            stopButton: AlarmButton(text: LocalizedStringResource(stringLiteral: L10n.tr("Vstávám")), textColor: .white, systemImageName: "sun.max.fill"))
        let attributes = AlarmAttributes<WakeAlarm>(presentation: AlarmPresentation(alert: alert), tintColor: Palette.indigo)
        let id = UUID()
        _ = try await manager.schedule(id: id, configuration: .alarm(schedule: schedule, attributes: attributes))
        return id
    }
    #endif
}

#if canImport(AlarmKit)
/// No data travels with the alarm.
@available(iOS 26, *)
struct WakeAlarm: AlarmMetadata {}
#endif
