import Foundation
import HealthKit

/// The journal's mood (Deník → Nálada, 1–5 with its words) and Apple Health's
/// State of Mind (iOS 18), both ways while Apple Health fills in the journal
/// (Zdroje dat → Apple Health → Deník): a mood saved in Aurin goes to Health,
/// a mood logged elsewhere (Apple Watch, Mindfulness) comes into an empty day.
@MainActor
enum MoodHealth {
    /// The words of the journal's labels bits (src/journal-catalog.js MOOD_LABELS), in that order.
    static let labelKeys = ["calm", "content", "happy", "grateful", "confident", "excited",
                            "drained", "stressed", "anxious", "irritated", "sad", "overwhelmed"]

    private static let store = HKHealthStore()
    private static let askedKey = "moodHealth.asked"

    private static var connected: Bool {
        AppleHealth.shared.enabled && AppleHealth.shared.categories.contains(.journal) && HKHealthStore.isHealthDataAvailable()
    }

    /// The mood of `date` to Health; the same day's earlier one is replaced.
    static func save(level: Int, labels: Int, date: String) async {
        guard #available(iOS 18.0, *), connected else { return }
        let type = HKObjectType.stateOfMindType()
        if store.authorizationStatus(for: type) == .notDetermined {
            _ = try? await store.requestAuthorization(toShare: [type], read: [type])
        }
        UserDefaults.standard.set(true, forKey: askedKey)
        guard store.authorizationStatus(for: type) == .sharingAuthorized else { return }
        // Today now, another day in its evening.
        let when = date == AppModel.localDate(Date()) ? Date() : dayStart(date).addingTimeInterval(20 * 3600)
        let mood = HKStateOfMind(date: when, kind: .dailyMood, valence: valence(level), labels: hkLabels(labels), associations: [],
                                 metadata: [HKMetadataKeySyncIdentifier: AppleHealthExport.syncPrefix + "mood:" + date,
                                            HKMetadataKeySyncVersion: NSNumber(value: Int(Date().timeIntervalSince1970 * 1000))])
        // The day's mood written before 2026-11 under "loadwise:" goes, so the day keeps one.
        _ = try? await store.deleteObjects(of: type, predicate: HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier,
                                                                                            allowedValues: [AppleHealthExport.legacySyncPrefix + "mood:" + date]))
        do { try await store.save(mood) } catch { print("Apple Health mood failed", error.localizedDescription) }
    }

    /// The newest mood of `date` logged outside Aurin: its level (1–5) and labels bits.
    static func logged(on date: String) async -> (level: Int, labels: Int)? {
        guard #available(iOS 18.0, *), connected, UserDefaults.standard.bool(forKey: askedKey) else { return nil }
        let start = dayStart(date)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: start.addingTimeInterval(86400), options: .strictStartDate)
        let found: HKStateOfMind? = await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: .stateOfMindType(), predicate: predicate, limit: HKObjectQueryNoLimit,
                                      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, _ in
                let others = (samples ?? []).compactMap { $0 as? HKStateOfMind }
                    .filter { sample in
                        let id = sample.metadata?[HKMetadataKeySyncIdentifier] as? String ?? ""
                        return !id.hasPrefix(AppleHealthExport.syncPrefix) && !id.hasPrefix(AppleHealthExport.legacySyncPrefix)
                    }
                continuation.resume(returning: others.first)
            }
            store.execute(query)
        }
        guard let found else { return nil }
        let level = min(5, max(1, Int(((found.valence + 1) * 2).rounded()) + 1))
        var bits = 0
        for label in found.labels {
            if let i = labelKeys.firstIndex(of: key(label)) { bits |= 1 << i }
        }
        return (level, bits)
    }

    /// 1 very unpleasant … 5 very pleasant as Apple's −1…1.
    static func valence(_ level: Int) -> Double { Double(min(5, max(1, level)) - 3) / 2 }

    @available(iOS 18.0, *)
    private static func hkLabels(_ bits: Int) -> [HKStateOfMind.Label] {
        labelKeys.indices.filter { bits & (1 << $0) != 0 }.compactMap { label(labelKeys[$0]) }
    }

    @available(iOS 18.0, *)
    private static func label(_ key: String) -> HKStateOfMind.Label? {
        switch key {
        case "calm": return .calm
        case "content": return .content
        case "happy": return .happy
        case "grateful": return .grateful
        case "confident": return .confident
        case "excited": return .excited
        case "drained": return .drained
        case "stressed": return .stressed
        case "anxious": return .anxious
        case "irritated": return .irritated
        case "sad": return .sad
        case "overwhelmed": return .overwhelmed
        default: return nil
        }
    }

    @available(iOS 18.0, *)
    private static func key(_ label: HKStateOfMind.Label) -> String {
        labelKeys.first { Self.label($0) == label } ?? ""
    }

    private static func dayStart(_ date: String) -> Date {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return Calendar.current.startOfDay(for: f.date(from: date) ?? Date())
    }
}
