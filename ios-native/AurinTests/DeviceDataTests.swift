import XCTest
@testable import Aurin

/// What a link may carry, which links an answer of the coach keeps, and the
/// files that must not stay on the phone.
@MainActor
final class DeviceDataTests: XCTestCase {
    func testLinksCarryOnlyRealDaysSportsAndMuscles() {
        let today = AppModel.localDate(Date())
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/gym/2026-10-30")!), .gym("2026-10-30"))
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/gym/2026-10-30%26x%3Dy")!), .gym(today))
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/gym/..%2F..%2FLibrary%2Foutbox")!), .gym(today))
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/journal/2026-10-29")!), .journal("2026-10-29"))
        if case .journal(let day)? = AppRoute(url: URL(string: "loadwise://open/journal/2026-1o-29")!) {
            XCTAssertTrue(AppRoute.isDay(day))
        } else {
            XCTFail("the journal opens on yesterday")
        }
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/library/run")!), .workoutLibrary("run"))
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/library/nope")!), .library)
        XCTAssertEqual(AppRoute(url: URL(string: "loadwise://open/muscle/upper_back")!), .muscle("upper_back"))
        XCTAssertNil(AppRoute(url: URL(string: "loadwise://open/muscle/quads%26id%3Dx")!))
        XCTAssertFalse(AppRoute.isDay("2026-10-3"))
        XCTAssertFalse(AppRoute.isDay("2026/10/30"))
    }

    func testTheGymCacheNamesFilesOnlyByDays() {
        let day = GymDay(date: "x", values: [[.string("WORK")]], cancelled: nil)
        GymDayCache.save(day, date: "../outbox")
        XCTAssertNil(GymDayCache.load(date: "../outbox"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "outbox.json").path))
    }

    func testCoachLinksStayOnlyToAurin() {
        let text = CoachMarkdown.inline("[Plán](https://aurin.health/t/Ab3dEf7hJk), [účet](https://evil.example/login), [app](otherapp://x), [http](http://aurin.health/)")
        let links = text.runs.compactMap(\.link)
        XCTAssertEqual(links, [URL(string: "https://aurin.health/t/Ab3dEf7hJk")!])
        // The words stay.
        XCTAssertEqual(String(text.characters), "Plán, účet, app, http")
    }

    func testOnlyAVideoIdMakesThePlayer() {
        XCTAssertTrue(YouTubePlayer.isVideoId("dQw4w9WgXcQ"))
        XCTAssertTrue(YouTubePlayer.isVideoId("a-b_c-d_e-f"))
        XCTAssertFalse(YouTubePlayer.isVideoId("dQw4w9WgXc\""))
        XCTAssertFalse(YouTubePlayer.isVideoId("short"))
        XCTAssertFalse(YouTubePlayer.isVideoId("dQw4w9<WgXc"))
    }

    func testTheSignInVerifierIsRandom() {
        let a = AuthService.randomVerifier(), b = AuthService.randomVerifier()
        XCTAssertEqual(a.count, 43)
        XCTAssertNotEqual(a, b)
    }

    func testSigningOutTakesTheExportAndCoachReplies() throws {
        let tmp = FileManager.default.temporaryDirectory
        let export = tmp.appending(path: "aurin-data-2026-10-30.ndjson"), reply = tmp.appending(path: "coach-reply-test.json")
        try Data("{}".utf8).write(to: export)
        try Data("{}".utf8).write(to: reply)
        APIClient.removeExports()
        CoachReplyUpload.sweep(olderThan: 3600)
        XCTAssertFalse(FileManager.default.fileExists(atPath: export.path))
        // A reply still on its way stays at launch; signing out takes it.
        XCTAssertTrue(FileManager.default.fileExists(atPath: reply.path))
        CoachReplyUpload.sweep()
        XCTAssertFalse(FileManager.default.fileExists(atPath: reply.path))
    }

    func testDamagedOutboxCopiesGoWithTheAccount() throws {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let damaged = folder.appending(path: "outbox-damaged-1.json")
        try Data("x".utf8).write(to: damaged)
        OutboxStore.clear()
        XCTAssertFalse(FileManager.default.fileExists(atPath: damaged.path))
    }
}
