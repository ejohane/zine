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
    case featuredArticle(HomeItem)

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
        case .featuredArticle: "featured-article"
        }
    }
}

@MainActor
@Observable
final class HomeStore {
    var sections: [HomeDashboardSection] {
        Self.makeSections(
            home: visibleHome,
            inboxItems: visibleInboxItems,
            optimisticOpenedItems: Array(optimisticOpenedItems.values),
            hiddenItemIDs: hiddenItemIDs.subtracting(client.bookmarkState.changedIDs),
            jumpBackInHiddenIDs: client.bookmarkState.hiddenUnfinishedIDs
        ).compactMap { section in
            switch section {
            case .collection(var collection):
                let visible = collection.items.filter {
                    client.bookmarkState.includesInCollection(
                        id: $0.id, membership: collection.completionMembership)
                }
                collection = HomeCollection(
                    collectionId: collection.collectionId, title: collection.title, layout: collection.layout,
                    position: collection.position, count: visible.count, items: visible,
                    completionMembership: collection.completionMembership)
                return .collection(collection)
            case .jumpBackIn: return section
            case .quickWins(let items): return .quickWins(visibleUnfinished(items))
            case .recentlySaved(let items): return .recentlySaved(visibleUnfinished(items))
            case .podcasts(let items): return .podcasts(visibleUnfinished(items))
            case .articles(let items): return .articles(visibleUnfinished(items))
            case .videos(let items): return .videos(visibleUnfinished(items))
            case .featuredArticle(let item):
                return client.bookmarkState.hiddenUnfinishedIDs.contains(item.id) ? nil : section
            default: return section
            }
        }
    }

    private var effectiveHiddenItemIDs: Set<String> {
        hiddenItemIDs.subtracting(client.bookmarkState.changedIDs)
            .union(client.bookmarkState.hiddenUnfinishedIDs)
    }

    // Observe the full eligible buffer, not the cropped grid, so removals trigger refill.
    var jumpBackInCandidateIDs: [String] {
        jumpBackInCandidates.map(\.id)
    }

    private var jumpBackInCandidates: [HomeItem] {
        Self.orderedOpenedItems(
            (visibleHome?.jumpBackIn ?? []) + Array(optimisticOpenedItems.values)
        ).filter { !effectiveHiddenItemIDs.contains($0.id) }
    }

    private var visibleHome: HomeResponse? {
        guard let home else { return nil }
        func visible(_ items: [HomeItem], key: String) -> [HomeItem] {
            items.filter { includes($0.id, key: key) }
        }
        return HomeResponse(
            recentBookmarks: visible(home.recentBookmarks, key: "recently-saved"),
            jumpBackIn: visibleUnfinished(visible(home.jumpBackIn, key: "jump-back-in")),
            byContentType: HomeContentTypeSections(
                videos: visible(home.byContentType.videos, key: "videos"),
                podcasts: visible(home.byContentType.podcasts, key: "podcasts"),
                articles: visible(home.byContentType.articles, key: "articles")),
            customCollections: home.customCollections.map { collection in
                let items = visible(collection.items, key: "collection-" + collection.id)
                return HomeCollection(collectionId: collection.collectionId, title: collection.title,
                    layout: collection.layout, position: collection.position, count: collection.count,
                    items: items, completionMembership: collection.completionMembership)
            }, sectionOrder: home.sectionOrder, requestId: home.requestId, traceId: home.traceId)
    }

    private func includes(_ id: String, key: String) -> Bool {
        membership[key]?.includes(id, state: client.bookmarkState) ?? true
    }

    private func visibleUnfinished(_ items: [HomeItem]) -> [HomeItem] {
        items.filter { !client.bookmarkState.hiddenUnfinishedIDs.contains($0.id) }
    }
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let client: APIClient
    private let cache: HomeCache
    private var home: HomeResponse?
    private var membership: [String: BookmarkMembershipSnapshot] = [:]

