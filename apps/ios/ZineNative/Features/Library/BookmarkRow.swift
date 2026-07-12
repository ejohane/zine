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

                Text(bookmark.creator)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label(bookmark.provider.title, systemImage: bookmark.contentType.systemImage)
                    if let label = bookmark.consumptionLabel {
                        Text(label)
                    }
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    private var thumbnail: some View {
        AsyncImage(url: bookmark.thumbnailUrl) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                ZStack {
                    Color.secondary.opacity(0.12)
                    Image(systemName: bookmark.contentType.systemImage)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: 96, height: 68)
        .clipShape(.rect(cornerRadius: 10))
    }
}
