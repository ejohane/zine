import SwiftUI
import UIKit

enum BookmarkChangePhase {
    case optimistic
    case rollback
}

struct BookmarkDetailContent: Equatable {
    let id: String
    let title: String
    let thumbnailUrl: URL?
    let canonicalUrl: URL
    let contentType: ContentType
    let provider: Provider
    let creator: String
    let creatorImageUrl: URL?
    let creatorId: String?
    let publisher: String?
    let summary: String?
    let duration: Int?
    let readingTimeMinutes: Int?
    let progress: BookmarkProgress?
    let isFinished: Bool
    let tags: [BookmarkTag]

    init(bookmark: Bookmark) {
        id = bookmark.id
        title = bookmark.title
        thumbnailUrl = bookmark.thumbnailUrl
        canonicalUrl = bookmark.canonicalUrl
        contentType = bookmark.contentType
        provider = bookmark.provider
        creator = bookmark.creator
        creatorImageUrl = bookmark.creatorImageUrl
        creatorId = bookmark.creatorId
        publisher = bookmark.publisher
        summary = bookmark.summary
        duration = bookmark.duration
        readingTimeMinutes = bookmark.readingTimeMinutes
        progress = bookmark.progress
        isFinished = bookmark.isFinished
        tags = bookmark.tags
    }

    init(item: HomeItem) {
        id = item.id
        title = item.title
        thumbnailUrl = item.thumbnailUrl
        canonicalUrl = item.canonicalUrl
        contentType = item.contentType
        provider = item.provider
        creator = item.creator
        creatorImageUrl = item.creatorImageUrl
        creatorId = item.creatorId
        publisher = item.publisher
        summary = item.summary
        duration = item.duration
        readingTimeMinutes = item.readingTimeMinutes
        progress = item.progress
        isFinished = false
        tags = []
    }

    init(
        source: EditorialSource,
        presentation: EditorialSourcePresentation?,
        userItemID: String
    ) {
        let provider = presentation?.zineProvider ?? (source.origin == .x ? .x : .web)
        let creator = presentation?.subtitle
            ?? source.creator
            ?? source.publisher
            ?? provider.title

        id = userItemID
        title = presentation?.title ?? source.title ?? creator
        thumbnailUrl = presentation?.imageURL
        canonicalUrl = source.canonicalUrl
        contentType = ContentType(rawValue: source.contentType)
            ?? (source.origin == .x ? .post : .article)
        self.provider = provider
        self.creator = creator
        creatorImageUrl = nil
        creatorId = nil
        publisher = source.publisher
        summary = presentation?.excerpt
        duration = nil
        readingTimeMinutes = nil
        progress = nil
        isFinished = presentation?.isFinished ?? false
        tags = []
    }

    var consumptionLabel: String? {
        if let readingTimeMinutes {
            return "\(readingTimeMinutes) min read"
        }
        guard let duration else { return nil }
        let minutes = max(1, duration / 60)
        if minutes < 60 { return "\(minutes) min" }
        return "\(minutes / 60) hr \(minutes % 60) min"
    }
}

