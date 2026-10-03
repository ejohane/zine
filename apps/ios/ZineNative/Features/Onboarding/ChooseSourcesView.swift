import SwiftUI

/// The first screen after a new account is created. Source details own OAuth,
/// channel selection, and feed management; this screen reflects their saved state.
struct ChooseSourcesView: View {
    let client: APIClient
    let configuration: AppConfiguration
    let onContinue: () -> Void
    private let loadSources: () async throws -> SubscriptionsHubResponse

    @State private var path: [SubscriptionSource] = []
    @State private var summaries: [SubscriptionSource: SubscriptionSourceSummary] = [:]
    @State private var hasLoaded = false
    @State private var isLoading = false
    @State private var loadError: String?

    init(
        client: APIClient,
        configuration: AppConfiguration = .current,
        onContinue: @escaping () -> Void
    ) {
        self.client = client
        self.configuration = configuration
        self.onContinue = onContinue
        loadSources = client.listSubscriptionSources
    }

    #if DEBUG
    init(
        client: APIClient,
        configuration: AppConfiguration = .current,
        loadSources: @escaping () async throws -> SubscriptionsHubResponse,
        onContinue: @escaping () -> Void
    ) {
        self.client = client
        self.configuration = configuration
        self.onContinue = onContinue
        self.loadSources = loadSources
    }
    #endif

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Choose your sources.")
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                        .tracking(-1.1)
                        .foregroundStyle(ZineTheme.primaryText)
                        .accessibilityAddTraits(.isHeader)

