import SwiftUI

struct BookmarkDetailView: View {
    @Environment(\.colorScheme) private var colorScheme

    @State private var bookmark: Bookmark
    @State private var isSaving = false
    @State private var errorMessage: String?

    let client: APIClient
    let onUpdate: (Bookmark) -> Void

    init(bookmark: Bookmark, client: APIClient, onUpdate: @escaping (Bookmark) -> Void) {
        _bookmark = State(initialValue: bookmark)
        self.client = client
        self.onUpdate = onUpdate
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
            try? await client.markOpened(id: bookmark.id)
            if let refreshed = try? await client.getBookmark(id: bookmark.id) {
                bookmark = refreshed
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
                    .font(.title.bold())
                Text(bookmark.creator)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                metadata
            }

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

            Link(destination: bookmark.canonicalUrl) {
                Label("Open original", systemImage: "arrow.up.right.square")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Button {
                Task { await toggleFinished() }
            } label: {
                Label(
                    bookmark.isFinished ? "Mark unfinished" : "Mark finished",
                    systemImage: bookmark.isFinished ? "arrow.uturn.backward.circle" : "checkmark.circle"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(isSaving)
        }
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func parallaxHero(height: CGFloat) -> some View {
        GeometryReader { geometry in
            let offset = geometry.frame(in: .named("bookmarkDetailScroll")).minY
            let stretch = max(offset, 0)

            heroImage
                .frame(width: geometry.size.width, height: height + stretch)
                .clipped()
                .overlay(alignment: .bottom) {
                    if colorScheme == .dark {
                        LinearGradient(
                            stops: heroFadeStops,
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 200)
                    }
                }
                .offset(y: offset > 0 ? -offset : -offset * 0.35)
        }
        .frame(height: height)
    }

    private var heroFadeStops: [Gradient.Stop] {
        let background = Color(uiColor: .systemBackground)

        return [
            .init(color: .clear, location: 0),
            .init(color: background.opacity(0.28), location: 0.35),
            .init(color: background.opacity(0.72), location: 0.72),
            .init(color: background, location: 1),
        ]
    }

    private var heroImage: some View {
        AsyncImage(url: bookmark.thumbnailUrl) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                ZStack {
                    Color.secondary.opacity(0.12)
                    Image(systemName: bookmark.contentType.systemImage)
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func heroHeight(in viewport: CGSize) -> CGFloat {
        min(max(viewport.height * 0.33, 240), 320)
    }

    private var metadata: some View {
        HStack(spacing: 10) {
            Label(bookmark.provider.title, systemImage: bookmark.contentType.systemImage)
            if let label = bookmark.consumptionLabel {
                Text(label)
            }
        }
        .font(.subheadline)
        .foregroundStyle(.tertiary)
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
}
