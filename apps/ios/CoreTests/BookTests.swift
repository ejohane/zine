import Foundation
import XCTest
@testable import ZineCore

final class BookTests: XCTestCase {
    func testBookDecodesAndOpensExternally() throws {
        let type = try JSONDecoder().decode(ContentType.self, from: Data("\"BOOK\"".utf8))
        XCTAssertEqual(type, .book)
        XCTAssertEqual(type.title, "Book")
        XCTAssertEqual(type.systemImage, "book.closed")
        XCTAssertFalse(Provider.web.opensInZineReader(contentType: type))
        XCTAssertTrue(Provider.web.opensInZineReader(contentType: .article))
    }
    func testBookMetadataAndFinishedStateSurviveLibraryCacheRecreation() async throws {
        let json = #"{"id":"book","itemId":"book-item","title":"The Inner Game of Tennis","canonicalUrl":"https://www.penguinrandomhouse.com/books/57757/book/9780307758859","thumbnailUrl":"https://images.penguinrandomhouse.com/cover/9780307758859","contentType":"BOOK","provider":"WEB","creator":"W. Timothy Gallwey","summary":"Relaxed concentration","state":"BOOKMARKED","ingestedAt":"2026-10-19","isFinished":true,"finishedAt":"2026-10-19","tags":[{"id":"books","name":"Books"}]}"#
        let book = try JSONDecoder().decode(Bookmark.self, from: Data(json.utf8))
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let query = LibraryQuery(includesFinished: true, contentType: .book)
        let cache = LibraryCache(userID: "book-proof", baseDirectory: directory)
        await cache.save(items: [book], nextCursor: nil, query: query)
        let reopened = LibraryCache(userID: "book-proof", baseDirectory: directory)
        let snapshot = await reopened.load(query: query)
        XCTAssertEqual(snapshot?.items, [book])
        XCTAssertEqual(snapshot?.items.first?.contentType, .book)
        XCTAssertEqual(snapshot?.items.first?.isFinished, true)
        XCTAssertEqual(snapshot?.items.first?.tags.first?.name, "Books")
        XCTAssertNil(book.consumptionLabel)
    }
}
