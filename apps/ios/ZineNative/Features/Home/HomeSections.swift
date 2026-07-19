import SwiftUI

struct HomeNavigationRoute: Hashable {
    enum Destination: Hashable {
        case item(HomeItem)
        case bookmark(Bookmark)
    }

    let destination: Destination
    let sourceID: String

    static func item(_ item: HomeItem, sectionID: String) -> HomeNavigationRoute {
        HomeNavigationRoute(
            destination: .item(item),
            sourceID: "\(sectionID)-\(item.id)"
        )
    }

    static func bookmark(_ bookmark: Bookmark, sectionID: String) -> HomeNavigationRoute {
        HomeNavigationRoute(
            destination: .bookmark(bookmark),
            sourceID: "\(sectionID)-\(bookmark.id)"
        )
    }
}

enum HomeSectionRoute: Hashable {
    case jumpBackIn
    case inbox
    case quickWins
    case recentlySaved
    case podcasts
    case articles
    case videos
    case collection(id: String, title: String)

    var title: String {
        switch self {
        case .jumpBackIn: "Jump Back In"
        case .inbox: "Fresh in Your Inbox"
        case .quickWins: "Quick Wins"
        case .recentlySaved: "Recently Saved"
        case .podcasts: "Listen Next"
        case .articles: "Saved Reads"
        case .videos: "Watch Later"
        case .collection(_, let title): title
        }
    }
}

private struct HomeNavigationLink<Label: View>: View {
    let route: HomeNavigationRoute
    let transitionNamespace: Namespace.ID
    @ViewBuilder let label: () -> Label

    var body: some View {
        NavigationLink(value: route, label: label)
            .buttonStyle(.plain)
            .matchedTransitionSource(id: route.sourceID, in: transitionNamespace)
    }
}

struct HomeDashboardSectionView: View {
    let section: HomeDashboardSection
    let transitionNamespace: Namespace.ID

