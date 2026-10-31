import AppIntents
import SwiftUI
import WidgetKit

// Control Center and Lock Screen controls (iOS 18). iOS draws them from the
// symbol, the title and the value; the kinds and the shared state are in
// Shared/AurinControls.swift.

/// Voda: one glass of the user's size (AddWaterIntent), with the day's water and its target.
@available(iOS 18.0, *)
struct WaterControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: AurinControls.water, provider: Provider()) { value in
            ControlWidgetButton(action: AddWaterIntent()) {
                Label(L10n.tr("Voda"), systemImage: "waterbottle.fill")
                // Redacted in Control Center and on the Lock Screen while the phone is locked.
                Text(verbatim: value).privacySensitive()
            }
        }
        .displayName(LocalizedStringResource("Voda", table: "Controls"))
        .description(LocalizedStringResource("Přidá sklenici vody do dnešního pití.", table: "Controls"))
    }

    struct Provider: ControlValueProvider {
        var previewValue: String { Units.volumeText(1200) + " / " + Units.volumeText(2500) }

        func currentValue() async throws -> String {
            let today = WidgetSnapshot.load()?.current(today: PendingDrinks.localDate())
            let water = Units.volumeText(today?.waterMl ?? 0)
            guard let target = today?.waterTarget, target > 0 else { return water }
            return water + " / " + Units.volumeText(target)
        }
    }
}

/// Začít posilovnu: opens the app in today's gym.
@available(iOS 18.0, *)
struct StartGymControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: AurinControls.startGym) {
            ControlWidgetButton(action: StartGymControlIntent()) {
                Label(L10n.tr("Začít posilovnu"), systemImage: "dumbbell.fill")
            }
        }
        .displayName(LocalizedStringResource("Začít posilovnu", table: "Controls"))
        .description(LocalizedStringResource("Otevře dnešní trénink v posilovně.", table: "Controls"))
    }
}

/// Přeskočit pauzu: ends the rest of the gym running now (GymRestSkipIntent,
/// the Live Activity's own button); its value says until when the rest runs.
@available(iOS 18.0, *)
struct SkipRestControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: AurinControls.skipRest, provider: Provider()) { end in
            ControlWidgetButton(action: GymRestSkipIntent()) {
                Label(L10n.tr("Přeskočit pauzu"), systemImage: "forward.end.fill")
                Text(verbatim: Self.value(end))
            }
        }
        .displayName(LocalizedStringResource("Přeskočit pauzu", table: "Controls"))
        .description(LocalizedStringResource("Ukončí pauzu v posilovně, která právě běží.", table: "Controls"))
    }

    static func value(_ end: Date?) -> String {
        guard let end else { return L10n.isEnglish ? "No rest now" : "Teď žádná pauza" }
        let time = end.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale))
        return (L10n.isEnglish ? "until " : "do ") + time
    }

    struct Provider: ControlValueProvider {
        var previewValue: Date? { nil }
        func currentValue() async throws -> Date? { GymRestShared.end }
    }
}