                    Text("Sources are places you follow. Add them to fill your Zine.")
                        .font(.system(.body, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 9)

                    if let loadError {
                        HStack(spacing: 8) {
                            Image(systemName: "wifi.exclamationmark")
                            Text("Source status is unavailable.")
                            Spacer(minLength: 4)
                            Button("Retry") { Task { await reload() } }
                        }
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .padding(.top, 22)
                        .accessibilityLabel("Source status is unavailable. Retry.")
                        .accessibilityHint(loadError)
                    }

                    sourceList
                        .padding(.top, loadError == nil ? 37 : 19)
                }
                .frame(maxWidth: 440, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 25)
                .padding(.top, 42)
                .padding(.bottom, 24)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button(action: onContinue) {
                    Text("Continue to Home")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.onAccent)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                }
                .background(ZineTheme.brandAccent, in: .rect(cornerRadius: 14))
                .buttonStyle(.plain)
                .accessibilityIdentifier("onboarding-continue-home")
                .frame(maxWidth: 440)
                .padding(.horizontal, 25)
                .padding(.top, 12)
                .padding(.bottom, 10)
                .frame(maxWidth: .infinity)
                .background(ZineTheme.canvas)
            }
            .background(ZineTheme.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: SubscriptionSource.self) { source in
                destination(for: source)
                    .toolbar(.visible, for: .navigationBar)
            }
            .task { await reload() }
            .onChange(of: path) { _, newPath in
                if newPath.isEmpty { Task { await reload() } }
            }
        }
        .tint(ZineTheme.brandAccent)
    }

    private var sourceList: some View {
        VStack(spacing: 0) {
            ForEach(SubscriptionSource.allCases) { source in
                NavigationLink(value: source) {
                    sourceRow(source)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(rowAccessibilityLabel(for: source))
                .accessibilityHint(sourceHint(for: source))
                .accessibilityIdentifier("onboarding-source-\(source.pathComponent)")

                if source != SubscriptionSource.allCases.last {
                    Rectangle()
                        .fill(ZineTheme.border.opacity(0.45))
                        .frame(height: 1)
                        .padding(.leading, 62)
                }
            }
        }
        .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
        }
    }

    private func sourceRow(_ source: SubscriptionSource) -> some View {
        HStack(spacing: 12) {
            sourceMark(for: source)

            Text(sourceName(for: source))
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(ZineTheme.primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)

            sourceState(for: source)
                .frame(width: 28, height: 28)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 64)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func sourceMark(for source: SubscriptionSource) -> some View {
        switch source {
        case .youtube:
            brandMark("YouTubeLogo", background: Color(red: 1, green: 0, blue: 0.2))
        case .spotify:
            brandMark("SpotifyLogo", background: Color(red: 0.114, green: 0.725, blue: 0.329))
        case .gmail:
            Image("GoogleG")
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
                .frame(width: 36, height: 36)
                .background(ZineTheme.surface, in: .rect(cornerRadius: 10))
                .overlay {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(ZineTheme.border.opacity(0.55), lineWidth: 1)
                }
        case .x:
            brandMark("XLogo", background: .black)
        case .rss:
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(ZineTheme.primaryText)
                .frame(width: 36, height: 36)
                .background(ZineTheme.raised, in: .rect(cornerRadius: 10))
        }
    }

    private func brandMark(_ name: String, background: Color) -> some View {
        Image(name)
            .resizable()
            .scaledToFit()
            .frame(width: 21, height: 21)
            .frame(width: 36, height: 36)
            .background(background, in: .rect(cornerRadius: 10))
    }

    @ViewBuilder
    private func sourceState(for source: SubscriptionSource) -> some View {
        if isLoading && !hasLoaded {
            ProgressView()
                .controlSize(.mini)
        } else if summaries[source]?.isReadyForOnboarding == true {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(ZineTheme.onAccent)
                .frame(width: 26, height: 26)
                .background(ZineTheme.brandAccent, in: .circle)
        } else {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(ZineTheme.secondaryText)
                .frame(width: 26, height: 26)
                .overlay {
                    Circle().strokeBorder(ZineTheme.border, lineWidth: 1.5)
                }
        }
    }

    private func sourceName(for source: SubscriptionSource) -> String {
        switch source {
        case .gmail: "Gmail newsletters"
        case .x: "X bookmarks"
        case .rss: "RSS feeds"
        default: source.title
        }
    }

    private func rowAccessibilityLabel(for source: SubscriptionSource) -> String {
        let name = sourceName(for: source)
        if isLoading && !hasLoaded { return "\(name), loading status" }
        return summaries[source]?.isReadyForOnboarding == true
            ? "\(name), added"
            : "Add \(name)"
    }

    private func sourceHint(for source: SubscriptionSource) -> String {
        switch source {
        case .youtube: "Choose which channels appear in Zine."
        case .spotify: "Choose which shows appear in Zine."
        case .gmail: "Choose which newsletters appear in Zine."
        default: "Opens source setup."
        }
    }

    @ViewBuilder
    private func destination(for source: SubscriptionSource) -> some View {
        switch source.destination {
        case .providerSubscriptions:
            OnboardingProviderSubscriptionsView(
                provider: source,
                client: client,
                configuration: configuration
            )
        case .newsletters:
            OnboardingNewsletterSubscriptionsView(client: client, configuration: configuration)
        case .xBookmarks:
            OnboardingXBookmarksView(client: client, configuration: configuration)
        case .rssFeeds:
            OnboardingRssSubscriptionsView(client: client)
        }
    }

    private func reload() async {
        isLoading = true
        defer {
            hasLoaded = true
            isLoading = false
        }

        do {
            let response = try await loadSources()
            guard !Task.isCancelled else { return }
            summaries = Dictionary(uniqueKeysWithValues: response.sources.map { ($0.provider, $0) })
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            loadError = error.localizedDescription
        }
    }
}

extension SubscriptionSourceSummary {
    /// Content sources with a picker are ready after an explicit saved selection.
    var isReadyForOnboarding: Bool {
        switch provider {
        case .youtube, .spotify, .gmail:
            isConnected && activeCount > 0
        case .x:
            isConnected
        case .rss:
            activeCount > 0
        }
    }
}
