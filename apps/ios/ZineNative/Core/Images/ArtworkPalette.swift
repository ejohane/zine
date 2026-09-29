import CoreGraphics
import SwiftUI
import UIKit

extension ZineTheme {
    /// A content-derived, dark tonal surface for a single media detail page.
    struct ArtworkPalette: Equatable {
        let hue: CGFloat
        let saturation: CGFloat
        let brightness: CGFloat
        private let sourceSaturation: CGFloat?

        init(hue: CGFloat, saturation: CGFloat, brightness: CGFloat, sourceSaturation: CGFloat? = nil) {
            self.hue = hue
            self.saturation = saturation
            self.brightness = brightness
            self.sourceSaturation = sourceSaturation
        }

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
        var tertiaryText: Color { .white.opacity(brightness <= 0.22 ? 0.68 : 0.78) }
        var divider: Color { .white.opacity(0.18) }
        var controlBackground: Color { .white.opacity(0.10) }
        var resumeControlBackground: Color { .black.opacity(0.22) }
        var actionBackground: Color { .white }
        var actionForeground: Color { background }

        /// Resolve the same extracted creator color for the app's appearance.
        /// Retaining the source saturation lets appearance change without
        /// fetching or decoding the avatar again.
        func resolved(for colorScheme: ColorScheme) -> ArtworkPalette {
            guard let sourceSaturation else { return self }
            let saturation = colorScheme == .dark
                ? min(max(sourceSaturation * 0.8, 0.32), 0.72)
                : min(max(sourceSaturation * 0.9, 0.50), 0.80)
            return ArtworkPalette(
                hue: hue,
                saturation: saturation,
                brightness: colorScheme == .dark ? 0.22 : Self.tonalBrightness(hue: hue, saturation: saturation),
                sourceSaturation: sourceSaturation
            )
        }

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

            // Coverage selects the color family; saturation gives accents a
            // modest advantage without excluding large, pale-colored fields.
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
                guard saturation > 0.16, maximum > 0.12 else { continue }

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
                // Reduce bright/pale votes gradually, by at most 25%. A yellow
                // field still participates; white/gray pixels remain excluded.
                let brightnessPenalty = min(max((maximum - 0.84) / 0.16, 0), 1)
                let paleness = min(max((0.60 - saturation) / 0.44, 0), 1)
                let weight = (0.5 + saturation * 0.5)
                    * (1 - 0.25 * brightnessPenalty * paleness)
                buckets[bucketIndex].weight += weight
                buckets[bucketIndex].saturation += saturation * weight
                buckets[bucketIndex].hue += normalizedHue * weight
            }

            guard let best = buckets.max(by: { $0.weight < $1.weight }), best.weight >= 8 else {
                return .fallback
            }
            let hue = best.hue / best.weight
            let saturation = min(max(best.saturation / best.weight * 0.9, 0.50), 0.80)
            return ArtworkPalette(
                hue: hue,
                saturation: saturation,
                brightness: tonalBrightness(hue: hue, saturation: saturation),
                sourceSaturation: best.saturation / best.weight
            )
        }

        private static func tonalBrightness(hue: CGFloat, saturation: CGFloat) -> CGFloat {
            // Equal HSB brightness does not look equally bright across hues.
            // Aim for a shared perceived luminance instead: white titles retain
            // over 8:1 contrast, while secondary and metadata text retain 4.5:1.
            let targetLuminance: CGFloat = 0.075
            var lower: CGFloat = 0
            var upper: CGFloat = 1
            for _ in 0..<16 {
                let midpoint = (lower + upper) / 2
                let color = UIColor(hue: hue, saturation: saturation, brightness: midpoint, alpha: 1)
                var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
                color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
                func linear(_ value: CGFloat) -> CGFloat {
                    value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
                }
                let luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
                if luminance < targetLuminance { lower = midpoint } else { upper = midpoint }
            }
            return lower
        }
    }
}

private struct HueBucket {
    var weight: CGFloat = 0
    var saturation: CGFloat = 0
    var hue: CGFloat = 0
}
