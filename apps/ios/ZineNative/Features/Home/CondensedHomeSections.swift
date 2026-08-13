import SwiftUI

struct CondensedHomeDashboardSectionView: View {
    let section: HomeDashboardSection
    let transitionNamespace: Namespace.ID

    var body: some View {
        switch section {
        case .jumpBackIn(let items):
            CondensedJumpBackInSection(
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
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

private struct CondensedSectionHeader: View {
    let title: String
    let route: HomeSectionRoute

    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: 5) {
                Text(title)
                    .font(.headline)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
            .foregroundStyle(ZineTheme.primaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("View all \(title)")
    }
}

private struct CondensedJumpBackInSection: View {
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    @State private var selectedPage = 0

    private var carouselItems: [HomeItem] {
        Array(items.prefix(3))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CondensedSectionHeader(title: "Jump Back In", route: .jumpBackIn)

            TabView(selection: $selectedPage) {
                ForEach(Array(carouselItems.enumerated()), id: \.element.id) { index, item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeResumeCard(item: item)
                    }
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 220)

            HStack(spacing: 7) {
                ForEach(carouselItems.indices, id: \.self) { index in
                    Circle()
                        .fill(index == selectedPage ? ZineTheme.brandAccent : ZineTheme.secondaryText.opacity(0.3))
                        .frame(width: 7, height: 7)
                }
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Jump Back In carousel")
            .accessibilityValue("Page \(selectedPage + 1) of \(carouselItems.count)")
        }
        .padding(.horizontal, 16)
        .onChange(of: carouselItems.map(\.id)) { _, _ in
            selectedPage = min(selectedPage, max(carouselItems.count - 1, 0))
        }
    }
}

private struct CondensedInboxSection: View {
    let items: [Bookmark]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CondensedSectionHeader(title: "Fresh in Your Inbox", route: .inbox)
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
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
            CondensedSectionHeader(title: title, route: route)
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 10) {
                    ForEach(items) { item in
                        HomeNavigationLink(
                            route: .item(item, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            CondensedLandscapeCard(item: item)
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
            CondensedSectionHeader(title: title, route: route)
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 10) {
                    ForEach(items) { item in
                        HomeNavigationLink(
                            route: .item(item, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            CondensedCoverCard(item: item)
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
            CondensedSectionHeader(title: title, route: route)

            LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
                ForEach(items) { item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        CondensedGridCard(item: item)
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
            CondensedSectionHeader(title: title, route: route)

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

private struct CondensedLandscapeCard: View {
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

private struct CondensedCoverCard: View {
    let item: HomeItem

    private let width: CGFloat = 112

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: width, height: 136)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 24)
            }
            .frame(width: width, height: 136)
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

private struct CondensedGridCard: View {
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
