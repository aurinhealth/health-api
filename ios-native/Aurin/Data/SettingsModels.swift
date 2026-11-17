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
    /// Health data → a type → Reads from: the types switched off per service, and
    /// the types each service can give (src/source-reading.js; HealthCategory raw values).
    var readOff: [String: [String]]? = nil
    var readTypes: [String: [String]]? = nil

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
        /// Written step by step: the one-line `&&`/`??` form crashed Xcode 27.1's
        /// optimiser (SemanticARCOpts) in the Release build for iPhone.
        var needsAttention: Bool {
            guard connected == true else { return false }
            if needsReconnect == true { return true }
            return missingPermissions?.isEmpty == false
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
        /// Intervals.icu's counts (src/index.js syncIntervalsActivities, syncIntervalsEvents).
        var parts: Parts? = nil

        struct Parts: Decodable, Equatable {
            var activities: Counts? = nil
            var planned: Counts? = nil
        }
        /// Only what was not in Aurin before; absent from older servers.
        struct Counts: Decodable, Equatable {
            var activities_new: Int? = nil
            var events_new: Int? = nil
        }
    }

    /// The line under "Synchronizovat znovu" on a service's page: what this sync
    /// brought from that service, or what went wrong with it. `failed`: the
    /// request itself failed (offline). Other services' problems stay in Zdroje dat.
    @MainActor
    func pageLine(source: String, name: String, failed: String?) -> (text: String, problem: Bool) {
        if let failed { return (failed, true) }
        if status == "running" { return (L10n.tr("Pořád se synchronizuje na pozadí. Nová data se ukážou na Dnes, až to doběhne."), false) }
        let result = (results ?? []).first { $0.source == source }
        if let result, result.status == "error" || result.status == "partial" {
            return (result.message ?? L10n.f("Synchronizace %@ se nepovedla. Zkus to za pár minut.", name), true)
        }
        var line = L10n.tr("Synchronizováno.")
        if let at = finishedAt.flatMap(SourceActions.date) { line = L10n.f("Synchronizováno %@.", SourceActions.when(at)) }
        if source == "google", googleStatus == "running" || result?.status == "queued" {
            return (line + " " + L10n.tr("Google Health se dotahuje na pozadí."), false)
        }
        guard let parts = result?.parts, let activities = parts.activities?.activities_new else { return (line, false) }
        let plans = parts.planned?.events_new ?? 0
        var new: [String] = []
        if activities > 0 { new.append(L10n.plural("%lld nových aktivit", activities)) }
        if plans > 0 { new.append(L10n.plural("%lld nových plánů", plans)) }
        switch new.count {
        case 0: return (line + " " + L10n.f("V %@ nic nového.", name), false)
        case 1: return (line + " " + L10n.f("%@ z %@.", new[0], name), false)
        default: return (line + " " + L10n.f("%@ a %@ z %@.", new[0], new[1], name), false)
        }
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
    /// The write of the FTP and power zones to Wahoo after a save (src/wahoo.js
    /// writeWahooZones): only when they changed; absent from older servers.
    let wahoo: IntervalsWrite?
    let wahooConnected: Bool?
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
    var preview: Preview? = nil
    /// The heart-rate models the server uses now (after its fallbacks) and the
    /// running one without the athlete's own zones.
    var hrModel: String? = nil
    var runHrModel: String? = nil
    var runHrAuto: String? = nil
    var swimZoneModel: SwimZoneModel? = nil
    /// Where each threshold comes from and how old it is ("Test 20 min, před
    /// 3 týdny", "Odhad podle věku"), by key (ftp, lthr, maxHr, runThresholdPace,
    /// runLthr, swimCss), in the app language; absent from older servers.
    var notes: [String: String]? = nil

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
        /// "manual", or "auto": the pool of the last pool swim.
        var poolLengthSource: String? = nil
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
        /// The zone tops (% of the reference) and names, for working the zones
        /// out while typing (ZoneMath); absent from older servers.
        var bounds: [Double]? = nil
        var names: [String]? = nil
        /// Heart rate: "lthr", "maxHr" or "reserve".
        var reference: String? = nil
    }

    /// The thresholds without the athlete's own values (Intervals.icu, the
    /// latest ride, the calibrated max and resting rate): what a cleared field
    /// falls back to. Absent from older servers.
    struct Preview: Decodable, Equatable {
        let ftp: Double?
        let lthr: Double?
        let maxHr: Double?
        let runMaxHr: Double?
        let restHr: Double?
        /// Seconds per km.
        let runThresholdPace: Double?
        let runLthr: Double?
        /// Seconds per 100 m.
        let swimCss: Double?
    }

    /// The swim zones' default fast ends (seconds per 100 m off CSS) and names.
    struct SwimZoneModel: Decodable, Equatable {
        let offsets: [Double]
        let names: [String]
    }
}

/// "auto" or a provider id ("apple", "google", "ultrahuman") for the night and the day.
struct SourcePriority: Codable, Equatable {
    var night: String
    var day: String

    static let auto = SourcePriority(night: "auto", day: "auto")
}

/// GET /app/api/sources/sending: per service, the app types it sent in the last `days` days.
struct SourcesSending: Decodable {
    let days: Int?
    let sending: [String: [String]]?
}
