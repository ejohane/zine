import Foundation
import Testing
@testable import ZineNative

struct SettingsTests {
    @Test func exposesSourcesAsThePrimarySettingsDestination() {
        #expect(SettingsRoute.allCases == [.sources, .appearance])
    }

    @MainActor
    @Test func signOutRequiresConfirmationBeforeRunningTheAuthAction() async {
        let store = SettingsStore()
        var invocationCount = 0

        store.requestSignOut()
        #expect(store.isSignOutConfirmationPresented)
        #expect(invocationCount == 0)

        store.cancelSignOut()
        #expect(!store.isSignOutConfirmationPresented)
        #expect(invocationCount == 0)

        store.requestSignOut()
        await store.signOut {
            invocationCount += 1
        }

        #expect(invocationCount == 1)
        #expect(!store.isSignOutConfirmationPresented)
        #expect(!store.isSigningOut)
        #expect(store.signOutError == nil)
    }

    @MainActor
    @Test func failedSignOutStaysInSettingsAndSurfacesTheError() async {
        let store = SettingsStore()

        store.requestSignOut()
        await store.signOut {
            throw SettingsTestError.rejected
        }

        #expect(!store.isSignOutConfirmationPresented)
        #expect(!store.isSigningOut)
        #expect(store.signOutError == SettingsTestError.rejected.localizedDescription)

        store.dismissSignOutError()
        #expect(store.signOutError == nil)
    }

    @MainActor
    @Test func appleConnectionCancellationDoesNotShowAnError() async {
        let store = SettingsStore()

        await store.connectApple {
            throw CancellationError()
        }

        #expect(!store.isConnectingApple)
        #expect(store.appleConnectionError == nil)
    }

    @MainActor
    @Test func failedAppleConnectionCanBeRetried() async {
        let store = SettingsStore()

        await store.connectApple {
            throw SettingsTestError.rejected
        }
        #expect(!store.isConnectingApple)
        #expect(store.appleConnectionError == SettingsTestError.rejected.localizedDescription)

        await store.connectApple {}
        #expect(store.appleConnectionError == nil)
    }
}

private enum SettingsTestError: Error, LocalizedError {
    case rejected

    var errorDescription: String? { "Session could not be ended" }
}
