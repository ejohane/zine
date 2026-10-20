import SwiftUI

struct CondensedHomeDashboardSectionView: View {
    let section: HomeDashboardSection
    let transitionNamespace: Namespace.ID
    var client: APIClient? = nil

    var body: some View {
        switch section {
        case .jumpBackIn(let items):
            CondensedJumpBackInSection(
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace,
                client: client
            )
        case .inbox(let items):
            CondensedInboxSection(
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .quickWins(let items):
            CondensedGridSection(
                title: "Quick Wins",
                route: .quickWins,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .recentlySaved(let items):
            CondensedLandscapeRail(
                title: "Recently Saved",
                route: .recentlySaved,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .podcasts(let items):
            CondensedCoverRail(
                title: "Listen Next",
                route: .podcasts,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .articles(let items):
            CondensedLandscapeRail(
                title: "Saved Reads",
                route: .articles,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .videos(let items):
            CondensedLandscapeRail(
                title: "Watch Later",
                route: .videos,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .collection(let collection):
            CondensedCollectionSection(
                collection: collection,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .featuredArticle(let item):
            HomeFeaturedArticleSection(
                item: item,
                sectionID: section.id,
                horizontalPadding: 16,
                transitionNamespace: transitionNamespace
            )
        }
    }
}


private struct CondensedJumpBackInSection: View {
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID
    var client: APIClient? = nil

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var columns: [GridItem] {
        if dynamicTypeSize.isAccessibilitySize {
            return [GridItem(.flexible())]
        }
        return [
            GridItem(.flexible(), spacing: 8),
            GridItem(.flexible(), spacing: 8),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HomeCompactSectionHeader(title: "Jump Back In", route: .jumpBackIn)
                .padding(.horizontal, 16)

            if let latest = items.first {
                if latest.contentType == .article {
                    HomeFeaturedArticleSection(
                        item: latest,
                        sectionID: "\(sectionID)-featured",
                        horizontalPadding: 16,
                        transitionNamespace: transitionNamespace,
                        compactHeight: HomeResumeCard.height,
                        eyebrow: "LAST OPENED",
                        showsSavedLabel: false,
                        articleContentClient: client
                    )
                } else {
                    HomeNavigationLink(
                        route: .item(latest, sectionID: "\(sectionID)-featured"),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeResumeCard(item: latest)
                    }
                    .padding(.horizontal, 16)
                }
            }

            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                ForEach(items.dropFirst().prefix(6)) { item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeCompactItemTile(item: item)
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }
}


private struct CondensedInboxSection: View {
    let items: [Bookmark]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HomeCompactSectionHeader(title: "Fresh in Your Inbox", route: .inbox)
                .padding(.horizontal, 16)

            HomeHorizontalScrollView {
                LazyHStack(spacing: 14) {
                    ForEach(items) { bookmark in
                        HomeNavigationLink(
                            route: .bookmark(bookmark, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            HomeCompactHorizontalCard(bookmark: bookmark)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

private struct CondensedCollectionSection: View {
    let collection: HomeCollection
    let sectionID: String
    let transitionNamespace: Namespace.ID

    private var route: HomeSectionRoute {
        .collection(id: collection.id, title: collection.title)
    }

    var body: some View {
        switch collection.layout {
        case .stackRail:
            CondensedLandscapeRail(
                title: collection.title,
                route: route,
                items: collection.items,
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        case .coverRail:
            CondensedCoverRail(
                title: collection.title,
                route: route,
                items: collection.items,
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        case .rowGrid:
            CondensedGridSection(
                title: collection.title,
                route: route,
                items: Array(collection.items.prefix(4)),
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        case .compactList:
            CondensedItemListSection(
                title: collection.title,
                route: route,
                items: Array(collection.items.prefix(4)),
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        }
    }
}

private struct CondensedLandscapeRail: View {
    let title: String
    let route: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HomeCompactSectionHeader(title: title, route: route)
                .padding(.horizontal, 16)

            HomeHorizontalScrollView {
                LazyHStack(alignment: .top, spacing: 10) {
                    ForEach(items) { item in
                        HomeNavigationLink(
                            route: .item(item, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            HomeCompactLandscapeCard(item: item)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

private struct CondensedCoverRail: View {
    let title: String
    let route: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HomeCompactSectionHeader(title: title, route: route)
                .padding(.horizontal, 16)

            HomeHorizontalScrollView {
                LazyHStack(alignment: .top, spacing: 10) {
                    ForEach(items) { item in
                        HomeNavigationLink(
                            route: .item(item, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            HomeCompactCoverCard(item: item)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

private struct CondensedGridSection: View {
    let title: String
    let route: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HomeCompactSectionHeader(title: title, route: route)

            LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
                ForEach(items) { item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeCompactGridCard(item: item)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

private struct CondensedItemListSection: View {
    let title: String
    let route: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HomeCompactSectionHeader(title: title, route: route)

            VStack(spacing: 0) {
                ForEach(items) { item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeItemRow(item: item)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                    }

                    if item.id != items.last?.id {
                        Divider()
                            .padding(.leading, 82)
                    }
                }
            }
            .background(ZineTheme.surface, in: .rect(cornerRadius: 13))
        }
        .padding(.horizontal, 16)
    }
}
