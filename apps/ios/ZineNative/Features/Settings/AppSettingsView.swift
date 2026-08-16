import ClerkKit
import ClerkKitUI
import Observation
import SwiftUI

enum SettingsRoute: CaseIterable, Hashable {
    case sources
    case appearance
}

@MainActor
@Observable
final class SettingsStore {
    var isSignOutConfirmationPresented = false
    private(set) var isSigningOut = false
    private(set) var signOutError: String?

    func requestSignOut() {
        isSignOutConfirmationPresented = true
    }

    func cancelSignOut() {
        isSignOutConfirmationPresented = false
    }

    func signOut(using action: () async throws -> Void) async {
        isSignOutConfirmationPresented = false
        isSigningOut = true
        signOutError = nil
        defer { isSigningOut = false }

        do {
            try await action()
        } catch is CancellationError {
            return
        } catch {
            signOutError = error.localizedDescription
        }
    }

    func dismissSignOutError() {
        signOutError = nil
    }
}

struct AppSettingsView: View {
    let client: APIClient

    @Environment(Clerk.self) private var clerk
    @Environment(\.zineTabNavigationActions) private var navigation
    @State private var store = SettingsStore()

    var body: some View {
        Group {
            if clerk.session?.tasks?.isEmpty == false {
                AuthView(isDismissible: false)
            } else {
                settingsContent
            }
        }
        .zineScreenChrome()
        .confirmationDialog(
            "Sign out of Zine?",
            isPresented: $store.isSignOutConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Sign Out", role: .destructive) {
                Task {
                    await store.signOut {
                        try await clerk.auth.signOut()
                    }
                }
            }
            Button("Cancel", role: .cancel) {
                store.cancelSignOut()
            }
        } message: {
            Text("You’ll need to sign in again to sync your library and sources on this device.")
        }
        .alert("Couldn’t sign out", isPresented: signOutErrorBinding) {
            Button("OK", role: .cancel) { store.dismissSignOutError() }
        } message: {
            Text(store.signOutError ?? "Please try again.")
        }
    }

    private var settingsContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                settingsHeader
                accountCard

                VStack(alignment: .leading, spacing: 12) {
                    settingsSectionTitle("Your Zine")
                    sourcesCard
                    appearanceCard
                }

                VStack(alignment: .leading, spacing: 12) {
                    settingsSectionTitle("Account")
                    signOutButton
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 36)
        }
        .background(ZineTheme.canvas)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var settingsHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("MAKE IT YOURS")
                .font(.system(.caption, design: .rounded, weight: .bold))
                .tracking(1.4)
                .foregroundStyle(ZineTheme.brandAccent)

            Text("Your reading,\nyour sources.")
                .font(.system(size: 38, weight: .bold, design: .rounded))
                .foregroundStyle(ZineTheme.primaryText)
                .fixedSize(horizontal: false, vertical: true)

            Text("Shape what arrives in Zine and how the app feels on this device.")
                .font(.system(.body, design: .rounded))
                .foregroundStyle(ZineTheme.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var accountCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(ZineTheme.raised)
                Text(accountInitials)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(ZineTheme.primaryText)
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 3) {
                Text(accountName)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(ZineTheme.primaryText)
                Text(accountDetail)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "checkmark.seal.fill")
                .font(.title3)
                .foregroundStyle(ZineTheme.brandAccent)
                .accessibilityLabel("Signed in")
        }
        .padding(18)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(ZineTheme.border.opacity(0.7), lineWidth: 1)
        }
    }

    private var sourcesCard: some View {
        Group {
            if let navigate = navigation.settings {
                Button {
                    navigate(.sources)
                } label: {
                    sourcesCardLabel
                }
            } else {
                NavigationLink(value: SettingsRoute.sources) {
                    sourcesCardLabel
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("settings-sources")
    }

    private var sourcesCardLabel: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                SettingsIconTile(systemImage: "dot.radiowaves.up.forward", isPrimary: true)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(ZineTheme.brandAccent)
            }

            VStack(alignment: .leading, spacing: 7) {
                Text("Sources")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(ZineTheme.primaryText)
                Text("Connect the places you follow and decide what flows into your Inbox and Library.")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                sourceChip("play.rectangle.fill")
                sourceChip("waveform.circle.fill")
                sourceChip("envelope.fill")
                sourceChip("bookmark.square.fill")
                sourceChip("dot.radiowaves.left.and.right")
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(ZineTheme.border.opacity(0.75), lineWidth: 1)
        }
    }

    private var appearanceCard: some View {
        Group {
            if let navigate = navigation.settings {
                Button {
                    navigate(.appearance)
                } label: {
                    appearanceCardLabel
                }
            } else {
                NavigationLink(value: SettingsRoute.appearance) {
                    appearanceCardLabel
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("settings-appearance")
    }

    private var appearanceCardLabel: some View {
        HStack(spacing: 14) {
            SettingsIconTile(systemImage: "circle.lefthalf.filled", isPrimary: false)

            VStack(alignment: .leading, spacing: 4) {
                Text("Appearance")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(ZineTheme.primaryText)
                Text("System, light, or dark")
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
            }

            Spacer()
            Image(systemName: "chevron.right")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZineTheme.tertiaryText)
        }
        .padding(16)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(ZineTheme.border.opacity(0.65), lineWidth: 1)
        }
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            store.requestSignOut()
        } label: {
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text(store.isSigningOut ? "Signing Out…" : "Sign Out")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                Spacer()
            }
            .padding(17)
            .frame(maxWidth: .infinity)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.red.opacity(0.34), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.red)
        .disabled(store.isSigningOut)
        .accessibilityIdentifier("settings-sign-out")
    }

    private func settingsSectionTitle(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(.caption2, design: .rounded, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(ZineTheme.tertiaryText)
            .padding(.leading, 3)
    }

    private func sourceChip(_ systemImage: String) -> some View {
        Image(systemName: systemImage)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(ZineTheme.primaryText)
            .frame(width: 34, height: 30)
            .background(ZineTheme.raised, in: .rect(cornerRadius: 9))
    }

    private var accountName: String {
        let components = [clerk.user?.firstName, clerk.user?.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return components.isEmpty ? "Zine Reader" : components.joined(separator: " ")
    }

    private var accountDetail: String {
        clerk.user?.primaryEmailAddress?.emailAddress ?? "Signed in to Zine"
    }

    private var accountInitials: String {
        let initials = accountName.split(separator: " ").prefix(2).compactMap(\.first)
        return initials.isEmpty ? "Z" : String(initials)
    }

    private var signOutErrorBinding: Binding<Bool> {
        Binding(
            get: { store.signOutError != nil },
            set: { if !$0 { store.dismissSignOutError() } }
        )
    }
}

private struct SettingsIconTile: View {
    let systemImage: String
    let isPrimary: Bool

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: isPrimary ? 23 : 18, weight: .bold))
            .foregroundStyle(isPrimary ? ZineTheme.onAccent : ZineTheme.primaryText)
            .frame(width: isPrimary ? 48 : 42, height: isPrimary ? 48 : 42)
            .background(
                isPrimary ? ZineTheme.brandAccent : ZineTheme.raised,
                in: .rect(cornerRadius: isPrimary ? 15 : 13)
            )
    }
}

