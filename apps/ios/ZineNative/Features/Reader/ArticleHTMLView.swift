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

private final class ArticleReaderWebView: WKWebView {
    var onNavigationControllerAvailable: ((UINavigationController) -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self,
                  let navigationController = nearestNavigationController()
            else { return }
            onNavigationControllerAvailable?(navigationController)
        }
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

struct ArticleReaderChromeOffsetTracker {
    static let maximumOffset: CGFloat = 56

    private(set) var offset: CGFloat = 0
    private var lastScrollOffset: CGFloat?

    mutating func begin(at scrollOffset: CGFloat) {
        lastScrollOffset = max(scrollOffset, 0)
    }

    mutating func update(scrollOffset: CGFloat) -> CGFloat? {
        let scrollOffset = max(scrollOffset, 0)

        if scrollOffset == 0 {
            lastScrollOffset = 0
            return setOffset(0)
        }

        guard let lastScrollOffset else {
            self.lastScrollOffset = scrollOffset
            return nil
        }

        self.lastScrollOffset = scrollOffset
        return setOffset(offset + scrollOffset - lastScrollOffset)
    }

    mutating func end() {
        lastScrollOffset = nil
    }

    private mutating func setOffset(_ value: CGFloat) -> CGFloat? {
        let value = min(max(value, 0), Self.maximumOffset)
        guard value != offset else { return nil }
        offset = value
        return value
    }
}

enum ArticleHTMLDocumentBuilder {
    static func makeHTML(
        for document: ArticleReaderDocument,
        fontScale: Double = ArticleReaderFontSize.standard.scale
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
        let topPadding = 32 + ArticleReaderChromeOffsetTracker.maximumOffset

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
              --reader-font-scale: \(fontScale);
            }
            * { box-sizing: border-box; }
            html { -webkit-text-size-adjust: 100%; }
            body {
              margin: 0 auto;
              max-width: 760px;
              padding: \(topPadding)px 22px 96px;
              background: #ffffff;
              color: #151719;
              font: -apple-system-body;
              font-size: calc(17px * var(--reader-font-scale));
              line-height: 1.66;
              overflow-wrap: anywhere;
            }
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
              border-top: 1px solid #cfd4da;
            }
            .meta {
              display: flex;
              align-items: center;
              gap: 8px;
              color: #5d646c;
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
              background: #e9edf0;
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
              color: #5d646c;
              font-size: calc(14px * var(--reader-font-scale));
              line-height: 1.45;
              text-align: center;
            }
            blockquote {
              margin-left: 0;
              padding-left: 18px;
              border-left: 3px solid #ef661f;
              color: #5d646c;
            }
            pre, code {
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size: 0.88em;
            }
            pre {
              padding: 15px;
              overflow-x: auto;
              white-space: pre-wrap;
              background: #e9edf0;
              border-radius: 12px;
            }
            a { color: #b64012; text-decoration-thickness: 0.08em; }
            hr { border: 0; border-top: 1px solid #cfd4da; margin: 2em 0; }
            ::selection { background: rgba(239, 102, 31, 0.24); }
            @media (prefers-color-scheme: dark) {
              body { background: #14171a; color: #f5f7f8; }
              .meta, figcaption { color: #b2bac2; }
              .creator-avatar { background: #20252a; }
              blockquote { color: #b2bac2; border-left-color: #ef661f; }
              pre { background: #20252a; }
              a { color: #ffad7c; }
              hr, .title-rule { border-top-color: #343a40; }
            }
            @media (max-width: 420px) {
              body { padding-left: 20px; padding-right: 20px; }
            }
          </style>
        </head>
        <body>
          <header>
            <h1>\(escape(metadata.title))</h1>
            <div class="meta">\(meta)</div>
            <hr class="title-rule" aria-hidden="true">
          </header>
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
    let fontScale: Double
    let onProgressChanged: (Double) -> Void
    let onScrollSettled: (Double) -> Void
    let onChromeOffsetChanged: (CGFloat) -> Void
    let onOpenURL: (URL) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            initialProgress: initialProgress,
            fontScale: fontScale,
            onProgressChanged: onProgressChanged,
            onScrollSettled: onScrollSettled,
            onChromeOffsetChanged: onChromeOffsetChanged,
            onOpenURL: onOpenURL
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = false
        preferences.preferredContentMode = .mobile
        configuration.defaultWebpagePreferences = preferences
        configuration.websiteDataStore = .nonPersistent()

        let webView = ArticleReaderWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.delegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.onNavigationControllerAvailable = { [weak coordinator = context.coordinator, weak webView] navigationController in
            guard let webView else { return }
            coordinator?.enableInteractivePop(
                in: navigationController,
                alongside: webView.scrollView.panGestureRecognizer
            )
        }
        context.coordinator.loadInitial(document, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.update(document, fontScale: fontScale, in: webView)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.restoreInteractivePopConfiguration()
        (webView as? ArticleReaderWebView)?.onNavigationControllerAvailable = nil
        webView.navigationDelegate = nil
        webView.scrollView.delegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, UIScrollViewDelegate {
        private struct PopGestureConfiguration {
            let gesture: UIGestureRecognizer
            let originalDelegate: (any UIGestureRecognizerDelegate)?
            let wasEnabled: Bool
        }

        private let initialProgress: Double
        private var fontScale: Double
        private let onProgressChanged: (Double) -> Void
        private let onScrollSettled: (Double) -> Void
        private let onChromeOffsetChanged: (CGFloat) -> Void
        private let onOpenURL: (URL) -> Void
        private var isRestoringProgress = false
        private var chromeOffsetTracker = ArticleReaderChromeOffsetTracker()
        private var popGestureConfigurations: [PopGestureConfiguration] = []
        fileprivate var loadedContentHash: String?

        init(
            initialProgress: Double,
            fontScale: Double,
            onProgressChanged: @escaping (Double) -> Void,
            onScrollSettled: @escaping (Double) -> Void,
            onChromeOffsetChanged: @escaping (CGFloat) -> Void,
            onOpenURL: @escaping (URL) -> Void
        ) {
            self.initialProgress = min(max(initialProgress, 0), 1)
            self.fontScale = fontScale
            self.onProgressChanged = onProgressChanged
            self.onScrollSettled = onScrollSettled
            self.onChromeOffsetChanged = onChromeOffsetChanged
            self.onOpenURL = onOpenURL
        }

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

        func loadInitial(_ document: ArticleReaderDocument, in webView: WKWebView) {
            loadedContentHash = document.contentHash
            pendingRestoreProgress = initialProgress
            isRestoringProgress = initialProgress > 0
            webView.loadHTMLString(
                ArticleHTMLDocumentBuilder.makeHTML(for: document, fontScale: fontScale),
                baseURL: document.metadata.canonicalURL
            )
        }

        func update(
            _ document: ArticleReaderDocument,
            fontScale newFontScale: Double,
            in webView: WKWebView
        ) {
            let contentChanged = loadedContentHash != document.contentHash
            let fontScaleChanged = fontScale != newFontScale
            guard contentChanged || fontScaleChanged else { return }

            let restoreProgress: Double
            if contentChanged {
                restoreProgress = initialProgress
            } else if isRestoringProgress, let pendingRestoreProgress {
                restoreProgress = pendingRestoreProgress
            } else {
                restoreProgress = progress(in: webView.scrollView)
            }
            pendingRestoreProgress = restoreProgress
            isRestoringProgress = restoreProgress > 0
            loadedContentHash = document.contentHash
            fontScale = newFontScale
            webView.loadHTMLString(
                ArticleHTMLDocumentBuilder.makeHTML(for: document, fontScale: newFontScale),
                baseURL: document.metadata.canonicalURL
            )
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            let progress = pendingRestoreProgress ?? 0
            pendingRestoreProgress = nil
            guard progress > 0 else {
                isRestoringProgress = false
                return
            }
            restoreProgress(progress, in: webView)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.navigationType == .linkActivated,
                  let url = navigationAction.request.url
            else {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            onOpenURL(url)
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            guard !isRestoringProgress else { return }
            let maximumOffset = max(scrollView.contentSize.height - scrollView.bounds.height, 1)
            let fraction = min(max(scrollView.contentOffset.y / maximumOffset, 0), 1)
            onProgressChanged(fraction)

            guard scrollView.isDragging || scrollView.isDecelerating else { return }
            if let offset = chromeOffsetTracker.update(scrollOffset: scrollView.contentOffset.y) {
                onChromeOffsetChanged(offset)
            }
        }

        func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
            progressRestorationGeneration += 1
            progressRestorationTask?.cancel()
            progressRestorationTask = nil
            isRestoringProgress = false
            chromeOffsetTracker.begin(at: scrollView.contentOffset.y)
        }

        func scrollViewDidEndDragging(
            _ scrollView: UIScrollView,
            willDecelerate decelerate: Bool
        ) {
            if !decelerate {
                chromeOffsetTracker.end()
                onScrollSettled(progress(in: scrollView))
            }
        }

        func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
            chromeOffsetTracker.end()
            onScrollSettled(progress(in: scrollView))
        }

        private var pendingRestoreProgress: Double?
        private var progressRestorationTask: Task<Void, Never>?
        private var progressRestorationGeneration = 0

        private func restoreProgress(_ progress: Double, in webView: WKWebView) {
            progressRestorationGeneration += 1
            let generation = progressRestorationGeneration
            progressRestorationTask?.cancel()
            isRestoringProgress = true
            progressRestorationTask = Task { @MainActor [weak self, weak webView] in
                guard let self, let webView else { return }
                defer {
                    if generation == progressRestorationGeneration {
                        isRestoringProgress = false
                        progressRestorationTask = nil
                    }
                }

                for delayMilliseconds in [0, 120, 300, 600] {
                    if delayMilliseconds > 0 {
                        do {
                            try await Task.sleep(for: .milliseconds(delayMilliseconds))
                        } catch {
                            return
                        }
                    } else {
                        await Task.yield()
                    }

                    guard !Task.isCancelled,
                          generation == progressRestorationGeneration
                    else { return }
                    let scrollView = webView.scrollView
                    let maximumOffset = max(
                        scrollView.contentSize.height - scrollView.bounds.height,
                        0
                    )
                    scrollView.setContentOffset(
                        CGPoint(x: 0, y: maximumOffset * progress),
                        animated: false
                    )
                    chromeOffsetTracker.end()
                }
            }
        }

        private func progress(in scrollView: UIScrollView) -> Double {
            let maximumOffset = max(scrollView.contentSize.height - scrollView.bounds.height, 1)
            return min(max(scrollView.contentOffset.y / maximumOffset, 0), 1)
        }
    }
}
