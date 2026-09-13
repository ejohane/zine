import Foundation
import WebKit

enum ArticleReaderFontFamily: String, CaseIterable, Identifiable {
    static let storageKey = "articleReaderFontFamily"
    case system, charter, georgia
    var id: Self { self }
    var title: String {
        switch self {
        case .system: "System"
        case .charter: "Charter"
        case .georgia: "Georgia"
        }
    }
    var css: String {
        switch self {
        case .system: "-apple-system, sans-serif"
        case .charter: "Charter, Georgia, serif"
        case .georgia: "Georgia, serif"
        }
    }
}

enum ArticleReaderAppearance {
    static let scaleKey = "articleReaderTextScale"
    static func scale(in defaults: UserDefaults = .standard) -> Double {
        if defaults.object(forKey: scaleKey) != nil {
            return min(max(defaults.double(forKey: scaleKey), 0.85), 1.6)
        }
        return ArticleReaderFontSize(rawValue: defaults.string(forKey: ArticleReaderFontSize.storageKey) ?? "")?.scale ?? 1
    }
}

/// A deliberate direction change must travel far enough before changing chrome.
struct ArticleReaderChromeState {
    private(set) var isVisible = true
    private var lastOffset: CGFloat?
    private var travel: CGFloat = 0

    mutating func toggle(at offset: CGFloat = 100) {
        isVisible = offset <= 1 ? true : !isVisible
        travel = 0
    }

    mutating func begin(at offset: CGFloat) {
        lastOffset = offset
        travel = 0
    }

    mutating func end() {
        lastOffset = nil
        travel = 0
    }

    mutating func update(offset: CGFloat) -> Bool? {
        if offset <= 1 {
            lastOffset = offset
            travel = 0
            guard !isVisible else { return nil }
            isVisible = true
            return true
        }
        guard let lastOffset else { self.lastOffset = offset; return nil }
        self.lastOffset = offset
        let delta = offset - lastOffset
        guard abs(delta) > 0.5 else { return nil }
        if (delta > 0) != (travel > 0) { travel = 0 }
        travel += delta
        let next = travel < -28 ? true : travel > 44 ? false : isVisible
        guard next != isVisible else { return nil }
        isVisible = next
        travel = 0
        return next
    }
}

/// A settled user scroll can prompt once; layout and restored positions cannot.
struct ArticleReaderEndState {
    private(set) var hasPresented = false

    mutating func settled(offset: CGFloat, maximum: CGFloat) -> Bool {
        guard !hasPresented, offset >= max(0, maximum) - 8 else { return false }
        hasPresented = true
        return true
    }
}

/// Local-only text location. Hash + quote protect against applying an old DOM index to new content.
struct ArticleReadingPosition: Codable, Equatable {
    let contentHash: String
    let nodeIndex: Int
    let offset: Int
    let quote: String
    let viewportY: Double
    let fraction: Double
}

struct ArticleReaderLink: Identifiable {
    let url: URL
    let title: String
    var context: String = ""
    var id: String { url.absoluteString }
    var destination: String { url.host() ?? url.absoluteString }
}

