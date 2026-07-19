import Foundation
import Observation

enum HomeDashboardSection: Identifiable {
    case jumpBackIn([HomeItem])
    case inbox([Bookmark])
    case quickWins([HomeItem])
    case recentlySaved([HomeItem])
    case podcasts([HomeItem])
    case articles([HomeItem])
    case videos([HomeItem])
    case collection(HomeCollection)

    var id: String {
        switch self {
        case .jumpBackIn: "jump-back-in"
        case .inbox: "inbox"
        case .quickWins: "quick-wins"
        case .recentlySaved: "recently-saved"
        case .podcasts: "podcasts"
        case .articles: "articles"
        case .videos: "videos"
        case .collection(let collection): "collection-\(collection.id)"
        }
    }
}

@MainActor
@Observable
final class HomeStore {
    private(set) var sections: [HomeDashboardSection] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let client: APIClient
    private let cache: HomeCache
    private var home: HomeResponse?
    private var inboxItems: [Bookmark] = []
    private var optimisticOpenedItems: [String: HomeItem] = [:]

    init(client: APIClient, cache: HomeCache) {
        self.client = client
        self.cache = cache
    }

    func reload() async {
        errorMessage = nil

        if let snapshot = await cache.load() {
            home = snapshot.home
            inboxItems = snapshot.inboxItems
            rebuildSections()
        }

        isLoading = sections.isEmpty
        defer { isLoading = false }

        var networkErrors: [Error] = []
        var didUpdate = false

        do {
            home = try await client.getHome()
            reconcileOptimisticOpenedItems()
            didUpdate = true
            rebuildSections()
        } catch is CancellationError {
            return
        } catch {
            networkErrors.append(error)
        }

        guard !Task.isCancelled else { return }

        do {
            let response = try await client.listInbox(query: InboxQuery(), limit: 4)
            inboxItems = Array(response.items.prefix(4))
            didUpdate = true
            rebuildSections()
        } catch is CancellationError {
            return
        } catch {
            networkErrors.append(error)
        }

        if didUpdate {
            await cache.save(home: home, inboxItems: inboxItems)
        } else if sections.isEmpty {
            errorMessage = networkErrors.first?.localizedDescription ?? "Please try again."
        }
    }

    private func rebuildSections() {
        sections = Self.makeSections(
            home: home,
            inboxItems: inboxItems,
            optimisticOpenedItems: Array(optimisticOpenedItems.values)
        )
    }

    func promoteOpened(_ bookmark: Bookmark, at openedAt: Date) {
        guard bookmark.state == "BOOKMARKED", !bookmark.isFinished else { return }
        optimisticOpenedItems[bookmark.id] = HomeItem(bookmark: bookmark, openedAt: openedAt)
        rebuildSections()
    }

    func rollbackOpened(id: String, openedAt: Date) {
        guard let optimistic = optimisticOpenedItems[id],
              optimistic.lastOpenedAt == openedAt.formatted(.iso8601)
        else { return }
        optimisticOpenedItems[id] = nil
        rebuildSections()
    }

    private func reconcileOptimisticOpenedItems() {
        guard let home else { return }
        let serverItems = Dictionary(uniqueKeysWithValues: home.jumpBackIn.map { ($0.id, $0) })

        optimisticOpenedItems = optimisticOpenedItems.filter { id, optimistic in
            guard let server = serverItems[id] else { return true }
            return (server.lastOpenedAt ?? "") < (optimistic.lastOpenedAt ?? "")
        }
    }

