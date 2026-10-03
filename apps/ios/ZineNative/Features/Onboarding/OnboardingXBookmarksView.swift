import SwiftUI

/// First-run X setup imports saved posts; there is no per-bookmark picker.
struct OnboardingXBookmarksView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store: XSubscriptionsStore
    @State private var hasLoaded = false

    init(client: APIClient, configuration: AppConfiguration = .current) {
        _store = State(initialValue: XSubscriptionsStore(client: client, configuration: configuration))
    }

    #if DEBUG
    init(client: XSubscriptionsClient) {
        _store = State(initialValue: XSubscriptionsStore(client: client))
    }
    #endif

    private var isConnected: Bool { store.response?.connection?.isActive == true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 9) {
                    Image("XLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 17, height: 17)
                        .frame(width: 32, height: 32)
                        .background(.black, in: .rect(cornerRadius: 9))
                        .overlay {
                            RoundedRectangle(cornerRadius: 9)
                                .strokeBorder(ZineTheme.border.opacity(0.55), lineWidth: 1)
                        }
                        .accessibilityHidden(true)
                    Text("X")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                }

                Text("Bring in your bookmarks.")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .tracking(-1.1)
                    .foregroundStyle(ZineTheme.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 28)
                    .accessibilityAddTraits(.isHeader)

                Text("Posts you save on X appear in Library.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 13)

                Text("YOUR BOOKMARKS")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(1.1)
                    .foregroundStyle(ZineTheme.tertiaryText)
                    .padding(.top, 42)
                    .padding(.horizontal, 2)

                content
                    .padding(.top, 13)
            }
            .frame(maxWidth: 440, alignment: .leading)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 25)
            .padding(.top, 25)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomAction }
        .background(ZineTheme.canvas.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.reload()
            hasLoaded = true
        }
        .alert("Couldn’t update X bookmarks", isPresented: messageBinding) {
            Button("OK", role: .cancel) { store.dismissMessage() }
        } message: {
            Text(store.actionMessage ?? "Please try again.")
        }
    }

    @ViewBuilder
    private var content: some View {
        if !hasLoaded || (store.isLoading && store.response == nil) {
            ProgressView("Loading X bookmarks…")
                .frame(maxWidth: .infinity, minHeight: 210)
        } else if let error = store.errorMessage, store.response == nil {
            messageCard("Couldn’t load X bookmarks.", symbol: "wifi.exclamationmark") {
                Task { await store.reload() }
            }
            .accessibilityHint(error)
        } else if !isConnected {
            messageCard("Connect X to bring saved posts into Library.", symbol: "bookmark")
        } else {
            HStack(spacing: 12) {
                Image(systemName: "bookmark.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .frame(width: 40, height: 40)
                    .background(ZineTheme.raised, in: .circle)

                VStack(alignment: .leading, spacing: 3) {
                    Text("X bookmarks")
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                    Text(importedLabel)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(ZineTheme.onAccent)
                    .frame(width: 28, height: 28)
                    .background(ZineTheme.brandAccent, in: .circle)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 66)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(ZineTheme.border.opacity(0.75), lineWidth: 1)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("X bookmarks connected. \(importedLabel)")
            .accessibilityIdentifier("onboarding-x-connected")
        }
    }

    private var importedLabel: String {
        let count = store.response?.importedCount ?? 0
        return count == 0 ? "Saved posts will appear in Library"
            : "\(count) \(count == 1 ? "bookmark" : "bookmarks") imported"
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
                    Image("XLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 17, height: 17)
                        .accessibilityHidden(true)
                }
                Text(isConnected ? "Done"
                     : (store.response?.connection?.needsAttention == true ? "Reconnect X" : "Connect X"))
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .foregroundStyle(isConnected ? ZineTheme.onAccent : .white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
        }
        .background(isConnected ? ZineTheme.brandAccent : .black,
                    in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(isConnected ? ZineTheme.brandAccent : ZineTheme.border, lineWidth: 1)
        }
        .buttonStyle(.plain)
        .disabled(!hasLoaded || store.isUpdatingConnection)
        .opacity(!hasLoaded || store.isUpdatingConnection ? 0.55 : 1)
        .accessibilityIdentifier(isConnected ? "onboarding-x-done" : "onboarding-x-connect")
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
