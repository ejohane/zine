import SwiftUI

struct HomeCompactLandscapeCard: View {
    let item: HomeItem

    private let width: CGFloat = 178

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: width, height: 96)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 22)
            }
            .frame(width: width, height: 96)
            .clipped()
            .clipShape(.rect(cornerRadius: 10))

            Text(item.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZineTheme.primaryText)
                .lineLimit(2)

            HomeItemMetadata(item: item)
        }
        .frame(width: width, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
