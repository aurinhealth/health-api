import Foundation
import HealthKit

/// Cycle tracking's data from Apple Health, read on the phone: menstrual flow
/// and ovulation tests (sent to the server, src/cycle-store.js, where what the
/// athlete logs in the app wins) and the latest contraception (only to fill
/// in the setup).
enum CycleHealth {
    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    static var readTypes: Set<HKObjectType> {
        [HKCategoryType(.menstrualFlow), HKCategoryType(.ovulationTestResult), HKCategoryType(.contraceptive),
         HKQuantityType(.appleSleepingWristTemperature)]
    }

    /// Settings → Cyklus turned on: one permission sheet for the cycle's types.
    static func requestAccess() async {
        guard isAvailable else { return }
        try? await HKHealthStore().requestAuthorization(toShare: [], read: readTypes)
    }

    /// What the setup fills in: the start of the last period, the usual length
    /// (from the last starts) and the contraception, as far as Health has them.
    struct Setup: Equatable {
        var lastPeriod: String?
        var cycleLength: Int?
        var contraception: String?
    }

    static func setup() async -> Setup {
        guard isAvailable else { return Setup() }
        let days = await flowDays(days: 400)
        let starts = periodStarts(days.filter { $0.flow > 0 }.map(\.date))
        var out = Setup()
        out.lastPeriod = starts.last
        let gaps = zip(starts, starts.dropFirst()).map { daysBetween($0, $1) }.filter { $0 >= 18 && $0 <= 50 }.suffix(6)
        if gaps.count >= 2 { out.cycleLength = min(40, max(21, Int((Double(gaps.reduce(0, +)) / Double(gaps.count)).rounded()))) }
        out.contraception = await contraception()
        return out
    }

    /// Sends Apple Health's flow and ovulation tests of the last 400 days.
    static func sync(api: APIClient) async {
        guard isAvailable else { return }
        let days = await flowDays(days: 400)
        guard !days.isEmpty else { return }
        let body: [JSONValue] = days.map { d in
            .object(["date": .string(d.date), "flow": .number(Double(d.flow)), "ovulationTest": .bool(d.ovulation)])
        }
        try? await api.importAppleCycle(body)
    }

    struct Day: Equatable {
        let date: String
        var flow: Int
        var ovulation: Bool
    }

    /// One entry per day: the heaviest flow (1 light, 2 medium or unspecified,
    /// 3 heavy) and whether an ovulation test was positive.
    static func flowDays(days: Int) async -> [Day] {
        let store = HKHealthStore()
        let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let flows = await samples(store, HKCategoryType(.menstrualFlow), from: start)
        let tests = await samples(store, HKCategoryType(.ovulationTestResult), from: start)
        var byDay: [String: Day] = [:]
        for s in flows {
            // Raw values of HKCategoryValueMenstrualFlow / VaginalBleeding:
            // 1 unspecified, 2 light, 3 medium, 4 heavy, 5 none.
            let flow: Int
            switch s.value {
            case 2: flow = 1
            case 4: flow = 3
            case 5: flow = 0
            default: flow = 2
            }
            let date = AppModel.localDate(s.startDate)
            var day = byDay[date] ?? Day(date: date, flow: 0, ovulation: false)
            day.flow = max(day.flow, flow)
            byDay[date] = day
        }
        for s in tests {
            // 2: luteinizing hormone surge (a positive test).
            guard s.value == 2 else { continue }
            let date = AppModel.localDate(s.startDate)
            var day = byDay[date] ?? Day(date: date, flow: 0, ovulation: false)
            day.ovulation = true
            byDay[date] = day
        }
        return byDay.values.sorted { $0.date < $1.date }
    }

    /// The latest contraception in Health as the app names it; an IUD counts
    /// as hormonal (Health does not tell the two apart, Settings can change it).
    static func contraception() async -> String? {
        let store = HKHealthStore()
        let start = Calendar.current.date(byAdding: .year, value: -2, to: Date()) ?? Date()
        guard let last = await samples(store, HKCategoryType(.contraceptive), from: start).last else { return nil }
        switch HKCategoryValueContraceptive(rawValue: last.value) {
        case .oral: return "pill"
        case .patch: return "patch"
        case .intravaginalRing: return "ring"
        case .intrauterineDevice: return "hormonal_iud"
        case .implant: return "implant"
        case .injection: return "injection"
        default: return nil
        }
    }

    private static func samples(_ store: HKHealthStore, _ type: HKCategoryType, from start: Date) async -> [HKCategorySample] {
        await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: Date())
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, results, _ in
                continuation.resume(returning: (results as? [HKCategorySample]) ?? [])
            }
            store.execute(query)
        }
    }

    /// Starts of periods: a bleeding day with none in the 7 days before.
    static func periodStarts(_ dates: [String]) -> [String] {
        var out: [String] = []
        var previous: String?
        for date in Set(dates).sorted() {
            if previous == nil || daysBetween(previous!, date) > 7 { out.append(date) }
            previous = date
        }
        return out
    }

    static func daysBetween(_ a: String, _ b: String) -> Int {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let x = f.date(from: a), let y = f.date(from: b) else { return 0 }
        return Int((y.timeIntervalSince(x) / 86400).rounded())
    }
}
