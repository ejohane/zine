import SwiftUI
import UIKit
import XCTest
@testable import ZineNative

@MainActor
final class RootNavigationChromeTests: XCTestCase {
    func testCompactTitleReturnsAfterRepeatedHiddenBarDestinationPops() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let previousKeyWindow = scene.keyWindow
        let state = NavigationState()
        let host = UIHostingController(rootView: NavigationHarness(state: state))
        let window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            window.isHidden = true
            window.rootViewController = nil
            previousKeyWindow?.makeKeyAndVisible()
        }

        try await settle()
        let navigation = try XCTUnwrap(findNavigationController(in: host))
        assertCompactTitleVisible(in: navigation)

        for _ in 0..<3 {
            state.path.append(1)
            try await settle()
            XCTAssertTrue(navigation.isNavigationBarHidden, "Detail must retain its hidden navigation bar")

            state.path.removeLast()
            try await settle()
            assertCompactTitleVisible(in: navigation)
        }
    }

    private func assertCompactTitleVisible(
        in navigation: UINavigationController,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertFalse(navigation.isNavigationBarHidden, file: file, line: line)
        let title = navigation.navigationBar.topItem?.titleView
        XCTAssertNotNil(title, "Root principal title must be restored", file: file, line: line)
        XCTAssertFalse(title?.isHidden ?? true, file: file, line: line)
        XCTAssertGreaterThan(title?.alpha ?? 0, 0, file: file, line: line)
    }

    private func settle() async throws {
        try await Task.sleep(for: .milliseconds(600))
    }

    private func findNavigationController(in controller: UIViewController) -> UINavigationController? {
        if let navigation = controller as? UINavigationController { return navigation }
        return controller.children.lazy.compactMap { self.findNavigationController(in: $0) }.first
    }
}

@MainActor
private final class NavigationState: ObservableObject {
    @Published var path: [Int] = []
}

private struct NavigationHarness: View {
    @ObservedObject var state: NavigationState

    var body: some View {
        NavigationStack(path: $state.path) {
            TabView {
                Tab("Library", systemImage: "books.vertical") {
                    List(0..<20) { index in Text("Item \(index)") }
                        .zineScreenChrome()
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .zineRootNavigationChrome(compactTitle: "Library", collapseProgress: 1)
            .navigationDestination(for: Int.self) { _ in
                Text("Detail")
                    .toolbarVisibility(.hidden, for: .navigationBar)
                    .zinePushedDestinationChrome()
            }
        }
    }
}
