import SwiftUI

struct HomeCompactItemTile: View {
    let item: HomeItem

    @ScaledMetric(relativeTo: .subheadline) private var artworkSize: CGFloat = 64

    var body: some View {
        HStack(spacing: 10) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: artworkSize, height: artworkSize)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 20)
            }
            .frame(width: artworkSize, height: artworkSize)
            .clipped()

            Text(item.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZineTheme.primaryText)
                .lineLimit(2)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: artworkSize)
        .background(ZineTheme.surface)
        .clipShape(.rect(cornerRadius: 10))
        .contentShape(.rect(cornerRadius: 10))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.title)
    }
}
