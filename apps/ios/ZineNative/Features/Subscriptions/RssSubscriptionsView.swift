import Observation
import SwiftUI

@MainActor
@Observable
private final class RssSubscriptionsStore {
    private(set) var response: RssSubscriptionsResponse?
    private(set) var isLoading = false
    private(set) var isAdding = false
    private(set) var pendingFeedIDs = Set<String>()
    private(set) var errorMessage: String?
    private(set) var actionMessage: String?

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func reload() async {
        isLoading = response == nil
        errorMessage = nil
        defer { isLoading = false }
        do {
            response = try await client.listRssFeeds()
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func add(url: String) async -> Bool {
        let value = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let candidate = URL(string: value),
              let scheme = candidate.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            actionMessage = "Enter a complete http or https feed URL."
            return false
        }

        isAdding = true
        defer { isAdding = false }
        do {
            try await client.addRssFeed(url: value)
            await reloadAfterMutation()
            return true
        } catch {
            actionMessage = "The RSS feed couldn’t be added. \(error.localizedDescription)"
            return false
        }
    }

    func setPaused(_ feed: RssFeed, isPaused: Bool) async {
        await perform(feed) {
            try await client.updateRssFeed(id: feed.id, action: isPaused ? "pause" : "resume")
        }
    }

    func remove(_ feed: RssFeed) async {
        await perform(feed) { try await client.removeRssFeed(id: feed.id) }
    }

    func sync(_ feed: RssFeed) async {
        pendingFeedIDs.insert(feed.id)
        defer { pendingFeedIDs.remove(feed.id) }
        do {
            let result = try await client.syncRssFeed(id: feed.id)
            actionMessage = result.itemsFound == 1
                ? "Fetched 1 new item from \(feed.title)."
                : "Fetched \(result.itemsFound) new items from \(feed.title)."
            await reloadAfterMutation()
        } catch {
            actionMessage = "The RSS feed couldn’t be synced. \(error.localizedDescription)"
        }
    }

    func dismissMessage() { actionMessage = nil }

    private func perform(_ feed: RssFeed, action: () async throws -> Void) async {
        pendingFeedIDs.insert(feed.id)
        defer { pendingFeedIDs.remove(feed.id) }
        do {
            try await action()
            await reloadAfterMutation()
        } catch {
            actionMessage = "\(feed.title) couldn’t be updated. \(error.localizedDescription)"
        }
    }

    private func reloadAfterMutation() async {
        do {
            response = try await client.listRssFeeds()
            errorMessage = nil
        } catch {
            actionMessage = "The change was saved, but the feed list couldn’t be refreshed."
        }
    }
}

struct RssSubscriptionsView: View {
    @State private var store: RssSubscriptionsStore
    @State private var searchText = ""
    @State private var feedURL = ""
    @State private var pendingRemoval: RssFeed?

    init(client: APIClient) {
        _store = State(initialValue: RssSubscriptionsStore(client: client))
    }

    private var filteredFeeds: [RssFeed] {
        let items = store.response?.items.filter { $0.status != .unsubscribed } ?? []
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return items }
        return items.filter {
            $0.title.localizedStandardContains(query)
                || $0.feedUrl.absoluteString.localizedStandardContains(query)
        }
    }

    var body: some View {
        Group {
            if store.isLoading && store.response == nil {
                ProgressView("Loading RSS feeds…")
            } else if let error = store.errorMessage, store.response == nil {
                ContentUnavailableView {
                    Label("RSS unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.reload() } }
                }
            } else {
                feedList
            }
        }
        .navigationTitle("RSS")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search feeds")
        .task { await store.reload() }
        .alert("RSS", isPresented: messageBinding) {
            Button("OK", role: .cancel) { store.dismissMessage() }
        } message: {
            Text(store.actionMessage ?? "Please try again.")
        }
        .confirmationDialog(
            "Remove \(pendingRemoval?.title ?? "this feed")?",
            isPresented: removalBinding,
            titleVisibility: .visible,
            presenting: pendingRemoval
        ) { feed in
            Button("Remove Feed", role: .destructive) { Task { await store.remove(feed) } }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("New articles will stop arriving. Existing bookmarks are kept.")
        }
    }

    private var feedList: some View {
        List {
            Section {
                HStack {
                    TextField("https://example.com/feed.xml", text: $feedURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityLabel("RSS feed URL")
                    if store.isAdding {
                        ProgressView()
                    } else {
                        Button("Add") {
                            Task {
                                if await store.add(url: feedURL) { feedURL = "" }
                            }
                        }
                        .disabled(feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            } header: {
                Text("Add a Feed")
            } footer: {
                Text("RSS connects directly—no external account is required.")
            }

            if filteredFeeds.isEmpty {
                Section {
                    ContentUnavailableView(
                        searchText.isEmpty ? "No RSS feeds" : "No matching feeds",
                        systemImage: searchText.isEmpty ? SubscriptionSource.rss.systemImage : "magnifyingglass",
                        description: Text(
                            searchText.isEmpty
                                ? "Paste a feed URL above to start syncing articles."
                                : "Try another title or URL."
                        )
                    )
                }
            } else {
                Section("Feeds") {
                    ForEach(filteredFeeds) { feed in feedRow(feed) }
                }
            }
        }
        .refreshable { await store.reload() }
    }

    private func feedRow(_ feed: RssFeed) -> some View {
        HStack(spacing: 12) {
            CachedRemoteImage(url: feed.imageUrl, targetSize: CGSize(width: 44, height: 44)) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .resizable()
                    .scaledToFit()
                    .padding(10)
                    .foregroundStyle(.tertiary)
            }
            .frame(width: 44, height: 44)
            .clipShape(.circle)

            VStack(alignment: .leading, spacing: 3) {
                Text(feed.title).lineLimit(2)
                Text(feed.status.title)
                    .font(.caption)
                    .foregroundStyle(feed.status == .active ? Color.secondary : Color.orange)
            }

            Spacer()
            if store.pendingFeedIDs.contains(feed.id) {
                ProgressView()
            } else {
                Menu {
                    Button { Task { await store.sync(feed) } } label: {
                        Label("Sync Now", systemImage: "arrow.clockwise")
                    }
                    if feed.status == .active {
                        Button { Task { await store.setPaused(feed, isPaused: true) } } label: {
                            Label("Pause", systemImage: "pause.circle")
                        }
                    } else {
                        Button { Task { await store.setPaused(feed, isPaused: false) } } label: {
                            Label("Resume", systemImage: "play.circle")
                        }
                    }
                    Button("Remove", systemImage: "trash", role: .destructive) {
                        pendingRemoval = feed
                    }
                } label: {
                    Image(systemName: "ellipsis.circle").font(.title3)
                }
            }
        }
        .padding(.vertical, 3)
    }

    private var messageBinding: Binding<Bool> {
        Binding(
            get: { store.actionMessage != nil },
            set: { if !$0 { store.dismissMessage() } }
        )
    }

    private var removalBinding: Binding<Bool> {
        Binding(
            get: { pendingRemoval != nil },
            set: { if !$0 { pendingRemoval = nil } }
        )
    }
}
