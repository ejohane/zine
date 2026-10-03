import SwiftUI

/// First-run RSS setup. A feed is selected as soon as the server saves it.
struct OnboardingRssSubscriptionsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store: RssSubscriptionsStore
    @State private var feedURL = ""
    @State private var hasLoaded = false
    @State private var pendingRemoval: RssFeed?
    @FocusState private var feedURLIsFocused: Bool

    init(client: APIClient) {
        _store = State(initialValue: RssSubscriptionsStore(client: client))
    }

    #if DEBUG
    init(client: RssSubscriptionsClient) {
        _store = State(initialValue: RssSubscriptionsStore(client: client))
    }
    #endif

    private var visibleFeeds: [RssFeed] {
        store.response?.items.filter { $0.status != .unsubscribed } ?? []
    }

    private var activeCount: Int {
        visibleFeeds.filter { $0.status == .active }.count
    }

    private var hasEnteredURL: Bool {
        !feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 9) {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(ZineTheme.primaryText)
                        .frame(width: 32, height: 32)
                        .background(ZineTheme.raised, in: .rect(cornerRadius: 9))
                        .accessibilityHidden(true)
                    Text("RSS")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                }

                Text("Add your feeds.")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .tracking(-1.1)
                    .foregroundStyle(ZineTheme.primaryText)
                    .padding(.top, 28)
                    .accessibilityAddTraits(.isHeader)

                Text("Fresh posts from your feeds appear in Inbox.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 13)

                Text("FEED URL")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(1.1)
                    .foregroundStyle(ZineTheme.tertiaryText)
                    .padding(.top, 36)
                    .padding(.horizontal, 2)

                HStack(spacing: 10) {
                    Image(systemName: "link")
                        .foregroundStyle(ZineTheme.secondaryText)
                        .accessibilityHidden(true)
                    TextField("Paste a feed URL", text: $feedURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .focused($feedURLIsFocused)
                        .onSubmit(addFeed)
                        .accessibilityIdentifier("onboarding-rss-url")
                }
                .font(.system(.subheadline, design: .rounded))
                .padding(.horizontal, 15)
                .frame(height: 50)
                .background(ZineTheme.raised, in: .rect(cornerRadius: 12))
                .padding(.top, 11)

                HStack(alignment: .firstTextBaseline) {
                    Text("YOUR FEEDS")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .tracking(1.1)
                        .foregroundStyle(ZineTheme.tertiaryText)
                    Spacer()
                    if !visibleFeeds.isEmpty {
                        Text("\(activeCount) added")
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(ZineTheme.secondaryText)
                            .accessibilityIdentifier("onboarding-rss-added-count")
                    }
                }
                .padding(.top, 30)
                .padding(.horizontal, 2)

                feedContent
                    .padding(.top, 13)
            }
            .frame(maxWidth: 440, alignment: .leading)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 25)
            .padding(.top, 25)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomAction }
        .background(ZineTheme.canvas.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.reload()
            hasLoaded = true
        }
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

    @ViewBuilder
    private var feedContent: some View {
        if !hasLoaded || (store.isLoading && store.response == nil) {
            ProgressView("Loading feeds…")
                .frame(maxWidth: .infinity, minHeight: 210)
        } else if let error = store.errorMessage, store.response == nil {
            VStack(spacing: 14) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 22))
                    .foregroundStyle(ZineTheme.secondaryText)
                Text("Couldn’t load your feeds.")
                    .foregroundStyle(ZineTheme.secondaryText)
                Button("Try again") { Task { await store.reload() } }
            }
            .font(.system(.subheadline, design: .rounded))
            .frame(maxWidth: .infinity, minHeight: 210)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
            }
            .accessibilityHint(error)
        } else if visibleFeeds.isEmpty {
            VStack(spacing: 15) {
                Image(systemName: "text.book.closed")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .frame(width: 54, height: 54)
                    .background(ZineTheme.raised, in: .rect(cornerRadius: 16))
                Text("Your feeds will appear here.")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
            }
            .frame(maxWidth: .infinity, minHeight: 210)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
            }
        } else {
            LazyVStack(spacing: 0) {
                ForEach(visibleFeeds) { feed in
                    feedRow(feed)
                    if feed.id != visibleFeeds.last?.id {
                        ZineTheme.border.opacity(0.5)
                            .frame(height: 1)
                            .padding(.leading, 65)
                    }
                }
            }
            .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
            }
        }
    }

    private func feedRow(_ feed: RssFeed) -> some View {
        Button {
            switch feed.status {
            case .active:
                pendingRemoval = feed
            case .paused:
                Task { await store.setPaused(feed, isPaused: false) }
            case .error:
                Task { await store.sync(feed) }
            case .unsubscribed:
                break
            }
        } label: {
            HStack(spacing: 12) {
                CachedRemoteImage(url: feed.imageUrl, targetSize: CGSize(width: 40, height: 40)) {
                    Image(systemName: feed.feedType == "PODCAST" ? "waveform" : "text.alignleft")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .frame(width: 40, height: 40)
                        .background(ZineTheme.raised)
                }
                .frame(width: 40, height: 40)
                .clipShape(.circle)

                VStack(alignment: .leading, spacing: 3) {
                    Text(feed.title)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                        .lineLimit(1)
                    Text(feed.feedUrl.host ?? feed.feedUrl.absoluteString)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Group {
                    if store.pendingFeedIDs.contains(feed.id) {
                        ProgressView().controlSize(.small)
                    } else if feed.status == .active {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(ZineTheme.onAccent)
                            .frame(width: 28, height: 28)
                            .background(ZineTheme.brandAccent, in: .circle)
                    } else {
                        Image(systemName: feed.status == .paused ? "play.fill" : "arrow.clockwise")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(ZineTheme.secondaryText)
                            .frame(width: 28, height: 28)
                            .overlay { Circle().strokeBorder(ZineTheme.border, lineWidth: 1.5) }
                    }
                }
                .frame(width: 28, height: 28)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 66)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(store.pendingFeedIDs.contains(feed.id))
        .accessibilityLabel({
            switch feed.status {
            case .active: "Remove \(feed.title)"
            case .paused: "Resume \(feed.title)"
            case .error: "Retry \(feed.title)"
            case .unsubscribed: feed.title
            }
        }())
        .accessibilityValue(feed.status == .active ? "Added" : feed.status.title)
        .accessibilityIdentifier("onboarding-rss-feed-\(feed.id)")
    }

    private var bottomAction: some View {
        Button {
            if hasEnteredURL {
                addFeed()
            } else {
                dismiss()
            }
        } label: {
            HStack(spacing: 9) {
                if store.isAdding { ProgressView().tint(ZineTheme.onAccent) }
                Text(hasEnteredURL || activeCount == 0 ? "Add feed" : "Done")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .foregroundStyle(ZineTheme.onAccent)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .background(ZineTheme.brandAccent, in: .rect(cornerRadius: 14))
        .buttonStyle(.plain)
        .disabled(!hasLoaded || store.isAdding || !store.pendingFeedIDs.isEmpty
                  || (!hasEnteredURL && activeCount == 0))
        .opacity(!hasLoaded || store.isAdding || !store.pendingFeedIDs.isEmpty
                 || (!hasEnteredURL && activeCount == 0) ? 0.55 : 1)
        .accessibilityIdentifier(hasEnteredURL || activeCount == 0 ? "onboarding-rss-add" : "onboarding-rss-done")
        .frame(maxWidth: 440)
        .padding(.horizontal, 25)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(ZineTheme.canvas)
    }

    private func addFeed() {
        guard hasEnteredURL, !store.isAdding else { return }
        let url = feedURL
        feedURLIsFocused = false
        Task {
            if await store.add(url: url) {
                feedURL = ""
            }
        }
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
