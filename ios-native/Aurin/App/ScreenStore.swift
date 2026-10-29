import Foundation
import Observation

/// A screen's data (Health, Training) and the error shown when there is none.
/// The views read it through AppModel (health, healthError…), and each one
/// follows only the screen it shows.
@MainActor
@Observable
final class ScreenStore<Value> {
    var value: Value?
    var error: String?

    func clear() {
        value = nil
        error = nil
    }
}

/// Today and Food: the server's answer as it came (raw JSON) with the writes
/// waiting in the queue drawn over it (OutboxPatch), and the ones just sent
/// until the screen's next load from the server has them, so nothing blinks away.
@MainActor
@Observable
final class PatchedScreen<Value: Decodable & Equatable> {
    var value: Value?
    var error: String?
    /// The answer as it came, under the waiting writes.
    @ObservationIgnored private(set) var base: Data?
    /// Whether value carries writes over base now.
    @ObservationIgnored private var patched = false
    @ObservationIgnored private var settling: [(id: UUID, overlay: OutboxOverlay)] = []
    @ObservationIgnored private let patch: (Data, [OutboxOverlay]) -> Data

    init(patch: @escaping (Data, [OutboxOverlay]) -> Data) {
        self.patch = patch
    }

    /// The writes drawn as sent when a load starts: its answer has them, so they leave with it.
    var settlingIds: Set<UUID> { Set(settling.map(\.id)) }

    /// An answer from the server (settled: the writes it already has) or a
    /// copy saved on the phone (settled empty). Waiting writes follow with apply.
    func show(_ value: Value, data: Data, settled: Set<UUID> = []) {
        if self.value != value { self.value = value }
        base = data
        patched = false
        settling.removeAll { settled.contains($0.id) }
    }

    /// A write just sent, drawn until the next load.
    func settle(_ id: UUID, _ overlay: OutboxOverlay) {
        settling.append((id, overlay))
    }

    /// The answer with the waiting writes over it. Nothing waiting and nothing
    /// drawn over the answer: no second decode.
    func apply(_ waiting: [OutboxOverlay]) {
        let layers = settling.map(\.overlay) + waiting
        guard let base, !layers.isEmpty || patched,
              let value = try? JSONDecoder().decode(Value.self, from: patch(base, layers)) else { return }
        if self.value != value { self.value = value }
        patched = !layers.isEmpty
    }

    /// The account's answer goes (sign-out, another account).
    func forgetBase() {
        base = nil
        patched = false
        settling = []
    }

    func clear() {
        value = nil
        error = nil
        forgetBase()
    }
}
