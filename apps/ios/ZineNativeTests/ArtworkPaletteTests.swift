import UIKit
import XCTest
@testable import ZineNative

final class ArtworkPaletteTests: XCTestCase {
    @MainActor
    func testBlueArtworkProducesADeepBlueReadableSurface() {
        let image = solidImage(UIColor(red: 0.06, green: 0.40, blue: 0.82, alpha: 1))
        let palette = ZineTheme.ArtworkPalette.make(from: image)

        XCTAssertGreaterThan(palette.hue, 0.50)
        XCTAssertLessThan(palette.hue, 0.70)
        XCTAssertGreaterThanOrEqual(contrastAgainstWhite(palette.backgroundUIColor), 7)
        XCTAssertGreaterThanOrEqual(contrastAgainstSecondaryText(palette.backgroundUIColor), 4.5)
    }

    @MainActor
    func testGrayArtworkUsesNeutralFallback() {
        let image = solidImage(UIColor(white: 0.5, alpha: 1))
        XCTAssertEqual(ZineTheme.ArtworkPalette.make(from: image), .fallback)
    }

    @MainActor
    func testBrightCoverFieldYieldsToSaturatedAccent() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { context in
            UIColor(red: 0.93, green: 0.92, blue: 0.54, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
            UIColor(red: 0.13, green: 0.38, blue: 0.82, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 70, width: 100, height: 30))
        }
        let palette = ZineTheme.ArtworkPalette.make(from: image)

        XCTAssertGreaterThan(palette.hue, 0.50)
        XCTAssertLessThan(palette.hue, 0.70)
        XCTAssertGreaterThanOrEqual(contrastAgainstSecondaryText(palette.backgroundUIColor), 4.5)
    }

    @MainActor
    private func solidImage(_ color: UIColor) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }
    }

    private func contrastAgainstWhite(_ background: UIColor) -> CGFloat {
        (1.05) / (relativeLuminance(background) + 0.05)
    }

    private func contrastAgainstSecondaryText(_ background: UIColor) -> CGFloat {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        background.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let text = UIColor(
            red: red * 0.18 + 0.82,
            green: green * 0.18 + 0.82,
            blue: blue * 0.18 + 0.82,
            alpha: 1
        )
        return (relativeLuminance(text) + 0.05) / (relativeLuminance(background) + 0.05)
    }

    private func relativeLuminance(_ color: UIColor) -> CGFloat {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        func linear(_ value: CGFloat) -> CGFloat {
            value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }
}
