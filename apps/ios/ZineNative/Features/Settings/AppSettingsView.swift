import ClerkKit
import ClerkKitUI
import SwiftUI

private enum SettingsRoute: Hashable {
    case subscriptions
    case appearance
}

struct AppSettingsView: View {
    let client: APIClient

    @Environment(Clerk.self) private var clerk

    var body: some View {
        if clerk.session?.tasks?.isEmpty == false {
            AuthView(isDismissible: false)
        } else {
            UserProfileView(isDismissible: false)
                .userProfileRows([
                    UserProfileCustomRow(
                        route: SettingsRoute.subscriptions,
                        title: "Subscriptions",
                        icon: .system(name: "rectangle.stack.badge.person.crop"),
                        placement: .before(.signOut)
                    ),
                    UserProfileCustomRow(
                        route: SettingsRoute.appearance,
                        title: "Appearance",
                        icon: .system(name: "circle.lefthalf.filled"),
                        placement: .before(.signOut)
                    ),
                ])
                .userProfileDestination { route in
                    switch route {
                    case .subscriptions:
                        SubscriptionsView(client: client)
                    case .appearance:
                        AppearanceSettingsView()
                    }
                }
        }
    }
}

private struct AppearanceSettingsView: View {
    @AppStorage(AppAppearance.storageKey) private var storedAppearance = AppAppearance.system.rawValue

    private var selection: Binding<AppAppearance> {
        Binding(
            get: { AppAppearance(rawValue: storedAppearance) ?? .system },
            set: { storedAppearance = $0.rawValue }
        )
    }

    var body: some View {
        List {
            Section {
                ForEach(AppAppearance.allCases) { appearance in
                    Button {
                        selection.wrappedValue = appearance
                    } label: {
                        Label(appearance.title, systemImage: appearance.systemImage)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(.rect)
                            .overlay(alignment: .trailing) {
                                if selection.wrappedValue == appearance {
                                    Image(systemName: "checkmark")
                                        .fontWeight(.semibold)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text("System follows your iPhone’s appearance setting.")
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }
}
