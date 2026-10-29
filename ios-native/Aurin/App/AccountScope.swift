import Foundation

/// One sign-in: the loads it started and what they may still bring back.
/// Signing out (or switching the server) ends it: its tasks are cancelled,
/// and an answer that comes back anyway finds it ended (AppModel.stillSignedIn),
/// so the last account's data never returns to the screens or to disk.
@MainActor
final class AccountScope {
    private(set) var ended = false
    private var tasks: [UUID: Task<Void, Never>] = [:]

    /// Work for this sign-in only, cancelled when it ends.
    @discardableResult
    func task(priority: TaskPriority? = nil, _ body: @escaping @MainActor @Sendable () async -> Void) -> Task<Void, Never> {
        let id = UUID()
        let task = Task(priority: priority) { @MainActor [weak self] in
            await body()
            self?.tasks[id] = nil
        }
        if ended { task.cancel() } else { tasks[id] = task }
        return task
    }

    func end() {
        ended = true
        for task in tasks.values { task.cancel() }
        tasks = [:]
    }
}

/// What the phone keeps for the signed-in account outside the app model: the
/// saved screens, the gym sheets, the coach's texts and the other memories of
/// the screens. One list, emptied by every sign-out and switch of server.
enum AccountCaches {
    @MainActor static func forget() {
        SnapshotCache.clear()
        CoachPick.forget()
        GymDayCache.clear()
        CoachTextMemory.values = [:]
        WeekPlanDraftMemory.drafts = [:]
        ThresholdCheckMemory.kept = nil
        GymHistoryCache.clear()
        ActivityDetailMemory.values = [:]
    }
}