struct AppearanceSettingsView: View {
    @AppStorage(AppAppearance.storageKey) private var storedAppearance = AppAppearance.system.rawValue

    private var selection: Binding<AppAppearance> {
        Binding(
            get: { AppAppearance(rawValue: storedAppearance) ?? .system },
            set: { storedAppearance = $0.rawValue }
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Choose how Zine looks on this device. System follows your iPhone’s appearance setting.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .padding(.bottom, 8)

                ForEach(AppAppearance.allCases) { appearance in
                    Button {
                        selection.wrappedValue = appearance
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: appearance.systemImage)
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(
                                    selection.wrappedValue == appearance
                                        ? ZineTheme.brandAccent
                                        : ZineTheme.primaryText
                                )
                                .frame(width: 42, height: 42)
                                .background(ZineTheme.raised, in: .rect(cornerRadius: 13))

                            Text(appearance.title)
                                .font(.system(.headline, design: .rounded, weight: .bold))
                                .foregroundStyle(ZineTheme.primaryText)

                            Spacer()

                            Image(
                                systemName: selection.wrappedValue == appearance
                                    ? "checkmark.circle.fill"
                                    : "circle"
                            )
                            .font(.title3)
                            .foregroundStyle(
                                selection.wrappedValue == appearance
                                    ? ZineTheme.brandAccent
                                    : ZineTheme.tertiaryText
                            )
                        }
                        .padding(16)
                        .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(
                                    selection.wrappedValue == appearance
                                        ? ZineTheme.brandAccent
                                        : ZineTheme.border.opacity(0.65),
                                    lineWidth: selection.wrappedValue == appearance ? 1.5 : 1
                                )
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(18)
        }
        .background(ZineTheme.canvas)
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
        .zineScreenChrome()
    }
}
