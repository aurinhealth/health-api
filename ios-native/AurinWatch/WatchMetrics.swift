import SwiftUI

/// What the watch pages read from a snapshot's history: today's value,
/// yesterday's, the week's average and the last days of a span.
extension Array where Element == WatchSnapshot.Day {
    func value(on date: String) -> Double? { last { $0.date == date }?.value }

    /// The day before `date` that has a value.
    func before(_ date: String) -> Double? { last { $0.date < date }?.value }

    /// The days of the last `days` up to `date`.
    func span(_ days: Int, upTo date: String) -> [WatchSnapshot.Day] {
        guard let end = W.dayValue(date) else { return Array(suffix(days)) }
        let start = Calendar(identifier: .gregorian).date(byAdding: .day, value: -(days - 1), to: end) ?? end
        let from = W.dayText(start)
        return filter { $0.date >= from && $0.date <= date }
    }

    var average: Double? {
        isEmpty ? nil : map(\.value).reduce(0, +) / Double(count)
    }

    /// Averages of seven days, counted back from the last day, oldest first;
    /// each carries the date of its last day.
    var weekly: [WatchSnapshot.Day] {
        var weeks: [WatchSnapshot.Day] = []
        var end = count
        while end > 0 {
            let part = self[Swift.max(0, end - 7)..<end]
            let mean = part.map(\.value).reduce(0, +) / Double(part.count)
            weeks.insert(WatchSnapshot.Day(date: part.last!.date, value: mean), at: 0)
            end -= 7
        }
        return weeks
    }
}

extension W {
    nonisolated static func dayValue(_ text: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: text)
    }

    nonisolated static func dayText(_ date: Date) -> String { WatchStore.localDate(date) }
}

/// Resting HR, HRV or sleep: the colours, names and the direction that is good.
enum WatchMetric: String, Hashable {
    case restingHR, hrv, sleep

    @MainActor var color: Color {
        switch self {
        case .restingHR: W.pink
        case .hrv: W.green
        case .sleep: W.indigo
        }
    }

    @MainActor var glow: Color {
        switch self {
        case .restingHR: W.Glow.restingHR
        case .hrv: W.Glow.readiness
        case .sleep: W.Glow.sleep
        }
    }

    @MainActor var name: String {
        switch self {
        case .restingHR: W.tr("Klidový tep", "Resting HR")
        case .hrv: "HRV"
        case .sleep: W.tr("Spánek", "Sleep")
        }
    }

    @MainActor var unit: String {
        switch self {
        case .restingHR: "bpm"
        case .hrv: "ms"
        case .sleep: "h"
        }
    }

    /// Down is good for resting HR, up for HRV and sleep.
    var higherIsBetter: Bool { self != .restingHR }
}
