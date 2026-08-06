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
        let navigationAppearance = UINavigationBarAppearance()
        navigationAppearance.configureWithOpaqueBackground()
        navigationAppearance.backgroundColor = uiColor(.canvas)
        navigationAppearance.shadowColor = uiColor(.border)
        navigationAppearance.titleTextAttributes = [.foregroundColor: uiColor(.primaryText)]
        navigationAppearance.largeTitleTextAttributes = [.foregroundColor: uiColor(.primaryText)]
        UINavigationBar.appearance().standardAppearance = navigationAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationAppearance
        UINavigationBar.appearance().compactAppearance = navigationAppearance
        UINavigationBar.appearance().tintColor = uiColor(.brandAccent)

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = uiColor(.surface)
        tabAppearance.shadowColor = uiColor(.border)
        configure(
            tabAppearance.stackedLayoutAppearance,
            normal: uiColor(.secondaryText),
            selected: uiColor(.brandAccent)
        )
        configure(
            tabAppearance.inlineLayoutAppearance,
            normal: uiColor(.secondaryText),
            selected: uiColor(.brandAccent)
        )
        configure(
            tabAppearance.compactInlineLayoutAppearance,
            normal: uiColor(.secondaryText),
            selected: uiColor(.brandAccent)
        )
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        UIRefreshControl.appearance().tintColor = uiColor(.brandAccent)
        UIPageControl.appearance().currentPageIndicatorTintColor = uiColor(.brandAccent)
        UIPageControl.appearance().pageIndicatorTintColor = uiColor(.secondaryText).withAlphaComponent(0.3)
    }

    @MainActor
    private static func configure(
        _ appearance: UITabBarItemAppearance,
        normal: UIColor,
        selected: UIColor
    ) {
        appearance.normal.iconColor = normal
        appearance.normal.titleTextAttributes = [.foregroundColor: normal]
        appearance.selected.iconColor = selected
        appearance.selected.titleTextAttributes = [.foregroundColor: selected]
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
            .toolbarBackground(ZineTheme.canvas, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
