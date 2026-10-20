import SwiftUI

/// The same featured-card presentation used by Home and agent-composed Home Lab.
/// Routing and content acquisition stay with the owning screen.
struct HomeFeaturedArticleCard: View {
    let item: HomeItem
    let excerpt: String?
    let eyebrow: String
    var footerLabels: [String] = []
    var compactHeight: CGFloat? = nil

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var cardHeight: CGFloat? {
        dynamicTypeSize.isAccessibilitySize ? nil : compactHeight
    }

    var body: some View {
        VStack(alignment: .leading, spacing: cardHeight == nil ? 12 : 8) {
            HStack(alignment: .center, spacing: 9) {
                CreatorAvatar(
                    imageUrl: item.creatorImageUrl,
                    creator: item.creator,
                    contentType: item.contentType,
                    size: 32
                )

                VStack(alignment: .leading, spacing: 1) {
                    Text(item.creator)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                        .lineLimit(1)

                    Text(eyebrow)
                        .font(.caption2.weight(.heavy))
                        .tracking(0.8)
                        .foregroundStyle(ZineTheme.brandAccent)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ZineTheme.tertiaryText)
            }

            Text(item.title)
                .font(.title3.weight(.bold))
                .foregroundStyle(ZineTheme.primaryText)
                .multilineTextAlignment(.leading)
                .lineLimit(cardHeight == nil ? 3 : 2)
                .layoutPriority(cardHeight == nil ? 0 : 2)

            if let excerpt {
                Text(excerpt)
                    .font(.subheadline)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .multilineTextAlignment(.leading)
                    .lineLimit(cardHeight == nil ? 4 : 8)
                    .layoutPriority(cardHeight == nil ? 0 : 1)
            }

            if cardHeight != nil && (excerpt?.count ?? 0) < 180 {
                Spacer(minLength: 0)
            }

            if !footerLabels.isEmpty {
                Text(footerLabels.joined(separator: " · "))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ZineTheme.tertiaryText)
                    .layoutPriority(cardHeight == nil ? 0 : 2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: cardHeight, alignment: .topLeading)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(ZineTheme.border.opacity(0.45), lineWidth: 0.5)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
