import SwiftUI

/// A gym session of the week moves to another day, is cancelled, or a
/// cancelled one comes back. A session that is an Intervals.icu event goes with
/// the event (the server carries the gym plan along); a plan saved only in the
/// app through POST /app/api/gym.
enum GymPlanActions {
    /// A gym session that is not done yet can still change.
    static func changeable(_ session: WeekSession) -> Bool {
        session.sport == "strength" && session.status != "done"
    }

    /// The plan and the logged sets stay saved; the session leaves the week.
    @MainActor
    static func cancel(_ model: AppModel, date: String, eventId: String?) async throws {
        if let eventId {
            try await model.api.deletePlanned(eventId: eventId)
        } else {
            try await model.api.cancelGym(date: date)
        }
    }
}

/// "Změnit trénink": from the week's list (the … of a gym row) and the gym screen.
struct GymPlanActionsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    var title: String? = nil
    var eventId: String? = nil
    var cancelled = false
    /// After a change went through (the gym screen loads its day again).
    var onChange: () -> Void = {}
    @State private var moveDate = Date()
    @State private var working = false
    @State private var error: String?
    @State private var confirmCancel = false

    /// The gym screen knows only the day: the event comes from the week's list.
    private var event: String? {
        eventId ?? model.training?.sessions?.first(where: { $0.date == date && GymPlanActions.changeable($0) })?.eventId
    }

    private var target: String { AppModel.localDate(moveDate) }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Změnit trénink") {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title ?? L10n.tr("Posilovna")).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Text(Fmt.capitalized(Fmt.relativeDay(date, today: AppModel.localDate(Date())))).font(Typo.small).foregroundStyle(Palette.muted)
                }
                if cancelled {
                    SettingsGroup {
                        Button { Task { await run { try await model.api.uncancelGym(date: date) } } } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "arrow.uturn.backward", color: Palette.green), title: L10n.tr("Obnovit"), chevron: false)
                        }
                        .buttonStyle(.plain)
                    }
                    .disabled(working || model.demo)
                } else {
                    SettingsGroup(title: L10n.tr("Přesunout na jiný den")) {
                        DatePicker("Nový den", selection: $moveDate, in: Date()..., displayedComponents: .date)
                            .environment(\.locale, Fmt.locale)
                            .padding(.horizontal, 16).frame(minHeight: 50)
                        SettingsDivider()
                        Button { Task { await move() } } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "calendar", color: Palette.indigo), title: L10n.tr("Přesunout na tento den"), chevron: false)
                        }
                        .buttonStyle(.plain)
                        .disabled(target == date)
                    }
                    .disabled(working || model.demo)
                    SettingsGroup {
                        Button { confirmCancel = true } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "xmark", color: Palette.rust), title: L10n.tr("Zrušit trénink"), chevron: false, titleColor: Palette.rust)
                        }
                        .buttonStyle(.plain)
                    }
                    .disabled(working || model.demo)
                }
                if working { ProgressView().frame(maxWidth: .infinity) }
                if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } }
            }
            .confirmationDialog("Zrušit trénink?", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("Zrušit trénink", role: .destructive) {
                    Task { await run { try await GymPlanActions.cancel(model, date: date, eventId: event) } }
                }
            }
        }
        .tint(Palette.ink)
        .onAppear {
            // The day after a session still ahead; today for a missed one.
            if let next = AppModel.shift(date, by: 1), next > AppModel.localDate(Date()), let day = Self.noon(next) { moveDate = day }
        }
    }

    private static func noon(_ isoDate: String) -> Date? {
        DateFormatters.make("yyyy-MM-dd").date(from: isoDate).map { $0.addingTimeInterval(12 * 3600) }
    }

    private func move() async {
        let to = target
        guard to != date else { return }
        if let event {
            await run { try await model.api.movePlanned(eventId: event, to: to) }
        } else {
            await run { try await model.api.moveGym(from: date, to: to) }
        }
    }

    /// The server's refusal (409: sets logged, the day has a plan) is shown as it says it.
    private func run(_ work: () async throws -> Void) async {
        working = true
        defer { working = false }
        do {
            try await work()
            error = nil
            await model.refreshTraining()
            await model.refresh()
            onChange()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
