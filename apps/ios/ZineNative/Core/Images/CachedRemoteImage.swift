import Nuke
import NukeUI
import SwiftUI
import UIKit

struct CachedRemoteImage<Placeholder: View>: View {
    let url: URL?
    let targetSize: CGSize
    let contentMode: SwiftUI.ContentMode
    let onImageLoaded: (@MainActor @Sendable (UIImage) -> Void)?
    @ViewBuilder let placeholder: () -> Placeholder

    init(
        url: URL?,
        targetSize: CGSize,
        contentMode: SwiftUI.ContentMode = .fill,
        onImageLoaded: (@MainActor @Sendable (UIImage) -> Void)? = nil,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.targetSize = targetSize
        self.contentMode = contentMode
        self.onImageLoaded = onImageLoaded
        self.placeholder = placeholder
    }

    var body: some View {
        LazyImage(request: request) { state in
            if let image = state.image {
                image
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                placeholder()
            }
        }
        .pipeline(AppImagePipeline.shared)
        .onCompletion { result in
            guard case let .success(response) = result else { return }
            onImageLoaded?(response.image)
        }
    }

    private var request: ImageRequest? {
        guard let url else { return nil }
        return ImageRequest(
            url: url,
            processors: [
                ImageProcessors.Resize(
                    size: targetSize,
                    unit: .points,
                    contentMode: contentMode == .fill ? .aspectFill : .aspectFit,
                    crop: contentMode == .fill
                ),
            ]
        )
    }
}
