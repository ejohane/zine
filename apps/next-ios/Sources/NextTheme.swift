import SwiftUI
import UIKit

/// Independent tokens; this app deliberately does not import the legacy theme.
enum NextTheme {
    static let canvas = adaptive(0xF3F3F8, 0x101014)
    static let paper = adaptive(0xFFFFFF, 0x1D1D24)
    static let inset = adaptive(0xE8E9F1, 0x2B2C36)
    static let ink = adaptive(0x1C1D26, 0xF4F3FA)
    static let secondary = adaptive(0x626372, 0xB7B7C7)
    static let line = adaptive(0xD5D6E2, 0x393A47)
    static let selection = adaptive(0x3653C8, 0xA8B8FF)
    // Content-driven contrast roles for text over photographic artwork.
    static let mediaText = Color.white
    static let mediaScrim = Color.black
    static let onSelection = adaptive(0xFFFFFF, 0x151D42)

    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((rgb >> 16) & 255) / 255,
                           green: CGFloat((rgb >> 8) & 255) / 255,
                           blue: CGFloat(rgb & 255) / 255, alpha: 1)
        })
    }
}
