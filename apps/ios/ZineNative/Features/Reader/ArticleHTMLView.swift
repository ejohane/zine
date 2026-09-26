import SwiftUI
import WebKit

enum ArticleReaderFontSize: String, CaseIterable, Identifiable {
    static let storageKey = "articleReaderFontSize"

    case small
    case standard
    case large
    case extraLarge

    var id: Self { self }

    var title: String {
        switch self {
        case .small: "Small"
        case .standard: "Default"
        case .large: "Large"
        case .extraLarge: "Extra Large"
        }
    }

    var scale: Double {
        switch self {
        case .small: 0.9
        case .standard: 1
        case .large: 1.15
        case .extraLarge: 1.3
        }
    }
}

/// Type erasure is confined to the UIKit hosting boundary.
struct ArticleBookmarkReaderHeader {
    let content: AnyView
    let palette: ZineTheme.ArtworkPalette
    let jumpRequest: Int
    let onScroll: (CGFloat, CGFloat) -> Void
}

private final class ArticleReaderWebView: WKWebView {
    var headerController: UIHostingController<AnyView>?
    var onHeaderLayout: ((CGFloat) -> Void)?
    private var headerHeight: CGFloat = 0

    override func layoutSubviews() {
        super.layoutSubviews()
        guard let host = headerController, bounds.width > 0 else { return }
        let height = ceil(host.sizeThatFits(in: CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height)
        guard height.isFinite, height > 0 else { return }
        host.view.frame = CGRect(x: 0, y: -height, width: bounds.width, height: height)
        if abs(height - headerHeight) > 0.5 {
            let wasAtHeader = scrollView.contentOffset.y <= -headerHeight + 1
            headerHeight = height
            scrollView.contentInset.top = height
            if wasAtHeader { scrollView.contentOffset.y = -height }
            onHeaderLayout?(height)
        }
    }

    func installHeader(_ content: AnyView) {
        if let host = headerController {
            host.rootView = content
        } else {
            let host = UIHostingController(rootView: content)
            host.sizingOptions = .intrinsicContentSize
            host.safeAreaRegions = []
            host.view.backgroundColor = .clear
            headerController = host
            scrollView.addSubview(host.view)
        }
        setNeedsLayout()
    }

    func removeHeader() {
        headerController?.willMove(toParent: nil)
        headerController?.view.removeFromSuperview()
        headerController?.removeFromParent()
        headerController = nil
        onHeaderLayout = nil
    }

    var onNavigationControllerAvailable: ((UINavigationController) -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let host = headerController, host.parent == nil,
               let owner = nearestViewController() {
                owner.addChild(host)
                host.didMove(toParent: owner)
            }
            if let navigationController = nearestNavigationController() {
                onNavigationControllerAvailable?(navigationController)
            }
        }
    }

    private func nearestViewController() -> UIViewController? {
        var responder: UIResponder? = self
        while let next = responder?.next {
            if let controller = next as? UIViewController { return controller }
            responder = next
        }
        return nil
    }

    private func nearestNavigationController() -> UINavigationController? {
        var responder: UIResponder? = self
        while let next = responder?.next {
            if let navigationController = next as? UINavigationController {
                return navigationController
            }
            if let viewController = next as? UIViewController,
               let navigationController = viewController.navigationController
            {
                return navigationController
            }
            responder = next
        }
        return nil
    }
}