    static func makeSections(
        home: HomeResponse?,
        inboxItems: [Bookmark],
        optimisticOpenedItems: [HomeItem] = []
    ) -> [HomeDashboardSection] {
        guard let home else {
            return inboxItems.isEmpty ? [] : [.inbox(inboxItems)]
        }

        let jumpBackInCandidates: [HomeItem]
        if optimisticOpenedItems.isEmpty {
            jumpBackInCandidates = home.jumpBackIn
        } else {
            let optimisticIDs = Set(optimisticOpenedItems.map(\.id))
            jumpBackInCandidates = (
                optimisticOpenedItems + home.jumpBackIn.filter { !optimisticIDs.contains($0.id) }
            ).sorted {
                ($0.lastOpenedAt ?? "") > ($1.lastOpenedAt ?? "")
            }
        }
        let jumpBackIn = Array(jumpBackInCandidates.prefix(6))
        let jumpIDs = Set(jumpBackIn.map(\.id))
        let quickWins = Array(
            home.recentBookmarks
                .filter { $0.isQuickWin && !jumpIDs.contains($0.id) }
                .prefix(4)
        )
        let quickWinIDs = Set(quickWins.map(\.id))
        let recentlySavedWithoutRepeats = home.recentBookmarks.filter {
            !jumpIDs.contains($0.id) && !quickWinIDs.contains($0.id)
        }
        let recentlySaved = Array(
            (recentlySavedWithoutRepeats.isEmpty
                ? home.recentBookmarks.filter { !jumpIDs.contains($0.id) }
                : recentlySavedWithoutRepeats)
                .prefix(6)
        )
        let collectionsByID = Dictionary(
            uniqueKeysWithValues: home.customCollections.map { ($0.id, $0) }
        )
        let order = home.sectionOrder.isEmpty ? Self.defaultOrder : home.sectionOrder
        var result: [HomeDashboardSection] = []
        var insertedQuickWins = false

        for orderedSection in order {
            switch orderedSection.kind {
            case .builtIn:
                guard let builtIn = orderedSection.builtInSection else { continue }
                if let section = makeBuiltInSection(
                    builtIn,
                    home: home,
                    inboxItems: inboxItems,
                    jumpBackIn: jumpBackIn,
                    recentlySaved: recentlySaved
                ) {
                    result.append(section)
                }
                if builtIn == .inbox, !quickWins.isEmpty {
                    result.append(.quickWins(quickWins))
                    insertedQuickWins = true
                }
            case .collection:
                guard let collectionID = orderedSection.collectionId,
                      let collection = collectionsByID[collectionID],
                      !collection.items.isEmpty
                else { continue }
                result.append(.collection(collection))
            }
        }

        if !quickWins.isEmpty, !insertedQuickWins {
            let insertionIndex = min(1, result.endIndex)
            result.insert(.quickWins(quickWins), at: insertionIndex)
        }

        return result
    }

    private static func makeBuiltInSection(
        _ builtIn: HomeBuiltInSection,
        home: HomeResponse,
        inboxItems: [Bookmark],
        jumpBackIn: [HomeItem],
        recentlySaved: [HomeItem]
    ) -> HomeDashboardSection? {
        switch builtIn {
        case .jumpBackIn:
            return jumpBackIn.isEmpty ? nil : .jumpBackIn(jumpBackIn)
        case .recentlyBookmarked:
            return recentlySaved.isEmpty ? nil : .recentlySaved(recentlySaved)
        case .inbox:
            return inboxItems.isEmpty ? nil : .inbox(Array(inboxItems.prefix(4)))
        case .podcasts:
            return home.byContentType.podcasts.isEmpty
                ? nil
                : .podcasts(Array(home.byContentType.podcasts.prefix(8)))
        case .articles:
            return home.byContentType.articles.isEmpty
                ? nil
                : .articles(Array(home.byContentType.articles.prefix(8)))
        case .videos:
            return home.byContentType.videos.isEmpty
                ? nil
                : .videos(Array(home.byContentType.videos.prefix(8)))
        }
    }

    private static let defaultOrder: [HomeLayoutSection] = [
        HomeLayoutSection(kind: .builtIn, builtInSection: .jumpBackIn, collectionId: nil),
        HomeLayoutSection(kind: .builtIn, builtInSection: .inbox, collectionId: nil),
        HomeLayoutSection(kind: .builtIn, builtInSection: .recentlyBookmarked, collectionId: nil),
        HomeLayoutSection(kind: .builtIn, builtInSection: .podcasts, collectionId: nil),
        HomeLayoutSection(kind: .builtIn, builtInSection: .articles, collectionId: nil),
        HomeLayoutSection(kind: .builtIn, builtInSection: .videos, collectionId: nil),
    ]
}
