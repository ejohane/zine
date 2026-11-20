// Generated from packages/next-design/tokens.json by `bun run generate`. Do not edit.
import SwiftUI
import UIKit

enum ZineNextTokens {
    enum Colors {
        static let canvas = adaptive(0xFAFAF8, 0x0A0A0B)
        static let ink = adaptive(0x0E0E10, 0xF5F5F3)
        static let muted = adaptive(0x5F5F64, 0xA3A3A8)
        static let outline = adaptive(0xCDCDC8, 0x3A3A40)
        static let line = adaptive(0xE3E3DF, 0x242427)
        static let lineStrong = adaptive(0x0E0E10, 0x6C6C73)
        static let accent = adaptive(0xFF6A1F, 0xFF6A1F)
        static let accentText = adaptive(0xC8440A, 0xFF6A1F)
        static let onAccent = adaptive(0x0E0E10, 0x0E0E10)
        static let raised = adaptive(0x0E0E10, 0x1A1A1D)
        static let raisedOutline = adaptive(0x0E0E10, 0x3A3A40)
        static let onRaised = adaptive(0xFAFAF8, 0xF5F5F3)
        static let onRaisedMuted = adaptive(0xB5B5BA, 0xA3A3A8)
        static let bubble = adaptive(0xECECE8, 0x1A1A1D)

        private static func adaptive(_ day: UInt32, _ night: UInt32) -> Color {
            Color(uiColor: UIColor { traits in
                let rgb = traits.userInterfaceStyle == .dark ? night : day
                return UIColor(red: CGFloat((rgb >> 16) & 255) / 255,
                               green: CGFloat((rgb >> 8) & 255) / 255,
                               blue: CGFloat(rgb & 255) / 255, alpha: 1)
            })
        }
    }

    static let fontFamily = "Space Grotesk"

    struct TypeStyle {
        let size: CGFloat
        let lineHeight: CGFloat
        let weight: Font.Weight
        /// Tracking in points (size multiplied by the em value).
        let tracking: CGFloat
    }

    enum TypeScale {
        static let display = TypeStyle(size: 32, lineHeight: 1, weight: .bold, tracking: -1.28)
        static let title = TypeStyle(size: 21, lineHeight: 1.05, weight: .bold, tracking: -0.63)
        static let body = TypeStyle(size: 15, lineHeight: 1.3, weight: .medium, tracking: 0)
        static let reading = TypeStyle(size: 17, lineHeight: 1.55, weight: .regular, tracking: 0)
        static let label = TypeStyle(size: 13, lineHeight: 1.4, weight: .bold, tracking: 0)
        static let meta = TypeStyle(size: 12, lineHeight: 1.4, weight: .regular, tracking: 0)
        static let numeral = TypeStyle(size: 20, lineHeight: 1, weight: .regular, tracking: -0.6)
    }

    enum Radius {
        static let thumb: CGFloat = 10
        static let tag: CGFloat = 12
        static let media: CGFloat = 14
        static let bubble: CGFloat = 18
        static let pill: CGFloat = 999
    }

    enum Size {
        static let filter: CGFloat = 40
        static let control: CGFloat = 44
        static let nav: CGFloat = 60
        static let thumb: CGFloat = 44
        static let rule: CGFloat = 1
        static let progress: CGFloat = 3
    }

    enum Space {
        static let gutter: CGFloat = 18
        static let row: CGFloat = 10
        static let stack: CGFloat = 16
    }
}
