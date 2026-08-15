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
}

private enum SettingsTestError: Error, LocalizedError {
    case rejected

    var errorDescription: String? { "Session could not be ended" }
}
