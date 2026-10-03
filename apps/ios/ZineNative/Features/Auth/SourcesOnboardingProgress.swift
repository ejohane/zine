import Foundation

/// Keeps a new account in setup across the Clerk handoff and app restarts.
enum SourcesOnboardingProgress {
    private static let pendingAuthKey = "zine.sourcesOnboarding.pendingAuthStartedAt"

    static func recordAuthAttempt(now: Date = Date(), defaults: UserDefaults = .standard) {
        defaults.set(now.timeIntervalSince1970, forKey: pendingAuthKey)
    }

    static func shouldPresent(
        userID: String,
        createdAt: Date,
        defaults: UserDefaults = .standard
    ) -> Bool {
        guard !defaults.bool(forKey: completedKey(for: userID)),
              let attempt = defaults.object(forKey: pendingAuthKey) as? Double else {
            return false
        }

        // Clerk creates the user after the attempt begins. Allow a small clock offset
        // while excluding accounts that already existed before this sign-in.
        return createdAt.timeIntervalSince1970 >= attempt - 120
    }

    static func markCompleted(userID: String, defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: completedKey(for: userID))
        defaults.removeObject(forKey: pendingAuthKey)
    }

    private static func completedKey(for userID: String) -> String {
        "zine.sourcesOnboarding.completed.\(userID)"
    }
}

/// Allows Erik to request the real source setup from the signed-out entry.
/// The request is honored only after Clerk supplies the matching signed-in email.
enum SourcesOnboardingReplayAccess {
    private static let allowedEmail = "ejohane@gmail.com"
    private static let requestedAtKey = "zine.sourcesOnboarding.replayRequestedAt"
    private static let requestLifetime: TimeInterval = 20 * 60

    static func isAvailable(email: String?) -> Bool {
        #if DEBUG
        email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == allowedEmail
        #else
        false
        #endif
    }

    static func requestPreview(now: Date = Date(), defaults: UserDefaults = .standard) {
        defaults.set(now.timeIntervalSince1970, forKey: requestedAtKey)
    }

    static func consumePreviewRequest(
        verifiedEmail: String?,
        now: Date = Date(),
        defaults: UserDefaults = .standard
    ) -> Bool {
        guard let verifiedEmail,
              let requestedAt = defaults.object(forKey: requestedAtKey) as? Double else {
            return false
        }
        defaults.removeObject(forKey: requestedAtKey)
        let age = now.timeIntervalSince1970 - requestedAt
        return isAvailable(email: verifiedEmail) && age >= -120 && age <= requestLifetime
    }
}
