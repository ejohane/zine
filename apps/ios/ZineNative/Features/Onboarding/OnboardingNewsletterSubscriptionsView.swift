import SwiftUI

/// First-run Gmail setup. Newly discovered feeds start unselected on the server.
struct OnboardingNewsletterSubscriptionsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store: NewsletterSubscriptionsStore
    @State private var searchText = ""
    @State private var hasLoaded = false

    init(client: APIClient, configuration: AppConfiguration = .current) {
        _store = State(initialValue: NewsletterSubscriptionsStore(
            client: client, configuration: configuration
        ))
    }

    #if DEBUG
    init(client: NewsletterSubscriptionsClient) {
        _store = State(initialValue: NewsletterSubscriptionsStore(client: client))
    }
    #endif

    private var isConnected: Bool { store.response?.connection?.isActive == true }
    private var feeds: [NewsletterFeed] { store.response?.items ?? [] }
    private var addedCount: Int { feeds.filter { $0.status == .active }.count }

    private var filteredFeeds: [NewsletterFeed] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return feeds }
        return feeds.filter {
            $0.displayName.localizedStandardContains(query)
                || ($0.fromAddress?.localizedStandardContains(query) == true)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 9) {
                    Image("GoogleG")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 20, height: 20)
                        .frame(width: 32, height: 32)
                        .background(ZineTheme.surface, in: .rect(cornerRadius: 9))
                        .overlay {
                            RoundedRectangle(cornerRadius: 9)
                                .strokeBorder(ZineTheme.border.opacity(0.55), lineWidth: 1)
                        }
                        .accessibilityHidden(true)
                    Text("Gmail")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                }

                Text("Choose your newsletters.")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .tracking(-1.1)
                    .foregroundStyle(ZineTheme.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 28)
                    .accessibilityAddTraits(.isHeader)

                Text("New issues from your picks appear in Inbox.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 13)

                if !hasLoaded || (store.isLoading && store.response == nil) {
                    ProgressView("Loading newsletters…")
                        .frame(maxWidth: .infinity, minHeight: 220)
                        .padding(.top, 34)
                } else if let error = store.errorMessage, store.response == nil {
                    messageCard("Couldn’t load Gmail.", symbol: "wifi.exclamationmark") {
                        Task { await store.reload() }
                    }
                    .accessibilityHint(error)
                    .padding(.top, 36)
                } else if !isConnected {
                    sectionHeading
                        .padding(.top, 42)
                    messageCard("Connect Gmail to find your newsletters.", symbol: "envelope")
                        .padding(.top, 13)
                } else {
                    connectedContent
                }
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
        .alert("Couldn’t update Gmail", isPresented: messageBinding) {
            Button("OK", role: .cancel) { store.dismissMessage() }
        } message: {
            Text(store.actionMessage ?? "Please try again.")
        }
    }

    private var connectedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !feeds.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(ZineTheme.secondaryText)
                        .accessibilityHidden(true)
                    TextField("Search newsletters", text: $searchText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("onboarding-newsletters-search")
                }
                .font(.system(.subheadline, design: .rounded))
                .padding(.horizontal, 15)
                .frame(height: 46)
                .background(ZineTheme.raised, in: .rect(cornerRadius: 12))
                .padding(.top, 27)
            }

            sectionHeading
                .padding(.top, feeds.isEmpty ? 42 : 26)

            if filteredFeeds.isEmpty {
                messageCard(
                    feeds.isEmpty ? "No newsletters found yet." : "No matching newsletters.",
                    symbol: feeds.isEmpty ? "envelope" : "magnifyingglass"
                )
                .padding(.top, 13)
                if feeds.isEmpty {
                    Text("Find newsletters to see what you can add.")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .padding(.top, 14)
                }
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredFeeds) { feed in
                        newsletterRow(feed)
                        if feed.id != filteredFeeds.last?.id {
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
                .padding(.top, 13)
            }
        }
    }

    private var sectionHeading: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("YOUR NEWSLETTERS")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .tracking(1.1)
                .foregroundStyle(ZineTheme.tertiaryText)
            Spacer()
            if isConnected && !feeds.isEmpty {
                Text("\(addedCount) added")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .accessibilityIdentifier("onboarding-newsletters-added-count")
            }
        }
        .padding(.horizontal, 2)
    }

    private func newsletterRow(_ feed: NewsletterFeed) -> some View {
        let isAdded = feed.status == .active
        return Button {
            Task { await store.setActive(feed, isActive: !isAdded) }
        } label: {
            HStack(spacing: 12) {
                CachedRemoteImage(url: feed.imageUrl, targetSize: CGSize(width: 40, height: 40)) {
                    Image(systemName: "envelope")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .frame(width: 40, height: 40)
                        .background(ZineTheme.raised)
                }
                .frame(width: 40, height: 40)
                .clipShape(.circle)

                VStack(alignment: .leading, spacing: 3) {
                    Text(feed.displayName)
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                        .lineLimit(1)
                    Text(feed.fromAddress ?? "Newsletter")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Group {
                    if store.pendingFeedIDs.contains(feed.id) {
                        ProgressView().controlSize(.small)
                    } else if isAdded {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(ZineTheme.onAccent)
                            .frame(width: 28, height: 28)
                            .background(ZineTheme.brandAccent, in: .circle)
                    } else {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .medium))
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
        .accessibilityLabel(isAdded ? "Hide \(feed.displayName)" : "Add \(feed.displayName)")
        .accessibilityValue(isAdded ? "Added" : "Not added")
        .accessibilityIdentifier("onboarding-newsletter-\(feed.id)")
    }

    private func messageCard(
        _ message: String,
        symbol: String,
        retry: (() -> Void)? = nil
    ) -> some View {
        VStack(spacing: 15) {
            Image(systemName: symbol)
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(ZineTheme.secondaryText)
                .frame(width: 54, height: 54)
                .background(ZineTheme.raised, in: .rect(cornerRadius: 16))
            Text(message)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(ZineTheme.secondaryText)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
            }
        }
        .frame(maxWidth: .infinity, minHeight: 210)
        .padding(20)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
        }
    }

    private var bottomAction: some View {
        Button {
            if !isConnected {
                Task { await store.connect() }
            } else if feeds.isEmpty {
                Task { await store.sync() }
            } else {
                dismiss()
            }
        } label: {
            HStack(spacing: 10) {
                if store.isUpdatingConnection || store.isSyncing {
                    ProgressView().tint(isConnected ? ZineTheme.onAccent : ZineTheme.primaryText)
                } else if !isConnected {
                    Image("GoogleG")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 19, height: 19)
                        .accessibilityHidden(true)
                }
                Text(!isConnected
                     ? (store.response?.connection?.needsAttention == true ? "Reconnect Gmail" : "Connect Gmail")
                     : (feeds.isEmpty ? "Find newsletters" : "Done"))
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .foregroundStyle(isConnected ? ZineTheme.onAccent : ZineTheme.primaryText)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .background(isConnected ? ZineTheme.brandAccent : ZineTheme.surface,
                    in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(isConnected ? ZineTheme.brandAccent : ZineTheme.border, lineWidth: 1)
        }
        .buttonStyle(.plain)
        .disabled(!hasLoaded || store.isUpdatingConnection || store.isSyncing
                  || !store.pendingFeedIDs.isEmpty || (isConnected && !feeds.isEmpty && addedCount == 0))
        .opacity(!hasLoaded || store.isUpdatingConnection || store.isSyncing
                 || !store.pendingFeedIDs.isEmpty || (isConnected && !feeds.isEmpty && addedCount == 0)
                 ? 0.55 : 1)
        .accessibilityIdentifier(!isConnected ? "onboarding-gmail-connect"
            : (feeds.isEmpty ? "onboarding-newsletters-find" : "onboarding-newsletters-done"))
        .frame(maxWidth: 440)
        .padding(.horizontal, 25)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(ZineTheme.canvas)
    }

    private var messageBinding: Binding<Bool> {
        Binding(
            get: { store.actionMessage != nil },
            set: { if !$0 { store.dismissMessage() } }
        )
    }
}
