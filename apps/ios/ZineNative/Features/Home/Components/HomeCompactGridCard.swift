import SwiftUI

struct HomeCompactGridCard: View {
    let item: HomeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: 180, height: 72)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 19)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .clipped()
            .clipShape(.rect(cornerRadius: 9))

            Text(item.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZineTheme.primaryText)
                .lineLimit(2)

            HomeItemMetadata(item: item)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
