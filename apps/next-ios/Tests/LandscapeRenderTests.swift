import SwiftUI
import XCTest
@testable import ZineNext

/// Static design artifacts only. This test does not verify gestures or folding.
final class LandscapeRenderTests: XCTestCase {
    @MainActor
    func testExportCapabilityStates() async throws {
        let directory = URL(fileURLWithPath: "/tmp/zine-next-api-previews", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        for theme in [ColorScheme.light, .dark] {
            let space = SavedSpace(ephemeral: true)
            let item = try XCTUnwrap(space.items.first)
            let views: [(String, AnyView, CGFloat)] = [
                ("Detail", AnyView(StoryView(space: space, itemID: item.id)), 460),
                ("Collections", AnyView(LibraryPanelView(panel: .collections, space: space, onChooseCollection: { _ in })), 0),
                ("Following", AnyView(LibraryPanelView(panel: .following, space: space, onChooseCollection: { _ in })), 0),
                ("Search", AnyView(LibraryPanelView(panel: .search, space: space, onChooseCollection: { _ in })), 0),
            ]
            for (name, view, offset) in views {
                let size = CGSize(width: 951, height: 669)
                let root = view.environment(\.colorScheme, theme).frame(width: size.width, height: size.height)
                let host = UIHostingController(rootView: root)
                host.safeAreaRegions = []
                let window = UIWindow(frame: CGRect(origin: .zero, size: size))
                window.rootViewController = host
                window.isHidden = false
                host.view.frame = window.bounds
                host.view.layoutIfNeeded()
                try await Task.sleep(for: .milliseconds(150))
                if offset > 0, let scroll = verticalScroll(in: host.view) {
                    scroll.setContentOffset(CGPoint(x: 0, y: offset), animated: false)
                    host.view.layoutIfNeeded()
                    try await Task.sleep(for: .milliseconds(120))
                }
                let format = UIGraphicsImageRendererFormat()
                format.scale = 2
                let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                    host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
                }
                window.isHidden = true
                let data = try XCTUnwrap(image.pngData())
                XCTAssertGreaterThan(data.count, 20_000)
                let filename = "\(name)-\(theme == .light ? "light" : "dark").png"
                try data.write(to: directory.appendingPathComponent(filename))
            }
        }
    }

    @MainActor
    func testExportFirstPass() async throws {
        let directory = URL(fileURLWithPath: "/tmp/zine-next-previews", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var cases = [ColorScheme.light, .dark].flatMap { theme in
            ContentSection.allCases.map { (theme, $0, DynamicTypeSize.large, CGSize(width: 951, height: 669), "", CGFloat.zero) }
        }
        cases.append((.light, .home, .xxxLarge, CGSize(width: 951, height: 669), "-large-text", 0))
        cases.append((.light, .home, .large, CGSize(width: 466, height: 678), "-compact", 0))
        cases.append((.light, .home, .large, CGSize(width: 951, height: 669), "-scrolled", 300))
        cases.append((.dark, .home, .large, CGSize(width: 951, height: 669), "-scrolled", 300))
        cases.append((.light, .home, .large, CGSize(width: 951, height: 669), "-flow", 760))
        cases.append((.light, .home, .accessibility3, CGSize(width: 951, height: 669), "-accessibility", 0))
        for (theme, section, textSize, size, suffix, offset) in cases {
            let root = SpaceView(space: SavedSpace(ephemeral: true), section: section)
                .environment(\.colorScheme, theme)
                .environment(\.dynamicTypeSize, textSize)
                .frame(width: size.width, height: size.height)
            let host = UIHostingController(rootView: root)
            host.safeAreaRegions = []
            let window = UIWindow(frame: CGRect(origin: .zero, size: size))
            window.rootViewController = host
            window.isHidden = false
            host.view.frame = window.bounds
            host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(150))
            host.view.frame = CGRect(origin: .zero, size: size)
            host.view.bounds = CGRect(origin: .zero, size: size)
            host.view.layoutIfNeeded()
            if offset > 0 {
                let scroll = try XCTUnwrap(verticalScroll(in: host.view))
                XCTAssertTrue(scroll.isScrollEnabled, "The page must retain native vertical scrolling")
                scroll.setContentOffset(CGPoint(x: 0, y: offset), animated: false)
                host.view.layoutIfNeeded()
                try await Task.sleep(for: .milliseconds(120))
                XCTAssertGreaterThan(scroll.contentOffset.y, offset - 2)
            }
            let format = UIGraphicsImageRendererFormat()
            format.scale = 2
            let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
            }
            window.isHidden = true
            let png = try XCTUnwrap(image.pngData())
            XCTAssertGreaterThan(png.count, 30_000, "A blank canvas is not a valid design capture")
            let name = "\(section.rawValue)-\(theme == .light ? "light" : "dark")\(suffix).png"
            try png.write(to: directory.appendingPathComponent(name))
            let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
    @MainActor
    private func verticalScroll(in view: UIView) -> UIScrollView? {
        if let scroll = view as? UIScrollView, scroll.contentSize.height > scroll.bounds.height + 10 {
            return scroll
        }
        return view.subviews.compactMap { verticalScroll(in: $0) }.first
    }

}