enum ArticleReaderScript {
    static let world = WKContentWorld.world(name: "ZineReader")
    static let source = #"""
    (() => {
      const send = value => window.webkit.messageHandlers.reader.postMessage(value);
      const nodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent.trim() && node.parentElement.closest('header, main')) nodes.push(node);
      }
      let pinned = null, timer = null, touch = null, lastTap = 0;
      const fraction = () => Math.max(0, Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
      const rect = (node, offset) => {
        const range = document.createRange();
        range.setStart(node, Math.min(offset, node.length - 1));
        range.setEnd(node, Math.min(offset + 1, node.length));
        return range.getBoundingClientRect();
      };
      const capture = () => {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i], range = document.createRange();
          range.selectNodeContents(node);
          if (range.getBoundingClientRect().bottom <= 24) continue;
          let lo = 0, hi = node.length - 1;
          while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (rect(node, mid).bottom <= 24) lo = mid + 1; else hi = mid;
          }
          return {nodeIndex:i, offset:lo, quote:node.textContent.slice(lo, lo + 48), viewportY:rect(node, lo).top, fraction:fraction()};
        }
        return null;
      };
      const restore = position => {
        if (!position) return;
        const node = nodes[position.nodeIndex];
        if (node && position.offset < node.length && node.textContent.slice(position.offset, position.offset + 48) === position.quote) {
          scrollBy(0, rect(node, position.offset).top - position.viewportY);
        } else {
          scrollTo(0, position.fraction * Math.max(0, document.documentElement.scrollHeight - innerHeight));
        }
      };
      // WebKit applies its native scroll geometry asynchronously after CSS reflow.
      // Reapply the same text range after layout commits; a new user drag releases it.
      const settle = position => {
        restore(position);
        requestAnimationFrame(() => {
          if (pinned !== position) return;
          restore(position);
          requestAnimationFrame(() => { if (pinned === position) restore(position); });
        });
      };
      const save = () => { const p = capture(); if (p) send({type:'position', ...p}); };
      window.zineReader = {
        links() {
          const links = [], seen = new Set();
          const article = new URL(document.baseURI); article.hash = '';
          for (const anchor of document.querySelectorAll('main a[href]')) {
            if (anchor.closest('nav, [role="navigation"]')) continue;
            const href = anchor.getAttribute('href').trim();
            if (!href || href.startsWith('#')) continue;
            try {
              const url = new URL(href, document.baseURI);
              if (!['https:', 'http:'].includes(url.protocol)) continue;
              // Keep articles and documents; omit direct media, downloads, and web resources.
              const asset = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|heic|tiff?|mp3|m4a|wav|ogg|mp4|m4v|mov|webm|css|js|woff2?|ttf|eot|zip)(?:$|[/?])/i;
              let path = url.pathname;
              try { path = decodeURIComponent(path); } catch (_) {}
              if (asset.test(path) || anchor.hasAttribute('download') ||
                  /^(?:image|audio|video)\//i.test(anchor.getAttribute('type') || '')) continue;
              const withoutFragment = new URL(url); withoutFragment.hash = '';
              if (withoutFragment.href === article.href) continue;
              if (seen.has(url.href)) continue;
              seen.add(url.href);
              const label = anchor.textContent.trim() || anchor.getAttribute('aria-label') ||
                anchor.querySelector('img[alt]')?.getAttribute('alt') || anchor.getAttribute('title') || url.href;
              const clean = text => text.replace(/\s+/g, ' ').trim();
              const rawTitle = clean(label);
              const title = /^(?:https?:\/\/|www\.)/i.test(rawTitle) ? url.hostname : rawTitle;
              const block = anchor.closest('p, li, blockquote, figcaption, dd, td');
              let context = '';
              if (block) {
                const range = document.createRange();
                range.selectNodeContents(block); range.setEndBefore(anchor);
                const before = clean(range.toString());
                range.selectNodeContents(block); range.setStartAfter(anchor);
                const after = clean(range.toString());
                if (before || after) {
                  context = (before.length > 100 ? '…' : '') + before.slice(-100) +
                    (before ? ' ' : '') + title + (after ? ' ' : '') + after.slice(0, 140) +
                    (after.length > 140 ? '…' : '');
                  context = context.replace(/https?:\/\/[^\s]+/g, value => {
                    try { return new URL(value).hostname; } catch (_) { return ''; }
                  });
                }
              }
              links.push({url:url.href, title:title || url.hostname, context});
            } catch (_) { /* Ignore malformed destinations. */ }
          }
          return links;
        },
        capture,
        restore(position) { pinned = position; settle(position); },
        release() { pinned = null; },
        appearance(scale, family) {
          const position = pinned && pinned.nodeIndex >= 0 ? pinned : capture();
          document.documentElement.style.setProperty('--reader-font-scale', scale);
          document.documentElement.style.setProperty('--reader-font-family', family);
          pinned = position; settle(position); save();
        },
        layout(topInset) {
          const atTop = scrollY <= 1;
          const position = atTop ? null : capture();
          document.documentElement.style.setProperty('--reader-top-inset', topInset + 'px');
          if (atTop) { pinned = null; scrollTo(0, 0); }
          else { pinned = position; settle(position); }
        },
        completion(finished, busy) {
          const footer = document.getElementById('zine-reader-end');
          const button = footer.querySelector('button');
          button.textContent = finished ? 'Mark Unfinished' : 'Mark Complete';
          button.disabled = busy;
        },
        save
      };
      new ResizeObserver(() => { if (pinned) settle(pinned); }).observe(document.body);
      document.addEventListener('load', () => { if (pinned) settle(pinned); }, true);
      document.fonts.ready.then(() => { if (pinned) settle(pinned); });
      window.addEventListener('scroll', () => {
        if (!timer) timer = setTimeout(() => { timer = null; save(); }, 180);
      }, {passive:true});
      document.addEventListener('pointerdown', event => {
        clearTimeout(lastTap);
        touch = {x:event.clientX, y:event.clientY, time:Date.now(), hadSelection:!getSelection().isCollapsed};
      }, {passive:true});
      document.addEventListener('click', event => {
        if (event.target.closest('#zine-reader-end button')) { send({type:'complete'}); return; }
        if (event.target.closest('a, button, input, textarea, select, [contenteditable], summary')) return;
        if (!getSelection().isCollapsed || event.detail > 1) return;
        if (touch && (touch.hadSelection || Date.now() - touch.time > 350 || Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 10)) return;
        // Delay a single tap so double-tap selection can win without flashing chrome.
        clearTimeout(lastTap);
        lastTap = setTimeout(() => { if (getSelection().isCollapsed) send({type:'toggle'}); }, 260);
      });
      document.addEventListener('dblclick', () => clearTimeout(lastTap));
      document.addEventListener('selectionchange', () => { if (!getSelection().isCollapsed) clearTimeout(lastTap); });
    })();
    """#
}
