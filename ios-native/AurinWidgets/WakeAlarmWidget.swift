#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import AppIntents
import SwiftUI
import WidgetKit

/// The alarm from Nastavení → Spánek (App/SystemAlarm.swift) while it rings or
/// is snoozed. iOS draws the alarm's Live Activity from here: without it the
/// expanded Dynamic Island of a ringing alarm stays black, with no buttons.
/// Ringing: the alarm's title with Snooze (when on) and "I'm up"; snoozed: "Snoozed"
/// with the minutes left and "I'm up".
@available(iOS 26, *)
struct WakeAlarmWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<WakeAlarm>.self) { context in
            WakeAlarmCard(attributes: context.attributes, state: context.state)
                .padding(.horizontal, 16).padding(.vertical, 14)
                .activityBackgroundTint(Palette.card.opacity(0.9))
                .activitySystemActionForegroundColor(Palette.ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    WakeAlarmTitle(attributes: context.attributes, state: context.state, size: 16)
                        .padding(.leading, 4).padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WakeAlarmTime(state: context.state, size: 28).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    WakeAlarmButtons(attributes: context.attributes, state: context.state)
                        .padding(.horizontal, 4).padding(.top, 10)
                        .environment(\.colorScheme, .dark)
                }
            } compactLeading: {
                Image(systemName: WakeAlarmMode.snoozed(context.state) ? "zzz" : "alarm.fill")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(context.attributes.tintColor)
            } compactTrailing: {
                WakeAlarmTime(state: context.state, size: 14).frame(maxWidth: 52)
            } minimal: {
                Image(systemName: WakeAlarmMode.snoozed(context.state) ? "zzz" : "alarm.fill")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(context.attributes.tintColor)
            }
            .keylineTint(context.attributes.tintColor)
        }
    }
}

@available(iOS 26, *)
enum WakeAlarmMode {
    static func snoozed(_ state: AlarmPresentationState) -> Bool {
        if case .countdown = state.mode { return true }
        return false
    }
}

/// The alarm's title ("Alarm, weekday"), or "Snoozed" while it waits.
@available(iOS 26, *)
struct WakeAlarmTitle: View {
    let attributes: AlarmAttributes<WakeAlarm>
    let state: AlarmPresentationState
    let size: CGFloat

    var body: some View {
        let title = WakeAlarmMode.snoozed(state) ? attributes.presentation.countdown?.title : attributes.presentation.alert.title
        HStack(spacing: 6) {
            Image(systemName: WakeAlarmMode.snoozed(state) ? "zzz" : "alarm.fill").foregroundStyle(attributes.tintColor)
            Text(title ?? attributes.presentation.alert.title).lineLimit(1).minimumScaleFactor(0.7)
        }
        .font(.system(size: size, weight: .semibold))
    }
}

/// Snoozed: the minutes left. Ringing: the alarm's time ("06:00").
@available(iOS 26, *)
struct WakeAlarmTime: View {
    let state: AlarmPresentationState
    let size: CGFloat

    var body: some View {
        Group {
            if case .countdown(let countdown) = state.mode {
                Text(timerInterval: Date.now...max(countdown.fireDate, Date.now), countsDown: true)
            } else if case .alert(let alert) = state.mode {
                Text(ClockText.format(minutes: alert.time.hour * 60 + alert.time.minute))
            }
        }
        .font(.system(size: size, weight: .semibold)).monospacedDigit()
        .multilineTextAlignment(.trailing).lineLimit(1).minimumScaleFactor(0.6)
    }
}

/// Snooze (while it rings, when Snooze is on in Nastavení → Spánek) and "I'm up".
@available(iOS 26, *)
struct WakeAlarmButtons: View {
    let attributes: AlarmAttributes<WakeAlarm>
    let state: AlarmPresentationState

    var body: some View {
        HStack(spacing: 8) {
            if !WakeAlarmMode.snoozed(state), attributes.presentation.alert.secondaryButton != nil {
                Button(intent: WakeAlarmSnoozeIntent(alarmID: state.alarmID)) {
                    pill(L10n.tr("Odložit"), icon: "zzz", primary: false)
                }
                .buttonStyle(.plain)
            }
            Button(intent: WakeAlarmStopIntent(alarmID: state.alarmID)) {
                pill(L10n.tr("Vstávám"), icon: "sun.max.fill", primary: true)
            }
            .buttonStyle(.plain)
        }
    }

    private func pill(_ text: String, icon: String, primary: Bool) -> some View {
        Label(text, systemImage: icon).font(.system(size: 15, weight: .semibold))
            .foregroundStyle(primary ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(primary ? Palette.button : Palette.ink.opacity(0.14), in: Capsule())
    }
}

/// The lock screen's card: the title and the time with the buttons.
@available(iOS 26, *)
struct WakeAlarmCard: View {
    let attributes: AlarmAttributes<WakeAlarm>
    let state: AlarmPresentationState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                WakeAlarmTitle(attributes: attributes, state: state, size: 16).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                WakeAlarmTime(state: state, size: 26).foregroundStyle(Palette.ink)
            }
            WakeAlarmButtons(attributes: attributes, state: state)
        }
    }
}
#endif
