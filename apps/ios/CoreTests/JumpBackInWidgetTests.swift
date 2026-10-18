import Foundation
import XCTest
@testable import ZineCore

final class JumpBackInWidgetTests: XCTestCase {
    private let scope = JumpBackInWidgetScope(userID: "account-A", apiBaseURL: URL(string: "http://localhost:8756")!)

    func testLinksRoundTripEscapedIDsAndRejectAmbiguousRoutes() {
        let link = JumpBackInWidgetLink(scope: scope, bookmarkID: "item/with ?&unicode-é")
        XCTAssertEqual(JumpBackInWidgetLink(url: link.url), link)
        for value in [
            "https://widget/bookmark?id=a&user=b&api=https://api.myzine.app",
            "zine://widget/bookmark?id=a&id=b&user=c&api=https://api.myzine.app",
            "zine://widget/bookmark?id=a&user=&api=https://api.myzine.app",
            "zine://widget/bookmark?id=a&user=b&api=file:///tmp/data",
            "zine://widget/home", "zine://oauth/callback",
        ] {
            XCTAssertNil(JumpBackInWidgetLink(url: URL(string: value)!), value)
        }
        XCTAssertNotEqual(link.scope, JumpBackInWidgetScope(userID: "account-B", apiBaseURL: scope.apiBaseURL))
        XCTAssertNotEqual(link.scope, JumpBackInWidgetScope(userID: scope.userID, apiBaseURL: URL(string: "https://api.myzine.app")!))
    }

    func testSnapshotReplacementAndSignOutDoNotRetainPreviousAccountArtwork() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let storage = JumpBackInWidgetStorage(directory: directory)
        let first = JumpBackInWidgetSnapshot(scope: scope, items: [
            JumpBackInWidgetItem(id: "a", title: "Title", creator: "Creator", symbol: "doc.text",
                                 artworkURL: nil, artwork: Data([1, 2, 3])),
        ])
        try storage.save(first)
        XCTAssertEqual(storage.load(), first)
        let second = JumpBackInWidgetSnapshot(
            scope: JumpBackInWidgetScope(userID: "account-B", apiBaseURL: scope.apiBaseURL), items: [])
        try storage.save(second)
        XCTAssertEqual(storage.load(), second)
        storage.clear()
        XCTAssertNil(storage.load())
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty)
    }

    func testCorruptOrUnavailableStorageReturnsEmptyState() throws {
        XCTAssertNil(JumpBackInWidgetStorage(directory: nil).load())
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data("partial JSON".utf8).write(to: directory.appendingPathComponent("jump-back-in.json"))
        XCTAssertNil(JumpBackInWidgetStorage(directory: directory).load())
    }
}

final class WidgetColorTests: XCTestCase {
    func testColorParsingAndContrastAcrossSRGBCube() {
        XCTAssertNil(WidgetRGB(hex: "GGFF00"))
        XCTAssertNil(WidgetRGB(hex: "12345678"))
        XCTAssertEqual(WidgetRGB(hex: "#ef661f"), WidgetRGB(hex: "EF661F"))
        XCTAssertTrue(WidgetRGB(hex: "FFFFFF")!.usesDarkText)
        XCTAssertFalse(WidgetRGB(hex: "000000")!.usesDarkText)
        for red in stride(from: 0, through: 255, by: 17) {
            for green in stride(from: 0, through: 255, by: 17) {
                for blue in stride(from: 0, through: 255, by: 17) {
                    let hex = String(format: "%02X%02X%02X", red, green, blue)
                    XCTAssertGreaterThanOrEqual(WidgetRGB(hex: hex)!.textContrast, 4.5, hex)
                }
            }
        }
    }

    func testSavedColorIdentitySurvivesEditsAndSelectionsStayIndependent() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let storage = WidgetColorStorage(directory: directory)
        try storage.save([WidgetSavedColor(id: "a", name: "Paper", hex: "FFFFFF"),
                          WidgetSavedColor(id: "b", name: "Ink", hex: "000000")])
        XCTAssertEqual(storage.color(for: "a"), WidgetRGB(hex: "FFFFFF"))
        XCTAssertEqual(storage.color(for: "b"), WidgetRGB(hex: "000000"))
        try storage.save([WidgetSavedColor(id: "a", name: "Renamed", hex: "EF661F"),
                          WidgetSavedColor(id: "b", name: "Ink", hex: "000000")])
        XCTAssertEqual(storage.color(for: "a"), WidgetRGB(hex: "EF661F"))
        XCTAssertEqual(storage.color(for: "b"), WidgetRGB(hex: "000000"))
        try storage.save([])
        XCTAssertNil(storage.color(for: "a"))
        XCTAssertNil(storage.color(for: "clear"))
        XCTAssertNil(storage.color(for: nil))
    }
}
