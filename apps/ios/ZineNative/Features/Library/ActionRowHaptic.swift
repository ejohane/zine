import SwiftUI
import UIKit

enum ActionRowHaptics {
    static func play(style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred(intensity: 1)
    }
}

/// Native ShareLink and Menu own their actions, so trigger feedback when pressed.
struct ActionRowHapticButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    var enabled = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, pressed in
                guard pressed && enabled && isEnabled else { return }
                ActionRowHaptics.play(style: .heavy)
            }
    }
}

private struct ActionRowHapticModifier: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled
    let style: UIImpactFeedbackGenerator.FeedbackStyle
    let enabled: Bool

    func body(content: Content) -> some View {
        content.simultaneousGesture(
            TapGesture()
                .onEnded {
                    guard enabled && isEnabled else { return }
                    ActionRowHaptics.play(style: style)
                }
        )
    }
}

extension View {
    func actionRowHaptic(style: UIImpactFeedbackGenerator.FeedbackStyle = .light, enabled: Bool = true) -> some View {
        modifier(ActionRowHapticModifier(style: style, enabled: enabled))
    }
}
