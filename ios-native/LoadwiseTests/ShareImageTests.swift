import SwiftUI
import XCTest
@testable import Loadwise

/// Sdílet: the share images' data and every layout rendered to PNG (CI uploads
/// them with the screen snapshots).
@MainActor
final class ShareImageTests: XCTestCase {
    private var outputDirectory: URL {
        let path = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"]
        return path.map { URL(fileURLWithPath: $0) } ?? FileManager.default.temporaryDirectory.appending(path: "snapshots")
    }

    /// A ride with a route, power and zones, like an Intervals.icu detail.
    private var ride: ShareWorkout {
        var w = ShareWorkout(title: "Kolo · tempo", sport: "ride")
        w.date = "2026-10-08"
        w.start = "17:30"
        w.minutes = 72
        w.distanceKm = 34.6
        w.watts = 198
        w.normalizedWatts = 221
        w.heartRate = 142
        w.elevation = 486
        w.tss = 84
        var route: [[Double]] = []
        for i in 0..<120 {
            let t: Double = Double(i) / 119
            let lat: Double = 50.08 + 0.05 * t + 0.006 * sin(t * 9)
            let lon: Double = 14.40 + 0.07 * t + 0.01 * cos(t * 7)
            route.append([lat, lon])
        }
        w.route = route
        var curve: [Double] = []
        for i in 0..<60 {
            let wave: Double = 60 * sin(Double(i) / 5)
            curve.append(150 + wave + Double(i % 7) * 4)
        }
        w.curve = curve
        w.curveIsPower = true
        w.zones = [14, 22, 30, 24, 10]
        return w
    }

    private var day: ShareDay {
        var d = ShareDay(today: DemoData.today)
        d.stepsTime = "15:20"
        d.deepMinutes = 94
        d.remMinutes = 108
        d.workouts = [ride]
        return d
    }

    func testDayData() {
        let d = ShareDay(today: DemoData.today)
        XCTAssertEqual(d.readiness, 78)
        XCTAssertEqual(d.sleepEnd, "07:02")
        XCTAssertEqual(d.readinessLabel, "vysoká")
        // The demo's plan workout is still planned: nothing done to show.
        XCTAssertTrue(d.workouts.isEmpty)
        XCTAssertEqual(ShareDay.minutes("17:30"), 1050)
        XCTAssertEqual(ride.end, "18:42")
        XCTAssertEqual(ride.available, ["Vzdálenost", "Čas", "Výkon", "Tep", "Převýšení"])

        var options = ShareOptions()
        options.toggle("Kroky")
        XCTAssertFalse(options.shows("Kroky"))
        XCTAssertEqual(day.metrics(options).map(\.key), ["Připravenost", "Spánek", "HRV", "Tep", "Námaha", "Trénink"])
        options.toggle("Kroky")
        XCTAssertTrue(options.shows("Kroky"))
        XCTAssertEqual(ShareWorkout.smooth(Array(repeating: 100, count: 600)).count, 60)
    }

    func testOptionsAreKept() throws {
        var options = ShareOptions()
        options.variant = 2
        options.dark = false
        options.clear = true
        options.sleep = ["REM"]
        options.save(.food)
        XCTAssertEqual(ShareOptions.load(.food), options)
        UserDefaults.standard.removeObject(forKey: "share.options.food")
        XCTAssertEqual(ShareOptions.load(.food), ShareOptions())
    }

    func testShareImagesRender() throws {
        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        let food = ShareFood(date: "2026-10-08", nutrition: DemoData.today.nutrition)
        for kind in ShareKind.allCases {
            for (i, _) in kind.variants.enumerated() {
                for (suffix, dark, clear) in [("dark", true, false), ("light", false, false), ("clear", true, true)] {
                    var options = ShareOptions()
                    options.variant = i
                    options.dark = dark
                    options.clear = clear
                    options.sleep = ["HRV", "Tep", "Hluboký"]
                    let card = ShareCard(kind: kind, options: options, day: day, workout: ride, food: food)
                    let image = try XCTUnwrap(ShareExport.image(card, clear: clear), "\(kind) \(i) did not render")
                    XCTAssertEqual(image.size.width * image.scale, 1080)
                    let data = try XCTUnwrap(image.pngData())
                    try data.write(to: outputDirectory.appending(path: "share-\(kind.rawValue)-\(i + 1)-\(suffix).png"))
                }
            }
        }
        // A morning: only the night and readiness, spread over the card.
        var morning = ShareOptions()
        morning.hidden = ["Trénink", "Námaha", "Kroky"]
        let card = ShareCard(kind: .day, options: morning, day: day)
        let data = try XCTUnwrap(ShareExport.image(card, clear: false)?.pngData())
        try data.write(to: outputDirectory.appending(path: "share-day-1-morning.png"))
    }
}