    private func setHome(_ updated: HomeResponse?, startedAt: Int? = nil, queuedIDs: Set<String> = []) {
        guard let oldValue = home, let current = updated else {
            membership = [:]
            home = updated
            return
        }
        func retain(_ old: [HomeItem], _ new: [HomeItem], key: String) -> [HomeItem] {
            if let startedAt {
                var snapshot = membership[key] ?? BookmarkMembershipSnapshot()
                snapshot.accept(previousIDs: old.map(\.id), receivedIDs: new.map(\.id), startedAt: startedAt, queuedIDs: queuedIDs)
                membership[key] = snapshot
            }
            let received = Set(new.map(\.id))
            return new
                + old.filter {
                    client.bookmarkState.changedIDs.contains($0.id) && !received.contains($0.id)
                }
        }
        let collections = current.customCollections.map { collection in
            guard let old = oldValue.customCollections.first(where: { $0.id == collection.id }) else {
                return collection
            }
            let items = retain(old.items, collection.items, key: "collection-" + collection.id)
            return HomeCollection(
                collectionId: collection.collectionId, title: collection.title, layout: collection.layout,
                position: collection.position, count: items.count, items: items,
                completionMembership: collection.completionMembership)
        }
        home = HomeResponse(
            recentBookmarks: retain(oldValue.recentBookmarks, current.recentBookmarks, key: "recently-saved"),
            jumpBackIn: retain(oldValue.jumpBackIn, current.jumpBackIn, key: "jump-back-in"),
            byContentType: HomeContentTypeSections(
                videos: retain(oldValue.byContentType.videos, current.byContentType.videos, key: "videos"),
                podcasts: retain(oldValue.byContentType.podcasts, current.byContentType.podcasts, key: "podcasts"),
                articles: retain(oldValue.byContentType.articles, current.byContentType.articles, key: "articles")),
            customCollections: collections, sectionOrder: current.sectionOrder,
            requestId: current.requestId, traceId: current.traceId)
    }
    private var inboxItems: [Bookmark] = []
    private var hiddenItemIDs: Set<String> = []
    private var optimisticOpenedItems: [String: HomeItem] = [:]

    private var inboxMembership = BookmarkMembershipSnapshot()
    private var reloadGeneration = 0
    private var openedCursor: String?
    private var openedHistoryExhausted = false
    private var isReloading = false
    @ObservationIgnored private var refillTask: (id: UUID, task: Task<Void, Never>)?

    private var visibleInboxItems: [Bookmark] {
        client.bookmarkState.overlay(inboxItems).filter {
            $0.state == "INBOX" && !$0.isFinished
                && inboxMembership.includes($0.id, state: client.bookmarkState)
        }
    }
    var inboxPreviewItems: [Bookmark] { Array(visibleInboxItems.prefix(4)) }

    private func setInboxItems(_ received: [Bookmark], startedAt: Int? = nil) {
        if let startedAt {
            inboxMembership.accept(previousIDs: inboxItems.map(\.id), receivedIDs: received.map(\.id),
                                   startedAt: startedAt, queuedIDs: [])
        }
        let receivedIDs = Set(received.map(\.id))
        // Keep rollback candidates; membership fences prevent old snapshots from
        // treating an omission in a genuinely newer page as continued membership.
        var updated = received
        for (index, item) in inboxItems.enumerated()
        where client.bookmarkState.changedIDs.contains(item.id) && !receivedIDs.contains(item.id) {
            updated.insert(item, at: min(index, updated.endIndex))
        }
        inboxItems = updated
    }

    init(client: APIClient, cache: HomeCache) {
        self.client = client
        self.cache = cache
    }

    func reload() async {
        reloadGeneration += 1
        let generation = reloadGeneration
        isReloading = true
        defer { if generation == reloadGeneration { isReloading = false } }
        func isCurrent() -> Bool { !Task.isCancelled && generation == reloadGeneration }
        errorMessage = nil

        if let snapshot = await cache.load() {
            guard isCurrent() else { return }
            if let cachedHome = snapshot.home {
                let overlaid = await client.overlayHome(cachedHome)
                guard isCurrent() else { return }
                setHome(overlaid)
            } else {
                home = nil
            }
            setInboxItems(snapshot.inboxItems)
        }

        isLoading = sections.isEmpty
        defer { if generation == reloadGeneration { isLoading = false } }

        var networkErrors: [Error] = []
        var didUpdate = false

        do {
            let queuedAtStart = await client.pendingBookmarkMutationIDs()
            let readRevision = client.bookmarkState.revision
            let response = try await client.getHome()
            let queuedIDs = queuedAtStart.union(await client.pendingBookmarkMutationIDs())
            guard isCurrent() else { return }
            setHome(response, startedAt: readRevision, queuedIDs: queuedIDs)
            openedCursor = nil
            openedHistoryExhausted = false
            reconcileOptimisticOpenedItems(startedAt: readRevision)
            didUpdate = true
        } catch is CancellationError {
            return
        } catch {
            networkErrors.append(error)
        }

        guard isCurrent() else { return }

        do {
            let readRevision = client.bookmarkState.revision
            let response = try await client.listInbox(query: InboxQuery(), limit: 4)
            guard isCurrent() else { return }
            setInboxItems(Array(response.items.prefix(4)), startedAt: readRevision)
            didUpdate = true
        } catch is CancellationError {
            return
        } catch {
            networkErrors.append(error)
        }

        guard isCurrent() else { return }

        if networkErrors.isEmpty, let home {
            // Once the server confirms removal, later re-bookmarking or marking
            // unfinished elsewhere can return the item through a normal refresh.
            let serverIDs = Set((home.recentBookmarks + home.jumpBackIn
                + home.byContentType.videos + home.byContentType.podcasts
                + home.byContentType.articles + home.customCollections.flatMap(\.items)).map(\.id))
                .union(inboxItems.map(\.id))
            hiddenItemIDs.formIntersection(serverIDs)
        }

        isReloading = false
        await refillJumpBackIn()
        guard isCurrent() else { return }

        if didUpdate {
            await saveCache()
        } else if sections.isEmpty {
            errorMessage = networkErrors.first?.localizedDescription ?? "Please try again."
        }
    }