    var body: some View {
        switch section {
        case .jumpBackIn(let items):
            HomeJumpBackInSection(
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .inbox(let items):
            HomeInboxSection(
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .quickWins(let items):
            HomeItemGridSection(
                title: "Quick Wins",
                subtitle: "Ten minutes or less",
                sectionRoute: .quickWins,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .recentlySaved(let items):
            HomeLandscapeRail(
                title: "Recently Saved",
                subtitle: "Your latest bookmarks",
                sectionRoute: .recentlySaved,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .podcasts(let items):
            HomeCoverRail(
                title: "Listen Next",
                sectionRoute: .podcasts,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .articles(let items):
            HomeLandscapeRail(
                title: "Saved Reads",
                sectionRoute: .articles,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .videos(let items):
            HomeLandscapeRail(
                title: "Watch Later",
                sectionRoute: .videos,
                items: items,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        case .collection(let collection):
            HomeCollectionSection(
                collection: collection,
                sectionID: section.id,
                transitionNamespace: transitionNamespace
            )
        }
    }
}

private struct HomeSectionHeader: View {
    let title: String
    var subtitle: String?
    let route: HomeSectionRoute

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            NavigationLink(value: route) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.title3.bold())
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View all \(title)")

            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct HomeJumpBackInSection: View {
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeader(
                title: "Jump Back In",
                subtitle: "Pick up where you left off",
                route: .jumpBackIn
            )
            .padding(.horizontal, 20)

            if let first = items.first {
                HomeNavigationLink(
                    route: .item(first, sectionID: sectionID),
                    transitionNamespace: transitionNamespace
                ) {
                    HomeResumeCard(item: first)
                }
                .padding(.horizontal, 20)
            }

            if items.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 14) {
                        ForEach(items.dropFirst()) { item in
                            HomeNavigationLink(
                                route: .item(item, sectionID: sectionID),
                                transitionNamespace: transitionNamespace
                            ) {
                                HomeJumpBackInCompactCard(item: item)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }
}

private struct HomeJumpBackInCompactCard: View {
    let item: HomeItem

    private enum Metrics {
        static let cardWidth: CGFloat = 220
        static let cardHeight: CGFloat = 72
        static let imageWidth: CGFloat = 96
        static let imageHeight: CGFloat = 54
    }

    var body: some View {
        HStack(spacing: 10) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: Metrics.imageWidth, height: Metrics.imageHeight)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 20)
            }
            .frame(width: Metrics.imageWidth, height: Metrics.imageHeight)
            .clipped()
            .clipShape(.rect(cornerRadius: 9))

            Text(item.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(3)
                .frame(maxHeight: .infinity, alignment: .leading)
                .padding(.trailing, 10)
        }
        .padding(.leading, 9)
        .frame(width: Metrics.cardWidth, height: Metrics.cardHeight, alignment: .leading)
        .background(.secondary.opacity(0.08))
        .clipShape(.rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

private struct HomeInboxSection: View {
    let items: [Bookmark]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeader(
                title: "Fresh in Your Inbox",
                subtitle: "New items waiting for review",
                route: .inbox
            )

            VStack(spacing: 0) {
                ForEach(items) { bookmark in
                    HomeNavigationLink(
                        route: .bookmark(bookmark, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        BookmarkRow(bookmark: bookmark)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                    }

                    if bookmark.id != items.last?.id {
                        Divider()
                            .padding(.leading, 88)
                    }
                }
            }
            .background(.secondary.opacity(0.08), in: .rect(cornerRadius: 16))
        }
        .padding(.horizontal, 20)
    }
}

private struct HomeCollectionSection: View {
    let collection: HomeCollection
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        switch collection.layout {
        case .stackRail:
            HomeLandscapeRail(
                title: collection.title,
                sectionRoute: .collection(id: collection.id, title: collection.title),
                items: collection.items,
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        case .coverRail:
            HomeCoverRail(
                title: collection.title,
                sectionRoute: .collection(id: collection.id, title: collection.title),
                items: collection.items,
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        case .rowGrid:
            HomeItemGridSection(
                title: collection.title,
                sectionRoute: .collection(id: collection.id, title: collection.title),
                items: Array(collection.items.prefix(4)),
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        case .compactList:
            HomeCompactListSection(
                title: collection.title,
                sectionRoute: .collection(id: collection.id, title: collection.title),
                items: Array(collection.items.prefix(4)),
                sectionID: sectionID,
                transitionNamespace: transitionNamespace
            )
        }
    }
}

private struct HomeLandscapeRail: View {
    let title: String
    var subtitle: String?
    let sectionRoute: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeader(title: title, subtitle: subtitle, route: sectionRoute)
                .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(items) { item in
                        HomeNavigationLink(
                            route: .item(item, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            HomeLandscapeCard(item: item)
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

private struct HomeCoverRail: View {
    let title: String
    let sectionRoute: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeader(title: title, route: sectionRoute)
                .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(items) { item in
                        HomeNavigationLink(
                            route: .item(item, sectionID: sectionID),
                            transitionNamespace: transitionNamespace
                        ) {
                            HomeCoverCard(item: item)
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

private struct HomeItemGridSection: View {
    let title: String
    var subtitle: String?
    let sectionRoute: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeader(title: title, subtitle: subtitle, route: sectionRoute)

            LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                ForEach(items) { item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeGridCard(item: item)
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }
}

private struct HomeCompactListSection: View {
    let title: String
    let sectionRoute: HomeSectionRoute
    let items: [HomeItem]
    let sectionID: String
    let transitionNamespace: Namespace.ID

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeader(title: title, route: sectionRoute)

            VStack(spacing: 0) {
                ForEach(items) { item in
                    HomeNavigationLink(
                        route: .item(item, sectionID: sectionID),
                        transitionNamespace: transitionNamespace
                    ) {
                        HomeItemRow(item: item)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                    }

                    if item.id != items.last?.id {
                        Divider()
                            .padding(.leading, 88)
                    }
                }
            }
            .background(.secondary.opacity(0.08), in: .rect(cornerRadius: 16))
        }
        .padding(.horizontal, 20)
    }
}

private struct HomeResumeCard: View {
    let item: HomeItem

    var body: some View {
        CachedRemoteImage(
            url: item.thumbnailUrl,
            targetSize: CGSize(width: 390, height: 220)
        ) {
            HomeImagePlaceholder(contentType: item.contentType, iconSize: 42)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 220)
        .clipped()
        .overlay {
            LinearGradient(
                colors: [.clear, .black.opacity(0.78)],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .overlay(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 7) {
                Text("RESUME")
                    .font(.caption2.bold())
                    .tracking(0.8)
                    .foregroundStyle(.white.opacity(0.8))
                Text(item.title)
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .lineLimit(2)
                HStack(spacing: 5) {
                    Text(item.creator)
                    if let label = item.consumptionLabel {
                        Text("·")
                        Text(label)
                    }
                }
                .font(.caption)
                .foregroundStyle(.white.opacity(0.82))

                if let progress = item.progress, progress.percent > 0 {
                    ProgressView(value: min(max(progress.percent / 100, 0), 1))
                        .tint(Color.accentColor)
                }
            }
            .padding(16)
        }
        .clipShape(.rect(cornerRadius: 18))
        .accessibilityElement(children: .combine)
    }
}

private struct HomeLandscapeCard: View {
    let item: HomeItem
    var width: CGFloat = 244

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: width, height: 137)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 28)
            }
            .frame(width: width, height: 137)
            .clipped()
            .clipShape(.rect(cornerRadius: 14))

            Text(item.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)

            HomeItemMetadata(item: item)
        }
        .frame(width: width, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct HomeCoverCard: View {
    let item: HomeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: 150, height: 190)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 30)
            }
            .frame(width: 150, height: 190)
            .clipped()
            .clipShape(.rect(cornerRadius: 14))

            Text(item.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
            HomeItemMetadata(item: item)
        }
        .frame(width: 150, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct HomeGridCard: View {
    let item: HomeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: 180, height: 100)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 24)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 100)
            .clipped()
            .clipShape(.rect(cornerRadius: 12))

            Text(item.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
            HomeItemMetadata(item: item)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct HomeItemRow: View {
    let item: HomeItem

    var body: some View {
        HStack(spacing: 10) {
            CachedRemoteImage(
                url: item.thumbnailUrl,
                targetSize: CGSize(width: 64, height: 48)
            ) {
                HomeImagePlaceholder(contentType: item.contentType, iconSize: 15)
            }
            .frame(width: 64, height: 48)
            .clipped()
            .clipShape(.rect(cornerRadius: 7))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                HomeItemMetadata(item: item)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct HomeItemMetadata: View {
    let item: HomeItem

    var body: some View {
        HStack(spacing: 4) {
            Text(item.creator)
                .lineLimit(1)
            if let label = item.consumptionLabel {
                Text("·")
                Text(label)
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

private struct HomeImagePlaceholder: View {
    let contentType: ContentType
    let iconSize: CGFloat

    var body: some View {
        ZStack {
            Color.secondary.opacity(0.12)
            Image(systemName: contentType.systemImage)
                .font(.system(size: iconSize))
                .foregroundStyle(.secondary)
        }
    }
}
