import SwiftUI
import UIKit
import XCTest
@testable import ZineNative

@MainActor
final class HomeHorizontalScrollTests: XCTestCase {
    func testReselectionResetsMultipleRailsAtTopInBothDensities() async throws {
        for density in [HomeLayoutDensity.standard, .compact] {
            try await withHome(density: density) { state, host in
                let rails = horizontalScrollViews(in: host.view)
                XCTAssertGreaterThanOrEqual(rails.count, 2)
                for rail in rails { rail.contentOffset.x = 180 }
                try await settle()
                XCTAssertTrue(horizontalScrollViews(in: host.view).allSatisfy { $0.contentOffset.x > 100 })

                // A redraw with the same event value must preserve normal scrolling.
                state.redraw += 1
                try await settle()
                XCTAssertTrue(horizontalScrollViews(in: host.view).allSatisfy { $0.contentOffset.x > 100 })

                state.selectedTab = 1
                try await settle()
                state.selectedTab = 0
                try await settle()
                XCTAssertFalse(horizontalScrollViews(in: host.view).isEmpty)
                XCTAssertTrue(horizontalScrollViews(in: host.view).allSatisfy { $0.contentOffset.x > 100 })

                state.reselection += 1
                try await settle()
                assertRailsAtStart(in: host.view)
                // Repeating the interaction must work after scrolling again.
                for rail in horizontalScrollViews(in: host.view) { rail.contentOffset.x = 150 }
                state.reselection += 1
                try await settle()
                assertRailsAtStart(in: host.view)
            }
        }
    }

    func testReselectionResetsOffscreenAndNewlyRealizedRails() async throws {
        for density in [HomeLayoutDensity.standard, .compact] {
            try await withHome(density: density) { state, host in
                let vertical = try XCTUnwrap(scrollViews(in: host.view).first { $0.contentSize.height > $0.bounds.height + 100 })
                let bottom = max(0, vertical.contentSize.height - vertical.bounds.height)
                vertical.contentOffset.y = bottom
                try await settle()
                let bottomRails = horizontalScrollViews(in: host.view)
                XCTAssertFalse(bottomRails.isEmpty)
                for rail in bottomRails { rail.contentOffset.x = 180 }
                try await settle()
                vertical.contentOffset.y = -vertical.adjustedContentInset.top
                try await settle()
                state.reselection += 1
                try await settle()
                assertRailsAtStart(in: host.view)
                vertical.contentOffset.y = max(0, vertical.contentSize.height - vertical.bounds.height)
                try await settle()
                assertRailsAtStart(in: host.view)
                // A middle row need not have been realized when the event occurred.
                vertical.contentOffset.y = vertical.contentSize.height / 2
                try await settle()
                assertRailsAtStart(in: host.view)
            }
        }
    }

    private func withHome(
        density: HomeLayoutDensity,
        exercise: (HomeScrollTestState, UIHostingController<HomeScrollHarness>) async throws -> Void
    ) async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = HomeCache(userID: "home-scroll-test", baseDirectory: directory)
        let collections = (0..<12).map { row in
            HomeCollection(
                collectionId: "row-\(row)", title: "Row \(row)",
                layout: row.isMultiple(of: 2) ? .stackRail : .coverRail,
                position: row, count: 8,
                items: (0..<8).map { column in
                    HomeItem(
                        id: "\(row)-\(column)", itemId: "item-\(row)-\(column)",
                        title: "Card \(column)", thumbnailUrl: nil,
                        canonicalUrl: URL(string: "https://example.com/\(row)/\(column)")!,
                        contentType: .podcast, provider: .rss, creator: "Creator",
                        creatorImageUrl: nil, creatorId: nil, publisher: nil, summary: nil,
                        duration: nil, publishedAt: nil, readingTimeMinutes: nil,
                        bookmarkedAt: nil, lastOpenedAt: nil, progress: nil
                    )
                }
            )
        }
        await cache.save(home: HomeResponse(
            recentBookmarks: [], jumpBackIn: [],
            byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []),
            customCollections: collections,
            sectionOrder: collections.map { HomeLayoutSection(kind: .collection, builtInSection: nil, collectionId: $0.id) },
            requestId: nil, traceId: nil
        ), inboxItems: [])
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HomeScrollUnavailableURLProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://example.com")!, tokenProvider: { "fixture" },
                               session: URLSession(configuration: configuration))
        let store = HomeStore(client: client, cache: cache)
        await store.reload()
        XCTAssertEqual(store.sections.count, 12)
        let state = HomeScrollTestState()
        let host = UIHostingController(rootView: HomeScrollHarness(state: state, store: store, client: client, density: density))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let previousWindow = scene.keyWindow
        let window = UIWindow(windowScene: scene)
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            window.isHidden = true
            window.rootViewController = nil
            previousWindow?.makeKeyAndVisible()
        }
        try await settle()
        try await exercise(state, host)
    }

    private func assertRailsAtStart(in view: UIView, file: StaticString = #filePath, line: UInt = #line) {
        let rails = horizontalScrollViews(in: view)
        XCTAssertFalse(rails.isEmpty, file: file, line: line)
        for rail in rails {
            XCTAssertEqual(rail.contentOffset.x, -rail.adjustedContentInset.left, accuracy: 1, file: file, line: line)
        }
    }

    private func horizontalScrollViews(in view: UIView) -> [UIScrollView] {
        scrollViews(in: view).filter { $0.contentSize.width > $0.bounds.width + 100 }
    }

    private func scrollViews(in view: UIView) -> [UIScrollView] {
        ((view as? UIScrollView).map { [$0] } ?? []) + view.subviews.flatMap { scrollViews(in: $0) }
    }

    private func settle() async throws { try await Task.sleep(for: .milliseconds(400)) }
}

@MainActor
private final class HomeScrollTestState: ObservableObject {
    @Published var reselection = 0
    @Published var redraw = 0
    @Published var selectedTab = 0
}

private struct HomeScrollHarness: View {
    @ObservedObject var state: HomeScrollTestState
    let store: HomeStore
    let client: APIClient
    let density: HomeLayoutDensity

    var body: some View {
        TabView(selection: $state.selectedTab) {
            Tab("Home", systemImage: "house", value: 0) {
                HomeView(client: client, store: store, density: density,
                         title: "Home \(state.redraw)", onContentChanged: {}, onExternalOpen: { _ in },
                         onHomeItemExternalOpen: { _ in }, tabReselection: state.reselection,
                         registersNavigationDestinations: false)
            }
            Tab("Other", systemImage: "books.vertical", value: 1) { Text("Other") }
        }
    }
}

private final class HomeScrollUnavailableURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    override func stopLoading() {}
}
