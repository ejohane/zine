import Foundation
import Testing
@testable import ZineNative

@MainActor
struct BookmarkShareTests {
    @Test
    func loadsPreviewAndSavesCreatedBookmark() async throws {
        let preview = makeBookmarkSharePreview()
        let savedTags = TagRecorder()
        let client = BookmarkShareClient(
            preview: { url in
                #expect(url.absoluteString == "https://example.com/story")
                return preview
            },
            listTags: {
                [
                    BookmarkShareTag(id: "tag-1", name: "Design"),
                    BookmarkShareTag(id: "tag-2", name: "Reading"),
                ]
            },
            save: { _, tags in
                await savedTags.record(tags)
                return BookmarkShareSaveResult(
                    status: .created,
                    itemID: "item-1",
                    userItemID: "user-item-1",
                    item: preview
                )
            }
        )
        let store = BookmarkShareStore(
            loadURL: { URL(string: "https://example.com/story")! },
            client: client
        )

        await store.load()

        #expect(store.phase == .ready)
        #expect(store.preview == preview)
        #expect(store.availableTags.map(\.name) == ["Design", "Reading"])
        #expect(store.selectTag(named: " design "))
        #expect(store.selectTag(named: "Product   Research"))
        #expect(store.selectedTags == ["Design", "Product Research"])
        #expect(await store.save())
        #expect(store.phase == .saved)
        #expect(store.saveStatus == .created)
        #expect(await savedTags.tags == ["Design", "Product Research"])
    }

    @Test
    func rejectsNonWebLinksBeforePreviewing() async {
        let client = BookmarkShareClient(
            preview: { _ in
                Issue.record("Preview should not be requested for a non-web URL")
                return makeBookmarkSharePreview()
            },
            listTags: {
                Issue.record("Tags should not be requested for a non-web URL")
                return []
            },
            save: { _, _ in
                Issue.record("Save should not be requested for a non-web URL")
                return BookmarkShareSaveResult(
                    status: .created,
                    itemID: "item-1",
                    userItemID: "user-item-1",
                    item: makeBookmarkSharePreview()
                )
            }
        )
        let store = BookmarkShareStore(
            loadURL: { URL(string: "file:///tmp/story")! },
            client: client
        )

        await store.load()

        #expect(store.phase == .failed)
        #expect(store.errorMessage == BookmarkShareError.unsupportedURL.errorDescription)
    }

    @Test
    func tagLoadingFailureDoesNotBlockSaving() async {
        let preview = makeBookmarkSharePreview()
        let client = BookmarkShareClient(
            preview: { _ in preview },
            listTags: {
                throw BookmarkShareError.server(status: 500, message: "Unavailable")
            },
            save: { _, _ in
                BookmarkShareSaveResult(
                    status: .created,
                    itemID: "item-1",
                    userItemID: "user-item-1",
                    item: preview
                )
            }
        )
        let store = BookmarkShareStore(
            loadURL: { URL(string: "https://example.com/story")! },
            client: client
        )

        await store.load()

        #expect(store.phase == .ready)
        #expect(store.tagsErrorMessage != nil)
        #expect(store.selectTag(named: "Manual Tag"))
        #expect(await store.save())
    }

    @Test
    func normalizesAndLimitsSelectedTags() {
        let client = BookmarkShareClient(
            preview: { _ in makeBookmarkSharePreview() },
            listTags: { [] },
            save: { _, _ in
                BookmarkShareSaveResult(
                    status: .created,
                    itemID: "item-1",
                    userItemID: "user-item-1",
                    item: makeBookmarkSharePreview()
                )
            }
        )
        let store = BookmarkShareStore(
            loadURL: { URL(string: "https://example.com/story")! },
            client: client
        )

        #expect(store.selectTag(named: "  Design   Systems "))
        #expect(store.selectTag(named: "design systems"))
        #expect(store.selectedTags == ["Design Systems"])
        #expect(!store.selectTag(named: String(repeating: "a", count: 33)))

        for index in 1..<BookmarkShareStore.maximumTagCount {
            #expect(store.selectTag(named: "Tag \(index)"))
        }

        #expect(store.selectedTags.count == BookmarkShareStore.maximumTagCount)
        #expect(!store.selectTag(named: "One too many"))
    }

