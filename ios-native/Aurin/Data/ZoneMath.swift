import Foundation

/// The zone math of src/training-zones.js on the phone: Nastavení → Zóny shows
/// the new zones while a threshold or a zone start is typed, before Save. The
/// server works them out again from what is saved, so both have to agree; the
/// tests (ZoneMathTests) hold the same numbers as tests/training-zones.test.mjs.
enum ZoneMath {
    typealias Power = TrainingProfileResponse.PowerZone
    typealias Heart = TrainingProfileResponse.HRZone
    typealias Pace = TrainingProfileResponse.PaceZone
    typealias Swim = TrainingProfileResponse.SwimZone
    typealias Model = TrainingProfileResponse.Model

    /// JavaScript's Math.round: a half goes up.
    static func round(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

    /// Two decimals, as the server keeps a zone edge typed in watts or pace.
    static func hundredth(_ x: Double) -> Double { round(x * 100) / 100 }

    // MARK: Zones

    /// Power zones from their tops in % FTP; watts only with an FTP.
    static func power(bounds: [Double], names: [String], ftp: Double?) -> [Power] {
        let ftp = ftp.flatMap { $0 > 0 ? $0 : nil }
        return names.prefix(bounds.count + 1).enumerated().map { i, name in
            let high: Double? = i < bounds.count ? bounds[i] : nil
            var wattsLow: Double? = nil
            var wattsHigh: Double? = nil
            if let ftp {
                wattsLow = i == 0 ? 0 : round(ftp * bounds[i - 1] / 100) + 1
                if let high { wattsHigh = round(ftp * high / 100) }
            }
            return Power(zone: i + 1, name: name, percentLow: i == 0 ? 0 : bounds[i - 1] + 1, percentHigh: high,
                         wattsLow: wattsLow, wattsHigh: wattsHigh)
        }
    }

    /// Heart-rate zones of a preset: tops in % of LTHR ("lthr"), of max ("maxHr")
    /// or of the heart-rate reserve ("reserve"); the last one ends at the max.
    static func heart(reference: String, bounds: [Double], names: [String], lthr: Double?, maxHr: Double?, restHr: Double?) -> [Heart] {
        func bpm(_ pct: Double) -> Double? {
            switch reference {
            case "lthr":
                guard let lthr else { return nil }
                return lthr * pct / 100
            case "maxHr":
                guard let maxHr else { return nil }
                return maxHr * pct / 100
            default:
                guard let maxHr, let restHr else { return nil }
                return restHr + (maxHr - restHr) * pct / 100
            }
        }
        return names.enumerated().map { i, name in
            let low: Double? = i == 0 ? nil : bpm(bounds[i - 1])
            let high: Double? = i < bounds.count ? bpm(bounds[i]) : nil
            var top: Double? = nil
            if let high { top = round(high) } else if i == names.count - 1 { top = maxHr }
            return Heart(zone: i + 1, name: name, bpmLow: low.map { round($0) + 1 }, bpmHigh: top)
        }
    }

    /// The athlete's own heart-rate zones: tops in bpm, the last one ends at the max.
    static func heart(tops: [Double], names: [String], maxHr: Double?) -> [Heart] {
        var zones: [Heart] = []
        for i in 0...tops.count {
            let name = i < names.count ? names[i] : "Z\(i + 1)"
            let low: Double? = i == 0 ? nil : tops[i - 1] + 1
            let high: Double? = i < tops.count ? tops[i] : maxHr
            zones.append(Heart(zone: i + 1, name: name, bpmLow: low, bpmHigh: high))
        }
        return zones
    }

    /// Pace zones from their tops in % of threshold speed; paces in seconds per km.
    static func pace(bounds: [Double], names: [String], threshold: Double?) -> [Pace] {
        func at(_ pct: Double) -> Double? {
            guard let threshold, pct > 0 else { return nil }
            return round(threshold * 100 / pct)
        }
        return names.prefix(bounds.count + 1).enumerated().map { i, name in
            let low: Double = i == 0 ? 0 : bounds[i - 1]
            let high: Double? = i < bounds.count ? bounds[i] : nil
            return Pace(zone: i + 1, name: name, percentLow: low, percentHigh: high,
                        paceSlow: i == 0 ? nil : at(low), paceFast: high.flatMap { at($0) })
        }
    }

    /// Swim zones from the fast end of each zone but the last, seconds per 100 m
    /// off CSS; a zone starts a second slower than the one before ends.
    static func swim(fastEnds: [Double], names: [String], css: Double?) -> [Swim] {
        names.prefix(fastEnds.count + 1).enumerated().map { i, name in
            let slow: Double? = i == 0 ? nil : fastEnds[i - 1] - 1
            let fast: Double? = i < fastEnds.count ? fastEnds[i] : nil
            var paceSlow: String? = nil
            var paceFast: String? = nil
            if let css, let slow { paceSlow = clock(css + slow) }
            if let css, let fast { paceFast = clock(css + fast) }
            return Swim(zone: i + 1, name: name, paceSlow: paceSlow, paceFast: paceFast)
        }
    }

    /// "1:45" from seconds.
    static func clock(_ seconds: Double) -> String {
        let s = Int(round(seconds))
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }

    // MARK: Models

    /// The model the server uses (src/intervals-athlete.js hrModelFor): zones
    /// from LTHR without an LTHR fall back to the heart-rate reserve, or to % of max.
    static func heartModel(_ model: String, lthr: Double?, maxHr: Double?, restHr: Double?) -> String {
        guard ["frielLthr", "frielRun"].contains(model), lthr == nil else { return model }
        if maxHr != nil && restHr != nil { return "karvonen" }
        return maxHr != nil ? "hrMax5" : model
    }

    /// The names of the athlete's own zones: the preset they were made from when
    /// it has as many zones, else a preset with that many, else Z1, Z2, …
    static func names(_ models: [Model], base: String?, count: Int, skip: String? = nil) -> [String] {
        if let from = models.first(where: { $0.id == base }), let names = from.names, (from.bounds?.count ?? -1) + 1 == count { return names }
        if let other = models.first(where: { $0.id != skip && ($0.bounds?.count ?? -1) + 1 == count }), let names = other.names { return names }
        return (0..<max(count, 0)).map { "Z\($0 + 1)" }
    }

    // MARK: Zone starts (edit mode)

    /// Each zone's start from Z2 on, the number typed in edit mode: watts or % FTP.
    static func powerStarts(_ zones: [Power], percent: Bool) -> [Double?] {
        zones.dropFirst().map { zone in
            guard percent else { return zone.wattsLow }
            return zone.percentLow.map { round($0) }
        }
    }

    /// Tops in % FTP from typed starts; nil unless every start is there and rising.
    static func powerBounds(starts: [Double?], percent: Bool, ftp: Double?) -> [Double]? {
        guard let values = rising(starts) else { return nil }
        if percent { return values.allSatisfy({ $0 > 1 && $0 <= 401 }) ? values.map { $0 - 1 } : nil }
        guard let ftp, ftp > 0 else { return nil }
        let bounds = values.map { hundredth(($0 - 1) / ftp * 100) }
        return bounds.allSatisfy({ $0 > 0 && $0 <= 400 }) ? bounds : nil
    }

    /// Each zone's start from Z2 on: bpm, or % of the threshold heart rate.
    static func heartStarts(_ zones: [Heart], lthr: Double?) -> [Double?] {
        zones.dropFirst().map { z in
            guard let low = z.bpmLow else { return nil }
            guard let lthr else { return low }
            return round(low / lthr * 100)
        }
    }

    /// Tops in bpm from typed starts (bpm, or % of the threshold heart rate).
    static func heartTops(starts: [Double?], lthr: Double?) -> [Double]? {
        guard let values = rising(starts) else { return nil }
        let tops = values.map { start in (lthr.map { round($0 * start / 100) } ?? round(start)) - 1 }
        guard tops.allSatisfy({ $0 >= 60 && $0 <= 230 }), rising(tops.map { Optional($0) }) != nil else { return nil }
        return tops
    }

    /// Each zone's start from Z2 on: its slow pace (seconds per km) or % of threshold speed.
    static func paceStarts(_ zones: [Pace], percent: Bool) -> [Double?] {
        zones.dropFirst().map { zone in percent ? zone.percentLow : zone.paceSlow }
    }

    /// Tops in % of threshold speed from typed starts: slow paces (seconds per
    /// km, getting faster) or % (rising).
    static func paceBounds(starts: [Double?], percent: Bool, threshold: Double?) -> [Double]? {
        if percent {
            guard let values = rising(starts), values.allSatisfy({ $0 > 0 && $0 <= 200 }) else { return nil }
            return values
        }
        guard let threshold, threshold > 0, starts.allSatisfy({ ($0 ?? 0) > 0 }) else { return nil }
        let bounds = starts.compactMap { $0 }.map { hundredth(threshold * 100 / $0) }
        guard bounds.count == starts.count, rising(bounds.map { Optional($0) }) != nil, bounds.allSatisfy({ $0 <= 200 }) else { return nil }
        return bounds
    }

    /// Each swim zone's start from Z2 on, seconds per 100 m.
    static func swimStarts(fastEnds: [Double], css: Double?) -> [Double?] {
        fastEnds.map { fast in css.map { $0 + fast - 1 } }
    }

    /// The fast ends of the zones off CSS from typed starts (getting faster).
    static func swimFastEnds(starts: [Double?], css: Double?) -> [Double]? {
        guard let css, starts.allSatisfy({ ($0 ?? 0) > 0 }) else { return nil }
        let ends = starts.compactMap { $0 }.map { round($0 - css) + 1 }
        guard ends.count == starts.count, ends.allSatisfy({ $0 >= -60 && $0 <= 90 }), rising(ends.reversed().map { Optional($0) }) != nil else { return nil }
        return ends
    }

    /// The values when every one is there and each is above the one before.
    static func rising(_ values: [Double?]) -> [Double]? {
        let present = values.compactMap { $0 }
        guard present.count == values.count, !present.isEmpty else { return nil }
        for i in present.indices.dropFirst() where present[i] <= present[i - 1] { return nil }
        return present
    }

    /// Which typed starts break the order: not a number, or not above the one
    /// before (for paces: not faster). The rows get a warning.
    static func outOfOrder(_ values: [Double?], descending: Bool = false) -> Set<Int> {
        var bad = Set<Int>()
        for (i, value) in values.enumerated() {
            guard let value else { bad.insert(i); continue }
            if i > 0, let before = values[i - 1], descending ? value >= before : value <= before { bad.insert(i) }
        }
        return bad
    }
}
