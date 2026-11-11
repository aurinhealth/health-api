import CoreImage
import CoreVideo
import Vision
import XCTest
@testable import Aurin

/// The scanner's Vision reader finds a code whichever way the phone is turned
/// (Petr, 2026-11-10: only codes held straight were read), and only inside
/// the window.
final class BarcodeAngleTests: XCTestCase {
    private let ean = "5449000000996"

    func testCodeAtAnyAngle() throws {
        // Vision in this simulator reads a code held straight, else there is nothing to compare.
        guard try VisionBarcodeReader.code(in: frame(code: ean, degrees: 0)) == ean else {
            throw XCTSkip("Vision reads no barcode in this simulator")
        }
        for degrees in [90.0, 180, 270, 45, 30, 135] {
            XCTAssertEqual(try VisionBarcodeReader.code(in: frame(code: ean, degrees: degrees)), ean, "at \(degrees)°")
        }
    }

    func testOnlyInsideTheWindow() throws {
        guard try VisionBarcodeReader.code(in: frame(code: ean, degrees: 0)) == ean else {
            throw XCTSkip("Vision reads no barcode in this simulator")
        }
        // The code sits in the middle; a window in the frame's corner misses it.
        XCTAssertNil(try VisionBarcodeReader.code(in: frame(code: ean, degrees: 90), region: CGRect(x: 0, y: 0, width: 0.2, height: 0.2)))
    }

    func testWindowTurnedToVisionsOrigin() {
        // The top band of the picture (metadata origin top left) is Vision's top band (origin bottom left).
        XCTAssertEqual(VisionBarcodeReader.visionRegion(CGRect(x: 0.1, y: 0, width: 0.5, height: 0.25)),
                       CGRect(x: 0.1, y: 0.75, width: 0.5, height: 0.25))
    }

    /// A 1280×720 camera frame, white, with the EAN-13 code in its middle turned by `degrees`.
    private func frame(code: String, degrees: Double) throws -> CVPixelBuffer {
        let width = 1280, height = 720
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA,
                            [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true] as CFDictionary, &buffer)
        let pixels = try XCTUnwrap(buffer)
        CVPixelBufferLockBaseAddress(pixels, [])
        defer { CVPixelBufferUnlockBaseAddress(pixels, []) }
        let context = try XCTUnwrap(CGContext(data: CVPixelBufferGetBaseAddress(pixels), width: width, height: height, bitsPerComponent: 8,
                                              bytesPerRow: CVPixelBufferGetBytesPerRow(pixels), space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue))
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let modules = Self.ean13Modules(code)
        let module: CGFloat = 6, barHeight: CGFloat = 220
        context.translateBy(x: CGFloat(width) / 2, y: CGFloat(height) / 2)
        context.rotate(by: degrees * .pi / 180)
        context.translateBy(x: -CGFloat(modules.count) * module / 2, y: -barHeight / 2)
        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        for (i, bar) in modules.enumerated() where bar {
            context.fill(CGRect(x: CGFloat(i) * module, y: 0, width: module, height: barHeight))
        }
        return pixels
    }

    /// The 95 modules of an EAN-13 code (true = a bar).
    private static func ean13Modules(_ code: String) -> [Bool] {
        let l = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
        let g = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
        let r = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
        let parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
        let d = code.compactMap(\.wholeNumberValue)
        var bits = "101"
        for (i, kind) in parity[d[0]].enumerated() { bits += kind == "L" ? l[d[i + 1]] : g[d[i + 1]] }
        bits += "01010"
        for i in 7...12 { bits += r[d[i]] }
        bits += "101"
        return bits.map { $0 == "1" }
    }
}

/// Bars too blurred or bent to read (Petr's photo of a can, 2026-11-11): the
/// digits printed under them find the code.
final class BarcodeDigitsTests: XCTestCase {
    func testDigitsOnALine() {
        XCTAssertEqual(VisionBarcodeReader.printedCode(["4 006795 304763"]), "4006795304763")
        XCTAssertEqual(VisionBarcodeReader.printedCode(["4  006795  304763>"]), "4006795304763")
        XCTAssertEqual(VisionBarcodeReader.printedCode(["Lot 12", "4 C06795 304763"]), "4006795304763")
        XCTAssertEqual(VisionBarcodeReader.printedCode(["e 500 g 4006795304763"]), "4006795304763")
    }

    func testOtherNumbersAreNoCode() {
        // A wrong check digit, a date, a batch, 12 digits.
        XCTAssertNil(VisionBarcodeReader.printedCode(["4 006795 304764"]))
        XCTAssertNil(VisionBarcodeReader.printedCode(["Best before 31.12.2026", "L 20261231"]))
        XCTAssertNil(VisionBarcodeReader.printedCode(["0 36000 29145 2"]))
        XCTAssertNil(VisionBarcodeReader.printedCode(["Cola"]))
    }

    func testMisreadLettersOnlyNextToDigits() {
        XCTAssertEqual(VisionBarcodeReader.digitsMisread("4 C06795 Cola l2"), "4 006795 Cola 12")
    }

    func testPhotoOfTheCan() async throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "BarcodeOnCan", withExtension: "jpg"))
        let data = try Data(contentsOf: url)
        let image = try XCTUnwrap(CIImage(data: data))
        let lines = VisionBarcodeReader.textLines(VNImageRequestHandler(ciImage: image))
        try XCTSkipIf(lines.isEmpty, "Vision reads no text in this simulator")
        let code = await BarcodeScanSheet.barcode(in: data)
        XCTAssertEqual(code, "4006795304763", "Text read: \(lines)")
    }

    func testWindowTurnedUpright() {
        // The window in the middle of the picture stays in the middle, its sides swapped.
        XCTAssertEqual(VisionBarcodeReader.uprightRegion(CGRect(x: 0.25, y: 0.125, width: 0.5, height: 0.75)),
                       CGRect(x: 0.125, y: 0.25, width: 0.75, height: 0.5))
    }
}
