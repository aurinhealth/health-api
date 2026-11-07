import XCTest
@testable import Aurin

/// "Zadat kód": typed digits are looked up as the camera would read them,
/// and a typo in a long code is caught before it finds another food.
final class BarcodeTypedTests: XCTestCase {
    func testValidCodes() {
        XCTAssertEqual(BarcodeScanSheet.typedCode("5449000000996"), "5449000000996")
        XCTAssertEqual(BarcodeScanSheet.typedCode("4006381333931"), "4006381333931")
        // UPC-A gets the leading 0 the camera adds.
        XCTAssertEqual(BarcodeScanSheet.typedCode("036000291452"), "0036000291452")
        XCTAssertEqual(BarcodeScanSheet.typedCode("96385074"), "96385074")
    }

    func testTyposAndLengths() {
        XCTAssertNil(BarcodeScanSheet.typedCode("5449000000997"))
        XCTAssertNil(BarcodeScanSheet.typedCode("036000291453"))
        XCTAssertNil(BarcodeScanSheet.typedCode("1234567"))
        XCTAssertNil(BarcodeScanSheet.typedCode("12345678901"))
        XCTAssertNil(BarcodeScanSheet.typedCode("12345678901234"))
        XCTAssertNil(BarcodeScanSheet.typedCode("544900000099a"))
    }
}
