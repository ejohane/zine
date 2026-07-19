import SwiftUI
import UIKit

enum ActionRowHaptics {
    static func play() {
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        generator.impactOccurred()
    }
}

private struct ActionRowHapticModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.simultaneousGesture(
            TapGesture()
                .onEnded {
                    ActionRowHaptics.play()
                }
        )
    }
}

extension View {
    func actionRowHaptic() -> some View {
        modifier(ActionRowHapticModifier())
    }
}
