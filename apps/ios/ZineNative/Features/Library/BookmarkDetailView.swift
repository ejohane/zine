import SwiftUI

struct BookmarkDetailView: View {
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
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                hero

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
            .padding()
        }
        .navigationBarTitleDisplayMode(.inline)
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

    private var hero: some View {
        AsyncImage(url: bookmark.thumbnailUrl) { phase in
            switch phase {
            case .success(let image): image.resizable().scaledToFill()
            default:
                ZStack {
                    Color.secondary.opacity(0.12)
                    Image(systemName: bookmark.contentType.systemImage)
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(.rect(cornerRadius: 16))
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
