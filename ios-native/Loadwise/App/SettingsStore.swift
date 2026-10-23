import Foundation
import Observation

/// The data behind Settings: the profile, training zones and data sources.
/// Forms change a copy and save the whole object (the server replaces it).
@MainActor
@Observable
final class SettingsStore {
    private(set) var profile: JSONObject = [:]
    /// The values Loadwise works out itself for the empty fields (max and
    /// resting heart rate, usual day, weekly sport).
    private(set) var suggestions: JSONObject = [:]
    private(set) var training: TrainingProfileResponse?
    private(set) var connections: [ConnectionsResponse.Provider] = []
    private(set) var priority: SourcePriority = .auto
    private(set) var sync: SyncStatus?
    private(set) var loaded = false
    /// The profile really came from the server. The server replaces the whole
    /// profile on save, so saving changes onto an empty one would wipe the rest.
    private(set) var profileLoaded = false
    private(set) var saving = false
    var errorMessage: String?
    /// Nastavení → Testování → Server is shown (GET /app/api/me → internalTester);
    /// always on the test server, so the way back is there.
    private(set) var internalTester = ServerChoice.current == .staging
    /// The app's owner: Nastavení → Správa → Návrhy oprav potravin.
    private(set) var owner = false
    /// Food corrections waiting for the owner, for the row's badge.
    var pendingFoodSuggestions = 0
    /// People from the website's waitlist waiting for the owner (Testování → Zájemci).
    var pendingWaitlist = 0
    let demo: Bool

    private let api: APIClient

    init(api: APIClient, demo: Bool) {
        self.api = api
        self.demo = demo
        if demo {
            profile = DemoData.profile
            connections = DemoData.connections
            loaded = true
        }
    }

    func load() async {
        guard !demo else { return }
        async let profile = api.profileWithSuggestions()
        async let training = api.trainingProfile()
        async let connections = api.connections()
        async let sync = api.syncStatus()
        async let roles = api.roles()
        do {
            let response = try await profile
            self.profile = response.profile ?? [:]
            suggestions = response.suggestions ?? [:]
            profileLoaded = true
            // The name typed in Profil (maybe on another phone) is the one
            // shown, so the avatar's letter comes from it, not the e-mail.
            if let shown = self.profile["displayName"]?.string?.trimmingCharacters(in: .whitespaces).nilIfBlank {
                UserDefaults.standard.set(shown, forKey: AppModel.displayNameKey)
                UserDefaults.standard.set(String(shown.first!).uppercased(), forKey: AppModel.accountInitialKey)
            }
            let status = try? await connections
            self.connections = status?.providers ?? []
            priority = status?.priority ?? .auto
            self.training = try? await training
            self.sync = try? await sync
            if let roles = try? await roles {
                internalTester = roles.internalTester
                owner = roles.owner
                if owner { pendingFoodSuggestions = (try? await api.foodSuggestions()).map { $0.pending.map { $0.values.reduce(0, +) } ?? $0.counts?["pending"] ?? 0 } ?? 0 }
                if owner { pendingWaitlist = (try? await api.waitlist())?.pending.count ?? 0 }
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        loaded = true
    }

    /// Saves the profile with these keys changed. Returns false on an error.
    func saveProfile(_ changes: JSONObject) async -> Bool {
        guard !demo else { profile.merge(changes) { $1 }; return true }
        if !profileLoaded { await load() }
        guard profileLoaded else {
            errorMessage = L10n.tr("Profil se nepodařilo načíst, takže ho teď nejde uložit. Zkus to znovu za chvíli.")
            return false
        }
        saving = true
        defer { saving = false }
        var next = profile
        next.merge(changes) { $1 }
        do {
            try await api.saveProfile(next)
            profile = try await api.profile()
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func saveTraining(_ changes: JSONObject, writeIntervals: Bool) async -> Bool {
        guard !demo else { return true }
        saving = true
        defer { saving = false }
        var next = training?.profile ?? [:]
        next.merge(changes) { $1 }
        next["writeIntervals"] = .bool(writeIntervals)
        do {
            training = try await api.saveTrainingProfile(next)
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func syncNow() async {
        guard !demo else { return }
        await AppleHealth.shared.sync(api: api, force: true)
        // Apple Health alone has nothing for the server to fetch.
        guard connections.contains(where: { $0.connected == true && $0.id != "apple" }) || connections.isEmpty else { return }
        do {
            try await api.startSync()
            // The server works on after answering: wait until it is done (at most a minute),
            // so the time and the errors shown are the ones of this sync.
            for _ in 0..<20 {
                sync = try? await api.syncStatus()
                guard sync?.status == "running" else { break }
                try? await Task.sleep(for: .seconds(3))
            }
            if let response = try? await api.connections() { connections = response.providers }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// After a reconnect: only the data sources and the sync state.
    func reloadConnections() async {
        guard !demo else { return }
        if let response = try? await api.connections() { connections = response.providers; priority = response.priority ?? .auto }
        if let status = try? await api.syncStatus() { sync = status }
    }

    /// Saves where the night and the day come from; the server re-picks the stored days.
    func savePriority(_ next: SourcePriority) async {
        let previous = priority
        priority = next
        guard !demo else { return }
        do {
            try await api.saveSourcePriority(next)
            errorMessage = nil
        } catch {
            priority = previous
            errorMessage = error.localizedDescription
        }
    }

    var connectedCount: Int { connections.filter { $0.connected == true }.count }

    /// Connected sources to connect again or grant permissions (Settings badge).
    var problems: [ConnectionsResponse.Provider] { connections.filter(\.needsAttention) }
}
