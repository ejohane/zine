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
    let summary: String?
    let duration: Int?
    let readingTimeMinutes: Int?
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
        summary = bookmark.summary
        duration = bookmark.duration
        readingTimeMinutes = bookmark.readingTimeMinutes
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
        summary = item.summary
        duration = item.duration
        readingTimeMinutes = item.readingTimeMinutes
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
        summary = presentation?.excerpt
        duration = nil
        readingTimeMinutes = nil
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
    @State private var isSaving = false
    @State private var isHydrating = false
    @State private var hydrationFailed = false
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
        _isHydrating = State(initialValue: false)
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
        _isHydrating = State(initialValue: true)
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
        _isHydrating = State(initialValue: true)
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
                Color(uiColor: .systemBackground)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {
                        parallaxHero(height: heroHeight)
                        details
                            .frame(
                                minHeight: max(viewport.size.height - heroHeight, 0),
                                alignment: .top
                            )
                            .background(Color(uiColor: .systemBackground))
                    }
                }
                .coordinateSpace(name: "bookmarkDetailScroll")
                .ignoresSafeArea(edges: .top)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task(id: content.id) {
            await hydrateBookmark()
        }
        .alert("Couldn’t update bookmark", isPresented: Binding(
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
                    .foregroundStyle(.secondary)
            }

            if !content.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(content.tags) { tag in
                            Text(tag.name)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(.secondary.opacity(0.12), in: .capsule)
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

            ProviderOpenButton(
                provider: content.provider,
                destination: content.canonicalUrl,
                onOpen: { onExternalOpen(bookmark) }
            )
                .padding(.trailing, 8)
        }
    }

    @ViewBuilder
    private var bookmarkActions: some View {
        if bookmark != nil {
            bookmarkButton

            if isBookmarked {
                completionButton
            }
            tagsMenu
        } else {
            actionIcon(systemName: "bookmark.fill", color: .primary.opacity(0.55))
                .accessibilityHidden(true)

            if isHydrating {
                ProgressView()
                    .frame(width: 42, height: 44)
                    .accessibilityLabel("Loading bookmark actions")
            } else if hydrationFailed {
                Button {
                    Task { await hydrateBookmark() }
                } label: {
                    actionIcon(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Retry loading bookmark actions")
            }

            actionIcon(systemName: "tag", color: .secondary.opacity(0.45))
                .accessibilityHidden(true)
        }
    }

    private var bookmarkButton: some View {
        Button {
            Task { await toggleBookmark() }
        } label: {
            actionIcon(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                color: isBookmarked ? .primary : .secondary
            )
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .allowsHitTesting(!isSavingBookmark)
        .accessibilityLabel(isBookmarked ? "Remove bookmark" : "Bookmark")
        .actionRowHaptic()
    }

    private var completionButton: some View {
        let isFinished = bookmark?.isFinished ?? false

        return Button {
            Task { await toggleFinished() }
        } label: {
            actionIcon(
                systemName: isFinished
                    ? "checkmark.circle.fill"
                    : "checkmark.circle",
                color: isFinished ? .green : .secondary
            )
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
        .accessibilityLabel(isFinished ? "Mark unfinished" : "Mark complete")
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
                .foregroundStyle(.primary)

            if showsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
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
            Color(uiColor: .systemBackground)

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
                Color.secondary.opacity(0.12)
                Image(systemName: content.contentType.systemImage)
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)
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
        .foregroundStyle(Color.primary.opacity(0.72))
    }

    private func hydrateBookmark() async {
        let needsInitialBookmark = bookmark == nil
        if needsInitialBookmark {
            isHydrating = true
            hydrationFailed = false
        }

        do {
            let refreshed = try await client.getBookmark(id: content.id)
            guard !Task.isCancelled else { return }
            bookmark = refreshed
            isHydrating = false
            hydrationFailed = false
            if !hasToggledBookmark {
                isBookmarked = refreshed.state == "BOOKMARKED"
            }
        } catch is CancellationError {
            return
        } catch {
            guard needsInitialBookmark else { return }
            isHydrating = false
            hydrationFailed = true
        }
    }

    private func toggleFinished() async {
        guard var bookmark else { return }

        isSaving = true
        defer { isSaving = false }

        do {
            let result = try await client.setFinished(
                id: bookmark.id,
                isFinished: !bookmark.isFinished
            )
            bookmark.isFinished = result.isFinished
            bookmark.finishedAt = result.finishedAt
            self.bookmark = bookmark
            onUpdate(bookmark)
        } catch {
            errorMessage = error.localizedDescription
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
}
