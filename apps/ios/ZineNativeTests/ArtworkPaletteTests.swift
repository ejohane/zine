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
        let palette = ZineTheme.ArtworkPalette.make(from: image)
        XCTAssertEqual(palette.resolved(for: .light), .fallback)
        XCTAssertEqual(palette.resolved(for: .dark), .fallback)
    }

    @MainActor
    func testAppearanceChangesToneWithoutChangingCreatorIdentity() {
        let extracted = ZineTheme.ArtworkPalette.make(from: solidImage(
            UIColor(red: 0.98, green: 0.97, blue: 0.54, alpha: 1)
        ))
        let light = extracted.resolved(for: .light)
        let dark = extracted.resolved(for: .dark)
        XCTAssertEqual(light.hue, dark.hue)
        XCTAssertGreaterThan(relativeLuminance(light.backgroundUIColor), relativeLuminance(dark.backgroundUIColor))
        XCTAssertEqual(dark.brightness, 0.22)
        XCTAssertEqual(dark.resolved(for: .light), light)
        XCTAssertEqual(light.resolved(for: .dark), dark)
    }

    @MainActor
    func testSubstantialPaleYellowFieldParticipatesInSelection() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { context in
            UIColor(red: 0.93, green: 0.92, blue: 0.54, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
            UIColor(red: 0.13, green: 0.38, blue: 0.82, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 70, width: 100, height: 30))
        }
        let palette = ZineTheme.ArtworkPalette.make(from: image)

        XCTAssertGreaterThan(palette.hue, 0.10)
        XCTAssertLessThan(palette.hue, 0.20)
        XCTAssertGreaterThanOrEqual(contrastAgainstSecondaryText(palette.backgroundUIColor), 4.5)
    }

    @MainActor
    func testSmallPaleFieldDoesNotDisplaceBlueArtwork() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100)).image { context in
            UIColor(red: 0.13, green: 0.38, blue: 0.82, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
            UIColor(red: 0.98, green: 0.97, blue: 0.54, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 20))
        }
        let palette = ZineTheme.ArtworkPalette.make(from: image)
        XCTAssertGreaterThan(palette.hue, 0.50)
        XCTAssertLessThan(palette.hue, 0.70)
    }

    @MainActor
    func testBrightSaturatedColorsRemainEligibleAndReadable() {
        for step in 0..<24 {
            let hue = CGFloat(step) / 24
            let palette = ZineTheme.ArtworkPalette.make(from: solidImage(
                UIColor(hue: hue, saturation: 0.8, brightness: 1, alpha: 1)
            ))
            XCTAssertNotEqual(palette, .fallback)
            XCTAssertGreaterThanOrEqual(contrastAgainstWhite(palette.backgroundUIColor), 7)
            XCTAssertGreaterThanOrEqual(contrastAgainstSecondaryText(palette.backgroundUIColor), 4.5)
            XCTAssertGreaterThanOrEqual(contrastAgainstText(palette.backgroundUIColor, opacity: 0.78), 4.5)
            XCTAssertEqual(relativeLuminance(palette.backgroundUIColor), 0.075, accuracy: 0.001)
            let dark = palette.resolved(for: .dark)
            XCTAssertEqual(dark.hue, palette.hue)
            XCTAssertGreaterThanOrEqual(contrastAgainstWhite(dark.backgroundUIColor), 7)
            XCTAssertGreaterThanOrEqual(contrastAgainstSecondaryText(dark.backgroundUIColor), 4.5)
            XCTAssertGreaterThanOrEqual(contrastAgainstText(dark.backgroundUIColor, opacity: 0.68), 4.5)
        }
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
        contrastAgainstText(background, opacity: 0.82)
    }

    private func contrastAgainstText(_ background: UIColor, opacity: CGFloat) -> CGFloat {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        background.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let text = UIColor(
            red: red * (1 - opacity) + opacity,
            green: green * (1 - opacity) + opacity,
            blue: blue * (1 - opacity) + opacity,
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
