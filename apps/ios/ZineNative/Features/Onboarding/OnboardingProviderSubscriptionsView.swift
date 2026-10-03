import SwiftUI

/// A focused first-run path for choosing what a connected provider brings into Zine.
/// The regular provider screen in Settings keeps its account-management controls.
struct OnboardingProviderSubscriptionsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store: ProviderSubscriptionsStore
    @State private var searchText = ""
    @State private var hasLoaded = false
    @State private var pendingRemoval: ProviderSubscriptionItem?

    private let provider: SubscriptionSource

    init(
        provider: SubscriptionSource,
        client: APIClient,
        configuration: AppConfiguration = .current
    ) {
        self.provider = provider
        _store = State(initialValue: ProviderSubscriptionsStore(
            provider: provider,
            client: .live(provider: provider, apiClient: client, configuration: configuration)
        ))
    }

    #if DEBUG
    init(provider: SubscriptionSource, client: ProviderSubscriptionsClient) {
        self.provider = provider
        _store = State(initialValue: ProviderSubscriptionsStore(provider: provider, client: client))
    }
    #endif

    private var isConnected: Bool {
        !store.connectionRequired && store.connection?.isActive == true
    }

    private var addedCount: Int {
        store.items.filter(\.isSubscribed).count
    }

    private var filteredItems: [ProviderSubscriptionItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return store.items }
        return store.items.filter { $0.name.localizedStandardContains(query) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                providerMark

                Text(provider == .youtube ? "Choose your subscriptions." : "Choose your shows.")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .tracking(-1.1)
                    .foregroundStyle(ZineTheme.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 28)
                    .accessibilityAddTraits(.isHeader)

                Text(provider == .youtube
                     ? "Videos from your picks appear in Inbox."
                     : "Episodes from your picks appear in Inbox.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 13)

                if !hasLoaded || (store.isLoading && store.items.isEmpty) {
                    ProgressView("Loading subscriptions…")
                        .frame(maxWidth: .infinity, minHeight: 220)
                        .padding(.top, 34)
                } else if let error = store.errorMessage, store.items.isEmpty {
                    messageCard(
                        symbol: "wifi.exclamationmark",
                        message: "Couldn’t load \(provider.providerTitle).",
                        action: "Try again"
                    ) { Task { await store.reload() } }
                    .accessibilityHint(error)
                    .padding(.top, 36)
                } else if !isConnected {
                    sectionHeading
                        .padding(.top, 42)
                    messageCard(
                        symbol: "list.bullet",
                        message: "Connect \(provider.providerTitle) to see your \(itemPlural)."
                    )
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
        .alert("Couldn’t update \(provider.providerTitle)", isPresented: actionErrorBinding) {
            Button("OK", role: .cancel) { store.dismissActionError() }
        } message: {
            Text(store.actionErrorMessage ?? "Please try again.")
        }
        .confirmationDialog(
            "Remove \(pendingRemoval?.name ?? "this subscription")?",
            isPresented: removalBinding,
            titleVisibility: .visible,
            presenting: pendingRemoval
        ) { item in
            Button("Remove Subscription", role: .destructive) {
                Task { await store.remove(item) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("New items will stop arriving. Existing inbox items are removed; bookmarks are kept.")
        }
    }

    private var itemPlural: String {
        provider == .youtube ? "subscriptions" : "shows"
    }

    private var providerMark: some View {
        HStack(spacing: 9) {
            Image(provider == .youtube ? "YouTubeLogo" : "SpotifyLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
                .frame(width: 32, height: 32)
                .background(providerColor, in: .rect(cornerRadius: 9))
                .accessibilityHidden(true)
            Text(provider.providerTitle)
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(ZineTheme.primaryText)
        }
    }

    private var providerColor: Color {
        provider == .youtube
            ? Color(red: 1, green: 0, blue: 0.2)
            : Color(red: 0.114, green: 0.725, blue: 0.329)
    }

    private var connectedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(ZineTheme.secondaryText)
                TextField("Search \(itemPlural)", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("onboarding-subscriptions-search")
            }
            .font(.system(.subheadline, design: .rounded))
            .padding(.horizontal, 15)
            .frame(height: 46)
            .background(ZineTheme.raised, in: .rect(cornerRadius: 12))
            .padding(.top, 27)

            sectionHeading
                .padding(.top, 26)

            if filteredItems.isEmpty {
                messageCard(
                    symbol: searchText.isEmpty ? "list.bullet" : "magnifyingglass",
                    message: searchText.isEmpty
                        ? "No \(itemPlural) are available yet."
                        : "No matching \(itemPlural)."
                )
                .padding(.top, 13)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredItems) { item in
                        subscriptionRow(item)
                        if item.id != filteredItems.last?.id {
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
            Text("YOUR \(itemPlural.uppercased())")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .tracking(1.1)
                .foregroundStyle(ZineTheme.tertiaryText)
            Spacer()
            if isConnected {
                Text("\(addedCount) added")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .accessibilityIdentifier("onboarding-subscriptions-added-count")
            }
        }
        .padding(.horizontal, 2)
    }

    private func subscriptionRow(_ item: ProviderSubscriptionItem) -> some View {
        Button {
            if item.isSubscribed {
                pendingRemoval = item
            } else {
                Task { await store.add(item) }
            }
        } label: {
            HStack(spacing: 12) {
                CachedRemoteImage(url: item.imageUrl, targetSize: CGSize(width: 40, height: 40)) {
                    Text(String(item.name.prefix(1)).uppercased())
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .frame(width: 40, height: 40)
                        .background(ZineTheme.raised)
                }
                .frame(width: 40, height: 40)
                .clipShape(.circle)

                Text(item.name)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(ZineTheme.primaryText)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Group {
                    if store.pendingItemIDs.contains(item.channelId) {
                        ProgressView().controlSize(.small)
                    } else if item.isSubscribed {
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
        .disabled(store.pendingItemIDs.contains(item.channelId))
        .accessibilityLabel(item.isSubscribed ? "Remove \(item.name)" : "Add \(item.name)")
        .accessibilityValue(item.isSubscribed ? "Added" : "Not added")
        .accessibilityIdentifier("onboarding-subscription-\(item.channelId)")
    }

    private func messageCard(
        symbol: String,
        message: String,
        action: String? = nil,
        onAction: (() -> Void)? = nil
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

            if let action, let onAction {
                Button(action, action: onAction)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 210)
        .padding(20)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
        }
    }

    private var bottomAction: some View {
        Button {
            if isConnected {
                dismiss()
            } else {
                Task { await store.connect() }
            }
        } label: {
            HStack(spacing: 10) {
                if store.isUpdatingConnection {
                    ProgressView().tint(.white)
                } else if !isConnected {
                    Image(provider == .youtube ? "YouTubeLogo" : "SpotifyLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 19, height: 19)
                        .accessibilityHidden(true)
                }
                Text(isConnected
                     ? "Done"
                     : (store.connection?.needsAttention == true
                        ? "Reconnect \(provider.providerTitle)"
                        : "Connect \(provider.providerTitle)"))
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .foregroundStyle(isConnected ? ZineTheme.onAccent : .white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .background(isConnected ? ZineTheme.brandAccent : providerColor,
                    in: .rect(cornerRadius: 14))
        .buttonStyle(.plain)
        .disabled(!hasLoaded || store.isUpdatingConnection || !store.pendingItemIDs.isEmpty
                  || (isConnected && addedCount == 0))
        .opacity(!hasLoaded || store.isUpdatingConnection || !store.pendingItemIDs.isEmpty
                 || (isConnected && addedCount == 0) ? 0.55 : 1)
        .accessibilityIdentifier(isConnected
            ? "onboarding-subscriptions-done"
            : "onboarding-provider-connect")
        .frame(maxWidth: 440)
        .padding(.horizontal, 25)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(ZineTheme.canvas)
    }

    private var actionErrorBinding: Binding<Bool> {
        Binding(
            get: { store.actionErrorMessage != nil },
            set: { if !$0 { store.dismissActionError() } }
        )
    }

    private var removalBinding: Binding<Bool> {
        Binding(
            get: { pendingRemoval != nil },
            set: { if !$0 { pendingRemoval = nil } }
        )
    }
}
