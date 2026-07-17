import Foundation

struct AppConfiguration {
    let apiBaseURL: URL
    let clerkPublishableKey: String
    let googleClientID: String
    let spotifyClientID: String
    let xClientID: String

    var isClerkConfigured: Bool {
        clerkPublishableKey.hasPrefix("pk_") && !clerkPublishableKey.contains("replace_me")
    }

    static let current: AppConfiguration = {
        let values = Bundle.main.infoDictionary ?? [:]
        let apiURLString = values["ZINEAPIBaseURL"] as? String ?? "https://api.myzine.app"
        let key = values["ZINEClerkPublishableKey"] as? String ?? ""
        let googleClientID = values["ZINEGoogleClientID"] as? String ?? ""
        let spotifyClientID = values["ZINESpotifyClientID"] as? String ?? ""
        let xClientID = values["ZINEXClientID"] as? String ?? ""

        return AppConfiguration(
            apiBaseURL: URL(string: apiURLString) ?? URL(string: "https://api.myzine.app")!,
            clerkPublishableKey: key.trimmingCharacters(in: .whitespacesAndNewlines),
            googleClientID: googleClientID.trimmingCharacters(in: .whitespacesAndNewlines),
            spotifyClientID: spotifyClientID.trimmingCharacters(in: .whitespacesAndNewlines),
            xClientID: xClientID.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }()
}
