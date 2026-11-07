import Nuke
import SwiftUI
import UIKit
import XCTest
@testable import ZineNative

@MainActor
final class HomeResumeCardLayoutTests: XCTestCase {
    func testLoadedArtworkDoesNotWidenTheClosedScreen() async throws {
        let url = URL(string: "https://example.invalid/resume-layout-\(UUID().uuidString).png")!
        let size = CGSize(width: 390, height: HomeResumeCard.height)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            UIColor.gray.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        let request = ImageRequest(url: url, processors: [
            ImageProcessors.Resize(size: size, unit: .points, contentMode: .aspectFill, crop: true)
        ])
        AppImagePipeline.shared.cache[request] = ImageContainer(image: image)
        defer { AppImagePipeline.shared.cache[request] = nil }
        let item = HomeItem(
            id: "resume-layout", itemId: "resume-layout",
            title: "A long video title that must wrap inside the available width",
            thumbnailUrl: url, canonicalUrl: url, contentType: .video, provider: .youtube,
            creator: "Creator", creatorImageUrl: nil, creatorId: nil, publisher: nil,
            summary: nil, duration: nil, publishedAt: nil, readingTimeMinutes: nil,
            bookmarkedAt: nil, lastOpenedAt: nil, progress: nil
        )
        let host = UIHostingController(rootView: HomeResumeCard(item: item))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 700))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        try await Task.sleep(for: .milliseconds(300))
        for width: CGFloat in [280, 320, 640, 280] {
            let fitted = host.sizeThatFits(in: CGSize(width: width, height: HomeResumeCard.height))
            XCTAssertEqual(fitted.width, width, accuracy: 1,
                           "Loaded artwork must not widen Home as the Duo opens or closes")
        }
    }
}