    private func saveCache() async {
        let visibleIDs = Set(inboxPreviewItems.map(\.id))
        let cachedInboxItems = inboxItems.filter {
            visibleIDs.contains($0.id) || client.bookmarkState.isPending(id: $0.id)
        }
        await cache.save(home: home, inboxItems: cachedInboxItems)
    }

    // The Home endpoint is only a recent buffer. Walk the canonical opened list
    // from its first page (it overlaps Home), following its timestamp + ID cursor.
    // Retain every returned candidate for immediate rollback/restoration and cache restart.
    func refillJumpBackIn() async {
        while let running = refillTask {
            await running.task.value
            if refillTask?.id == running.id { refillTask = nil }
        }
        guard !isReloading, home != nil, jumpBackInCandidates.count < 7,
              !openedHistoryExhausted, !Task.isCancelled else { return }
        let generation = reloadGeneration
        let task = Task { await self.loadMoreOpened(generation: generation) }
        let id = UUID()
        refillTask = (id, task)
        await task.value
        if refillTask?.id == id { refillTask = nil }
    }

    private func loadMoreOpened(generation: Int) async {
        var seenCursors: Set<String> = []
        while jumpBackInCandidates.count < 7, !openedHistoryExhausted {
            guard !Task.isCancelled, generation == reloadGeneration else { return }
            let requestedCursor = openedCursor
            do {
                let page = try await client.listOpenedBookmarks(cursor: requestedCursor)
                guard !Task.isCancelled, generation == reloadGeneration, let current = home else { return }
                let returned = page.items.compactMap { bookmark -> HomeItem? in
                    guard bookmark.state == "BOOKMARKED", !bookmark.isFinished,
                          let openedAt = bookmark.lastOpenedAt else { return nil }
                    return HomeItem(bookmark: bookmark, lastOpenedAt: openedAt)
                }
                var snapshot = membership["jump-back-in"] ?? BookmarkMembershipSnapshot()
                snapshot.includeReturned(returned.map(\.id))
                membership["jump-back-in"] = snapshot
                home = HomeResponse(
                    recentBookmarks: current.recentBookmarks,
                    jumpBackIn: Self.orderedOpenedItems(current.jumpBackIn + returned),
                    byContentType: current.byContentType, customCollections: current.customCollections,
                    sectionOrder: current.sectionOrder, requestId: current.requestId, traceId: current.traceId)
                await saveCache()
                guard !Task.isCancelled, generation == reloadGeneration else { return }
                openedCursor = page.nextCursor
                openedHistoryExhausted = page.nextCursor == nil
                // A broken/repeated cursor must not spin forever or invent older data.
                if let cursor = page.nextCursor,
                   cursor == requestedCursor || !seenCursors.insert(cursor).inserted { return }
            } catch {
                // Keep cached candidates; retry from the same cursor on the next refill.
                return
            }
        }
    }

    // Apply destination mutations before an interactive pop exposes Home. Keep this
    // overlay across cache/network refreshes so stale responses cannot restore rows.
    func setItemVisibility(id: String, isVisible: Bool) {
        if isVisible {
            hiddenItemIDs.remove(id)
        } else {
            hiddenItemIDs.insert(id)
        }
    }

