import Foundation
import Observation

/// Moje poznámka: the athlete's own note on each exercise ("sedadlo 4, úzký
/// úchop", GET/PUT /app/api/gym/notes, src/exercise-notes.js). Shown each time
/// the exercise comes: Režim tréninku, its Další card in the rest, the
/// exercise detail (TechniqueSheet). Loaded once, kept for the app's run.
@Observable
final class ExerciseNotes {
    static let shared = ExerciseNotes()

    private(set) var notes: [String: String] = [:]
    @ObservationIgnored private var loaded = false

    private init() {}

    func note(_ exercise: String) -> String? {
        notes[exercise]?.nilIfBlank
    }

    func load(api: APIClient, demo: Bool) async {
        guard !demo, !loaded else { return }
        guard let r: Response = try? await api.get("/app/api/gym/notes") else { return }
        notes = r.notes
        loaded = true
    }

    /// Saved at once on the phone; an empty note removes it. Throws when the server refuses.
    func save(_ note: String, for exercise: String, api: APIClient, demo: Bool) async throws {
        let text = note.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let before = notes[exercise]
        notes[exercise] = text.isEmpty ? nil : text
        guard !demo else { return }
        do {
            let _: Response.Saved = try await api.send("/app/api/gym/notes", method: "PUT", body: ["exercise": exercise, "note": text])
        } catch {
            notes[exercise] = before
            throw error
        }
    }

    struct Response: Decodable {
        let notes: [String: String]
        struct Saved: Decodable { let status: String? }
    }
}
