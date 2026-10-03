import Foundation
import Testing
@testable import ZineNative

struct SourcesOnboardingProgressTests {
    @Test func presentsOnlyForAnAccountCreatedDuringThisAuthAttempt() {
        let suite = "SourcesOnboardingProgressTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        let startedAt = Date(timeIntervalSince1970: 1_000_000)
        let newAccountCreatedAt = startedAt.addingTimeInterval(10)
        let existingAccountCreatedAt = startedAt.addingTimeInterval(-3_600)

        #expect(!SourcesOnboardingProgress.shouldPresent(
            userID: "new-user", createdAt: newAccountCreatedAt, defaults: defaults
        ))

        SourcesOnboardingProgress.recordAuthAttempt(now: startedAt, defaults: defaults)

        #expect(SourcesOnboardingProgress.shouldPresent(
            userID: "new-user", createdAt: newAccountCreatedAt, defaults: defaults
        ))
        #expect(!SourcesOnboardingProgress.shouldPresent(
            userID: "existing-user", createdAt: existingAccountCreatedAt, defaults: defaults
        ))

        SourcesOnboardingProgress.markCompleted(userID: "new-user", defaults: defaults)

        #expect(!SourcesOnboardingProgress.shouldPresent(
            userID: "new-user", createdAt: newAccountCreatedAt, defaults: defaults
        ))
    }
}
