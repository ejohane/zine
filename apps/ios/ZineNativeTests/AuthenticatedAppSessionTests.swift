import Foundation
import SwiftUI
import XCTest
@testable import ZineNative

final class AuthenticatedAppSessionTests: XCTestCase {
    @MainActor
    func testReconstructedShellRetainsEntireSessionGraph() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SessionUnavailableProtocol.self]
        let transport = URLSession(configuration: configuration)
        defer { transport.invalidateAndCancel() }
        func session(_ id: String) -> AuthenticatedAppSession {
            AuthenticatedAppSession(baseURL: URL(string: "https://fixture.invalid")!, userID: id,
                                    tokenProvider: { "fixture" }, transport: transport, baseDirectory: directory)
        }
        let original = session("original")
        let replacement = session("replacement")
        func shell(_ session: AuthenticatedAppSession) -> AuthenticatedAppView {
            AuthenticatedAppView(configuration: .current, userID: "session-fixture",
                                 userCreatedAt: .distantPast, userEmail: nil, initialSession: session)
        }
        let host = UIHostingController(rootView: shell(original))
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.layoutIfNeeded()
        for _ in 0..<100 where original.commandSession.navigate == nil {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertNotNil(original.commandSession.navigate)
        XCTAssertTrue(original.client.bookmarkState === original.commandSession.client.bookmarkState)
        host.rootView = shell(replacement)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertNil(replacement.commandSession.navigate, "Reconstruction must not wire a replacement graph")
        XCTAssertNotNil(original.commandSession.navigate)
        XCTAssertFalse(original.client.bookmarkState === replacement.client.bookmarkState)
    }
}

private final class SessionUnavailableProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    override func stopLoading() {}
}
