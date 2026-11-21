import SwiftUI

/// Today's coach card on a key workout missed this week (src/missed-workout.js,
/// mockups/zmeskany-trenink, Petr 2026-11-21): the session with what happens
/// to it, "Move to today" (the day the server proposes), "Other day…" (the
/// usual Move sheet) and "Skip it"; when no day fits, OK lets it go. Each step
/// shows "Vrátit" a few seconds; an easy session it replaces is removed only
/// once that is gone.
struct MissedWorkoutBlock: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    let missed: TodaySnapshot.MissedWorkout

    @State private var toast: PlanToast?
    @State private var working = false
    @State private var picking: WeekSession?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let toast {
                PlanToastView(toast: toast) { settle(toast, undo: true) }
                    .transition(.opacity)
            } else {
                row
                buttons
            }
            if let error {
                Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .animation(.snappy, value: toast?.id)
        // Today reloaded under it (the card went): the step stands, what it replaces still goes.
        .onDisappear { if let toast { settle(toast, undo: false) } }
        // Sent to the background (and maybe closed): the step stands now, so a replaced session still goes.
        .onChange(of: scenePhase) { _, phase in if phase != .active, let toast { settle(toast, undo: false) } }
        .task(id: toast?.id) {
            guard let current = toast else { return }
            try? await Task.sleep(for: .seconds(6))
            settle(current, undo: false)
        }
        .sheet(item: $picking) { session in
            MovePlannedSheet(session: session, today: AppModel.localDate(Date())) { date, note in
                show(PlanToast(title: L10n.f("Přesunuto na %@", Fmt.weekdayName(date)), note: note, cancelled: false,
                               undo: { [model] in
                                   try? await PlanSessionActions.moveBack(model, session: session, from: date)
                                   await Self.reload(model)
                               },
                               commit: { [model] in await Self.reload(model) }))
            }
        }
    }

    /// The session and, with a day proposed, "From Thursday, replaces Easy Z2 ride".
    private var row: some View {
        HStack(spacing: 12) {
            SportDisc(sport: missed.sport, state: missed.suggest == nil ? .missed : .ahead, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: missed.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                if let detail = missed.detail {
                    Text(verbatim: detail).font(Typo.small).foregroundStyle(Palette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private var buttons: some View {
        VStack(spacing: 10) {
            Button { Task { if missed.move != nil { await move() } else { await skip() } } } label: {
                Text(verbatim: missed.move ?? "OK").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(minHeight: 50)
                    .background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            HStack(spacing: 10) {
                Button { Task { await pickDay() } } label: {
                    Text("Jiný den…").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(minHeight: 44)
                        .background(Palette.track, in: Capsule())
                }
                .buttonStyle(.plain)
                if missed.move != nil {
                    Button { Task { await skip() } } label: {
                        Text("Vynechat trénink").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                            .frame(maxWidth: .infinity).frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .disabled(working || model.demo)
    }

    /// To the proposed day; what it replaces goes once the undo is gone.
    private func move() async {
        guard let day = missed.suggest else { return }
        await run {
            if let id = missed.eventId {
                _ = try await model.api.reschedulePlanned(eventId: id, to: day, time: nil)
            } else if let from = missed.gymDate {
                try await model.api.moveGym(from: from, to: day)
            }
            let replaced = missed.replaces
            let title = day == AppModel.localDate(Date()) ? L10n.tr("Přesunuto na dnešek") : L10n.f("Přesunuto na %@", Fmt.weekdayName(day))
            let note = replaced.isEmpty ? nil : L10n.f("%@ odebrán", replaced.map(\.title).joined(separator: ", "))
            show(PlanToast(title: title, note: note, cancelled: false,
                           undo: { [model, missed] in
                               if let id = missed.eventId {
                                   _ = try? await model.api.reschedulePlanned(eventId: id, to: missed.date, time: nil, back: true)
                               } else if let from = missed.gymDate {
                                   try? await model.api.moveGym(from: day, to: from, back: true)
                               }
                               await Self.reload(model)
                           },
                           commit: { [model] in
                               for r in replaced { try? await model.api.deletePlanned(eventId: r.eventId) }
                               await Self.reload(model)
                           }))
        }
    }

    /// Let go: the card does not come back for it.
    private func skip() async {
        await run {
            try await model.api.decideMissed(key: missed.key, skip: true)
            show(PlanToast(title: L10n.tr("Vynecháno"), note: nil, cancelled: true,
                           undo: { [model, missed] in
                               try? await model.api.decideMissed(key: missed.key, skip: false)
                               await Self.reload(model)
                           },
                           commit: { [model] in await Self.reload(model) }))
        }
    }

    /// The usual Move sheet, for the session as Training lists it.
    private func pickDay() async {
        // The calendar's day (last Sunday is not in this week's list), else this week's list.
        if model.calendar[missed.date] == nil && model.training == nil { await model.refreshTraining() }
        let matches = { (s: WeekSession) in
            missed.eventId != nil ? s.eventId == missed.eventId : (s.kind == "gym" && s.date == missed.gymDate)
        }
        let session = model.calendar[missed.date]?.activities.map(\.session).first(where: matches)
            ?? model.training?.sessions?.first(where: matches)
        if let session { picking = session } else { error = L10n.tr("Trénink se teď nepodařilo načíst") }
    }

    private func show(_ next: PlanToast) {
        error = nil
        toast = next
    }

    private func settle(_ current: PlanToast, undo: Bool) {
        if toast?.id == current.id { toast = nil }
        if let action = current.settle(undo: undo) { Task { await action() } }
    }

    private func run(_ work: () async throws -> Void) async {
        working = true
        defer { working = false }
        do { try await work() } catch { self.error = error.localizedDescription }
    }

    @MainActor
    static func reload(_ model: AppModel) async {
        async let training: Void = model.refreshTraining()
        await model.refresh()
        await training
    }
}
