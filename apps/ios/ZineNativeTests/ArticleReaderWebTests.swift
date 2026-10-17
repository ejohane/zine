import WebKit
import XCTest
@testable import ZineNative

@MainActor
final class ArticleReaderWebTests: XCTestCase {
    private var windows: [UIWindow] = []

    override func tearDown() {
        windows.forEach { $0.isHidden = true }
        windows.removeAll()
        super.tearDown()
    }

    private func makeWebView(body: String? = nil, cover: String = "") async throws -> (WKWebView, ReaderMessageRecorder) {
        let recorder = ReaderMessageRecorder()
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        configuration.userContentController.add(recorder, contentWorld: ArticleReaderScript.world, name: "reader")
        configuration.userContentController.addUserScript(WKUserScript(
            source: ArticleReaderScript.source, injectionTime: .atDocumentEnd,
            forMainFrameOnly: true, in: ArticleReaderScript.world
        ))
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: configuration)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.navigationDelegate = recorder
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        let controller = UIViewController()
        window.rootViewController = controller
        controller.view.addSubview(web)
        // WebKit only commits animation-frame scroll restoration in an active window.
        window.makeKeyAndVisible()
        windows.append(window)
        let paragraphs = (0..<30).map {
            "<p>Passage \($0). " + String(repeating: "A readable sentence with enough words to wrap across several lines. ", count: 8) + "</p>"
        }.joined()
        web.loadHTMLString("""
            <html><head><meta name="zine-cover-image" content="\(cover)"><meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="Content-Security-Policy" content="script-src 'none'">
            <style>body { padding: 24px; font-size: calc(17px * var(--reader-font-scale, 1)); font-family: var(--reader-font-family, Georgia); } p { margin-bottom: 30px; }</style>
            </head><body><main>\(body ?? "<a href=\"https://example.com\">Ordinary link</a>" + paragraphs)</main></body></html>
            """, baseURL: URL(string: "https://example.com/article"))
        for _ in 0..<100 {
            if let ready = try? await evaluate("Boolean(window.zineReader)", in: web) as? Bool, ready {
                try await Task.sleep(for: .milliseconds(150))
                return (web, recorder)
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTFail("Reader script did not load with article JavaScript disabled")
        return (web, recorder)
    }

    private func evaluate(_ script: String, in web: WKWebView) async throws -> Any? {
        try await withCheckedThrowingContinuation { continuation in
            web.evaluateJavaScript(script, in: nil, in: ArticleReaderScript.world) { result in
                continuation.resume(with: result.map { $0 as Any? })
            }
        }
    }

    private func settledDisplacement(_ script: String, in web: WKWebView) async throws -> Double? {
        var displacement: Double?
        for _ in 0..<40 {
            try await Task.sleep(for: .milliseconds(50))
            displacement = try await evaluate(script, in: web) as? Double
            if let displacement, displacement < 2 { return displacement }
        }
        return displacement
    }

    func testOpeningCoverDeduplicationPreservesArticleContent() async throws {
        let cover = "https://images.example.com/cover.jpg?w=1200"
        let ghostBase = "https://storage.ghost.io/c/89/e0/89e08557-681a-40be-8264-278bf46d6b25/content/images/"
        let ghostImage = "2026/10/modo_de_volar_a_way_of_flying_1951.10.55-1.jpg"
        let cases: [(String, String, Bool)] = [
            ("<div><figure><img src='\(ghostBase)size/w2000/\(ghostImage)' srcset='\(ghostBase)size/w1000/\(ghostImage) 1000w'></figure><p>Article text</p></div>", "\(ghostBase)size/w1200/\(ghostImage)", true),
            ("<figure><a href='/full'><picture><source srcset='https://images.example.com/cover.jpg?w=400'><img src='https://images.example.com/cover.jpg?w=800'></picture></a><figcaption>Original credit</figcaption></figure><p>Article text</p>", cover, true),
            ("<div><p><img src='https://images.example.com/cover.jpg'></p></div><p>Article text</p>", cover, true),
            ("<img src='https://substackcdn.com/image/fetch/w_800,c_limit/https%3A%2F%2Fimages.example.com%2Fcover.jpg'><p>Article text</p>", cover, true),
            ("<img src='/cover.jpg'><p>Article text</p>", "https://example.com/cover.jpg", true),
            ("<img src='https://images.example.com/different.jpg'><p>Article text</p>", cover, false),
            ("<p>Opening text</p><img src='https://images.example.com/cover.jpg'><p>Article text</p>", cover, false),
            ("<img src='https://other.example.com/cover.jpg'><p>Article text</p>", cover, false),
            ("<img src='https://images.example.com/cover.jpg?id=other'><p>Article text</p>", cover, false),
            ("<img src='https://images.example.com/cover.jpg'><p>Article text</p>", "", false),
        ]
        for (body, cover, hidden) in cases {
            let (web, _) = try await makeWebView(body: body, cover: cover)
            let isHidden = try await evaluate("Boolean(document.querySelector('main img').closest('[style*=\"display: none\"]'))", in: web) as? Bool
            XCTAssertEqual(isHidden, hidden, body)
            let text = try await evaluate("document.querySelector('main').innerText", in: web) as? String
            XCTAssertTrue(text?.contains("Article text") == true)
            if body.contains("Original credit") { XCTAssertTrue(text?.contains("Original credit") == true) }
        }
        let (web, _) = try await makeWebView(
            body: "<img id='opening' src='https://images.example.com/cover.jpg'><p>Article text</p><img id='later' src='https://images.example.com/cover.jpg'>",
            cover: cover
        )
        let laterVisible = try await evaluate("getComputedStyle(document.querySelector('#later')).display !== 'none'", in: web) as? Bool
        XCTAssertEqual(laterVisible, true)
    }

    func testFontChangePreservesTextRangeWithoutReplacingDocument() async throws {
        let (web, _) = try await makeWebView()
        _ = try await evaluate("scrollTo(0, 2300); window.before = zineReader.capture(); window.originalMain = document.querySelector('main'); null;", in: web)
        _ = try await evaluate("zineReader.appearance(1.6, 'Charter, Georgia, serif');", in: web)
        let displacementScript = """
            (() => {
              const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), nodes = [];
              while(w.nextNode()) { if(w.currentNode.textContent.trim() && w.currentNode.parentElement.closest('header, main')) nodes.push(w.currentNode); }
              const r = document.createRange(); r.setStart(nodes[before.nodeIndex], before.offset); r.setEnd(nodes[before.nodeIndex], before.offset + 1);
              return Math.abs(r.getBoundingClientRect().top - before.viewportY);
            })()
            """
        let displacement = try await settledDisplacement(displacementScript, in: web)
        XCTAssertLessThan(try XCTUnwrap(displacement), 2)
        let sameDocument = try await evaluate("originalMain === document.querySelector('main')", in: web) as? Bool
        XCTAssertEqual(sameDocument, true)
    }

    func testPassageRestoresAfterReloadAtDifferentFontSizeAndImageLayout() async throws {
        let (web, _) = try await makeWebView()
        _ = try await evaluate("scrollTo(0, 3200);", in: web)
        let encodedPosition = try await evaluate("JSON.stringify(zineReader.capture())", in: web) as? String
        let positionJSON = try XCTUnwrap(encodedPosition)
        let (reopened, _) = try await makeWebView()
        _ = try await evaluate("zineReader.appearance(1.4, 'Georgia'); zineReader.restore(\(positionJSON));", in: reopened)
        // An image above the passage arriving late should retain the pinned text range.
        _ = try await evaluate("document.querySelector('p').style.paddingTop = '420px';", in: reopened)
        try await Task.sleep(for: .milliseconds(100))
        let before = try JSONSerialization.jsonObject(with: Data(positionJSON.utf8)) as! [String: Any]
        let captured = try await evaluate("zineReader.capture()", in: reopened) as? [String: Any]
        let after = try XCTUnwrap(captured)
        XCTAssertEqual(before["nodeIndex"] as? Int, after["nodeIndex"] as? Int)
        // Capture selects the first visible line; the saved character remains at the same height
        // even if reflow places a different character at the start of that line.
        let delta = try await settledDisplacement("""
            (() => {
              const p = \(positionJSON), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), nodes = [];
              while(w.nextNode()) { if(w.currentNode.textContent.trim() && w.currentNode.parentElement.closest('header, main')) nodes.push(w.currentNode); }
              const r = document.createRange(); r.setStart(nodes[p.nodeIndex], p.offset); r.setEnd(nodes[p.nodeIndex], p.offset + 1);
              return Math.abs(r.getBoundingClientRect().top - p.viewportY);
            })()
            """, in: reopened)
        XCTAssertLessThanOrEqual(try XCTUnwrap(delta), 2)
    }

    func testArticleLinksResolveDeduplicateAndFilterInDocumentOrder() async throws {
        let (web, _) = try await makeWebView()
        _ = try await evaluate("""
            document.querySelector('main').innerHTML = `
              <p>For the evidence, see <a href="/reference?q=1&amp;v=2"> A <strong>useful</strong> reference </a> before the next section.</p>
              <a href="https://example.com/reference?q=1&amp;v=2">Duplicate</a>
              <a href="#note">Footnote</a>
              <a href="https://example.com/article#note">Same article</a>
              <a href="javascript:alert(1)">Unsafe</a>
              <a href="data:text/html,hello">Data</a>
              <a href="https://cdn.example.com/photo.JPG?width=500">Photo</a>
              <a href="https://cdn.example.com/image%2Epng">Encoded photo</a>
              <a href="https://example.com/resource" download>Download</a>
              <a href="https://example.com/stream" type="video/mp4">Video</a>
              <a href="">Empty</a>
              <nav><a href="/navigation">Navigation</a></nav>
              <a href="//example.org/image"><img alt="A diagram"></a>
              <a href="https://example.net/unlabelled"></a>
            `;
            """, in: web)
        let value = try await evaluate("zineReader.links()", in: web)
        let links = try XCTUnwrap(value as? [[String: String]])
        XCTAssertEqual(links.map { $0["url"] }, [
            "https://example.com/reference?q=1&v=2",
            "https://example.org/image",
            "https://example.net/unlabelled"
        ])
        XCTAssertEqual(links.map { $0["title"] }, ["A useful reference", "A diagram", "example.net"])
        XCTAssertEqual(links.first?["context"], "For the evidence, see A useful reference before the next section.")
        XCTAssertEqual(links.last?["context"], "")
        _ = try await evaluate("document.querySelector('main').innerHTML = '<p>No links</p>';", in: web)
        let empty = try await evaluate("zineReader.links()", in: web) as? [[String: String]]
        XCTAssertEqual(empty?.count, 0)
    }

    func testLinksAndSelectionDoNotToggleChrome() async throws {
        let (web, recorder) = try await makeWebView()
        _ = try await evaluate("document.querySelector('a').dispatchEvent(new MouseEvent('click', {bubbles:true}));", in: web)
        _ = try await evaluate("""
            const range = document.createRange(); range.selectNodeContents(document.querySelector('p'));
            getSelection().addRange(range);
            document.querySelector('p').dispatchEvent(new MouseEvent('click', {bubbles:true}));
            """, in: web)
        try await Task.sleep(for: .milliseconds(350))
        XCTAssertFalse(recorder.types.contains("toggle"))
        _ = try await evaluate("getSelection().removeAllRanges();", in: web)
        _ = try await evaluate("document.querySelector('p').dispatchEvent(new MouseEvent('click', {bubbles:true}));", in: web)
        try await Task.sleep(for: .milliseconds(350))
        XCTAssertEqual(recorder.types.filter { $0 == "toggle" }.count, 1)
    }
}

@MainActor
private final class ReaderMessageRecorder: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.navigationType == .linkActivated ? .cancel : .allow)
    }
    var types: [String] = []
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any], let type = body["type"] as? String { types.append(type) }
    }
}
