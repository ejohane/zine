import Nuke
import NukeUI
import SwiftUI

struct CachedRemoteImage<Placeholder: View>: View {
    let url: URL?
    let targetSize: CGSize
    let contentMode: SwiftUI.ContentMode
    @ViewBuilder let placeholder: () -> Placeholder

    init(
        url: URL?,
        targetSize: CGSize,
        contentMode: SwiftUI.ContentMode = .fill,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.targetSize = targetSize
        self.contentMode = contentMode
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
