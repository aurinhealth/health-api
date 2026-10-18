import XCTest
import UIKit
@testable import Loadwise

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
        let slots = ["run", "run-gold", "ride", "ride-gold", "gym", "gym-gold", "spring", "summer", "autumn", "winter", "streak"]
        let ids = Set(icons.map(\.id))
        XCTAssertEqual(AppIconChoice.styles.map(\.key), ["badge", "track"])
        for style in AppIconChoice.styles {
            for slot in slots {
                XCTAssertTrue(ids.contains(style.key + "-" + slot), style.key + "-" + slot)
            }
        }
        XCTAssertEqual(AppIconChoice.sections.map { $0.icons.count }, [4, 4, 4, 8, 2, 5])
    }

    func testProIcons() {
        let pro = icons.filter { $0.rule == .pro }
        XCTAssertEqual(pro.map(\.name), ["Polární záře", "Půlnoc", "Zatmění", "Porcelán", "Nebe"])
    }
}