    func promoteOpened(_ bookmark: Bookmark, at openedAt: Date) {
        guard bookmark.state == "BOOKMARKED", !bookmark.isFinished else { return }
        optimisticOpenedItems[bookmark.id] = HomeItem(bookmark: bookmark, openedAt: openedAt)
    }

    func rollbackOpened(id: String, openedAt: Date) {
        guard let optimistic = optimisticOpenedItems[id],
              optimistic.lastOpenedAt == openedAt.formatted(.iso8601)
        else { return }
        optimisticOpenedItems[id] = nil
    }

    private func reconcileOptimisticOpenedItems(startedAt: Int) {
        guard let home else { return }
        let retained = optimisticOpenedItems.filter { id, _ in
            client.bookmarkState.shouldRetain(id: id, after: startedAt)
        }
        optimisticOpenedItems = Self.reconciledOptimisticOpenedItems(
            optimisticOpenedItems, serverItems: home.jumpBackIn
        ).merging(retained, uniquingKeysWith: { _, pending in pending })
    }

    static func reconciledOptimisticOpenedItems(
        _ optimisticItems: [String: HomeItem],
        serverItems: [HomeItem]
    ) -> [String: HomeItem] {
        let serverItemsByID = Dictionary(serverItems.map { ($0.id, $0) }, uniquingKeysWith: { previous, _ in previous })

        return optimisticItems.filter { id, optimistic in
            guard let server = serverItemsByID[id] else { return false }
            return (server.lastOpenedAt ?? "") < (optimistic.lastOpenedAt ?? "")
        }
    }

    static func makeSections(
        home: HomeResponse?,
        inboxItems: [Bookmark],
        optimisticOpenedItems: [HomeItem] = [],
        hiddenItemIDs: Set<String> = [],
        jumpBackInHiddenIDs: Set<String> = []
    ) -> [HomeDashboardSection] {
        let inboxItems = inboxItems.filter { !hiddenItemIDs.contains($0.id) }
        let optimisticOpenedItems = optimisticOpenedItems.filter { !hiddenItemIDs.contains($0.id) }
        guard let sourceHome = home else {
            return inboxItems.isEmpty ? [] : [.inbox(inboxItems)]
        }
        let home = APIClient.filterHome(sourceHome, hiding: hiddenItemIDs)

        let jumpBackInCandidates = Self.orderedOpenedItems(
            home.jumpBackIn + optimisticOpenedItems
        ).filter { !jumpBackInHiddenIDs.contains($0.id) }
        let compactCount = min(6, max(0, jumpBackInCandidates.count - 1)) / 2 * 2
        let jumpBackIn = Array(jumpBackInCandidates.prefix(
            jumpBackInCandidates.isEmpty ? 0 : 1 + compactCount))
        let jumpIDs = Set(jumpBackIn.map(\.id))
        let quickWins = Array(
            home.recentBookmarks
                .filter { $0.isQuickWin && !jumpIDs.contains($0.id) }
                .prefix(4)
        )
        let recentlySaved = Array(home.recentBookmarks.prefix(6))
        let featuredArticle = home.recentBookmarks.first { item in
            item.contentType == .article && !(item.summary ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty
        }
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

        return interleaveFeaturedArticle(featuredArticle, into: result)
    }

    private static func orderedOpenedItems(_ items: [HomeItem]) -> [HomeItem] {
        // Parse dates to handle equivalent ISO timestamps with fractional seconds.
        let formatter = ISO8601DateFormatter()
        func timestamp(_ item: HomeItem) -> Date {
            let value = item.lastOpenedAt ?? ""
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: value) ?? .distantPast
        }
        let dates = Dictionary(items.map { ($0.id, timestamp($0)) }, uniquingKeysWith: max)
        let unique = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { previous, next in
            timestamp(next) >= timestamp(previous) ? next : previous
        })
        return unique.values.sorted {
            let lhs = dates[$0.id]!, rhs = dates[$1.id]!
            return lhs == rhs ? $0.id > $1.id : lhs > rhs
        }
    }

    static func interleaveFeaturedArticle(
        _ article: HomeItem?,
        into sections: [HomeDashboardSection]
    ) -> [HomeDashboardSection] {
        guard let article else { return sections }

        var result = sections
        let insertionIndex: Int
        if let jumpBackInIndex = result.firstIndex(where: { section in
            if case .jumpBackIn = section { return true }
            return false
        }) {
            insertionIndex = result.index(after: jumpBackInIndex)
        } else {
            insertionIndex = min(1, result.endIndex)
        }
        result.insert(.featuredArticle(article), at: insertionIndex)
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
