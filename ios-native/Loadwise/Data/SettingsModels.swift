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
        /// The provider refused the stored access at the last sync (src/connection-health.js).
        var needsReconnect: Bool? = nil
        var lastError: String? = nil
        var lastErrorAt: String? = nil
        var lastSuccessAt: String? = nil

        /// Connected, but the access was refused or Google permissions are missing.
        var needsAttention: Bool {
            connected == true && (needsReconnect == true || !(missingPermissions ?? []).isEmpty)
        }

        /// What is wrong, in a few words (Today card, Settings).
        var problemText: String? {
            guard connected == true else { return nil }
            if needsReconnect == true { return L10n.tr("přístup vypršel nebo byl odebrán") }
            if !(missingPermissions ?? []).isEmpty { return L10n.tr("chybí oprávnění") }
            return nil
        }
    }
}

/// GET /app/api/sync (src/dashboard-sync.js).
struct SyncStatus: Decodable, Equatable {
    /// "running", "done", "partial", "error" or "idle".
    let status: String?
    let updatedAt: String?
    /// The latest result of each source ("google", "intervals", "weight"…).
    let results: [SourceResult]?
    /// The Google Health import's own state ("completed", "partial", "error"…).
    let googleStatus: String?

    struct SourceResult: Decodable, Equatable {
        let source: String?
        let status: String?
        let message: String?
    }

    /// Sources whose last sync failed, in a readable form.
    var failedSources: [String] {
        let names = ["google": "Google Health", "intervals": "Intervals.icu", "weight": L10n.tr("váha"), "wellness": "wellness",
                     "exports": L10n.tr("export tréninků"), "matching": L10n.tr("párování aktivit")]
        var failed = (results ?? []).filter { $0.status == "error" || $0.status == "partial" }.compactMap { $0.source }
        if googleStatus == "error" || googleStatus == "partial" { failed.append("google") }
        var seen = Set<String>()
        return failed.filter { seen.insert($0).inserted }.map { names[$0] ?? $0 }
    }
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
