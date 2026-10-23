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
        // The demo's morning run is done; the gym session is still planned.
        XCTAssertEqual(d.workouts.count, 1)
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
                    let card = ShareCard(kind: kind, options: options, day: day, workout: ride, food: food, week: .sample, milestones: .sample)
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
        // Milník: the days in a row on the poster and the way there.
        for variant in [0, 1] {
            var options = ShareOptions()
            options.variant = variant
            options.milestone = "streak"
            let streak = ShareCard(kind: .milestone, options: options, milestones: .sample)
            let png = try XCTUnwrap(ShareExport.image(streak, clear: false)?.pngData())
            try png.write(to: outputDirectory.appending(path: "share-milestone-\(variant + 1)-streak.png"))
        }
    }

    /// The sample gym day with every work set done.
    private var gym: ShareWorkout {
        var day = DemoData.gym
        for set in day.exercises.flatMap(\.sets) where set.work {
            day.complete(row: set.row, kg: set.plannedKg ?? "", reps: "8", rpe: "")
        }
        var w = ShareWorkout(title: "Posilovna", sport: "strength")
        w.date = "2026-10-08"
        w.minutes = 64
        w.kcal = 412
        w.add(day)
        return w
    }

    func testGymNumbers() throws {
        let w = gym
        XCTAssertFalse(w.best.isEmpty)
        XCTAssertNotNil(w.value("Objem"))
        XCTAssertNotNil(w.value("Série"))
        XCTAssertEqual(w.value("Kalorie")?.value, "412")
        XCTAssertEqual(w.value("Cviky")?.value, String(w.best.count))
        XCTAssertTrue(w.best.allSatisfy { $0.set.contains("× 8") })
        // No route for a gym: its exercises instead, and no chart without heart rate.
        XCTAssertEqual(ShareKind.activity.layouts(w).map(\.name), ["Cviky", "Čísla"])
        XCTAssertEqual(ShareKind.activity.layouts(ride).map(\.name), ["Trasa", "Graf", "Čísla"])

        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        for variant in [0, 2] {
            var options = ShareOptions()
            options.variant = variant
            let card = ShareCard(kind: .activity, options: options, workout: w)
            let png = try XCTUnwrap(ShareExport.image(card, clear: false)?.pngData())
            try png.write(to: outputDirectory.appending(path: "share-activity-gym-\(variant + 1).png"))
        }
    }

    /// A photo behind the numbers, the numbers moved up to the middle.
    func testPhotoBehindTheImage() throws {
        let size = CGSize(width: 900, height: 1200)
        let photo = UIGraphicsImageRenderer(size: size).image { context in
            let colors = [UIColor(red: 0.95, green: 0.7, blue: 0.48, alpha: 1).cgColor, UIColor(red: 0.16, green: 0.16, blue: 0.2, alpha: 1).cgColor]
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: [0, 1])!
            context.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
        }
        XCTAssertEqual(SharePhoto.fitted(photo, longSide: 600).size, CGSize(width: 450, height: 600))
        var options = ShareOptions()
        options.variant = 2
        options.clear = true
        let card = ShareCard(kind: .activity, options: options, workout: gym, photo: photo,
                             offsets: [ShareBlock.bottom: CGSize(width: 0, height: -60)])
        let image = try XCTUnwrap(ShareExport.image(card, clear: false))
        XCTAssertEqual(image.size.width * image.scale, 1080)
        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        try XCTUnwrap(image.pngData()).write(to: outputDirectory.appending(path: "share-activity-photo.png"))
    }

    func testWeekAndMilestoneData() throws {
        let week = ShareWeek.sample
        XCTAssertEqual(ShareWeek.value("Trénink", week.week)?.value, "7:40")
        XCTAssertEqual(ShareWeek.delta("Trénink", now: 460, before: 395), "+1:05 h")
        XCTAssertEqual(ShareWeek.delta("Běh", now: 18, before: 22), "−4")
        XCTAssertEqual(ShareWeek.delta("Zátěž", now: 486, before: 412), "+74")
        XCTAssertNil(ShareWeek.value("Kolo", ShareWeek.Totals()))
        XCTAssertEqual(ShareText.range("2026-10-12", "2026-10-18"), "12.–18. 10.")
        XCTAssertEqual(ShareText.range("2026-09-28", "2026-10-04"), "28. 9. – 4. 10.")
        XCTAssertEqual(ShareText.weekday("2026-10-12"), "Po")

        let json = #"{"since":"2026-06-12","today":"2026-10-15","items":[{"key":"run","value":25,"unit":"km","total":26,"since":"2026-06-12","reachedOn":"2026-10-14","sessions":2,"minutes":120,"elevation":0,"bars":[{"date":"2026-10-13","value":12},{"date":"2026-10-14","value":14}],"start":0}],"record":null}"#
        let decoded = try JSONDecoder().decode(ShareMilestones.self, from: Data(json.utf8))
        let run = try XCTUnwrap(decoded.item(nil))
        XCTAssertEqual(run.path, [0, 12, 26])
        XCTAssertEqual(run.noun, "naběhaných kilometrů")
        XCTAssertEqual(run.sinceText, "od 12. června")
        XCTAssertEqual(run.stat("Tréninky")?.label, "Běhy")
        XCTAssertNil(run.stat("Převýšení"))
        XCTAssertNil(decoded.record)
        XCTAssertEqual(ShareMilestones.sample.item("streak")?.noun, "dní v řadě")
        XCTAssertEqual(ShareMilestones.Record.duration(1200), "20 minut")
        XCTAssertEqual(ShareMilestones.Record.duration(60), "1 minuta")
        XCTAssertTrue(ShareMilestones(items: [], record: nil).isEmpty)

        let weekJSON = #"{"start":"2026-10-12","end":"2026-10-18","today":"2026-10-15","days":[{"date":"2026-10-12","readiness":64,"zone":"green","sport":"run","minutes":50,"sessions":1,"tss":60}],"week":{"minutes":50,"sessions":1,"tss":60,"rideKm":0,"runKm":10,"sleepMinutes":420,"readiness":64},"previous":{"minutes":0,"sessions":0,"tss":0,"rideKm":0,"runKm":0,"sleepMinutes":null,"readiness":null}}"#
        let parsed = try JSONDecoder().decode(ShareWeek.self, from: Data(weekJSON.utf8))
        XCTAssertEqual(parsed.days.first?.readiness, 64)
        XCTAssertNil(parsed.previous.readiness)
    }
}
