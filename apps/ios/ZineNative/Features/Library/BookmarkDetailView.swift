import SwiftUI
import UIKit

enum BookmarkChangePhase {
    case optimistic
    case rollback
}

struct BookmarkDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale

    @State private var bookmark: Bookmark
    @State private var isBookmarked: Bool
    @State private var hasToggledBookmark = false
    @State private var isSavingBookmark = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    let client: APIClient
    let onUpdate: (Bookmark) -> Void
    let onBookmarkChange: (Bookmark, Bool, BookmarkChangePhase) -> Void
    let onBookmarkCommit: (Bookmark, Bool) -> Void
    let onExternalOpen: (Bookmark) -> Void

    init(
        bookmark: Bookmark,
        client: APIClient,
        onUpdate: @escaping (Bookmark) -> Void,
        onBookmarkChange: @escaping (Bookmark, Bool, BookmarkChangePhase) -> Void = { _, _, _ in },
        onBookmarkCommit: @escaping (Bookmark, Bool) -> Void = { _, _ in },
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in }
    ) {
        _bookmark = State(initialValue: bookmark)
        _isBookmarked = State(initialValue: bookmark.state == "BOOKMARKED")
        self.client = client
        self.onUpdate = onUpdate
        self.onBookmarkChange = onBookmarkChange
        self.onBookmarkCommit = onBookmarkCommit
        self.onExternalOpen = onExternalOpen
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
        .task {
            if let refreshed = try? await client.getBookmark(id: bookmark.id) {
                bookmark = refreshed
                if !hasToggledBookmark {
                    isBookmarked = refreshed.state == "BOOKMARKED"
                }
            }
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
                Text(bookmark.title)
                    .font(.title2.bold())
                creatorRow
                metadata
            }

            actionRow

            if let summary = bookmark.summary, !summary.isEmpty {
                Text(summary)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            if !bookmark.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(bookmark.tags) { tag in
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
                bookmarkButton

                if isBookmarked {
                    completionButton
                }
                tagsMenu

                ShareLink(item: bookmark.canonicalUrl) {
                    actionIcon(systemName: "square.and.arrow.up")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Share")
                .actionRowHaptic()

                moreMenu
            }

            Spacer(minLength: 0)

            ProviderOpenButton(
                provider: bookmark.provider,
                destination: bookmark.canonicalUrl,
                onOpen: { onExternalOpen(bookmark) }
            )
                .padding(.trailing, 8)
        }
    }

    private var bookmarkButton: some View {
        Button {
            Task { await toggleBookmark() }
        } label: {
            actionIcon(
                systemName: isBookmarked ? "bookmark.fill" : "bookmark",
                color: isBookmarked ? .white : .secondary
            )
            .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.plain)
        .disabled(isSavingBookmark)
        .accessibilityLabel(isBookmarked ? "Remove bookmark" : "Bookmark")
        .actionRowHaptic()
    }

    private var completionButton: some View {
        Button {
            Task { await toggleFinished() }
        } label: {
            actionIcon(
                systemName: bookmark.isFinished
                    ? "checkmark.circle.fill"
                    : "checkmark.circle",
                color: bookmark.isFinished ? .green : .secondary
            )
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
        .accessibilityLabel(bookmark.isFinished ? "Mark unfinished" : "Mark complete")
        .actionRowHaptic()
    }

    private var tagsMenu: some View {
        Menu {
            if bookmark.tags.isEmpty {
                Button("No tags") {}
                    .disabled(true)
            } else {
                ForEach(bookmark.tags) { tag in
                    Button(tag.name) {}
                        .disabled(true)
                }
            }
        } label: {
            actionIcon(systemName: "tag")
        }
        .accessibilityLabel(bookmark.tags.isEmpty ? "No tags" : "View tags")
        .actionRowHaptic()
    }

    private var moreMenu: some View {
        Menu {
            Link(destination: bookmark.canonicalUrl) {
                Label("Open Original", systemImage: "arrow.up.forward.app")
            }

            Button {
                UIPasteboard.general.url = bookmark.canonicalUrl
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
        if let creatorId = bookmark.creatorId {
            NavigationLink {
                CreatorView(
                    creatorId: creatorId,
                    fallbackName: bookmark.creator,
                    fallbackImageUrl: bookmark.creatorImageUrl,
                    fallbackProvider: bookmark.provider,
                    client: client,
                    onBookmarkUpdate: onUpdate,
                    onBookmarkChange: onBookmarkChange,
                    onBookmarkCommit: onBookmarkCommit,
                    onExternalOpen: onExternalOpen
                )
            } label: {
                creatorRowLabel(showsDisclosure: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View \(bookmark.creator)")
        } else {
            creatorRowLabel(showsDisclosure: false)
        }
    }

    private func creatorRowLabel(showsDisclosure: Bool) -> some View {
        HStack(spacing: 10) {
            CreatorAvatar(
                imageUrl: bookmark.creatorImageUrl,
                creator: bookmark.creator,
                contentType: bookmark.contentType,
                size: 32
            )

            Text(bookmark.creator)
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
            url: bookmark.thumbnailUrl,
            targetSize: CGSize(width: 430, height: 320)
        ) {
            ZStack {
                Color.secondary.opacity(0.12)
                Image(systemName: bookmark.contentType.systemImage)
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
            Label(bookmark.provider.title, systemImage: bookmark.contentType.systemImage)
            if let label = bookmark.consumptionLabel {
                Text(label)
            }
        }
        .font(.subheadline)
        .foregroundStyle(Color.primary.opacity(0.72))
    }

    private func toggleFinished() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let result = try await client.setFinished(
                id: bookmark.id,
                isFinished: !bookmark.isFinished
            )
            bookmark.isFinished = result.isFinished
            bookmark.finishedAt = result.finishedAt
            onUpdate(bookmark)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func toggleBookmark() async {
        guard !isSavingBookmark else { return }

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
