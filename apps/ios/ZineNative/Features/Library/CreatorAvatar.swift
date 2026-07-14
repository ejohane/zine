import SwiftUI

struct CreatorAvatar: View {
    let imageUrl: URL?
    let creator: String
    let contentType: ContentType
    let size: CGFloat

    var body: some View {
        CachedRemoteImage(
            url: imageUrl,
            targetSize: CGSize(width: size, height: size)
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
                .fill(.secondary.opacity(0.12))

            if let initial {
                Text(initial)
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(.secondary)
            } else {
                Image(systemName: contentType.systemImage)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(.secondary)
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
