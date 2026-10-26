import XCTest
@testable import Loadwise

/// The app's settings kept with the account (SettingsBackup): only what the
/// user chose goes out, and it comes back as it was.
@MainActor
final class SettingsBackupTests: XCTestCase {
    func testOnlyTheUsersChoicesAreKept() {
        XCTAssertTrue(SettingsBackup.kept("appearance"))
        XCTAssertTrue(SettingsBackup.kept("restSets"))
        XCTAssertTrue(SettingsBackup.kept("remind.water.every"))
        XCTAssertTrue(SettingsBackup.kept("share.options.food"))
        // Things of this phone or this session stay out.
        XCTAssertFalse(SettingsBackup.kept(AvatarStore.idKey))
        XCTAssertFalse(SettingsBackup.kept("appleHealth.enabled"))
        XCTAssertFalse(SettingsBackup.kept("heartRateSensorID"))
        XCTAssertFalse(SettingsBackup.kept("liveWorkout.checkpoint"))
        XCTAssertFalse(SettingsBackup.kept("push.sentToken"))
    }

    func testSettingsComeBackAsTheyWere() throws {
        let from = try XCTUnwrap(UserDefaults(suiteName: "SettingsBackupTests.from"))
        let to = try XCTUnwrap(UserDefaults(suiteName: "SettingsBackupTests.to"))
        for (suite, defaults) in [("SettingsBackupTests.from", from), ("SettingsBackupTests.to", to)] {
            defaults.removePersistentDomain(forName: suite)
            addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        }
        from.set("dark", forKey: "appearance")
        from.set(90, forKey: "restExercises")
        from.set(false, forKey: GymSignals.vibrationKey)
        from.set(Data([1, 2, 3]), forKey: "appleHealth.export")
        from.set("token", forKey: "push.sentToken")
        let sent = SettingsBackup.current(from)
        XCTAssertNil(sent["push.sentToken"])
        let data = try PropertyListSerialization.data(fromPropertyList: sent, format: .binary, options: 0)
        let back = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        SettingsBackup.apply(back, to: to)
        XCTAssertEqual(to.string(forKey: "appearance"), "dark")
        XCTAssertEqual(to.integer(forKey: "restExercises"), 90)
        XCTAssertEqual(to.object(forKey: GymSignals.vibrationKey) as? Bool, false)
        XCTAssertEqual(to.data(forKey: "appleHealth.export"), Data([1, 2, 3]))
        XCTAssertNil(to.string(forKey: "push.sentToken"))
    }
}