    @Test
    func formatsSaveOutcomesForTheConfirmationState() {
        #expect(BookmarkShareSaveStatus.created.confirmationTitle == "Saved to Zine")
        #expect(
            BookmarkShareSaveStatus.alreadyBookmarked.confirmationTitle
                == "Already in your library"
        )
        #expect(
            BookmarkShareSaveStatus.rebookmarked.confirmationTitle
                == "Added back to your library"
        )
    }

    @Test
    func liveClientSendsBearerTokenAndDecodesShareRequests() async throws {
        let recorder = RequestRecorder()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [BookmarkShareURLProtocol.self]
        BookmarkShareURLProtocol.handler = { request in
            await recorder.record(request)
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let item =
                """
                {
                  "provider": "WEB",
                  "contentType": "ARTICLE",
                  "title": "A useful story",
                  "creator": "Example",
                  "canonicalUrl": "https://example.com/story",
                  "siteName": "Example"
                }
                """
            let payload: String
            switch request.url?.path {
            case "/api/v1/tags":
                payload = "{\"tags\":[{\"id\":\"tag-1\",\"name\":\"Design\"}]}"
            case "/api/v1/bookmarks":
                payload =
                    """
                    {
                      "bookmark": {
                        "itemId": "item-1",
                        "userItemId": "user-item-1",
                        "status": "created"
                      },
                      "item": \(item)
                    }
                    """
            default:
                payload = "{\"item\":\(item)}"
            }
            let data = Data(payload.utf8)
            return (response, data)
        }
        let session = URLSession(configuration: configuration)
        let client = BookmarkShareClient.live(
            baseURL: URL(string: "https://api.myzine.app")!,
            session: session,
            tokenProvider: { "clerk-token" }
        )

        let preview = try await client.preview(URL(string: "https://example.com/story")!)
        let tags = try await client.listTags()
        let saved = try await client.save(
            URL(string: "https://example.com/story")!,
            ["Design", "Reading"]
        )
        let requests = await recorder.requests
        let recordedSaveBody = await recorder.saveBody
        let saveBody = try #require(recordedSaveBody)
        let savePayload = try #require(
            JSONSerialization.jsonObject(with: saveBody) as? [String: Any]
        )

        #expect(preview.title == "A useful story")
        #expect(tags.map(\.name) == ["Design"])
        #expect(saved.status == .created)
        #expect(requests.map(\.url?.path) == [
            "/api/v1/bookmarks/preview",
            "/api/v1/tags",
            "/api/v1/bookmarks",
        ])
        #expect(
            requests.allSatisfy {
                $0.value(forHTTPHeaderField: "Authorization") == "Bearer clerk-token"
            }
        )
        #expect(savePayload["tags"] as? [String] == ["Design", "Reading"])
    }

}

private func makeBookmarkSharePreview() -> BookmarkSharePreview {
    BookmarkSharePreview(
        provider: "WEB",
        contentType: "ARTICLE",
        title: "A useful story",
        creator: "Example",
        creatorImageUrl: nil,
        thumbnailUrl: nil,
        canonicalUrl: "https://example.com/story",
        duration: nil,
        description: "A story worth saving.",
        siteName: "Example",
        readingTimeMinutes: 5
    )
}

private actor RequestRecorder {
    private(set) var requests: [URLRequest] = []
    private(set) var saveBody: Data?

    func record(_ request: URLRequest) {
        requests.append(request)
        if request.url?.path == "/api/v1/bookmarks" {
            saveBody = Self.bodyData(from: request)
        }
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else { return nil }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1_024)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

private actor TagRecorder {
    private(set) var tags: [String] = []

    func record(_ tags: [String]) {
        self.tags = tags
    }
}

private final class BookmarkShareURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: (@Sendable (URLRequest) async throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Task {
            do {
                guard let handler = Self.handler else {
                    throw BookmarkShareError.invalidResponse
                }
                let (response, data) = try await handler(request)
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data)
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
        }
    }

    override func stopLoading() {}
}
