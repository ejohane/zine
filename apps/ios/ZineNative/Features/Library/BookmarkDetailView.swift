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
    let podcastDestinations: [String: PodcastDestination]?
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
        podcastDestinations = bookmark.podcastDestinations
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
        podcastDestinations = item.podcastDestinations
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
        podcastDestinations = nil
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
    @Environment(\.nativeCommandSession) private var commandSession
    @State private var showsReader = false
    @State private var showsArticleCreator = false
    @State private var articleJumpRequest = 0
    @State private var articleScrollOffset: CGFloat = 0
    @State private var articleReaderActive = false
    @State private var showsTagEditor = false
    @State private var showsPodcastFollow = false
    @Environment(\.openURL) private var openURL
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var bookmark: Bookmark?
    @State private var isBookmarked: Bool
    @State private var hasToggledBookmark = false
    @State private var isSavingBookmark = false
    @State private var finishedState: OptimisticFinishedState
    @State private var subscriptionSettings: BookmarkSubscriptionSettings?
    @State private var isSavingSubscriptionSettings = false
    @State private var errorMessage: String?
    @State private var artworkPalette: ZineTheme.ArtworkPalette?
    @State private var headerBottom: CGFloat = 0
    @State private var titleBottom: CGFloat = .greatestFiniteMagnitude

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

    private var readerDestination: some View { readerView() }

    private func readerView(bookmarkHeader: ArticleBookmarkReaderHeader? = nil) -> some View {
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
            bookmarkHeader: bookmarkHeader,
            synchronizedBookmark: bookmarkHeader == nil ? nil : bookmark,
            onRead: { onExternalOpen(bookmark) },
            onProgressSaved: updateReadingProgress,
            onFinishedChanged: updateFinishedState,
            onFinishedCommit: commitFinishedState,
            onTagsChanged: updateTags
        )
        .tint(ZineTheme.primaryText)
    }

    private var content: BookmarkDetailContent {
        bookmark.map { BookmarkDetailContent(bookmark: $0) } ?? initialContent
    }

    private var usesArtworkDetail: Bool {
        content.thumbnailUrl != nil
            && (content.provider == .youtube || content.provider == .spotify)
            && (content.contentType == .video || content.contentType == .podcast)
    }

    private var usesArticleDetail: Bool { content.contentType == .article }

    private var usesXPostDetail: Bool {
        content.provider == .x && content.contentType == .post
    }

    private var usesContextualDetail: Bool {
        usesArtworkDetail || usesArticleDetail || usesXPostDetail
    }

    private var showsContextualArtwork: Bool {
        usesContextualDetail && content.thumbnailUrl != nil
    }

    private var activeArtworkPalette: ZineTheme.ArtworkPalette? {
        usesContextualDetail ? artworkPalette ?? .fallback : nil
    }

    private var detailPrimaryText: Color {
        activeArtworkPalette?.primaryText ?? ZineTheme.primaryText
    }

    private var detailSecondaryText: Color {
        activeArtworkPalette?.secondaryText ?? ZineTheme.secondaryText
    }

    private var headerTitleProgress: CGFloat {
        min(max((headerBottom + 16 - titleBottom + (usesArticleDetail ? articleScrollOffset : 0)) / 32, 0), 1)
    }

    var body: some View {
        GeometryReader { viewport in
            let heroHeight = usesContextualDetail
                ? (showsContextualArtwork ? mediaHeroHeight(in: viewport.size) : 116)
                : heroHeight(in: viewport.size)

            ZStack(alignment: .topLeading) {
                (activeArtworkPalette?.background ?? ZineTheme.canvas)
                    .ignoresSafeArea()

                if usesArticleDetail {
                    readerView(bookmarkHeader: ArticleBookmarkReaderHeader(
                        content: AnyView(articleBookmarkHeader(viewport: viewport.size)),
                        palette: activeArtworkPalette ?? .fallback,
                        jumpRequest: articleJumpRequest,
                        onScroll: { offset, height in
                            articleScrollOffset = min(offset + height, height)
                            articleReaderActive = offset >= 0
                        }
                    ))
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            if showsContextualArtwork {
                                mediaHero(height: heroHeight, viewport: viewport.size)
                            } else if usesContextualDetail {
                                Color.clear.frame(height: heroHeight)
                            } else {
                                parallaxHero(height: heroHeight)
                            }
                            Group {
                                if usesContextualDetail {
                                    contextualDetails
                                } else {
                                    details
                                }
                            }
                                .frame(
                                    minHeight: max(viewport.size.height - heroHeight, 0),
                                    alignment: .top
                                )
                                .background(activeArtworkPalette?.background ?? ZineTheme.canvas)
                        }
                        .background(BookmarkDetailPopGestureBridge())
                    }
                    .coordinateSpace(name: "bookmarkDetailScroll")
                    .ignoresSafeArea(edges: .top)
                    .modifier(BookmarkDetailTopEdgeEffect())
                }

            }
            .onGeometryChange(for: CGFloat.self) { geometry in
                geometry.frame(in: .global).minY
            } action: { headerBottom = $0 }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: artworkPalette)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(articleReaderActive ? .hidden : .visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(content.title)
                    .font(.headline)
                    .foregroundStyle(detailPrimaryText)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .opacity(headerTitleProgress)
                    .accessibilityHidden(headerTitleProgress < 0.5)
            }
        }
        .tint(detailPrimaryText)
        .preferredColorScheme(usesArtworkDetail ? .dark : nil)
        .zinePushedDestinationChrome()
        .zineNavigationBarContentBackdrop(activeArtworkPalette?.background ?? ZineTheme.canvas)
        .navigationDestination(isPresented: $showsReader) { readerDestination }
        .navigationDestination(isPresented: $showsArticleCreator) { creatorDestination }
        .onAppear {
            commandSession?.bookmarkID = content.id
            commandSession?.route = "bookmark"
            commandSession?.openReader = {
                if usesArticleDetail { articleJumpRequest += 1 } else { showsReader = true }
            }
            commandSession?.detailBookmark = {
                guard var value = bookmark else { return nil }
                value.state = isBookmarked ? "BOOKMARKED" : "ARCHIVED"
                return value
            }
            commandSession?.setDetailTags = saveDetailTags
            commandSession?.setDetailBookmarked = setBookmarked
            commandSession?.refreshDetail = {
                guard await hydrateBookmark(force: true) else { throw CommandError("bookmark_refresh_failed") }
            }
        }
        .sheet(isPresented: $showsTagEditor) {
            ArticleTagEditorView(bookmarkID: content.id, initialTags: content.tags, client: client,
                saveTags: { names in try await saveDetailTags(names).value }, onSaved: updateTags)
        }
        .sheet(isPresented: $showsPodcastFollow) {
            PodcastFollowSheet(bookmarkID: content.id, client: client) {
                Task { await hydrateSubscriptionSettings() }
            }
        }
        .task(id: content.id) {
            await hydrateBookmark()
        }
        .onChange(of: content.creatorImageUrl) { _, _ in artworkPalette = nil }
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
            Button("OK", role: .cancel) { ActionRowHaptics.play(style: .heavy) }
        } message: {
            Text(errorMessage ?? "Please try again.")
        }
    }

    private func articleBookmarkHeader(viewport: CGSize) -> some View {
        VStack(spacing: 0) {
            if showsContextualArtwork {
                mediaHero(height: mediaHeroHeight(in: viewport), viewport: viewport)
            } else {
                Color.clear.frame(height: 116)
            }
            contextualDetails
        }
        .coordinateSpace(name: "articleBookmarkHeader")
        .background(activeArtworkPalette?.background ?? ZineTheme.canvas)
    }

    private var contextualDetails: some View {
        VStack(spacing: 0) {
            Text(content.title)
                .font(.title2.bold())
                .multilineTextAlignment(.center)
                .foregroundStyle(detailPrimaryText)
                .frame(maxWidth: .infinity)
                .opacity(1 - headerTitleProgress)
                .accessibilityHidden(headerTitleProgress >= 0.5)
                .onGeometryChange(for: CGFloat.self) { geometry in
                    usesArticleDetail ? geometry.frame(in: .named("articleBookmarkHeader")).maxY : geometry.frame(in: .global).maxY
                } action: { titleBottom = $0 }

            creatorRow
                .frame(maxWidth: .infinity)
                .padding(.top, 8)

            HStack(spacing: 6) {
                Text(content.provider.title)
                if let label = content.consumptionLabel {
                    Text("·")
                    Text(label)
                }
            }
            .font(.subheadline)
            .foregroundStyle(activeArtworkPalette?.tertiaryText ?? ZineTheme.tertiaryText)
            .padding(.top, 8)

            if usesArticleDetail {
                Button {
                    ActionRowHaptics.play(style: .heavy)
                    articleJumpRequest += 1
                } label: {
                    Label("Read in Zine", systemImage: "book.pages")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(ZineTheme.onAccent)
                        .background(activeArtworkPalette?.actionBackground ?? ZineTheme.surface, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 24)
            }

            contextualOpenButton
                .padding(.top, usesArticleDetail ? 12 : 24)

            HStack(spacing: 16) {
                bookmarkActions
                Spacer(minLength: 0)
                ShareLink(item: content.canonicalUrl) {
                    actionIcon(systemName: "square.and.arrow.up")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Share")
                .actionRowHaptic(style: .heavy)
                moreMenu
            }
            .padding(.top, 18)

            if usesArticleDetail {
                Rectangle()
                    .fill(activeArtworkPalette?.divider ?? ZineTheme.border)
                    .frame(height: 1)
                    .padding(.top, 22)
            } else if let summary = content.summary, !summary.isEmpty {
                Rectangle()
                    .fill(activeArtworkPalette?.divider ?? ZineTheme.border)
                    .frame(height: 1)
                    .padding(.top, 22)

                Text(BookmarkDescription.attributedText(
                    summary,
                    youtubeURL: content.provider == .youtube ? content.canonicalUrl : nil,
                    duration: content.duration
                ))
                .font(.body)
                .foregroundStyle(detailSecondaryText)
                .tint(detailPrimaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 22)
            }

            if !usesArticleDetail && !content.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(content.tags) { tag in
                            Text(tag.name)
                                .font(.caption)
                                .foregroundStyle(detailPrimaryText)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(activeArtworkPalette?.controlBackground ?? ZineTheme.raised, in: Capsule())
                        }
                    }
                }
                .padding(.top, 24)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, usesArticleDetail ? 0 : 48)
        .frame(maxWidth: .infinity)
    }

    private var contextualOpenButton: some View {
        let action = content.provider.openAction(for: content.canonicalUrl)

        return Button {
            ActionRowHaptics.play(style: .heavy)
            onExternalOpen(bookmark)
            openURL(content.canonicalUrl)
        } label: {
            HStack(spacing: 9) {
                ProviderLogoView(logo: action.logo)
                    .frame(width: 24, height: 24)
                Text(action.title)
                    .font(.headline)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(ZineTheme.onAccent)
            .background(activeArtworkPalette?.actionBackground ?? ZineTheme.surface, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.accessibilityLabel)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 10) {
                Text(content.title)
                    .font(.title2.bold())
                    .opacity(1 - headerTitleProgress)
                    .accessibilityHidden(headerTitleProgress >= 0.5)
                    .onGeometryChange(for: CGFloat.self) { geometry in
                        geometry.frame(in: .global).maxY
                    } action: { titleBottom = $0 }
                creatorRow
                metadata
            }

            actionRow

            if content.contentType == .podcast, content.provider == .web,
               subscriptionSettings == nil {
                Button {
                    ActionRowHaptics.play(style: .heavy)
                    showsPodcastFollow = true
                } label: {
                    Label("Follow show", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(ZineTheme.brandAccent)
                .foregroundStyle(ZineTheme.onAccent)
                .accessibilityIdentifier("podcast-follow-show")
            }

            if let summary = content.summary, !summary.isEmpty {
                Text(BookmarkDescription.attributedText(
                    summary,
                    youtubeURL: content.provider == .youtube ? content.canonicalUrl : nil,
                    duration: content.duration
                ))
                    .font(.body)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .tint(ZineTheme.bookmarkDescriptionLink)
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
                .actionRowHaptic(style: .heavy)

                moreMenu
            }

            Spacer(minLength: 0)

            if content.provider.opensInZineReader(contentType: content.contentType) {
                Button {
                    ActionRowHaptics.play(style: .heavy)
                    showsReader = true
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
                .padding(.trailing, 8)
            } else if content.contentType == .podcast && content.provider == .rss {
                PodcastOpenControl(
                    publisherURL: content.canonicalUrl,
                    destinations: content.podcastDestinations,
                    onOpen: { onExternalOpen(bookmark) },
                    hapticStyle: .heavy
                )
                .padding(.trailing, 8)
            } else {
                ProviderOpenButton(
                    provider: content.provider,
                    destination: content.canonicalUrl,
                    onOpen: { onExternalOpen(bookmark) },
                    hapticStyle: .heavy
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
                color: detailSecondaryText.opacity(0.55)
            )
                .accessibilityHidden(true)
        }

        if isBookmarked {
            completionButton
        }

        if bookmark != nil {
            tagsMenu
        } else {
            actionIcon(systemName: "tag", color: detailSecondaryText.opacity(0.45))
                .accessibilityHidden(true)
        }
    }

    private var bookmarkButton: some View {
        Button {
            ActionRowHaptics.play(style: .heavy)
            Task { await toggleBookmark() }
        } label: {
            actionIcon(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                color: isBookmarked ? detailPrimaryText : detailSecondaryText
            )
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .allowsHitTesting(!isSavingBookmark)
        .accessibilityLabel(isBookmarked ? "Remove bookmark" : "Bookmark")
    }

    private var completionButton: some View {
        return Button {
            ActionRowHaptics.play(style: .heavy)
            toggleFinished()
        } label: {
            actionIcon(
                systemName: finishedState.isFinished
                    ? "checkmark.circle.fill"
                    : "checkmark.circle",
                color: finishedState.isFinished ? .green : detailSecondaryText
            )
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .allowsHitTesting(!finishedState.isUpdating)
        .accessibilityLabel(finishedState.isFinished ? "Mark unfinished" : "Mark complete")
    }

    private var tagsMenu: some View {
        Button {
            ActionRowHaptics.play(style: .heavy)
            showsTagEditor = true
        } label: { actionIcon(systemName: "tag") }
            .buttonStyle(.plain)
            .accessibilityLabel("Edit tags")
    }

    private func saveDetailTags(_ names: [String]) async throws -> NativeMutationReceipt<[BookmarkTag]> {
        let receipt = try await client.setTagsWithReceipt(id: content.id, tags: names, bookmark: bookmark)
        updateTags(receipt.value)
        return receipt
    }

    private var moreMenu: some View {
        Menu {
            Button {
                ActionRowHaptics.play(style: .heavy)
                openURL(content.canonicalUrl)
            } label: {
                Label("Open Original", systemImage: "arrow.up.forward.app")
            }

            Button {
                ActionRowHaptics.play(style: .heavy)
                UIPasteboard.general.url = content.canonicalUrl
            } label: {
                Label("Copy Link", systemImage: "doc.on.doc")
            }

            if let subscriptionSettings {
                Divider()
                Button {
                    ActionRowHaptics.play(style: .heavy)
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
        .actionRowHaptic(style: .heavy)
    }

    private func actionIcon(
        systemName: String,
        color: Color? = nil
    ) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 21, weight: .medium))
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(color ?? detailSecondaryText)
            .frame(width: 42, height: 44)
            .background(activeArtworkPalette?.controlBackground ?? .clear, in: Circle())
            .contentShape(Rectangle())
    }

    private var creatorDestination: some View {
        CreatorView(
            creatorId: content.creatorId ?? "",
            fallbackName: content.creator,
            fallbackImageUrl: content.creatorImageUrl,
            fallbackProvider: content.provider,
            client: client,
            onBookmarkUpdate: onUpdate,
            onBookmarkChange: onBookmarkChange,
            onBookmarkCommit: onBookmarkCommit,
            onExternalOpen: { opened in onExternalOpen(opened) }
        )
    }

    @ViewBuilder
    private var creatorRow: some View {
        if content.creatorId != nil {
            if usesArticleDetail {
                Button {
                    ActionRowHaptics.play(style: .heavy)
                    showsArticleCreator = true
                } label: {
                    creatorRowLabel(showsDisclosure: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("View \(content.creator)")
            } else {
                NavigationLink { creatorDestination } label: {
                    creatorRowLabel(showsDisclosure: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("View \(content.creator)")
                .actionRowHaptic(style: .heavy)
            }
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
                size: 32,
                onImageLoaded: { image in
                    guard usesContextualDetail else { return }
                    artworkPalette = ZineTheme.ArtworkPalette.make(from: image)
                }
            )

            Text(content.creator)
                .font(.headline)
                .foregroundStyle(detailPrimaryText)

            if showsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(detailSecondaryText)
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

    private func mediaHero(height: CGFloat, viewport: CGSize) -> some View {
        let imageWidth = max(0, viewport.width - 72)
        let imageHeight = content.provider == .spotify ? imageWidth : imageWidth * 9 / 16

        return GeometryReader { geometry in
            let offset = usesArticleDetail ? -articleScrollOffset : geometry.frame(in: .named("bookmarkDetailScroll")).minY
            let stretch = max(offset, 0)

            ZStack(alignment: .top) {
                activeArtworkPalette?.background ?? ZineTheme.canvas

                heroImage
                    .frame(width: imageWidth, height: imageHeight)
                    .clipShape(.rect(cornerRadius: 14))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(.white.opacity(0.10), lineWidth: 1)
                    }
                    .scaleEffect(1 + min(stretch / 800, 0.08))
                    .padding(.top, 116 + stretch * 0.25)
            }
            .frame(width: geometry.size.width, height: height + stretch)
            .offset(y: offset > 0 ? -offset : -offset * 0.35)
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
            targetSize: CGSize(
                width: 430,
                height: showsContextualArtwork
                    ? (content.provider == .spotify ? 430 : 242)
                    : 320
            )
        ) {
            ZStack {
                activeArtworkPalette?.controlBackground ?? ZineTheme.raised
                Image(systemName: content.contentType.systemImage)
                    .font(.system(size: 48))
                    .foregroundStyle(detailSecondaryText)
            }
        }
    }

    private func mediaHeroHeight(in viewport: CGSize) -> CGFloat {
        let imageWidth = max(0, viewport.width - 72)
        let imageHeight = content.provider == .spotify ? imageWidth : imageWidth * 9 / 16
        return alignedToDisplayPixel(116 + imageHeight + 16)
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

    @discardableResult
    private func hydrateBookmark(force: Bool = false) async -> Bool {
        do {
            var refreshed = try await client.getBookmark(id: content.id)
            guard !Task.isCancelled else { return false }
            finishedState.hydrate(
                isFinished: refreshed.isFinished,
                finishedAt: refreshed.finishedAt
            )
            refreshed.isFinished = finishedState.isFinished
            refreshed.finishedAt = finishedState.finishedAt
            bookmark = refreshed
            if force || !hasToggledBookmark {
                hasToggledBookmark = false
                isBookmarked = refreshed.state == "BOOKMARKED"
            }
            return true
        } catch is CancellationError {
            return false
        } catch {
            return false
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
                    isFinished: mutation.requestedIsFinished,
                    bookmark: bookmark
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
        do { _ = try await setBookmarked(!isBookmarked) }
        catch { errorMessage = error.localizedDescription }
    }

    private func setBookmarked(_ newValue: Bool) async throws -> NativeMutationDelivery {
        guard let bookmark, !isSavingBookmark else { throw CommandError("bookmark_busy_or_unavailable") }
        guard newValue != isBookmarked else { throw CommandError(newValue ? "already_bookmarked" : "already_archived") }
        let previousValue = isBookmarked
        hasToggledBookmark = true
        isSavingBookmark = true
        isBookmarked = newValue
        onBookmarkChange(bookmark, newValue, .optimistic)
        defer { isSavingBookmark = false }
        do {
            let delivery: NativeMutationDelivery
            if newValue {
                try await client.bookmarkItem(id: bookmark.id)
                delivery = .serverCommitted
            } else {
                delivery = try await client.archiveBookmarkWithReceipt(id: bookmark.id, bookmark: bookmark)
            }
            onBookmarkCommit(bookmark, newValue)
            return delivery
        } catch {
            isBookmarked = previousValue
            onBookmarkChange(bookmark, previousValue, .rollback)
            throw error
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
        if notify && finishedState.isFinished && !isBookmarked {
            isBookmarked = true
            hasToggledBookmark = true
            bookmark.state = "BOOKMARKED"
            onBookmarkChange(bookmark, true, .optimistic)
            onBookmarkCommit(bookmark, true)
        }
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

private struct BookmarkDetailTopEdgeEffect: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.scrollEdgeEffectHidden(for: .top)
        } else {
            content
        }
    }
}

// The hidden navigation bar can disable UIKit's pop gestures after a push
// through the creator screen. Keep the system gesture on the navigation
// controller, and let the detail scroll view yield to it.
struct BookmarkDetailPopGestureBridge: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> NavigationAnchor {
        let view = NavigationAnchor()
        view.onNavigationControllerAvailable = { [weak coordinator = context.coordinator, weak view] navigation in
            guard let view else { return }
            coordinator?.enable(in: navigation, alongside: view.nearestScrollView()?.panGestureRecognizer)
        }
        return view
    }

    func updateUIView(_ view: NavigationAnchor, context: Context) {
        view.refreshNavigationController()
    }

    static func dismantleUIView(_ view: NavigationAnchor, coordinator: Coordinator) {
        view.onNavigationControllerAvailable = nil
        coordinator.restore()
    }

    final class NavigationAnchor: UIView {
        var onNavigationControllerAvailable: ((UINavigationController) -> Void)?

        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            backgroundColor = .clear
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            refreshNavigationController()
        }

        func refreshNavigationController() {
            guard window != nil else { return }
            DispatchQueue.main.async { [weak self] in
                guard let self, let navigation = nearestNavigationController() else { return }
                onNavigationControllerAvailable?(navigation)
            }
        }

        func nearestScrollView() -> UIScrollView? {
            var view = superview
            while let current = view {
                if let scrollView = current as? UIScrollView { return scrollView }
                view = current.superview
            }
            return nil
        }

        private func nearestNavigationController() -> UINavigationController? {
            var responder: UIResponder? = self
            while let next = responder?.next {
                if let navigation = next as? UINavigationController { return navigation }
                if let controller = next as? UIViewController,
                   let navigation = controller.navigationController { return navigation }
                responder = next
            }
            return nil
        }
    }

    @MainActor
    final class Coordinator {
        private struct Configuration {
            let gesture: UIGestureRecognizer
            let delegate: (any UIGestureRecognizerDelegate)?
            let wasEnabled: Bool
        }

        private var configurations: [Configuration] = []

        func enable(in navigation: UINavigationController, alongside scrollGesture: UIPanGestureRecognizer?) {
            var gestures = [navigation.interactivePopGestureRecognizer]
            if #available(iOS 26.0, *) {
                gestures.append(navigation.interactiveContentPopGestureRecognizer)
            }

            for gesture in gestures.compactMap({ $0 }) {
                if !configurations.contains(where: { $0.gesture === gesture }) {
                    configurations.append(Configuration(
                        gesture: gesture,
                        delegate: gesture.delegate,
                        wasEnabled: gesture.isEnabled
                    ))
                    scrollGesture?.require(toFail: gesture)
                }
                gesture.delegate = nil
                gesture.isEnabled = navigation.viewControllers.count > 1
            }
        }

        func restore() {
            for configuration in configurations {
                if configuration.gesture.delegate == nil {
                    configuration.gesture.delegate = configuration.delegate
                }
                configuration.gesture.isEnabled = configuration.wasEnabled
            }
            configurations.removeAll()
        }
    }
}