struct BookmarkDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale

    @State private var bookmark: Bookmark?
    @State private var isBookmarked: Bool
    @State private var hasToggledBookmark = false
    @State private var isSavingBookmark = false
    @State private var finishedState: OptimisticFinishedState
    @State private var subscriptionSettings: BookmarkSubscriptionSettings?
    @State private var isSavingSubscriptionSettings = false
    @State private var errorMessage: String?

    private let initialContent: BookmarkDetailContent
    let client: APIClient
    let onUpdate: (Bookmark) -> Void
    let onBookmarkChange: (Bookmark, Bool, BookmarkChangePhase) -> Void
    let onBookmarkCommit: (Bookmark, Bool) -> Void
    private let onExternalOpen: (Bookmark?) -> Void

    init(
        bookmark: Bookmark,
        client: APIClient,
        onUpdate: @escaping (Bookmark) -> Void,
        onBookmarkChange: @escaping (Bookmark, Bool, BookmarkChangePhase) -> Void = { _, _, _ in },
        onBookmarkCommit: @escaping (Bookmark, Bool) -> Void = { _, _ in },
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in }
    ) {
        initialContent = BookmarkDetailContent(bookmark: bookmark)
        _bookmark = State(initialValue: .some(bookmark))
        _isBookmarked = State(initialValue: bookmark.state == "BOOKMARKED")
        _finishedState = State(initialValue: OptimisticFinishedState(
            isFinished: bookmark.isFinished,
            finishedAt: bookmark.finishedAt
        ))
        self.client = client
        self.onUpdate = onUpdate
        self.onBookmarkChange = onBookmarkChange
        self.onBookmarkCommit = onBookmarkCommit
        self.onExternalOpen = { refreshed in
            onExternalOpen(refreshed ?? bookmark)
        }
    }

    init(
        item: HomeItem,
        client: APIClient,
        onUpdate: @escaping (Bookmark) -> Void,
        onBookmarkChange: @escaping (Bookmark, Bool, BookmarkChangePhase) -> Void = { _, _, _ in },
        onBookmarkCommit: @escaping (Bookmark, Bool) -> Void = { _, _ in },
        onExternalOpen: @escaping (Bookmark?, HomeItem) -> Void = { _, _ in }
    ) {
        initialContent = BookmarkDetailContent(item: item)
        _bookmark = State(initialValue: nil)
        _isBookmarked = State(initialValue: true)
        _finishedState = State(initialValue: OptimisticFinishedState(
            isFinished: initialContent.isFinished,
            finishedAt: nil
        ))
        self.client = client
        self.onUpdate = onUpdate
        self.onBookmarkChange = onBookmarkChange
        self.onBookmarkCommit = onBookmarkCommit
        self.onExternalOpen = { bookmark in onExternalOpen(bookmark, item) }
    }

    init(
        source: EditorialSource,
        presentation: EditorialSourcePresentation?,
        userItemID: String,
        client: APIClient,
        onUpdate: @escaping (Bookmark) -> Void,
        onBookmarkChange: @escaping (Bookmark, Bool, BookmarkChangePhase) -> Void = { _, _, _ in },
        onBookmarkCommit: @escaping (Bookmark, Bool) -> Void = { _, _ in },
        onExternalOpen: @escaping (Bookmark?) -> Void = { _ in }
    ) {
        initialContent = BookmarkDetailContent(
            source: source,
            presentation: presentation,
            userItemID: userItemID
        )
        _bookmark = State(initialValue: nil)
        _isBookmarked = State(initialValue: presentation?.isSaved ?? true)
        _finishedState = State(initialValue: OptimisticFinishedState(
            isFinished: initialContent.isFinished,
            finishedAt: nil
        ))
        self.client = client
        self.onUpdate = onUpdate
        self.onBookmarkChange = onBookmarkChange
        self.onBookmarkCommit = onBookmarkCommit
        self.onExternalOpen = onExternalOpen
    }

    private var content: BookmarkDetailContent {
        bookmark.map { BookmarkDetailContent(bookmark: $0) } ?? initialContent
    }

    var body: some View {
        GeometryReader { viewport in
            let heroHeight = heroHeight(in: viewport.size)

            ZStack {
                ZineTheme.canvas
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        parallaxHero(height: heroHeight)
                        details
                            .frame(
                                minHeight: max(viewport.size.height - heroHeight, 0),
                                alignment: .top
                            )
                            .background(ZineTheme.canvas)
                    }
                }
                .coordinateSpace(name: "bookmarkDetailScroll")
                .ignoresSafeArea(edges: .top)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(.hidden, for: .tabBar)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task(id: content.id) {
            await hydrateBookmark()
        }
        .task(id: content.id) {
            await hydrateSubscriptionSettings()
        }
        .task(id: articleWarmupID) {
            guard let articleWarmupID else { return }
            try? await client.warmArticleContent(id: articleWarmupID)
        }
        .alert("Couldn’t update", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Please try again.")
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 10) {
                Text(content.title)
                    .font(.title2.bold())
                creatorRow
                metadata
            }

            actionRow

            if let summary = content.summary, !summary.isEmpty {
                Text(summary)
                    .font(.body)
                    .foregroundStyle(ZineTheme.secondaryText)
            }

            if !content.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(content.tags) { tag in
                            Text(tag.name)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(ZineTheme.raised, in: .capsule)
                        }
                    }
                }
            }

        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actionRow: some View {
        HStack(spacing: 12) {
            HStack(spacing: 5) {
                bookmarkActions

                ShareLink(item: content.canonicalUrl) {
                    actionIcon(systemName: "square.and.arrow.up")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Share")
                .actionRowHaptic()

                moreMenu
            }

            Spacer(minLength: 0)

            if content.provider.opensInZineReader(contentType: content.contentType) {
                NavigationLink {
                    ArticleReaderView(
                        metadata: ArticleReaderMetadata(
                            bookmarkID: content.id,
                            title: content.title,
                            creator: content.creator,
                            creatorImageURL: content.creatorImageUrl,
                            canonicalURL: content.canonicalUrl,
                            readingTimeMinutes: content.readingTimeMinutes,
                            initialProgress: content.progress,
                            isFinished: finishedState.isFinished,
                            tags: content.tags
                        ),
                        client: client,
                        onRead: { onExternalOpen(bookmark) },
                        onProgressSaved: updateReadingProgress,
                        onFinishedChanged: updateFinishedState,
                        onFinishedCommit: commitFinishedState,
                        onTagsChanged: updateTags
                    )
                } label: {
                    Image(systemName: "book.pages")
                        .resizable()
                        .scaledToFit()
                        .symbolRenderingMode(.monochrome)
                        .frame(
                            width: ProviderOpenButton.iconSize,
                            height: ProviderOpenButton.iconSize
                        )
                        .frame(
                            width: ProviderOpenButton.controlSize,
                            height: ProviderOpenButton.controlSize
                        )
                        .background(ZineTheme.brandAccent, in: Circle())
                        .foregroundStyle(ZineTheme.onAccent)
                        .accessibilityHidden(true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Read in Zine")
                .actionRowHaptic()
                .padding(.trailing, 8)
            } else {
                ProviderOpenButton(
                    provider: content.provider,
                    destination: content.canonicalUrl,
                    onOpen: { onExternalOpen(bookmark) }
                )
                    .padding(.trailing, 8)
            }
        }
    }

    private var articleWarmupID: String? {
        guard content.provider.opensInZineReader(contentType: content.contentType) else {
            return nil
        }
        return content.id
    }

    @ViewBuilder
    private var bookmarkActions: some View {
        if bookmark != nil {
            bookmarkButton
        } else {
            actionIcon(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                color: ZineTheme.secondaryText.opacity(0.55)
            )
                .accessibilityHidden(true)
        }

        if isBookmarked {
            completionButton
        }

        if bookmark != nil {
            tagsMenu
        } else {
            actionIcon(systemName: "tag", color: ZineTheme.secondaryText.opacity(0.45))
                .accessibilityHidden(true)
        }
    }

    private var bookmarkButton: some View {
        Button {
            Task { await toggleBookmark() }
        } label: {
            actionIcon(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                color: isBookmarked ? ZineTheme.primaryText : ZineTheme.secondaryText
            )
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .allowsHitTesting(!isSavingBookmark)
        .accessibilityLabel(isBookmarked ? "Remove bookmark" : "Bookmark")
        .actionRowHaptic()
    }

    private var completionButton: some View {
        return Button {
            toggleFinished()
        } label: {
            actionIcon(
                systemName: finishedState.isFinished
                    ? "checkmark.circle.fill"
                    : "checkmark.circle",
                color: finishedState.isFinished ? .green : ZineTheme.secondaryText
            )
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .allowsHitTesting(!finishedState.isUpdating)
        .accessibilityLabel(finishedState.isFinished ? "Mark unfinished" : "Mark complete")
        .actionRowHaptic()
    }

    private var tagsMenu: some View {
        let tags = bookmark?.tags ?? []

        return Menu {
            if tags.isEmpty {
                Button("No tags") {}
                    .disabled(true)
            } else {
                ForEach(tags) { tag in
                    Button(tag.name) {}
                        .disabled(true)
                }
            }
        } label: {
            actionIcon(systemName: "tag")
        }
        .accessibilityLabel(tags.isEmpty ? "No tags" : "View tags")
        .actionRowHaptic()
    }

    private var moreMenu: some View {
        Menu {
            Link(destination: content.canonicalUrl) {
                Label("Open Original", systemImage: "arrow.up.forward.app")
            }

            Button {
                UIPasteboard.general.url = content.canonicalUrl
            } label: {
                Label("Copy Link", systemImage: "doc.on.doc")
            }

            if let subscriptionSettings {
                Divider()
                Button {
                    Task { await toggleSubscriptionAutoBookmark() }
                } label: {
                    Label(
                        subscriptionSettings.actionTitle,
                        systemImage: subscriptionSettings.autoBookmark
                            ? "bookmark.slash"
                            : "bookmark"
                    )
                }
                .disabled(isSavingSubscriptionSettings)
            }
        } label: {
            actionIcon(systemName: "ellipsis")
        }
        .accessibilityLabel("More actions")
        .actionRowHaptic()
    }

    private func actionIcon(
        systemName: String,
        color: Color = .secondary
    ) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 21, weight: .medium))
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(color)
            .frame(width: 42, height: 44)
            .contentShape(Rectangle())
    }

    @ViewBuilder
    private var creatorRow: some View {
        if let creatorId = content.creatorId {
            NavigationLink {
                CreatorView(
                    creatorId: creatorId,
                    fallbackName: content.creator,
                    fallbackImageUrl: content.creatorImageUrl,
                    fallbackProvider: content.provider,
                    client: client,
                    onBookmarkUpdate: onUpdate,
                    onBookmarkChange: onBookmarkChange,
                    onBookmarkCommit: onBookmarkCommit,
                    onExternalOpen: { opened in onExternalOpen(opened) }
                )
            } label: {
                creatorRowLabel(showsDisclosure: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View \(content.creator)")
        } else {
            creatorRowLabel(showsDisclosure: false)
        }
    }

    private func creatorRowLabel(showsDisclosure: Bool) -> some View {
        HStack(spacing: 10) {
            CreatorAvatar(
                imageUrl: content.creatorImageUrl,
                creator: content.creator,
                contentType: content.contentType,
                size: 32
            )

            Text(content.creator)
                .font(.headline)
                .foregroundStyle(ZineTheme.primaryText)

            if showsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZineTheme.secondaryText)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func parallaxHero(height: CGFloat) -> some View {
        GeometryReader { geometry in
            let offset = geometry.frame(in: .named("bookmarkDetailScroll")).minY
            let stretch = max(offset, 0)
            let renderedHeight = alignedToDisplayPixel(height + stretch)
            let parallaxOffset = alignedToDisplayPixel(
                offset > 0 ? -offset : -offset * 0.35
            )

            heroBase
                .frame(width: geometry.size.width, height: renderedHeight)
                .clipped()
                .overlay(alignment: .bottom) {
                    if colorScheme == .dark {
                        LinearGradient(
                            stops: heroFadeStops,
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 200 + displayPixel)
                    }
                }
                .offset(y: parallaxOffset)
        }
        .frame(height: height)
    }

    private var heroBase: some View {
        ZStack {
            ZineTheme.canvas

            heroImage
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var heroFadeStops: [Gradient.Stop] {
        return [
            .init(color: .clear, location: 0),
            .init(color: Color.black.opacity(0.28), location: 0.35),
            .init(color: Color.black.opacity(0.72), location: 0.72),
            .init(color: .black, location: 1),
        ]
    }

    private var heroImage: some View {
        CachedRemoteImage(
            url: content.thumbnailUrl,
            targetSize: CGSize(width: 430, height: 320)
        ) {
            ZStack {
                ZineTheme.raised
                Image(systemName: content.contentType.systemImage)
                    .font(.system(size: 48))
                    .foregroundStyle(ZineTheme.secondaryText)
            }
        }
    }

    private func heroHeight(in viewport: CGSize) -> CGFloat {
        alignedToDisplayPixel(min(max(viewport.height * 0.33, 240), 320))
    }

    private func alignedToDisplayPixel(_ value: CGFloat) -> CGFloat {
        guard displayScale > 0 else { return value }
        return (value * displayScale).rounded() / displayScale
    }

    private var displayPixel: CGFloat {
        displayScale > 0 ? 1 / displayScale : 1
    }

    private var metadata: some View {
        HStack(spacing: 10) {
            Label(content.provider.title, systemImage: content.contentType.systemImage)
            if let label = content.consumptionLabel {
                Text(label)
            }
        }
        .font(.subheadline)
        .foregroundStyle(ZineTheme.primaryText.opacity(0.72))
    }

    private func hydrateBookmark() async {
        do {
            var refreshed = try await client.getBookmark(id: content.id)
            guard !Task.isCancelled else { return }
            finishedState.hydrate(
                isFinished: refreshed.isFinished,
                finishedAt: refreshed.finishedAt
            )
            refreshed.isFinished = finishedState.isFinished
            refreshed.finishedAt = finishedState.finishedAt
            bookmark = refreshed
            if !hasToggledBookmark {
                isBookmarked = refreshed.state == "BOOKMARKED"
            }
        } catch is CancellationError {
            return
        } catch {
            return
        }
    }

    private func hydrateSubscriptionSettings() async {
        do {
            let settings = try await client.getBookmarkSubscriptionSettings(id: content.id)
            guard !Task.isCancelled else { return }
            subscriptionSettings = settings
        } catch is CancellationError {
            return
        } catch {
            subscriptionSettings = nil
        }
    }

    private func toggleSubscriptionAutoBookmark() async {
        guard var settings = subscriptionSettings, !isSavingSubscriptionSettings else { return }

        let previousSettings = settings
        settings.autoBookmark.toggle()
        subscriptionSettings = settings
        isSavingSubscriptionSettings = true
        defer { isSavingSubscriptionSettings = false }

        do {
            try await client.setBookmarkSubscriptionAutoBookmark(
                settings,
                enabled: settings.autoBookmark
            )
        } catch {
            subscriptionSettings = previousSettings
            errorMessage = error.localizedDescription
        }
    }

    private func toggleFinished() {
        guard let mutation = finishedState.beginToggle() else { return }
        updateBookmarkFromFinishedState(notify: false)

        Task {
            do {
                let result = try await client.setFinished(
                    id: content.id,
                    isFinished: mutation.requestedIsFinished
                )
                finishedState.accept(
                    isFinished: result.isFinished,
                    finishedAt: result.finishedAt
                )
                updateBookmarkFromFinishedState(notify: true)
            } catch is CancellationError {
                finishedState.rollback(mutation)
                updateBookmarkFromFinishedState(notify: false)
            } catch {
                finishedState.rollback(mutation)
                updateBookmarkFromFinishedState(notify: false)
                errorMessage = error.localizedDescription
            }
        }
    }

    private func toggleBookmark() async {
        guard let bookmark, !isSavingBookmark else { return }

        let previousValue = isBookmarked
        let newValue = !previousValue
        hasToggledBookmark = true
        isSavingBookmark = true
        isBookmarked = newValue
        onBookmarkChange(bookmark, newValue, .optimistic)

        defer { isSavingBookmark = false }

        do {
            if newValue {
                try await client.bookmarkItem(id: bookmark.id)
            } else {
                try await client.archiveBookmark(id: bookmark.id)
            }
            onBookmarkCommit(bookmark, newValue)
        } catch {
            isBookmarked = previousValue
            onBookmarkChange(bookmark, previousValue, .rollback)
            errorMessage = error.localizedDescription
        }
    }

    private func updateReadingProgress(_ progress: BookmarkProgress) {
        guard var bookmark else { return }
        bookmark.progress = progress
        self.bookmark = bookmark
        onUpdate(bookmark)
    }

    private func updateFinishedState(_ isFinished: Bool, phase: BookmarkChangePhase) {
        finishedState.synchronize(
            isFinished: isFinished,
            finishedAt: isFinished ? Date().formatted(.iso8601) : nil,
            isUpdating: phase == .optimistic
        )
        updateBookmarkFromFinishedState(notify: false)
    }

    private func commitFinishedState(_ isFinished: Bool) {
        finishedState.accept(
            isFinished: isFinished,
            finishedAt: isFinished ? Date().formatted(.iso8601) : nil
        )
        updateBookmarkFromFinishedState(notify: true)
    }

    private func updateBookmarkFromFinishedState(notify: Bool) {
        guard var bookmark else { return }
        bookmark.isFinished = finishedState.isFinished
        bookmark.finishedAt = finishedState.finishedAt
        self.bookmark = bookmark
        if notify {
            onUpdate(bookmark)
        }
    }

    private func updateTags(_ tags: [BookmarkTag]) {
        guard var bookmark else { return }
        bookmark.tags = tags
        self.bookmark = bookmark
        onUpdate(bookmark)
    }
}
