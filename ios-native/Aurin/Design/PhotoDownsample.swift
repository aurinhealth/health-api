import ImageIO
import UIKit

extension UIImage {
    /// The longest side a picked or shot photo keeps. A 48-megapixel photo
    /// decoded whole took up to 190 MB while the food look-up ran in the
    /// background; 2560 px is about 20 MB and still covers the 1600 px upload,
    /// the label camera's middle square (1920 px of a 4:3 photo) and a
    /// 1080 × 1920 share image.
    static let photoSide: CGFloat = 2560

    /// A photo file decoded straight at most `side` pixels on its longer side,
    /// upright (ImageIO), never the whole bitmap first. A smaller photo keeps its size.
    static func downsampled(_ data: Data, side: CGFloat = photoSide) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: side,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    /// The same off the main thread, for a photo from the library.
    static func photo(_ data: Data) async -> UIImage? {
        await Task.detached(priority: .userInitiated) { UIImage.downsampled(data) }.value
    }

    /// An already decoded photo (the system camera) drawn again at most
    /// `side` pixels on its longer side, at scale 1; a smaller one stays as it is.
    func shrunk(side: CGFloat = UIImage.photoSide) -> UIImage {
        let pixels = CGSize(width: size.width * scale, height: size.height * scale)
        let factor = side / max(pixels.width, pixels.height)
        guard factor < 1 else { return self }
        let target = CGSize(width: max(1, (pixels.width * factor).rounded()), height: max(1, (pixels.height * factor).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}
