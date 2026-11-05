import Foundation

/// An exercise swapped for another in today's workout ("Vyměněno dnes" in its
/// summary). "I příště" writes the thumbs the plans read (src/exercise-feedback.js):
/// down for the old exercise, up for the new one.
struct GymSwap: Codable, Equatable, Identifiable {
    let from: String
    var to: String
    var nextTime = false
    /// The thumbs before "I příště", put back with "Jen dnes".
    var fromBefore: Bool?
    var toBefore: Bool?
    var id: String { from }
}

/// The day's swaps, kept on the phone for that one day: Režim tréninku and the
/// Apple Watch add to them.
enum GymSwaps {
    private static let key = "gym.swaps"
    private struct Stored: Codable {
        let date: String
        let swaps: [GymSwap]
    }

    static func list(_ date: String) -> [GymSwap] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let stored = try? JSONDecoder().decode(Stored.self, from: data), stored.date == date else { return [] }
        return stored.swaps
    }

    static func save(_ swaps: [GymSwap], date: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(Stored(date: date, swaps: swaps)), forKey: key)
    }

    static func record(_ date: String, from: String, to: String) {
        save(adding(list(date), from: from, to: to), date: date)
    }

    /// A → B, then B → C is A → C; swapped back to A, nothing is left.
    static func adding(_ list: [GymSwap], from: String, to: String) -> [GymSwap] {
        guard from != to else { return list }
        var out = list
        if let i = out.firstIndex(where: { $0.to == from }) {
            if out[i].from == to { out.remove(at: i) } else { out[i].to = to }
        } else if let i = out.firstIndex(where: { $0.from == from }) {
            out[i].to = to
        } else {
            out.append(GymSwap(from: from, to: to))
        }
        return out
    }
}
