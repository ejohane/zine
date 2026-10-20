import SwiftUI

/// Reuses Home's real cards, routes and scroll behavior. The manifest supplies no display content.
struct HomeComposedSectionView: View {
    let resolved: HomeComposedSection
    let transitionNamespace: Namespace.ID
    var client: APIClient? = nil
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var section: HomeComposition.Section { resolved.section }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title = section.title {
                HomeCompactSectionHeader(title: title).padding(.horizontal, 16)
            }
            switch section.layout {
            case .single:
                if let item = resolved.items.first { linkedCard(item).padding(.horizontal, 16) }
            case .horizontal:
                HomeHorizontalScrollView {
                    LazyHStack(alignment: .top, spacing: 10) {
                        ForEach(resolved.items) { linkedCard($0) }
                    }
                    .padding(.horizontal, 16)
                }
            case .twoColumn:
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8),
                                         count: dynamicTypeSize.isAccessibilitySize ? 1 : 2),
                          alignment: .leading, spacing: 8) {
                    ForEach(resolved.items) { linkedCard($0) }
                }
                .padding(.horizontal, 16)
            case .vertical:
                VStack(spacing: section.card == .row ? 0 : 8) {
                    ForEach(Array(resolved.items.enumerated()), id: \.element.id) { index, item in
                        linkedCard(item)
                        if section.card == .row && index < resolved.items.count - 1 {
                            Divider().padding(.leading, 82)
                        }
                    }
                }
                .background(section.card == .row ? ZineTheme.surface : .clear,
                            in: .rect(cornerRadius: 13))
                .padding(.horizontal, 16)
            }
        }
    }

    @ViewBuilder
    private func linkedCard(_ item: HomeItem) -> some View {
        if section.card == .featured {
            HomeFeaturedArticleSection(item: item, sectionID: "composition-\(section.id)",
                                       horizontalPadding: 0, transitionNamespace: transitionNamespace,
                                       compactHeight: HomeResumeCard.height,
                                       eyebrow: "FEATURED", showsSavedLabel: false,
                                       articleContentClient: client)
        } else {
            HomeNavigationLink(route: .item(item, sectionID: "composition-\(section.id)"), transitionNamespace: transitionNamespace) {
                switch section.card {
                case .landscape: HomeCompactLandscapeCard(item: item)
                case .cover: HomeCompactCoverCard(item: item)
                case .compact: HomeCompactHorizontalCard(item: item)
                case .tile: HomeCompactItemTile(item: item)
                case .grid: HomeCompactGridCard(item: item)
                case .row:
                    HomeItemRow(item: item).padding(.horizontal, 9).padding(.vertical, 4)
                case .featured: EmptyView()
                }
            }
        }
    }
}
