import Foundation

/// GET /app/api/profile: the profile as stored (energy-profile.js normalizeProfile).
struct ProfileResponse: Decodable {
    let profile: JSONObject?
    /// What Aurin worked out itself (src/profile-suggestions.js): it fills
    /// the fields left empty.
    let suggestions: JSONObject?
}

/// GET /app/api/connections (src/connections.js).
struct ConnectionsResponse: Decodable, Equatable {
    let providers: [Provider]
    /// Which device the night and the day come from (src/source-priority.js).
    var priority: SourcePriority? = nil

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
    /// When the last "Synchronizovat vše" finished (its details).
    var finishedAt: String? = nil
    /// The latest result of each source ("google", "intervals", "weight"…).
    let results: [SourceResult]?
    /// The Google Health import's own state ("completed", "partial", "error"…).
    let googleStatus: String?

    struct SourceResult: Decodable, Equatable {
        let source: String?
        let status: String?
        /// What failed and why, readable (src/dashboard-sync.js).
        let message: String?
        /// When this result came, ISO.
        var at: String? = nil
    }

    /// One source whose last sync failed: its name, what failed and when.
    struct Failure: Equatable, Identifiable {
        let id: String
        let name: String
        let message: String?
        let at: Date?
    }

    private static func date(_ text: String) -> Date? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }

    /// Sources whose last sync failed within the last day; an older failure
    /// was followed by syncs that went fine, so it is no longer shown.
    func failures(now: Date = Date()) -> [Failure] {
        let names = ["google": "Google Health", "intervals": "Intervals.icu", "weight": L10n.tr("váha"), "wellness": L10n.tr("zdravotní hodnoty"),
                     "exports": L10n.tr("export tréninků"), "matching": L10n.tr("párování aktivit")]
        var failed = (results ?? []).filter { $0.status == "error" || $0.status == "partial" }
        if (googleStatus == "error" || googleStatus == "partial") && !failed.contains(where: { $0.source == "google" }) {
            failed.append(SourceResult(source: "google", status: googleStatus, message: nil, at: updatedAt))
        }
        var seen = Set<String>()
        return failed.compactMap { result -> Failure? in
            guard let source = result.source, seen.insert(source).inserted else { return nil }
            let at = result.at.flatMap(Self.date)
            if let at, now.timeIntervalSince(at) > 24 * 3600 { return nil }
            return Failure(id: source, name: names[source] ?? source, message: result.message, at: at)
        }
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
    /// The swim zones around CSS (src/training-zones.js swimZones); absent from older servers.
    let swimZones: [SwimZone]?
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
        /// CSS, seconds per 100 m.
        let swimCss: Double?
        let poolLength: Double?
        /// "off", "races" or "season".
        let openWater: String?
    }

    struct SwimZone: Decodable, Equatable, Identifiable {
        let zone: Int
        let name: String
        /// "1:58" per 100 m; nil at an open end or without a CSS.
        let paceSlow: String?
        let paceFast: String?
        var id: Int { zone }
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

/// "auto" or a provider id ("apple", "google", "ultrahuman") for the night and the day.
struct SourcePriority: Codable, Equatable {
    var night: String
    var day: String

    static let auto = SourcePriority(night: "auto", day: "auto")
}
