import CoreGraphics
import SwiftUI
import UIKit

extension ZineTheme {
    /// A content-derived, dark tonal surface for a single media detail page.
    struct ArtworkPalette: Equatable {
        let hue: CGFloat
        let saturation: CGFloat
        let brightness: CGFloat

        static let fallback = ArtworkPalette(hue: 0, saturation: 0, brightness: 0.12)

        var backgroundUIColor: UIColor {
            UIColor(hue: hue, saturation: saturation, brightness: brightness, alpha: 1)
        }

        var readerBackgroundCSS: String {
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            backgroundUIColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            return "rgb(\(Int((red * 255).rounded())),\(Int((green * 255).rounded())),\(Int((blue * 255).rounded())))"
        }

        var background: Color { Color(uiColor: backgroundUIColor) }
        var primaryText: Color { .white }
        var secondaryText: Color { .white.opacity(0.82) }
        var tertiaryText: Color { .white.opacity(0.68) }
        var divider: Color { .white.opacity(0.18) }
        var controlBackground: Color { .white.opacity(0.10) }
        var actionBackground: Color { .white }
        var actionForeground: Color { background }

        static func make(from image: UIImage) -> ArtworkPalette {
            guard let image = image.cgImage else { return .fallback }

            let side = 32
            var pixels = [UInt8](repeating: 0, count: side * side * 4)
            let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
            let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue
                | CGImageAlphaInfo.premultipliedLast.rawValue
            let drewImage = pixels.withUnsafeMutableBytes { bytes in
                guard let context = CGContext(
                    data: bytes.baseAddress,
                    width: side,
                    height: side,
                    bitsPerComponent: 8,
                    bytesPerRow: side * 4,
                    space: colorSpace,
                    bitmapInfo: bitmapInfo
                ) else { return false }
                context.interpolationQuality = .medium
                context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
                return true
            }
            guard drewImage else { return .fallback }

            // Hue voting favors the image's substantial color families over
            // isolated highlights, black letterboxing, and pale backgrounds.
            var buckets = [HueBucket](repeating: HueBucket(), count: 24)
            for index in stride(from: 0, to: pixels.count, by: 4) {
                let alpha = CGFloat(pixels[index + 3]) / 255
                guard alpha > 0.5 else { continue }

                let red = CGFloat(pixels[index]) / 255
                let green = CGFloat(pixels[index + 1]) / 255
                let blue = CGFloat(pixels[index + 2]) / 255
                let maximum = max(red, green, blue)
                let minimum = min(red, green, blue)
                let chroma = maximum - minimum
                let saturation = maximum > 0 ? chroma / maximum : 0
                guard saturation > 0.16, maximum > 0.12, maximum < 0.96 else { continue }
                // A bright paper-colored field can occupy most of a cover while
                // the smaller, saturated artwork supplies its visual identity.
                if maximum > 0.84 && saturation < 0.60 { continue }

                let hue: CGFloat
                if maximum == red {
                    hue = ((green - blue) / chroma).truncatingRemainder(dividingBy: 6) / 6
                } else if maximum == green {
                    hue = ((blue - red) / chroma + 2) / 6
                } else {
                    hue = ((red - green) / chroma + 4) / 6
                }
                let normalizedHue = hue < 0 ? hue + 1 : hue
                let bucketIndex = min(Int(normalizedHue * CGFloat(buckets.count)), buckets.count - 1)
                let weight = 0.4 + saturation * 0.6
                buckets[bucketIndex].weight += weight
                buckets[bucketIndex].saturation += saturation * weight
                buckets[bucketIndex].hue += normalizedHue * weight
            }

            guard let best = buckets.max(by: { $0.weight < $1.weight }), best.weight >= 8 else {
                return .fallback
            }
            return ArtworkPalette(
                hue: best.hue / best.weight,
                saturation: min(max(best.saturation / best.weight * 0.8, 0.32), 0.72),
                brightness: 0.22
            )
        }
    }
}

private struct HueBucket {
    var weight: CGFloat = 0
    var saturation: CGFloat = 0
    var hue: CGFloat = 0
}
