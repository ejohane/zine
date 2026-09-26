import SwiftUI

struct CreatorView: View {
    private enum ContentSection: Hashable {
        case bookmarked
        case latest
    }

    let fallbackName: String
    let fallbackImageUrl: URL?
    let fallbackProvider: Provider
    let client: APIClient
    let onBookmarkUpdate: (Bookmark) -> Void
    let onBookmarkChange: (Bookmark, Bool, BookmarkChangePhase) -> Void
    let onBookmarkCommit: (Bookmark, Bool) -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var store: CreatorStore
    @State private var selectedSection: ContentSection = .bookmarked
    @State private var renderedSection: ContentSection = .bookmarked
    @State private var artworkPalette = ZineTheme.ArtworkPalette.fallback
    @State private var headerBottom: CGFloat = 0
    @State private var titleBottom: CGFloat = .greatestFiniteMagnitude
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var avatarURL: URL? { store.profile?.imageUrl ?? fallbackImageUrl }
    private var creatorName: String { store.profile?.name ?? fallbackName }
    private var headerTitleProgress: CGFloat {
        min(max((headerBottom + 16 - titleBottom) / 32, 0), 1)
    }

    init(
        creatorId: String,
        fallbackName: String,
        fallbackImageUrl: URL?,
        fallbackProvider: Provider,
        client: APIClient,
        onBookmarkUpdate: @escaping (Bookmark) -> Void = { _ in },
        onBookmarkChange: @escaping (Bookmark, Bool, BookmarkChangePhase) -> Void = { _, _, _ in },
        onBookmarkCommit: @escaping (Bookmark, Bool) -> Void = { _, _ in },
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in }
    ) {
        self.fallbackName = fallbackName
        self.fallbackImageUrl = fallbackImageUrl
        self.fallbackProvider = fallbackProvider
        self.client = client
        self.onBookmarkUpdate = onBookmarkUpdate
        self.onBookmarkChange = onBookmarkChange
        self.onBookmarkCommit = onBookmarkCommit
        self.onExternalOpen = onExternalOpen
        _store = State(initialValue: CreatorStore(creatorId: creatorId, client: client))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                creatorHeader
                contentSwitcher
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 40)
        }
        .coordinateSpace(name: "creatorScroll")
        .background(artworkPalette.background.ignoresSafeArea())
        .foregroundStyle(artworkPalette.primaryText)
        .tint(artworkPalette.primaryText)
        .preferredColorScheme(.dark)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(creatorName)
                    .font(.headline)
                    .foregroundStyle(artworkPalette.primaryText)
                    .lineLimit(1)
                    .opacity(headerTitleProgress)
                    .accessibilityHidden(headerTitleProgress < 0.5)
            }
        }
        .toolbarBackground(.hidden, for: .navigationBar)
        .zineNavigationBarContentBackdrop(artworkPalette.background)
        .onGeometryChange(for: CGFloat.self) { geometry in
            geometry.frame(in: .global).minY
        } action: { headerBottom = $0 }
        .onChange(of: avatarURL) { _, _ in artworkPalette = .fallback }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: artworkPalette)
        .task { await store.reload() }
        .refreshable { await store.reload() }
    }

    private var creatorHeader: some View {
        VStack(spacing: 12) {
            CreatorAvatar(
                imageUrl: avatarURL,
                creator: creatorName,
                contentType: .article,
                size: 160,
                onImageLoaded: { image in
                    artworkPalette = ZineTheme.ArtworkPalette.make(from: image)
                }
            )

            VStack(spacing: 5) {
                Text(creatorName)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                    .opacity(1 - headerTitleProgress)
                    .accessibilityHidden(headerTitleProgress >= 0.5)
                    .onGeometryChange(for: CGFloat.self) { geometry in
                        geometry.frame(in: .global).maxY
                    } action: { titleBottom = $0 }

                if let handle = store.profile?.handle, !handle.isEmpty {
                    Text(handle)
                        .font(.subheadline)
                        .foregroundStyle(artworkPalette.secondaryText)
                }
            }

            if let description = store.profile?.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(artworkPalette.secondaryText)
                    .multilineTextAlignment(.center)
                    .lineLimit(5)
            }

            if let externalUrl = store.profile?.externalUrl {
                Link(destination: externalUrl) {
                    Label(
                        (store.profile?.provider ?? fallbackProvider).creatorActionTitle,
                        systemImage: "arrow.up.right"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(artworkPalette.actionForeground)
                    .background(artworkPalette.actionBackground, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }

            if let error = store.profileErrorMessage {
                Text("Some profile details couldn’t be loaded. \(error)")
                    .font(.caption)
                    .foregroundStyle(artworkPalette.secondaryText)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var contentSwitcher: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Creator content", selection: sectionSelection) {
                Text("Bookmarked")
                    .tag(ContentSection.bookmarked)
                Text(latestSectionTitle)
                    .tag(ContentSection.latest)
            }
            .pickerStyle(.segmented)
            .sensoryFeedback(.selection, trigger: selectedSection)

            switch renderedSection {
            case .bookmarked:
                savedSection
            case .latest:
                latestSection
            }
        }
    }

    private var latestSectionTitle: String {
        "Latest on \((store.latestProvider ?? fallbackProvider).title)"
    }

    private var sectionSelection: Binding<ContentSection> {
        Binding(
            get: { selectedSection },
            set: { newSelection in
                guard newSelection != selectedSection else { return }
                selectedSection = newSelection

                Task { @MainActor in
                    await Task.yield()
                    guard selectedSection == newSelection else { return }
                    renderedSection = newSelection
                }
            }
        )
    }

    private var savedSection: some View {
        VStack(alignment: .leading, spacing: 24) {
            if (store.isLoadingBookmarks || store.isLoadingCompletedBookmarks)
                && store.bookmarks.isEmpty
                && store.completedBookmarks.isEmpty
            {
                ProgressView("Loading bookmarks…")
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            } else if store.bookmarks.isEmpty && store.completedBookmarks.isEmpty {
                sectionMessage(
                    title: "No saved content",
                    message: "Bookmarks from this creator will appear here."
                )
            } else {
                bookmarkSection(
                    title: "Up Next",
                    bookmarks: store.bookmarks,
                    isCompleted: false,
                    isLoading: store.isLoadingBookmarks,
                    isLoadingMore: store.isLoadingMore,
                    emptyMessage: "Nothing unfinished from this creator."
                )

                bookmarkSection(
                    title: "Completed",
                    bookmarks: store.completedBookmarks,
                    isCompleted: true,
                    isLoading: store.isLoadingCompletedBookmarks,
                    isLoadingMore: store.isLoadingMoreCompleted,
                    emptyMessage: "No completed bookmarks from this creator yet."
                )
            }

            if let error = store.bookmarksErrorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            if let error = store.completedBookmarksErrorMessage {
                Text("Completed bookmarks couldn’t be loaded. \(error)")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private func bookmarkSection(
        title: String,
        bookmarks: [Bookmark],
        isCompleted: Bool,
        isLoading: Bool,
        isLoadingMore: Bool,
        emptyMessage: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .font(.headline)
                Text("\(bookmarks.count)")
                    .font(.subheadline)
                    .foregroundStyle(artworkPalette.secondaryText)
            }

            if isLoading && bookmarks.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else if bookmarks.isEmpty {
                Text(emptyMessage)
                    .font(.subheadline)
                    .foregroundStyle(artworkPalette.secondaryText)
                    .padding(.vertical, 8)
            } else {
                bookmarkRows(bookmarks, isCompleted: isCompleted)

                if isLoadingMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func bookmarkRows(_ bookmarks: [Bookmark], isCompleted: Bool) -> some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(bookmarks) { bookmark in
                NavigationLink {
                    BookmarkDetailView(
                        bookmark: bookmark,
                        client: client,
                        onUpdate: onBookmarkUpdate,
                        onBookmarkChange: onBookmarkChange,
                        onBookmarkCommit: onBookmarkCommit,
                        onExternalOpen: onExternalOpen
                    )
                } label: {
                    creatorContentRow(
                        thumbnailUrl: bookmark.thumbnailUrl,
                        title: bookmark.title,
                        metadataLabel: bookmarkMetadataLabel(bookmark),
                        placeholderSystemImage: bookmark.contentType.systemImage,
                        accessorySystemImage: "chevron.right"
                    )
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .task {
                    if isCompleted {
                        await store.loadMoreCompletedIfNeeded(current: bookmark)
                    } else {
                        await store.loadMoreIfNeeded(current: bookmark)
                    }
                }

                if bookmark.id != bookmarks.last?.id {
                    Rectangle().fill(artworkPalette.divider).frame(height: 1).padding(.leading, 106)
                }
            }
        }
    }

    @ViewBuilder
    private var latestSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if store.isLoadingLatest && store.latestContent.isEmpty {
                ProgressView("Checking for recent content…")
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            } else if let error = store.latestErrorMessage {
                sectionMessage(title: "Latest content unavailable", message: error)
            } else if let reason = store.latestReason {
                sectionMessage(title: "Latest content unavailable", message: latestReasonMessage(reason))
            } else if store.latestContent.isEmpty {
                sectionMessage(
                    title: "Nothing recent found",
                    message: "This creator’s feed doesn’t have any recent content to show."
                )
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(store.latestContent) { item in
                        Link(destination: item.externalUrl) {
                            creatorContentRow(
                                thumbnailUrl: item.thumbnailUrl,
                                title: item.title,
                                metadataLabel: item.metadataLabel,
                                placeholderSystemImage: "doc.richtext",
                                accessorySystemImage: "arrow.up.right"
                            )
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)

                        if item.id != store.latestContent.last?.id {
                            Rectangle().fill(artworkPalette.divider).frame(height: 1).padding(.leading, 106)
                        }
                    }
                }
            }
        }
    }

    private func sectionMessage(title: String, message: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(message)
                .font(.caption)
                .foregroundStyle(artworkPalette.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(artworkPalette.controlBackground, in: .rect(cornerRadius: 12))
    }

    private func creatorContentRow(
        thumbnailUrl: URL?,
        title: String,
        metadataLabel: String,
        placeholderSystemImage: String,
        accessorySystemImage: String
    ) -> some View {
        HStack(spacing: 12) {
            CachedRemoteImage(
                url: thumbnailUrl,
                targetSize: CGSize(width: 94, height: 60)
            ) {
                ZStack {
                    artworkPalette.controlBackground
                    Image(systemName: placeholderSystemImage)
                        .foregroundStyle(artworkPalette.secondaryText)
                }
            }
            .frame(width: 94, height: 60)
            .clipShape(.rect(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(artworkPalette.primaryText)
                    .lineLimit(2)
                Text(metadataLabel)
                    .font(.caption)
                    .foregroundStyle(artworkPalette.secondaryText)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
            Image(systemName: accessorySystemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(artworkPalette.tertiaryText)
        }
        .contentShape(Rectangle())
    }

    private func bookmarkMetadataLabel(_ bookmark: Bookmark) -> String {
        [bookmark.creator, bookmark.consumptionLabel]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    private func latestReasonMessage(_ reason: String) -> String {
        switch reason {
        case "NOT_CONNECTED":
            "Connect this provider in Subscriptions to load the creator’s latest content."
        case "TOKEN_EXPIRED":
            "Reconnect this provider in Subscriptions to refresh the creator’s feed."
        case "RATE_LIMITED":
            "The provider is temporarily rate limited. Pull to refresh in a few minutes."
        default:
            "A latest-content feed isn’t available for this source yet."
        }
    }
}