enum ArticleHTMLDocumentBuilder {
    static func makeHTML(
        for document: ArticleReaderDocument,
        fontScale: Double = ArticleReaderFontSize.standard.scale,
        fontFamily: ArticleReaderFontFamily = .system,
        topContentInset: CGFloat = 0,
        bookmarkPalette: ZineTheme.ArtworkPalette? = nil
    ) -> String {
        let metadata = document.metadata
        let readingTime = metadata.readingTimeMinutes.map { "\($0) min read" }
        let creatorAvatar = avatarHTML(for: metadata.creatorImageURL)
        let creatorMeta = """
        <span class="creator">\(creatorAvatar)<span>\(escape(metadata.creator))</span></span>
        """
        let meta = [creatorMeta, readingTime.map { "<span>\(escape($0))</span>" }]
            .compactMap { $0 }
            .joined(separator: "<span aria-hidden=\"true\">·</span>")
        let body = document.response.readableContent ?? ""
        let appHeader = bookmarkPalette == nil ? """
          <header>
            <h1>\(escape(metadata.title))</h1>
            <div class="meta">\(meta)</div>
            <hr class="title-rule" aria-hidden="true">
          </header>
        """ : ""
        let contextualStyle = bookmarkPalette.map { palette in
            """
            html, body { background: \(palette.readerBackgroundCSS); color: rgba(255,255,255,0.82); }
            body { padding-top: 24px; }
            h1, h2, h3, h4, h5, h6, a { color: white; }
            blockquote, figcaption { color: rgba(255,255,255,0.82); }
            pre { background: rgba(255,255,255,0.10); }
            hr { border-color: rgba(255,255,255,0.18); }
            """
        } ?? ""

        return """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
          <style>
            :root {
              color-scheme: light dark;
              --reader-top-inset: \(topContentInset)px;
              --reader-font-scale: \(fontScale);
              --reader-font-family: \(fontFamily.css);
            }
            * { box-sizing: border-box; }
            html { -webkit-text-size-adjust: 100%; }
            body {
              margin: 0 auto;
              max-width: 760px;
              padding: calc(var(--reader-top-inset) + 72px) 22px calc(env(safe-area-inset-bottom) + 68px);
              background: #\(ZineTheme.Role.surface.lightHex);
              color: #\(ZineTheme.Role.readerBodyText.lightHex);
              font: -apple-system-body;
              font-size: calc(17px * var(--reader-font-scale));
              font-family: var(--reader-font-family);
              line-height: 1.66;
              overflow-wrap: anywhere;
            }
            h1, h2, h3, h4, h5, h6 { color: #\(ZineTheme.Role.primaryText.lightHex); }
            header { margin: 6px 0 24px; }
            h1 {
              margin: 0 0 14px;
              font: -apple-system-title1;
              font-size: calc(34px * var(--reader-font-scale));
              font-weight: 750;
              line-height: 1.12;
              letter-spacing: -0.02em;
            }
            .title-rule {
              margin: 14px 0 0;
              border: 0;
              border-top: 1px solid #\(ZineTheme.Role.border.lightHex);
            }
            .meta {
              display: flex;
              align-items: center;
              gap: 8px;
              color: #\(ZineTheme.Role.secondaryText.lightHex);
              font: -apple-system-subheadline;
              font-size: calc(15px * var(--reader-font-scale));
              line-height: 1.4;
            }
            .creator {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .creator-avatar {
              width: 24px;
              height: 24px;
              margin: 0;
              border-radius: 50%;
              object-fit: cover;
              flex: 0 0 auto;
              background: #\(ZineTheme.Role.raised.lightHex);
            }
            main > :first-child { margin-top: 0; }
            p, ul, ol, blockquote, pre, figure { margin: 0 0 1.25em; }
            h2, h3, h4 {
              margin: 1.7em 0 0.65em;
              line-height: 1.2;
              letter-spacing: -0.012em;
            }
            h2 {
              font: -apple-system-title2;
              font-size: calc(22px * var(--reader-font-scale));
              font-weight: 700;
            }
            h3 {
              font: -apple-system-title3;
              font-size: calc(20px * var(--reader-font-scale));
              font-weight: 700;
            }
            h4 {
              font: -apple-system-headline;
              font-size: calc(17px * var(--reader-font-scale));
            }
            ul, ol { padding-left: 1.4em; }
            li { margin-bottom: 0.45em; }
            img, video {
              display: block;
              width: auto;
              max-width: 100%;
              height: auto;
              margin: 1.6em auto;
              border-radius: 12px;
            }
            figure { margin-left: 0; margin-right: 0; }
            figcaption {
              margin-top: -0.8em;
              color: #\(ZineTheme.Role.secondaryText.lightHex);
              font-size: calc(14px * var(--reader-font-scale));
              line-height: 1.45;
              text-align: center;
            }
            blockquote {
              margin-left: 0;
              padding-left: 18px;
              border-left: 3px solid #\(ZineTheme.Role.brandAccent.lightHex);
              color: #\(ZineTheme.Role.secondaryText.lightHex);
            }
            pre, code {
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size: 0.88em;
            }
            pre {
              padding: 15px;
              overflow-x: auto;
              white-space: pre-wrap;
              background: #\(ZineTheme.Role.raised.lightHex);
              border-radius: 12px;
            }
            a { color: #\(ZineTheme.Role.inlineLink.lightHex); text-decoration-thickness: 0.08em; }
            hr { border: 0; border-top: 1px solid #\(ZineTheme.Role.border.lightHex); margin: 2em 0; }
            ::selection { background: rgba(239, 102, 31, 0.24); }
            @media (prefers-color-scheme: dark) {
              body { background: #\(ZineTheme.Role.surface.darkHex); color: #\(ZineTheme.Role.readerBodyText.darkHex); }
              h1, h2, h3, h4, h5, h6 { color: #\(ZineTheme.Role.primaryText.darkHex); }
              .meta, figcaption { color: #\(ZineTheme.Role.secondaryText.darkHex); }
              .creator-avatar { background: #\(ZineTheme.Role.raised.darkHex); }
              blockquote { color: #\(ZineTheme.Role.secondaryText.darkHex); border-left-color: #\(ZineTheme.Role.brandAccent.lightHex); }
              pre { background: #\(ZineTheme.Role.raised.darkHex); }
              a { color: #\(ZineTheme.Role.inlineLink.darkHex); }
              hr, .title-rule { border-top-color: #\(ZineTheme.Role.border.darkHex); }
            }
            @media (max-width: 420px) {
              body { padding-left: 20px; padding-right: 20px; }
            }
            \(contextualStyle)
          </style>
        </head>
        <body>
          \(appHeader)
          <main>\(body)</main>
        </body>
        </html>
        """
    }

