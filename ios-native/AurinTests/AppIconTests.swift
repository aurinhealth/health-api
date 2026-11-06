import XCTest
import UIKit
@testable import Aurin

/// Settings → Ikona aplikace: every icon in the picker has its preview, and every
/// style has the same sport, season and reward icons.
final class AppIconTests: XCTestCase {
    private var icons: [AppIconChoice] { [AppIconChoice.aurin] + AppIconChoice.sections.flatMap { $0.icons } }

    func testEveryIconHasAPreview() {
        for icon in icons {
            XCTAssertNotNil(UIImage(named: icon.preview, in: Bundle(for: AppModel.self), compatibleWith: nil), icon.id)
        }
    }

    func testIdsAreUnique() {
        XCTAssertEqual(Set(icons.map(\.id)).count, icons.count)
    }

    func testEveryStyleHasEverySlot() {
        let slots = ["ride", "ride-gold", "run", "run-gold", "swim", "swim-gold", "multisport", "multisport-gold", "gym", "gym-gold", "spring", "summer", "autumn", "winter", "streak"]
        let ids = Set(icons.map(\.id))
        XCTAssertEqual(AppIconChoice.styles.map(\.key), ["badge", "track"])
        for style in AppIconChoice.styles {
            for slot in slots {
                XCTAssertTrue(ids.contains(style.key + "-" + slot), style.key + "-" + slot)
            }
        }
        XCTAssertEqual(AppIconChoice.sections.map { $0.icons.count }, [4, 4, 4, 4, 4, 8, 2, 5])
        // Sports in the app's order: Ride, Run, Swim, Multisport, Gym.
        XCTAssertEqual(AppIconChoice.sections.prefix(5).map(\.title), ["Kolo", "Běh", "Plavání", "Multisport", "Posilovna"])
    }

    /// An older server without the swim and multisport totals still decodes.
    func testMilestonesWithoutNewTotals() throws {
        let old = try JSONDecoder().decode(Milestones.self, from: Data(#"{"runKm":12,"rideKm":340,"gymSessions":8,"streakDays":3}"#.utf8))
        XCTAssertEqual(old, Milestones(runKm: 12, rideKm: 340, gymSessions: 8, streakDays: 3))
        let now = try JSONDecoder().decode(Milestones.self, from: Data(#"{"runKm":12,"rideKm":340,"swimKm":30,"multisportDays":11,"gymSessions":8,"streakDays":3}"#.utf8))
        let unlock = AppIconUnlock(milestones: now, hasPro: false, season: 0, earned: [])
        let swim = icons.first { $0.id == "badge-swim" }!, multi = icons.first { $0.id == "badge-multisport-gold" }!
        XCTAssertTrue(unlock.isOpen(swim))
        XCTAssertFalse(unlock.isOpen(multi))
        XCTAssertEqual(unlock.progress(multi)?.done, 11)
    }

    func testProIcons() {
        let pro = icons.filter { $0.rule == .pro }
        XCTAssertEqual(pro.map(\.name), ["Polární záře", "Půlnoc", "Zatmění", "Porcelán", "Nebe"])
    }
}
