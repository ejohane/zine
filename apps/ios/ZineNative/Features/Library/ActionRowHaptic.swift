import SwiftUI
import UIKit

private struct ActionRowHapticModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.simultaneousGesture(
            TapGesture()
                .onEnded {
                    let generator = UIImpactFeedbackGenerator(style: .light)
                    generator.prepare()
                    generator.impactOccurred()
                }
        )
    }
}

extension View {
    func actionRowHaptic() -> some View {
        modifier(ActionRowHapticModifier())
    }
}
