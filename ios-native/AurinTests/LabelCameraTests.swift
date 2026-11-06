import XCTest
@testable import Aurin

/// Etiketa: the photo keeps only the square the camera's window showed.
final class LabelCameraTests: XCTestCase {
    func testMiddleSquareOfAnUprightPhoto() async {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let photo = UIGraphicsImageRenderer(size: CGSize(width: 30, height: 40), format: format).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 30, height: 40))
            // The middle square is blue; the 5 px above and below it are cut off.
            UIColor.blue.setFill()
            context.fill(CGRect(x: 0, y: 5, width: 30, height: 30))
        }
        let square = await photo.middleSquare()
        XCTAssertEqual(square.size, CGSize(width: 30, height: 30))
        XCTAssertEqual(square.scale, 1)
        var pixel = [UInt8](repeating: 0, count: 4)
        let drawn = pixel.withUnsafeMutableBytes { bytes in
            CGContext(data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
                .map { context in
                    // The top row of the square, where red would show if the crop were off.
                    context.draw(square.cgImage!, in: CGRect(x: 0, y: -29, width: 30, height: 30))
                    return true
                } ?? false
        }
        XCTAssertTrue(drawn)
        XCTAssertLessThan(pixel[0], 40)
        XCTAssertGreaterThan(pixel[2], 200)
    }
}
