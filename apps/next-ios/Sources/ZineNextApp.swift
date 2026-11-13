import SwiftUI

@main
struct ZineNextApp: App {
    @State private var space: SavedSpace

    init() {
#if DEBUG
        _space = State(initialValue: SavedSpace(ephemeral: ProcessInfo.processInfo.arguments.contains("-ui-testing")))
#else
        _space = State(initialValue: SavedSpace())
#endif
    }

    var body: some Scene {
        WindowGroup {
            SpaceView(space: space)
                .tint(NextTheme.selection)
        }
    }
}
