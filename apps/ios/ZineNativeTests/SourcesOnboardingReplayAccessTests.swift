import Foundation
import Testing
@testable import ZineNative

struct SourcesOnboardingReplayAccessTests {
    @Test func onlyTheRequestedAccountCanReplay() {
        #if DEBUG
        #expect(SourcesOnboardingReplayAccess.isAvailable(email: "ejohane@gmail.com"))
        #expect(SourcesOnboardingReplayAccess.isAvailable(email: " EJOHANE@gmail.com "))
        #else
        #expect(!SourcesOnboardingReplayAccess.isAvailable(email: "ejohane@gmail.com"))
        #endif

        #expect(!SourcesOnboardingReplayAccess.isAvailable(email: nil))
        #expect(!SourcesOnboardingReplayAccess.isAvailable(email: "other@gmail.com"))
        #expect(!SourcesOnboardingReplayAccess.isAvailable(email: "ejohane+test@gmail.com"))
    }

    @Test func previewRequestRequiresTheMatchingSignedInAccountAndExpires() {
        #if DEBUG
        let suite = "SourcesOnboardingReplayAccessTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let now = Date(timeIntervalSince1970: 1_000_000)

        SourcesOnboardingReplayAccess.requestPreview(now: now, defaults: defaults)
        #expect(!SourcesOnboardingReplayAccess.consumePreviewRequest(
            verifiedEmail: nil, now: now, defaults: defaults
        ))
        #expect(SourcesOnboardingReplayAccess.consumePreviewRequest(
            verifiedEmail: "EJOHANE@gmail.com", now: now.addingTimeInterval(30), defaults: defaults
        ))
        #expect(!SourcesOnboardingReplayAccess.consumePreviewRequest(
            verifiedEmail: "ejohane@gmail.com", now: now, defaults: defaults
        ))

        SourcesOnboardingReplayAccess.requestPreview(now: now, defaults: defaults)
        #expect(!SourcesOnboardingReplayAccess.consumePreviewRequest(
            verifiedEmail: "other@gmail.com", now: now, defaults: defaults
        ))

        SourcesOnboardingReplayAccess.requestPreview(now: now, defaults: defaults)
        #expect(!SourcesOnboardingReplayAccess.consumePreviewRequest(
            verifiedEmail: "ejohane@gmail.com",
            now: now.addingTimeInterval(21 * 60),
            defaults: defaults
        ))
        #endif
    }
}
