import SwiftUI
import XCTest
@testable import Aurin

/// The home-screen widgets' faces (Shared/WidgetFaces.swift) on the concept's
/// sample day, in English, light and dark: the board ios-designer and the
/// critic hold against the widgets concept v3 (Figma page "v3 1").
@MainActor
final class WidgetFaceTests: XCTestCase {
    private var outputDirectory: URL {
        let path = ProcessInfo.processInfo.environment["SNAPSHOT_DIR"]
        return path.map { URL(fileURLWithPath: $0) } ?? FileManager.default.temporaryDirectory.appending(path: "snapshots")
    }

    /// The concept's demo day (v2 fix round): one set of numbers on every widget.
    private var day: WidgetSnapshot {
        var s = WidgetSnapshot.sample
        s.readiness = 78
        s.zone = "green"
        s.hrv = 68
        s.hrvLow = 60
        s.hrvHigh = 74
        s.restingHR = 53
        s.restingLow = 50
        s.restingHigh = 56
        s.strain = 8.4
        s.strainLow = 11
        s.strainHigh = 14
        s.sleepMinutes = 414
        s.sleepNeed = 420
        s.sleepStart = "23:36"
        s.sleepEnd = "06:42"
        s.waterMl = 800
        s.waterTarget = 2500
        s.steps = 6420
        s.stepsGoal = 10000
        s.stepsAverage = 9212
        s.kcal = 1380
        s.kcalTarget = 2650
        s.nextTitle = "Upper body strength"
        s.nextTime = "17:30"
        s.nextSport = "strength"
        s.nextMinutes = 45
        return s
    }

    func testSmallWidgets() throws {
        L10n.setLanguage("en")
        defer {
            L10n.setLanguage("cs")
            UserDefaults.standard.removeObject(forKey: "AppleLanguages")
        }
        let s = day
        // The captions carry a concrete number (design rule), in the app's words.
        XCTAssertEqual(WidgetFaces.hrv(s).caption, "usual 60 to 74")
        XCTAssertEqual(WidgetFaces.strain(s).caption, "target 11 to 14")
        XCTAssertEqual(WidgetFaces.steps(s).caption?.hasPrefix("your average "), true)
        XCTAssertEqual(WidgetFaces.readiness(s).caption, "in your usual range")

        var low = s
        low.readiness = 52
        low.zone = "yellow"
        var learning = s
        learning.readiness = nil
        learning.zone = nil
        learning.learningDays = 4
        var noData = s
        noData.readiness = nil
        noData.zone = nil
        var noWatch = noData
        noWatch.noWearable = true
        noWatch.sleepMinutes = nil
        noWatch.hrv = nil
        var newUser = s
        newUser.strainLow = nil
        newUser.strainHigh = nil

        try render("widgets-small", rows: [
            [AnyView(WidgetFaces.readiness(s)), AnyView(WidgetFaces.strain(s)), AnyView(WidgetFaces.sleep(s)),
             AnyView(WidgetFaces.hrv(s)), AnyView(WidgetFaces.water(s))],
            [AnyView(WidgetFaces.next(s)), AnyView(WidgetFaces.food(s)), AnyView(WidgetFaces.restingHR(s)),
             AnyView(WidgetFaces.steps(s)), AnyView(WidgetFaces.kcalLeft(s))],
            [AnyView(WidgetFaces.readiness(low)), AnyView(WidgetFaces.readiness(learning)), AnyView(WidgetFaces.readiness(noData)),
             AnyView(WidgetFaces.readiness(noWatch)), AnyView(WidgetFaces.sleep(noWatch))],
            [AnyView(WidgetFaces.hrv(noWatch)), AnyView(WidgetFaces.strain(newUser)), AnyView(WidgetFaces.next(WidgetSnapshot(date: s.date, updated: s.updated))),
             AnyView(WidgetFaces.food(WidgetSnapshot(date: s.date, updated: s.updated, kcal: 0, kcalTarget: 2650))), AnyView(WidgetFaces.sleep(noData))]
        ])
    }

    /// A snapshot saved by an older build (no redesign fields) still loads.
    func testOlderSnapshotDecodes() throws {
        let json = #"{"date":"2026-11-20","updated":1795000000,"readiness":70,"zone":"green"}"#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        let s = try decoder.decode(WidgetSnapshot.self, from: Data(json.utf8))
        XCTAssertEqual(s.readiness, 70)
        XCTAssertNil(s.sleepStart)
        XCTAssertNil(s.strainLow)
    }

    /// The usual steps a day leave today out and skip days without steps.
    func testStepsAverage() {
        let today = DemoData.today
        let earlier = today.steps.week.filter { $0.date != today.date && $0.value > 0 }
        guard !earlier.isEmpty else { return XCTAssertNil(WidgetBridge.stepsAverage(today)) }
        XCTAssertEqual(WidgetBridge.stepsAverage(today) ?? 0, earlier.map(\.value).reduce(0, +) / Double(earlier.count), accuracy: 0.001)
    }

    /// Each face on a small widget's card (170 pt, the 6.3" iPhone), five to a row.
    private func render(_ name: String, rows: [[AnyView]]) throws {
        try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
        for (suffix, scheme) in [("light", ColorScheme.light), ("dark", ColorScheme.dark)] {
            let board = VStack(spacing: 16) {
                ForEach(rows.indices, id: \.self) { r in
                    HStack(spacing: 16) {
                        ForEach(rows[r].indices, id: \.self) { c in
                            rows[r][c]
                                .padding(16)
                                .frame(width: 170, height: 170)
                                .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Palette.card))
                        }
                    }
                }
            }
            .padding(24)
            .background(scheme == .dark ? Color(white: 0.05) : Color(red: 0.93, green: 0.91, blue: 0.87))
            .environment(\.colorScheme, scheme)
            let renderer = ImageRenderer(content: board)
            renderer.scale = 2
            let png = try XCTUnwrap(renderer.uiImage?.pngData(), "\(name) did not render")
            try png.write(to: outputDirectory.appending(path: "\(name)-\(suffix).png"))
        }
    }
}