    private static func escape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private static func avatarHTML(for url: URL?) -> String {
        guard let url,
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http"
        else { return "" }

        return "<img class=\"creator-avatar\" src=\"\(escape(url.absoluteString))\" alt=\"\">"
    }
}

struct ArticleHTMLView: UIViewRepresentable {
    let document: ArticleReaderDocument
    let initialProgress: Double
    let initialPosition: ArticleReadingPosition?
    let fontScale: Double
    let fontFamily: ArticleReaderFontFamily
    let onProgressChanged: (Double) -> Void
    let onScrollSettled: (Double) -> Void
    let onChromeVisibilityChanged: (Bool) -> Void
    let onPositionChanged: (ArticleReadingPosition) -> Void
    let onOpenURL: (URL) -> Void
    var topContentInset: CGFloat = 0
    var bookmarkHeader: ArticleBookmarkReaderHeader? = nil
    var onLinksLoaded: (Result<[ArticleReaderLink], Error>) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = false
        preferences.preferredContentMode = .mobile
        configuration.defaultWebpagePreferences = preferences
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(context.coordinator, contentWorld: ArticleReaderScript.world, name: "reader")
        configuration.userContentController.addUserScript(WKUserScript(
            source: ArticleReaderScript.source, injectionTime: .atDocumentEnd,
            forMainFrameOnly: true, in: ArticleReaderScript.world
        ))
        let webView = ArticleReaderWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.delegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.showsVerticalScrollIndicator = true
        webView.scrollView.alwaysBounceVertical = true
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.accessibilityCustomActions = [UIAccessibilityCustomAction(
            name: "Show or hide reader controls", target: context.coordinator,
            selector: #selector(Coordinator.toggleChrome)
        )]
        webView.onNavigationControllerAvailable = { [weak coordinator = context.coordinator, weak webView] navigationController in
            guard let webView else { return }
            coordinator?.enableInteractivePop(in: navigationController, alongside: webView.scrollView.panGestureRecognizer)
        }
        context.coordinator.configureHeader(in: webView)
        context.coordinator.load(document, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.update(self, in: webView)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.capturePosition(in: webView)
        (webView as? ArticleReaderWebView)?.removeHeader()
        coordinator.restoreInteractivePopConfiguration()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "reader", contentWorld: ArticleReaderScript.world)
        (webView as? ArticleReaderWebView)?.onNavigationControllerAvailable = nil
        webView.navigationDelegate = nil
        webView.scrollView.delegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, UIScrollViewDelegate, WKScriptMessageHandler {
        private struct PopGestureConfiguration {
            let gesture: UIGestureRecognizer
            let originalDelegate: (any UIGestureRecognizerDelegate)?
            let wasEnabled: Bool
        }
        private var parent: ArticleHTMLView
        private var chrome = ArticleReaderChromeState()
        private var endState = ArticleReaderEndState()
        private var popGestureConfigurations: [PopGestureConfiguration] = []
        private var loadedHash: String?
        private weak var webView: WKWebView?
        private var headerHeight: CGFloat = 0
        private var lastJumpRequest = 0
        private var ready = false
        private var latestPosition: ArticleReadingPosition?

        init(_ parent: ArticleHTMLView) { self.parent = parent }

        func enableInteractivePop(
            in navigationController: UINavigationController,
            alongside scrollGesture: UIPanGestureRecognizer
        ) {
            var popGestures = [navigationController.interactivePopGestureRecognizer]
            if #available(iOS 26.0, *) {
                popGestures.append(navigationController.interactiveContentPopGestureRecognizer)
            }

            for popGesture in popGestures.compactMap({ $0 }) {
                guard !popGestureConfigurations.contains(where: { $0.gesture === popGesture })
                else { continue }

                popGestureConfigurations.append(
                    PopGestureConfiguration(
                        gesture: popGesture,
                        originalDelegate: popGesture.delegate,
                        wasEnabled: popGesture.isEnabled
                    )
                )
                popGesture.delegate = nil
                popGesture.isEnabled = navigationController.viewControllers.count > 1
                scrollGesture.require(toFail: popGesture)
            }
        }

