import SwiftUI
import UIKit

enum ZineTheme {
    enum Role: CaseIterable, Hashable {
        case canvas
        case surface
        case raised
        case primaryText
        case secondaryText
        case border
        case brandAccent
        case onAccent
        case inlineLink

        var lightHex: String {
            switch self {
            case .canvas: "F5F7F8"
            case .surface: "FFFFFF"
            case .raised: "E9EDF0"
            case .primaryText: "151719"
            case .secondaryText: "5D646C"
            case .border: "CFD4DA"
            case .brandAccent: "EF661F"
            case .onAccent: "000000"
            case .inlineLink: "B64012"
            }
        }

        var darkHex: String {
            switch self {
            case .canvas: "000000"
            case .surface: "14171A"
            case .raised: "20252A"
            case .primaryText: "F5F7F8"
            case .secondaryText: "B2BAC2"
            case .border: "343A40"
            case .brandAccent: "EF661F"
            case .onAccent: "000000"
            case .inlineLink: "FFAD7C"
            }
        }
    }

    static let canvas = color(.canvas)
    static let surface = color(.surface)
    static let raised = color(.raised)
    static let primaryText = color(.primaryText)
    static let secondaryText = color(.secondaryText)
    static let border = color(.border)
    static let brandAccent = color(.brandAccent)
    static let onAccent = color(.onAccent)
    static let inlineLink = color(.inlineLink)
    static let tertiaryText = secondaryText.opacity(0.72)

    static func color(_ role: Role) -> Color {
        Color(uiColor: uiColor(role))
    }

    static func uiColor(_ role: Role) -> UIColor {
        UIColor { traits in
            resolvedUIColor(role, interfaceStyle: traits.userInterfaceStyle)
        }
    }

    static func resolvedUIColor(
        _ role: Role,
        interfaceStyle: UIUserInterfaceStyle
    ) -> UIColor {
        UIColor(zineHex: interfaceStyle == .dark ? role.darkHex : role.lightHex)
    }

    @MainActor
    static func configureUIKitAppearance() {
        UINavigationBar.appearance().tintColor = uiColor(.brandAccent)
        UITabBar.appearance().tintColor = uiColor(.brandAccent)
        UITabBar.appearance().unselectedItemTintColor = uiColor(.secondaryText)

        UIRefreshControl.appearance().tintColor = uiColor(.brandAccent)
        UIPageControl.appearance().currentPageIndicatorTintColor = uiColor(.brandAccent)
        UIPageControl.appearance().pageIndicatorTintColor = uiColor(.secondaryText).withAlphaComponent(0.3)
    }
}

private extension UIColor {
    convenience init(zineHex hex: String) {
        let value = UInt64(hex, radix: 16) ?? 0
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension View {
    func zineAppTheme() -> some View {
        foregroundStyle(ZineTheme.primaryText)
            .tint(ZineTheme.brandAccent)
            .background(ZineTheme.canvas.ignoresSafeArea())
    }

    func zineScreenChrome() -> some View {
        scrollContentBackground(.hidden)
            .background(ZineTheme.canvas)
            .foregroundStyle(ZineTheme.primaryText)
            .tint(ZineTheme.brandAccent)
            .toolbar(.visible, for: .navigationBar)
    }

    func zineTabShellChrome() -> some View {
        tint(ZineTheme.brandAccent)
            .background(ZineTheme.canvas)
    }
}
