import SwiftUI

struct BookmarkRow: View {
    let bookmark: Bookmark

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            thumbnail
            VStack(alignment: .leading, spacing: 3) {
                Text(bookmark.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)

                creatorLine
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private var creatorLine: some View {
        HStack(spacing: 5) {
            CreatorAvatar(
                imageUrl: bookmark.creatorImageUrl,
                creator: bookmark.creator,
                contentType: bookmark.contentType,
                size: 16
            )

            ViewThatFits(in: .horizontal) {
                if let label = bookmark.consumptionLabel {
                    HStack(spacing: 4) {
                        Text(bookmark.creator)
                        Text("·")
                        Text(label)
                    }
                    .fixedSize(horizontal: true, vertical: false)
                }

                Text(bookmark.creator)
                    .lineLimit(1)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    private var thumbnail: some View {
        CachedRemoteImage(
            url: bookmark.thumbnailUrl,
            targetSize: CGSize(width: 64, height: 48)
        ) {
            ZStack {
                Color.secondary.opacity(0.12)
                Image(systemName: bookmark.contentType.systemImage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 64, height: 48)
        .clipShape(.rect(cornerRadius: 7))
    }
}