        func restoreInteractivePopConfiguration() {
            for configuration in popGestureConfigurations {
                if configuration.gesture.delegate == nil {
                    configuration.gesture.delegate = configuration.originalDelegate
                }
                configuration.gesture.isEnabled = configuration.wasEnabled
            }
            popGestureConfigurations.removeAll()
        }

        func configureHeader(in view: WKWebView) {
            guard let view = view as? ArticleReaderWebView, let header = parent.bookmarkHeader else { return }
            view.installHeader(header.content)
            view.backgroundColor = header.palette.backgroundUIColor
            view.scrollView.backgroundColor = header.palette.backgroundUIColor
            view.onHeaderLayout = { [weak self, weak view] height in
                guard let self, let view else { return }
                headerHeight = height
                DispatchQueue.main.async { [weak self, weak view] in
                    guard let self, let view else { return }
                    parent.bookmarkHeader?.onScroll(view.scrollView.contentOffset.y, height)
                }
            }
        }

        func load(_ document: ArticleReaderDocument, in webView: WKWebView) {
            self.webView = webView
            ready = false
            loadedHash = document.contentHash
            webView.loadHTMLString(
                ArticleHTMLDocumentBuilder.makeHTML(for: document, fontScale: parent.fontScale, fontFamily: parent.fontFamily, topContentInset: parent.topContentInset, bookmarkPalette: parent.bookmarkHeader?.palette),
                baseURL: document.metadata.canonicalURL
            )
        }

