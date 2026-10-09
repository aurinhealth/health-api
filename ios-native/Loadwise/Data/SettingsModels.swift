import Foundation

/// GET /app/api/profile: the profile as stored (energy-profile.js normalizeProfile).
struct ProfileResponse: Decodable {
    let profile: JSONObject?
}

/// GET /app/api/connections (src/connections.js).
struct ConnectionsResponse: Decodable, Equatable {
    let providers: [Provider]

    struct Provider: Decodable, Equatable, Identifiable {
        let id: String
        let name: String?
        let connected: Bool?
        let configured: Bool?
        let missingPermissions: [JSONValue]?
        let metrics: [String]?
        let note: String?
    }
}

/// GET /app/api/sync (src/dashboard-sync.js).
struct SyncStatus: Decodable, Equatable {
    let status: String?
    let updatedAt: String?
}

/// GET /app/api/training-profile (src/training-zones.js, intervals-athlete.js).
struct TrainingProfileResponse: Decodable, Equatable {
    let profile: JSONObject?
    /// The write to Intervals.icu after a save (src/intervals-zones.js).
    let intervals: IntervalsWrite?
    let intervalsConnected: Bool?
    let resolved: Resolved
    let powerZones: [PowerZone]
    let hrZones: [HRZone]
    let paceZones: [PaceZone]
    let runHrZones: [HRZone]?
    let powerZoneModels: [Model]
    let hrZoneModels: [Model]
    let paceZoneModels: [Model]

    struct IntervalsWrite: Decodable, Equatable {
        /// "ok", "needs-permission", "not-connected" or "error".
        let status: String
        let updated: [String]?
        let message: String?
    }

    struct Resolved: Decodable, Equatable {
        let ftp: Double?
        let ftpSource: String?
        let indoorFtp: Double?
        let lthr: Double?
        let maxHr: Double?
        let restHr: Double?
        let runThresholdPace: Double?
        let runPaceSource: String?
        let runLthr: Double?
    }

    struct PowerZone: Decodable, Equatable, Identifiable {
        let zone: Int
        let name: String
        let percentLow: Double?
        let percentHigh: Double?
        let wattsLow: Double?
        let wattsHigh: Double?
        var id: Int { zone }
    }

    struct HRZone: Decodable, Equatable, Identifiable {
        let zone: Int
        let name: String
        let bpmLow: Double?
        let bpmHigh: Double?
        var id: Int { zone }
    }

    struct PaceZone: Decodable, Equatable, Identifiable {
        let zone: Int
        let name: String
        let percentLow: Double?
        let percentHigh: Double?
        /// Seconds per km.
        let paceSlow: Double?
        let paceFast: Double?
        var id: Int { zone }
    }

    struct Model: Decodable, Equatable, Identifiable {
        let id: String
        let label: String
    }
}
