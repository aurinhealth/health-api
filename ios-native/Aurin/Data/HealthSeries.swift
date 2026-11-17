import Foundation

/// GET /app/api/health/series?metric=&range= (src/health-series.js, S1): one
/// value over 30 days to a year, each point with the athlete's usual band and
/// the state the server worked out. For vo2max (src/health-estimates.js) the
/// latest estimate, its sources and the FRIEND group come with it.
struct HealthSeries: Decodable, Equatable {
    var points: [ChartPoint] = []
    /// The newest finished day with its state (steps: yesterday).
    var latest: ChartPoint? = nil
    /// The last 7 days against the 7 days 90 days before.
    var change90: Double? = nil
    /// HRV: which service measured which stretch of days.
    var sources: [SourceStretch]? = nil
    /// An Intervals.icu read failed: the points can be incomplete.
    var degraded: Bool? = nil
    // vo2max only
    var value: Double? = nil
    var change3m: Double? = nil
    var estimateDate: String? = nil
    var compared: FriendBands? = nil
    /// The services the newest estimate's workouts and heart rate came from.
    var estimateSources: [String]? = nil

    /// The points, or nil when none came (a failed decode keeps the saved ones).
    var shown: [ChartPoint]? { points.isEmpty ? nil : points }

    struct SourceStretch: Decodable, Equatable {
        let source: String?
        let from: String
        let to: String
    }

    private enum CodingKeys: String, CodingKey {
        case points, latest, change90, sources, degraded, value, change3m, estimateDate, compared
    }

    init(points: [ChartPoint] = [], latest: ChartPoint? = nil, change90: Double? = nil) {
        self.points = points
        self.latest = latest
        self.change90 = change90
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        points = (try? c.decode([ChartPoint].self, forKey: .points)) ?? []
        latest = try? c.decode(ChartPoint.self, forKey: .latest)
        change90 = try? c.decode(Double.self, forKey: .change90)
        degraded = try? c.decode(Bool.self, forKey: .degraded)
        value = try? c.decode(Double.self, forKey: .value)
        change3m = try? c.decode(Double.self, forKey: .change3m)
        estimateDate = try? c.decode(String.self, forKey: .estimateDate)
        compared = try? c.decode(FriendBands.self, forKey: .compared)
        // HRV sends stretches, vo2max the services' names: the same key.
        sources = try? c.decode([SourceStretch].self, forKey: .sources)
        estimateSources = try? c.decode([String].self, forKey: .sources)
    }
}

/// The FRIEND registry group the athlete is compared with (Kaminsky 2015,
/// treadmill tests): the 10th to the 90th percentile in ml/kg/min.
struct FriendBands: Decodable, Equatable {
    let sex: String
    let ageFrom: Int
    let ageTo: Int
    let p10: Double
    let p25: Double
    let p50: Double
    let p75: Double
    let p90: Double
    var year: Int? = nil
}

/// Aurin's own VO2max on /app/api/health (never the watch's, T-SCI-1).
struct HealthVO2max: Decodable, Equatable {
    let value: Double
    let date: String
    var change3m: Double? = nil
    var sources: [String]? = nil
    var compared: FriendBands? = nil
    var series: [Point] = []

    private enum CodingKeys: String, CodingKey { case value, date, change3m, sources, compared, series }

    init(value: Double, date: String, change3m: Double? = nil, sources: [String]? = nil, compared: FriendBands? = nil, series: [Point] = []) {
        self.value = value
        self.date = date
        self.change3m = change3m
        self.sources = sources
        self.compared = compared
        self.series = series
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        value = try c.decode(Double.self, forKey: .value)
        date = try c.decode(String.self, forKey: .date)
        change3m = try? c.decode(Double.self, forKey: .change3m)
        sources = try? c.decode([String].self, forKey: .sources)
        compared = try? c.decode(FriendBands.self, forKey: .compared)
        series = (try? c.decode([Point].self, forKey: .series)) ?? []
    }
}

/// Aurin age on /app/api/health: the estimate, the real age and what each
/// factor adds or takes off in years (+ older, − younger).
struct HealthAurinAge: Decodable, Equatable {
    let value: Double
    var age: Double? = nil
    let date: String
    var fitnessAge: Double? = nil
    var parts: [String: Double] = [:]
    var gains: [String: Double] = [:]
    var change90: Double? = nil
    var series: [Point] = []

    private enum CodingKeys: String, CodingKey { case value, age, date, fitnessAge, parts, gains, change90, series }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        value = try c.decode(Double.self, forKey: .value)
        date = try c.decode(String.self, forKey: .date)
        age = try? c.decode(Double.self, forKey: .age)
        fitnessAge = try? c.decode(Double.self, forKey: .fitnessAge)
        parts = (try? c.decode([String: Double?].self, forKey: .parts))?.compactMapValues { $0 } ?? [:]
        gains = (try? c.decode([String: Double?].self, forKey: .gains))?.compactMapValues { $0 } ?? [:]
        change90 = try? c.decode(Double.self, forKey: .change90)
        series = (try? c.decode([Point].self, forKey: .series)) ?? []
    }
}

/// A metric's state on /app/api/health (`states`), as the detail charts judge
/// the newest value.
struct HealthState: Decodable, Equatable {
    let date: String
    var state: String? = nil
    var side: String? = nil

    var metricState: MetricState? { MetricState(state: state, side: side) }
}

extension APIClient {
    /// metric: hrv, restingHR, respiration, oxygen, walkingHR, hrRecovery, steps, vo2max or aurinAge.
    func healthSeries(metric: String, period: ChartPeriod) async throws -> HealthSeries {
        try await get("/app/api/health/series?metric=" + metric + "&range=" + period.key)
    }
}
