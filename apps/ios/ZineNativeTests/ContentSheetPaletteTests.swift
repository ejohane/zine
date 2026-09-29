import SwiftUI
import UIKit
import XCTest
@testable import ZineNative

final class ContentSheetPaletteTests: XCTestCase {
    func testStandaloneSheetUsesNeutralCharcoal() {
        let sheet = ZineTheme.ContentSheetPalette()
        XCTAssertEqual(components(sheet.backgroundUIColor), components(ZineTheme.resolvedUIColor(.surface, interfaceStyle: .dark)))
    }

    @MainActor
    func testCreatorSheetsSeparateFromPageAndRetainReadableTextInBothAppearances() {
        for step in 0..<24 {
            let hue = CGFloat(step) / 24
            let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { context in
                UIColor(hue: hue, saturation: 0.8, brightness: 0.8, alpha: 1).setFill()
                context.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
            }
            let extracted = ZineTheme.ArtworkPalette.make(from: image)
            for appearance: ColorScheme in [.light, .dark] {
                let page = extracted.resolved(for: appearance)
                let sheet = ZineTheme.ContentSheetPalette(artwork: page)
                let background = components(sheet.backgroundUIColor)
                let luminance = relativeLuminance(background)
                XCTAssertGreaterThan(luminance, relativeLuminance(components(page.backgroundUIColor)))
                XCTAssertLessThanOrEqual(luminance, 0.091)
                XCTAssertGreaterThanOrEqual(contrast(background, opacity: 1), 7)
                XCTAssertGreaterThanOrEqual(contrast(background, opacity: 0.82), 4.5)
                // Only a hint of creator hue remains, rather than a second saturated page.
                var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
                sheet.backgroundUIColor.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
                XCTAssertLessThan(s, 0.25)
            }
        }
    }

    func testDifferentCreatorsRetainDistinctTintAndMissingAvatarRemainsNeutral() {
        let blue = ZineTheme.ContentSheetPalette(artwork: .init(hue: 0.6, saturation: 0.7, brightness: 0.22))
        let yellow = ZineTheme.ContentSheetPalette(artwork: .init(hue: 0.16, saturation: 0.7, brightness: 0.22))
        XCTAssertNotEqual(components(blue.backgroundUIColor), components(yellow.backgroundUIColor))
        let fallback = ZineTheme.ContentSheetPalette(artwork: .fallback)
        XCTAssertGreaterThan(relativeLuminance(components(fallback.backgroundUIColor)), relativeLuminance(components(ZineTheme.ArtworkPalette.fallback.backgroundUIColor)))
    }

    private func components(_ color: UIColor) -> [CGFloat] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b]
    }

    private func relativeLuminance(_ rgb: [CGFloat]) -> CGFloat {
        let linear = rgb.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
    }

    private func contrast(_ background: [CGFloat], opacity: CGFloat) -> CGFloat {
        let foreground = background.map { opacity + $0 * (1 - opacity) }
        return (relativeLuminance(foreground) + 0.05) / (relativeLuminance(background) + 0.05)
    }
}