        func update(_ next: ArticleHTMLView, in webView: WKWebView) {
            let appearanceChanged = parent.fontScale != next.fontScale || parent.fontFamily != next.fontFamily
            let layoutChanged = parent.topContentInset != next.topContentInset
            let paletteChanged = parent.bookmarkHeader?.palette != next.bookmarkHeader?.palette
            parent = next
            configureHeader(in: webView)
            if loadedHash != next.document.contentHash { load(next.document, in: webView); return }
            guard ready else { return }
            if let header = parent.bookmarkHeader {
                if paletteChanged {
                    run("document.documentElement.style.background = '\(header.palette.readerBackgroundCSS)'; document.body.style.background = '\(header.palette.readerBackgroundCSS)';", in: webView)
                }
                if header.jumpRequest != lastJumpRequest {
                    lastJumpRequest = header.jumpRequest
                    webView.scrollView.setContentOffset(CGPoint(x: 0, y: 0), animated: false)
                    let position = latestPosition ?? parent.initialPosition
                    if let position, let data = try? JSONEncoder().encode(position),
                       let json = String(data: data, encoding: .utf8), position.contentHash == loadedHash {
                        run("window.zineReader.restore(\(json));", in: webView)
                    } else {
                        run("window.zineReader.restore({nodeIndex:-1, fraction:\(position?.fraction ?? parent.initialProgress)});", in: webView)
                    }
                    UIAccessibility.post(notification: .layoutChanged, argument: webView)
                }
            }
            if layoutChanged { run("window.zineReader.layout(\(parent.topContentInset));", in: webView) }
            if appearanceChanged { applyAppearance(in: webView) }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            ready = true
            let hash = loadedHash
            webView.evaluateJavaScript("window.zineReader.links()", in: nil, in: ArticleReaderScript.world) { [weak self] result in
                guard let self, loadedHash == hash else { return }
                parent.onLinksLoaded(result.map { value in
                    (value as? [[String: String]] ?? []).compactMap { item in
                        guard let rawURL = item["url"], let url = URL(string: rawURL),
                              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                              let title = item["title"] else { return nil }
                        return ArticleReaderLink(url: url, title: title, context: item["context"] ?? "")
                    }
                })
            }
            let position = latestPosition ?? parent.initialPosition
            let fallback = position?.fraction ?? parent.initialProgress
            let json: String
            if let position, position.contentHash == loadedHash,
               let data = try? JSONEncoder().encode(position), let encoded = String(data: data, encoding: .utf8) {
                json = encoded
            } else {
                json = "{nodeIndex:-1, fraction:\(fallback)}"
            }
            if parent.bookmarkHeader == nil {
                run("window.zineReader.restore(\(json));", in: webView)
                applyAppearance(in: webView)
            } else {
                webView.scrollView.setContentOffset(CGPoint(x: 0, y: -headerHeight), animated: false)
            }
        }

        private func applyAppearance(in webView: WKWebView) {
            if parent.bookmarkHeader != nil, webView.scrollView.contentOffset.y < 0 {
                run("document.documentElement.style.setProperty('--reader-font-scale', '\(parent.fontScale)'); document.documentElement.style.setProperty('--reader-font-family', '\(parent.fontFamily.css)');", in: webView)
                return
            }
            run("window.zineReader.appearance(\(parent.fontScale), '\(parent.fontFamily.css)');", in: webView)
        }

        private func run(_ script: String, in webView: WKWebView) {
            webView.evaluateJavaScript(script, in: nil, in: ArticleReaderScript.world, completionHandler: nil)
        }

