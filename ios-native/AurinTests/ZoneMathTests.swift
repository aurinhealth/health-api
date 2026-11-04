import XCTest
@testable import Aurin

/// The phone's zone math (ZoneMath) gives the numbers the server gives
/// (tests/training-zones.test.mjs), so the zones do not jump after Save.
final class ZoneMathTests: XCTestCase {
    private let coggan: [Double] = [55, 75, 90, 105, 120, 150]
    private let cogganNames = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"]

    func testPowerZonesAsOnTheServer() {
        let zones = ZoneMath.power(bounds: coggan, names: cogganNames, ftp: 300)
        XCTAssertEqual(zones.count, 7)
        XCTAssertEqual(zones[1].percentLow, 56)
        XCTAssertEqual(zones[1].percentHigh, 75)
        XCTAssertEqual(zones[1].wattsLow, 166)
        XCTAssertEqual(zones[1].wattsHigh, 225)
        XCTAssertNil(zones[6].percentHigh)
        XCTAssertNil(zones[6].wattsHigh)
        // Without an FTP only the percentages.
        XCTAssertNil(ZoneMath.power(bounds: coggan, names: cogganNames, ftp: nil)[1].wattsLow)
    }

    func testHeartZonesFromLthrMaxAndReserve() {
        let friel: [Double] = [81, 89, 93, 99, 102, 106]
        let lthr = ZoneMath.heart(reference: "lthr", bounds: friel, names: cogganNames, lthr: 170, maxHr: nil, restHr: nil)
        XCTAssertEqual(lthr[0].bpmHigh, 138)
        XCTAssertEqual(lthr[1].bpmLow, 139)
        let five: [Double] = [60, 70, 80, 90]
        let names = ["Z1", "Z2", "Z3", "Z4", "Z5"]
        XCTAssertEqual(ZoneMath.heart(reference: "maxHr", bounds: five, names: names, lthr: nil, maxHr: 190, restHr: nil)[4].bpmLow, 172)
        let karvonen = ZoneMath.heart(reference: "reserve", bounds: five, names: names, lthr: nil, maxHr: 190, restHr: 50)
        XCTAssertEqual(karvonen[1].bpmLow, 135)
        XCTAssertEqual(karvonen[4].bpmHigh, 190, "the last zone ends at max")
        XCTAssertNil(ZoneMath.heart(reference: "maxHr", bounds: five, names: names, lthr: nil, maxHr: nil, restHr: nil)[1].bpmLow)
        XCTAssertEqual(ZoneMath.heartModel("frielLthr", lthr: nil, maxHr: 190, restHr: 50), "karvonen")
        XCTAssertEqual(ZoneMath.heartModel("frielLthr", lthr: nil, maxHr: 190, restHr: nil), "hrMax5")
        XCTAssertEqual(ZoneMath.heartModel("frielLthr", lthr: 170, maxHr: 190, restHr: 50), "frielLthr")
    }

    func testPaceAndSwimZones() {
        let pace = ZoneMath.pace(bounds: [77.5, 87.7, 94.3, 100, 103.4, 111.5], names: cogganNames, threshold: 275)
        XCTAssertEqual(pace[0].paceFast, 355)
        XCTAssertEqual(pace[3].paceFast, 275)
        XCTAssertNil(pace[6].paceFast)
        // Own swim zones off a CSS of 1:40 (tests/training-zones.test.mjs).
        let swim = ZoneMath.swim(fastEnds: [10, 5, 2, -3], names: ["Z1", "Z2", "Z3", "Z4", "Z5"], css: 100)
        XCTAssertEqual(swim.map(\.paceSlow), [nil, "1:49", "1:44", "1:41", "1:36"])
        XCTAssertEqual(swim.map(\.paceFast), ["1:50", "1:45", "1:42", "1:37", nil])
    }

    func testTypedStartsBecomeZoneTops() {
        // Watts: Z2 from 161 W at FTP 285 keeps Z1 at 0–160 W after the server rounds it.
        let bounds = ZoneMath.powerBounds(starts: [161, 215, 258, 300, 343, 429], percent: false, ftp: 285)
        XCTAssertEqual(bounds?.first, 56.14)
        let zones = ZoneMath.power(bounds: bounds ?? [], names: cogganNames, ftp: 285)
        XCTAssertEqual(zones[0].wattsHigh, 160)
        XCTAssertEqual(zones[1].wattsLow, 161)
        // Percent: a zone starting at 56 % puts the one below at 0–55 %, as the presets.
        XCTAssertEqual(ZoneMath.powerBounds(starts: [56, 76, 91, 106, 121, 151], percent: true, ftp: nil), coggan)
        XCTAssertEqual(ZoneMath.powerStarts(ZoneMath.power(bounds: coggan, names: cogganNames, ftp: 300), percent: true), [56, 76, 91, 106, 121, 151])
        XCTAssertNil(ZoneMath.powerBounds(starts: [161, 150], percent: false, ftp: 285), "starts must rise")
        XCTAssertNil(ZoneMath.powerBounds(starts: [161, nil], percent: false, ftp: 285))
        // Heart rate: bpm, or % of a threshold of 172.
        XCTAssertEqual(ZoneMath.heartTops(starts: [146, 156], lthr: nil), [145, 155])
        XCTAssertEqual(ZoneMath.heartTops(starts: [85, 90], lthr: 172), [145, 154])
        XCTAssertNil(ZoneMath.heartTops(starts: [40, 156], lthr: nil))
        // Pace: slow paces get faster zone by zone.
        XCTAssertEqual(ZoneMath.paceBounds(starts: [355, 314], percent: false, threshold: 275), [77.46, 87.58])
        XCTAssertNil(ZoneMath.paceBounds(starts: [314, 355], percent: false, threshold: 275))
        XCTAssertEqual(ZoneMath.paceBounds(starts: [77.5, 87.7], percent: true, threshold: nil), [77.5, 87.7])
        // Swim: Z2 from 1:49 at a CSS of 1:40 is a fast end of +10 for Z1.
        XCTAssertEqual(ZoneMath.swimFastEnds(starts: [109, 104, 101, 96], css: 100), [10, 5, 2, -3])
        XCTAssertEqual(ZoneMath.swimStarts(fastEnds: [10, 5, 2, -3], css: 100), [109, 104, 101, 96])
        XCTAssertNil(ZoneMath.swimFastEnds(starts: [104, 109, 101, 96], css: 100))
        XCTAssertEqual(ZoneMath.outOfOrder([161, 150, 258]), [1])
        XCTAssertEqual(ZoneMath.outOfOrder([355, 314, 320], descending: true), [2])
        XCTAssertEqual(ZoneMath.outOfOrder([161, nil]), [1])
    }

    func testOwnZoneNamesComeFromTheirPreset() {
        let models = [
            TrainingProfileResponse.Model(id: "coggan7", label: "Coggan", bounds: coggan, names: ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]),
            TrainingProfileResponse.Model(id: "sweetSpot", label: "SS", bounds: [55, 75, 87, 94, 105, 120], names: ["S1", "S2", "S3", "SS", "S5", "S6", "S7"])
        ]
        XCTAssertEqual(ZoneMath.names(models, base: "sweetSpot", count: 7, skip: "sweetSpot")[3], "SS")
        XCTAssertEqual(ZoneMath.names(models, base: nil, count: 7, skip: "sweetSpot")[3], "C4")
        XCTAssertEqual(ZoneMath.names(models, base: nil, count: 3), ["Z1", "Z2", "Z3"])
    }
}
