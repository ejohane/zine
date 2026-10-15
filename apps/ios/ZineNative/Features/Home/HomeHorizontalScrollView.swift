import SwiftUI

private struct HomeTabReselectionKey: EnvironmentKey {
    static let defaultValue = 0
}

extension EnvironmentValues {
    var homeTabReselection: Int {
        get { self[HomeTabReselectionKey.self] }
        set { self[HomeTabReselectionKey.self] = newValue }
    }
}

/// Only the rail's scroll state changes identity. The vertical Home scroll view
/// keeps the system tab re-selection behavior and the section keeps its identity.
struct HomeHorizontalScrollView<Content: View>: View {
    @Environment(\.homeTabReselection) private var tabReselection
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false, content: content)
            // A value, rather than an onChange scroll command, also resets rails
            // retained offscreen by LazyVStack or first realized after the tap.
            .id(tabReselection)
    }
}
