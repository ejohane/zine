import SwiftUI
import WebKit

enum ArticleHTMLDocumentBuilder {
    static func makeHTML(for document: ArticleReaderDocument) -> String {
        let metadata = document.metadata
        let readingTime = metadata.readingTimeMinutes.map { "\($0) min read" }
        let meta = [metadata.creator, readingTime]
            .compactMap { $0 }
            .map(escape)
            .joined(separator: " · ")
        let body = document.response.readableContent ?? ""

        return """
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
          <style>
            :root { color-scheme: light dark; }
            * { box-sizing: border-box; }
            html { -webkit-text-size-adjust: 100%; }
            body {
              margin: 0 auto;
              max-width: 760px;
              padding: 32px 22px 96px;
              background: #ffffff;
              color: #1c1c1e;
              font: -apple-system-body;
              line-height: 1.66;
              overflow-wrap: anywhere;
            }
            header { margin: 6px 0 34px; }
            h1 {
              margin: 0 0 12px;
              font: -apple-system-title1;
              font-weight: 750;
              line-height: 1.12;
              letter-spacing: -0.02em;
            }
            .meta {
              color: #636366;
              font: -apple-system-subheadline;
              line-height: 1.4;
            }
            main > :first-child { margin-top: 0; }
            p, ul, ol, blockquote, pre, figure { margin: 0 0 1.25em; }
            h2, h3, h4 {
              margin: 1.7em 0 0.65em;
              line-height: 1.2;
              letter-spacing: -0.012em;
            }
            h2 { font: -apple-system-title2; font-weight: 700; }
            h3 { font: -apple-system-title3; font-weight: 700; }
            h4 { font: -apple-system-headline; }
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
              color: #6e6e73;
              font-size: 14px;
              line-height: 1.45;
              text-align: center;
            }
            blockquote {
              margin-left: 0;
              padding-left: 18px;
              border-left: 3px solid #c7c7cc;
              color: #48484a;
            }
            pre, code {
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size: 0.88em;
            }
            pre {
              padding: 15px;
              overflow-x: auto;
              white-space: pre-wrap;
              background: #f2f2f7;
              border-radius: 12px;
            }
            a { color: #0066cc; text-decoration-thickness: 0.08em; }
            hr { border: 0; border-top: 1px solid #d1d1d6; margin: 2em 0; }
            @media (prefers-color-scheme: dark) {
              body { background: #000000; color: #f2f2f7; }
              .meta, figcaption { color: #a1a1a6; }
              blockquote { color: #d1d1d6; border-left-color: #636366; }
              pre { background: #1c1c1e; }
              a { color: #64a8ff; }
              hr { border-top-color: #38383a; }
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
}

struct ArticleHTMLView: UIViewRepresentable {
    let document: ArticleReaderDocument
    let initialProgress: Double
    let onProgressChanged: (Double) -> Void
    let onOpenURL: (URL) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            initialProgress: initialProgress,
            onProgressChanged: onProgressChanged,
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

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.delegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        context.coordinator.load(document, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.loadedContentHash != document.contentHash else { return }
        context.coordinator.load(document, in: webView)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, UIScrollViewDelegate {
        private let initialProgress: Double
        private let onProgressChanged: (Double) -> Void
        private let onOpenURL: (URL) -> Void
        private var isRestoringProgress = false
        fileprivate var loadedContentHash: String?

        init(
            initialProgress: Double,
            onProgressChanged: @escaping (Double) -> Void,
            onOpenURL: @escaping (URL) -> Void
        ) {
            self.initialProgress = min(max(initialProgress, 0), 1)
            self.onProgressChanged = onProgressChanged
            self.onOpenURL = onOpenURL
        }

        func load(_ document: ArticleReaderDocument, in webView: WKWebView) {
            loadedContentHash = document.contentHash
            webView.loadHTMLString(
                ArticleHTMLDocumentBuilder.makeHTML(for: document),
                baseURL: document.metadata.canonicalURL
            )
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            guard initialProgress > 0 else { return }
            isRestoringProgress = true
            DispatchQueue.main.async { [weak self, weak webView] in
                guard let self, let webView else { return }
                let scrollView = webView.scrollView
                let maximumOffset = max(scrollView.contentSize.height - scrollView.bounds.height, 0)
                scrollView.setContentOffset(
                    CGPoint(x: 0, y: maximumOffset * initialProgress),
                    animated: false
                )
                isRestoringProgress = false
            }
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
        }
    }
}