        @objc func toggleChrome() -> Bool {
            chrome.toggle(at: webView?.scrollView.contentOffset.y ?? 0)
            parent.onChromeVisibilityChanged(chrome.isVisible)
            return true
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any] else { return }
            switch body["type"] as? String {
            case "toggle": _ = toggleChrome()
            case "position": acceptPosition(body)
            default: break
            }
        }

        private func acceptPosition(_ body: [String: Any]) {
            guard parent.bookmarkHeader == nil || (webView?.scrollView.contentOffset.y ?? -1) >= 0 else { return }
            guard let nodeIndex = body["nodeIndex"] as? Int,
                  let offset = body["offset"] as? Int,
                  let quote = body["quote"] as? String,
                  let viewportY = body["viewportY"] as? Double,
                  let fraction = body["fraction"] as? Double,
                  let loadedHash else { return }
            let position = ArticleReadingPosition(contentHash: loadedHash, nodeIndex: nodeIndex, offset: offset,
                quote: quote, viewportY: viewportY, fraction: fraction)
            latestPosition = position
            parent.onPositionChanged(position)
            parent.onProgressChanged(fraction)
        }

        func capturePosition(in webView: WKWebView) {
            guard ready else { return }
            webView.evaluateJavaScript("window.zineReader.capture()", in: nil, in: ArticleReaderScript.world) { [self] result in
                if case let .success(body as [String: Any]) = result { acceptPosition(body) }
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard action.navigationType == .linkActivated, let url = action.request.url else {
                decisionHandler(.allow); return
            }
            // Keep article footnotes in the document; ordinary links retain their existing external behavior.
            if url.fragment != nil, url.deletingFragment == parent.document.metadata.canonicalURL.deletingFragment {
                decisionHandler(.allow); return
            }
            decisionHandler(.cancel)
            parent.onOpenURL(url)
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            if let header = parent.bookmarkHeader {
                let y = scrollView.contentOffset.y
                DispatchQueue.main.async { header.onScroll(y, self.headerHeight) }
            }
            guard ready else { return }
            let maximum = max(scrollView.contentSize.height - scrollView.bounds.height, 0)
            let offset = min(max(scrollView.contentOffset.y, 0), maximum)
            // Include status-bar scroll-to-top and restoration at the beginning.
            if offset <= 1, let visible = chrome.update(offset: offset) {
                parent.onChromeVisibilityChanged(visible)
            }
            guard scrollView.isDragging || scrollView.isDecelerating else { return }
            if parent.bookmarkHeader == nil || scrollView.contentOffset.y >= 0 {
                parent.onProgressChanged(progress(in: scrollView))
            }
            if let visible = chrome.update(offset: offset) { parent.onChromeVisibilityChanged(visible) }
        }

        func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
            if let webView { run("window.zineReader.release();", in: webView) }
            let maximum = max(scrollView.contentSize.height - scrollView.bounds.height, 0)
            chrome.begin(at: min(max(0, scrollView.contentOffset.y), maximum))
        }

        func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
            if !decelerate { settled(scrollView) }
        }
        func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { settled(scrollView) }
        private func settled(_ scrollView: UIScrollView) {
            chrome.end()
            guard parent.bookmarkHeader == nil || scrollView.contentOffset.y >= 0 else { return }
            parent.onScrollSettled(progress(in: scrollView))
            if endState.settled(
                offset: scrollView.contentOffset.y,
                maximum: scrollView.contentSize.height - scrollView.bounds.height
            ), let visible = chrome.reveal() {
                parent.onChromeVisibilityChanged(visible)
            }
            if let webView { capturePosition(in: webView) }
        }
        private func progress(in scrollView: UIScrollView) -> Double {
            min(max(scrollView.contentOffset.y / max(scrollView.contentSize.height - scrollView.bounds.height, 1), 0), 1)
        }
    }
}

private extension URL {
    var deletingFragment: URL {
        var components = URLComponents(url: self, resolvingAgainstBaseURL: true)
        components?.fragment = nil
        return components?.url ?? self
    }
}
