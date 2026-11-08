import Foundation

/// The plates on each side of a bar for a weight, and back: the iPhone's
/// plate loader (Aurin/Screens/PlateLoader.swift) and the watch's rest.
/// Weights here are in the chosen unit (kg, or lb with imperial units).
enum PlateLoad {
    static let kgSizes: [Double] = [25, 20, 15, 10, 5, 2.5, 1.25]
    static let lbSizes: [Double] = [45, 35, 25, 10, 5, 2.5]
    /// More would not fit on the sleeve.
    static let maxPerSide = 10

    /// Plates per side, heaviest first, for a total weight on a bar: the
    /// heaviest that fit, so a weight the plates can't make exactly loads
    /// what comes nearest below it.
    static func plates(for total: Double, bar: Double, sizes: [Double] = kgSizes) -> [Double] {
        guard total > bar else { return [] }
        var side = (total - bar) / 2
        var out: [Double] = []
        for plate in sizes where side >= plate - 0.001 {
            while side >= plate - 0.001, out.count < maxPerSide { out.append(plate); side -= plate }
        }
        return out
    }

    /// The plates per side when they make the weight exactly; nil when none go on or they can't.
    static func exact(_ total: Double, bar: Double, sizes: [Double] = kgSizes) -> [Double]? {
        let out = plates(for: total, bar: bar, sizes: sizes)
        guard !out.isEmpty, abs(self.total(out, bar: bar) - total) < 0.01 else { return nil }
        return out
    }

    static func total(_ plates: [Double], bar: Double) -> Double {
        bar + 2 * plates.reduce(0, +)
    }

    /// A plate added: kept heaviest first, as they go on the bar.
    static func adding(_ plate: Double, to plates: [Double]) -> [Double] {
        guard plates.count < maxPerSide else { return plates }
        return (plates + [plate]).sorted(by: >)
    }
}
