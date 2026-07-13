import SwiftUI

struct BookmarkRow: View {
    let bookmark: Bookmark

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            thumbnail
            VStack(alignment: .leading, spacing: 6) {
                Text(bookmark.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(3)

                creatorLine
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    private var creatorLine: some View {
        HStack(spacing: 7) {
            CreatorAvatar(
                imageUrl: bookmark.creatorImageUrl,
                creator: bookmark.creator,
                contentType: bookmark.contentType,
                size: 22
            )

            ViewThatFits(in: .horizontal) {
                if let label = bookmark.consumptionLabel {
                    HStack(spacing: 5) {
                        Text(bookmark.creator)
                        Text("·")
                        Text(label)
                    }
                    .fixedSize(horizontal: true, vertical: false)
                }

                Text(bookmark.creator)
                    .lineLimit(1)
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
    }

    private var thumbnail: some View {
        CachedRemoteImage(
            url: bookmark.thumbnailUrl,
            targetSize: CGSize(width: 96, height: 68)
        ) {
            ZStack {
                Color.secondary.opacity(0.12)
                Image(systemName: bookmark.contentType.systemImage)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 96, height: 68)
        .clipShape(.rect(cornerRadius: 10))
    }
}
