import SwiftUI
import UIKit

extension ZineTheme {
    /// Modal surfaces retain a little creator color while separating from the page.
    struct ContentSheetPalette {
        let backgroundUIColor: UIColor

        init(artwork: ArtworkPalette? = nil) {
            let charcoal = ZineTheme.resolvedUIColor(.surface, interfaceStyle: .dark)
            guard let artwork else {
                backgroundUIColor = charcoal
                return
            }
            func components(_ color: UIColor) -> [CGFloat] {
                var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
                color.getRed(&r, green: &g, blue: &b, alpha: &a)
                return [r, g, b]
            }
            func luminance(_ rgb: [CGFloat]) -> CGFloat {
                let linear = rgb.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
                return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
            }
            let creator = components(artwork.backgroundUIColor)
            let base = zip(components(charcoal), creator).map { $0 * 0.8 + $1 * 0.2 }
            // Keep the tint restrained, then lift the surface just above the page.
            // The cap keeps white body text readable even for custom palettes.
            let target = min(max(luminance(creator) + 0.012, 0.035), 0.09)
            var lower: CGFloat = 0
            var upper: CGFloat = 1
            for _ in 0..<16 {
                let amount = (lower + upper) / 2
                let lifted = base.map { $0 + (1 - $0) * amount }
                if luminance(lifted) < target { lower = amount } else { upper = amount }
            }
            let rgb = base.map { $0 + (1 - $0) * lower }
            backgroundUIColor = UIColor(red: rgb[0], green: rgb[1], blue: rgb[2], alpha: 1)
        }

        var background: Color { Color(uiColor: backgroundUIColor) }
        var primaryText: Color { .white }
        var secondaryText: Color { .white.opacity(0.82) }
        var divider: Color { .white.opacity(0.14) }
        var controlBackground: Color { .white.opacity(0.07) }
        var selectedBackground: Color { .white.opacity(0.13) }
        var actionBackground: Color { .white }
        var actionForeground: Color { ZineTheme.onAccent }
    }
}

private struct ContentSheetStyle: ViewModifier {
    let palette: ZineTheme.ContentSheetPalette

    func body(content: Content) -> some View {
        content
            .foregroundStyle(palette.primaryText)
            .tint(palette.primaryText)
            .preferredColorScheme(.dark)
            .presentationBackground(palette.background)
            .presentationDragIndicator(.visible)
    }
}

extension View {
    func contentSheetStyle(_ palette: ZineTheme.ContentSheetPalette) -> some View {
        modifier(ContentSheetStyle(palette: palette))
    }

    func contentSheetPrimaryAction(_ palette: ZineTheme.ContentSheetPalette) -> some View {
        font(.headline)
            .foregroundStyle(palette.actionForeground)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(palette.actionBackground, in: Capsule())
    }
}
