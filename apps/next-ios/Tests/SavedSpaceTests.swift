import XCTest
@testable import ZineNext

final class SavedSpaceTests: XCTestCase {
    @MainActor
    func testSavingAndFinishingSurviveRelaunch() throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("space.json")
        let space = SavedSpace(fileURL: url)
        try space.save(urlText: "https://example.com/story", title: "A personal discovery", section: .articles)
        let saved = try XCTUnwrap(space.items.first)
        space.toggleFinished(saved.id)
        let reopened = SavedSpace(fileURL: url)
        XCTAssertEqual(reopened.items.first?.id, saved.id)
        XCTAssertEqual(reopened.items.first?.isFinished, true)
        XCTAssertEqual(reopened.items.first?.isSample, false)
        XCTAssertEqual(reopened.items.first?.title, "A personal discovery")
    }

    @MainActor
    func testInvalidLinksAreRejectedAndRepeatedSaveAddsContextWithoutDuplicate() throws {
        let space = SavedSpace(ephemeral: true)
        let initial = space.items.count
        for invalid in ["", "hello", "file:///private/data", "javascript:alert(1)", "https://"] {
            XCTAssertThrowsError(try space.save(urlText: invalid, title: "", section: .home))
        }
        XCTAssertEqual(space.items.count, initial)
        try space.save(urlText: " https://example.com/a ", title: "", section: .home)
        XCTAssertEqual(space.items.first?.section, .articles)
        XCTAssertEqual(space.items.first?.title, "example.com")
        try space.save(urlText: "https://example.com/a", title: "Again", section: .videos, contextText: "A second reason to keep it")
        XCTAssertEqual(space.items.first?.api?.context.last?.text, "A second reason to keep it")
        XCTAssertEqual(space.items.count, initial + 1)
    }

    @MainActor
    func testCategoryAndThreadFiltersIntersect() {
        let space = SavedSpace(ephemeral: true)
        let podcast = space.contents(in: .podcasts, thread: "From your Zine")
        XCTAssertFalse(podcast.isEmpty)
        XCTAssertTrue(podcast.allSatisfy { $0.section == .podcasts && $0.thread == "From your Zine" })
        XCTAssertTrue(space.contents(in: .articles, thread: "Missing thread").isEmpty)
        XCTAssertEqual(space.contents(in: .home).count, space.items.filter { ($0.api?.status ?? "saved") == "saved" }.count)
    }

    @MainActor
    func testRefreshingBundledSamplesPreservesPersonalSavesAndFinishedState() throws {
        let file = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        let sample = try XCTUnwrap(SampleStories.items.first)
        var finished = sample
        finished.isFinished = true
        let oldSample = SavedContent(section: .articles, title: "Retired fictional sample", author: "Fiction",
                                     note: "", body: "", duration: "", thread: "")
        let personal = SavedContent(section: .posts, title: "My own save", author: "example.com",
                                    note: "", body: "", duration: "", thread: "Your discoveries",
                                    url: URL(string: "https://example.com/personal"), isSample: false)
        try JSONEncoder().encode([personal, oldSample, finished]).write(to: file)
        let reopened = SavedSpace(fileURL: file)
        XCTAssertEqual(reopened.items.first?.id, personal.id)
        XCTAssertTrue(reopened.items.contains { $0.id == sample.id && $0.isFinished })
        XCTAssertFalse(reopened.items.contains { $0.id == oldSample.id })
        XCTAssertEqual(reopened.items.filter(\.isSample).count, SampleStories.items.count)
    }

    @MainActor
    func testUnreadableSavedFileIsPreserved() throws {
        let file = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        let original = Data("unreadable existing data".utf8)
        try original.write(to: file)
        let space = SavedSpace(fileURL: file)
        XCTAssertNotNil(space.storageError)
        try space.save(urlText: "https://example.com/new", title: "", section: .articles)
        XCTAssertEqual(try Data(contentsOf: file), original)
    }
    @MainActor
    func testLaterSavesRetryAfterStorageRecovers() throws {
        let directory = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("space.json")
        let space = SavedSpace(fileURL: file)
        try space.save(urlText: "https://example.com/first", title: "First", section: .articles)
        XCTAssertNotNil(space.storageError)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try space.save(urlText: "https://example.com/second", title: "Second", section: .articles)
        XCTAssertNil(space.storageError)
        let reopened = SavedSpace(fileURL: file)
        XCTAssertNotNil(reopened.items.first { $0.title == "First" })
        XCTAssertNotNil(reopened.items.first { $0.title == "Second" })
    }

    @MainActor
    func testSevenNewSavesRemainInCategoryAndThreadAfterRelaunch() throws {
        let file = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        let space = SavedSpace(fileURL: file)
        for number in 1...7 {
            try space.save(urlText: "https://example.com/story-\(number)", title: "Story \(number)", section: .articles)
        }
        let reopened = SavedSpace(fileURL: file)
        let category = reopened.contents(in: .articles).filter { !$0.isSample }
        let thread = reopened.contents(in: .home, thread: "Your discoveries")
        XCTAssertEqual(category.count, 7)
        XCTAssertEqual(thread.count, 7)
        XCTAssertNotNil(category.first { $0.title == "Story 1" })
        XCTAssertNotNil(thread.first { $0.title == "Story 1" })
    }

}
