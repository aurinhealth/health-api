import Foundation
import Observation

/// The data behind Settings: the profile, training zones and data sources.
/// Forms change a copy and save the whole object (the server replaces it).
@MainActor
@Observable
final class SettingsStore {
    private(set) var profile: JSONObject = [:]
    private(set) var training: TrainingProfileResponse?
    private(set) var connections: [ConnectionsResponse.Provider] = []
    private(set) var sync: SyncStatus?
    private(set) var loaded = false
    private(set) var saving = false
    var errorMessage: String?
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
        async let profile = api.profile()
        async let training = api.trainingProfile()
        async let connections = api.connections()
        async let sync = api.syncStatus()
        do {
            self.profile = try await profile
            self.connections = (try? await connections)?.providers ?? []
            self.training = try? await training
            self.sync = try? await sync
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        loaded = true
    }

    /// Saves the profile with these keys changed. Returns false on an error.
    func saveProfile(_ changes: JSONObject) async -> Bool {
        guard !demo else { profile.merge(changes) { $1 }; return true }
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
        do {
            try await api.startSync()
            sync = try? await api.syncStatus()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// After a reconnect: only the data sources and the sync state.
    func reloadConnections() async {
        guard !demo else { return }
        if let response = try? await api.connections() { connections = response.providers }
        if let status = try? await api.syncStatus() { sync = status }
    }

    var connectedCount: Int { connections.filter { $0.connected == true }.count }

    /// Connected sources to connect again or grant permissions (Settings badge).
    var problems: [ConnectionsResponse.Provider] { connections.filter(\.needsAttention) }
}
