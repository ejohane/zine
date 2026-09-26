import SwiftUI
import UIKit

struct CreatorAvatar: View {
    let imageUrl: URL?
    let creator: String
    let contentType: ContentType
    let size: CGFloat
    var onImageLoaded: (@MainActor @Sendable (UIImage) -> Void)? = nil

    var body: some View {
        CachedRemoteImage(
            url: imageUrl,
            // Palette-bearing avatars use the same image processing request
            // on creator and episode pages, regardless of their display size.
            targetSize: CGSize(
                width: onImageLoaded == nil ? size : 160,
                height: onImageLoaded == nil ? size : 160
            ),
            onImageLoaded: onImageLoaded
        ) {
            fallback
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .accessibilityHidden(true)
    }

    private var fallback: some View {
        ZStack {
            Circle()
                .fill(ZineTheme.raised)

            if let initial {
                Text(initial)
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(ZineTheme.secondaryText)
            } else {
                Image(systemName: contentType.systemImage)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(ZineTheme.secondaryText)
            }
        }
    }

    private var initial: String? {
        creator
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .first
            .map { String($0).uppercased() }
    }
}
