import Foundation
import Nuke

enum AppImagePipeline {
    static let shared = ImagePipeline(
        configuration: .withDataCache(
            name: "app.zine.native.images",
            sizeLimit: 300 * 1024 * 1024
        )
    )

    private static let prefetcher = ImagePrefetcher(
        pipeline: shared,
        destination: .diskCache,
        maxConcurrentRequestCount: 4
    )

    static func prefetch(_ urls: [URL]) {
        prefetcher.startPrefetching(with: urls)
    }
}
