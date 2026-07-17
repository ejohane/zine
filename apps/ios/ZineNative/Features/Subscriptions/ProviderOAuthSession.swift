import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

@MainActor
final class ProviderOAuthSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let apiClient: APIClient
    private let configuration: AppConfiguration
    private var activeSession: ASWebAuthenticationSession?

    init(apiClient: APIClient, configuration: AppConfiguration) {
        self.apiClient = apiClient
        self.configuration = configuration
    }

    func connect(_ provider: SubscriptionSource) async throws {
        let oauth = try ProviderOAuth.configuration(for: provider, app: configuration)
        let pkce = try ProviderOAuth.generatePKCE()
        let state = "\(provider.rawValue):\(UUID().uuidString)"
        try await apiClient.registerOAuthState(state, provider: provider)

        let authorizationURL = try ProviderOAuth.authorizationURL(
            configuration: oauth,
            state: state,
            challenge: pkce.challenge
        )
        let callbackURL = try await authenticate(
            authorizationURL: authorizationURL,
            callbackScheme: oauth.redirectUri.scheme
        )
        let response = try ProviderOAuth.parseCallback(callbackURL, expectedState: state)

        try await apiClient.completeOAuth(
            provider: provider,
            code: response.code,
            state: response.state,
            codeVerifier: pkce.verifier,
            redirectUri: oauth.redirectUri.absoluteString
        )
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? scenes.flatMap(\.windows).first ?? ASPresentationAnchor()
    }

    private func authenticate(
        authorizationURL: URL,
        callbackScheme: String?
    ) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.activeSession = nil

                if let sessionError = error as? ASWebAuthenticationSessionError,
                   sessionError.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else if let error {
                    continuation.resume(throwing: error)
                } else if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: ProviderOAuthError.missingCallback)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session

            if !session.start() {
                activeSession = nil
                continuation.resume(throwing: ProviderOAuthError.couldNotStartSession)
            }
        }
    }
}

enum ProviderOAuth {
    struct PKCE: Equatable {
        let verifier: String
        let challenge: String
    }

    struct Callback: Equatable {
        let code: String
        let state: String
    }

    struct Configuration: Equatable {
        let provider: SubscriptionSource
        let clientID: String
        let authorizationEndpoint: URL
        let redirectUri: URL
        let scopes: [String]
        let requestsOfflineAccess: Bool
    }

    static func configuration(
        for provider: SubscriptionSource,
        app: AppConfiguration
    ) throws -> Configuration {
        let googleRedirect = googleRedirectUri(clientID: app.googleClientID)

        let result: Configuration?
        switch provider {
        case .youtube:
            result = googleRedirect.map {
                Configuration(
                    provider: provider,
                    clientID: app.googleClientID,
                    authorizationEndpoint: URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!,
                    redirectUri: $0,
                    scopes: [
                        "https://www.googleapis.com/auth/youtube.readonly",
                        "https://www.googleapis.com/auth/userinfo.email",
                        "https://www.googleapis.com/auth/userinfo.profile",
                    ],
                    requestsOfflineAccess: true
                )
            }
        case .gmail:
            result = googleRedirect.map {
                Configuration(
                    provider: provider,
                    clientID: app.googleClientID,
                    authorizationEndpoint: URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!,
                    redirectUri: $0,
                    scopes: [
                        "https://www.googleapis.com/auth/gmail.readonly",
                        "https://www.googleapis.com/auth/userinfo.email",
                        "https://www.googleapis.com/auth/userinfo.profile",
                    ],
                    requestsOfflineAccess: true
                )
            }
        case .spotify:
            result = Configuration(
                provider: provider,
                clientID: app.spotifyClientID,
                authorizationEndpoint: URL(string: "https://accounts.spotify.com/authorize")!,
                redirectUri: URL(string: "zine://oauth/callback")!,
                scopes: ["user-library-read"],
                requestsOfflineAccess: false
            )
        case .x:
            result = Configuration(
                provider: provider,
                clientID: app.xClientID,
                authorizationEndpoint: URL(string: "https://x.com/i/oauth2/authorize")!,
                redirectUri: URL(string: "zine://oauth/callback")!,
                scopes: ["tweet.read", "users.read", "bookmark.read", "offline.access"],
                requestsOfflineAccess: false
            )
        case .rss:
            result = nil
        }

        guard let result, !result.clientID.isEmpty else {
            throw ProviderOAuthError.missingClientConfiguration(provider.providerTitle)
        }
        return result
    }

    static func googleRedirectUri(clientID: String) -> URL? {
        let suffix = ".apps.googleusercontent.com"
        guard clientID.hasSuffix(suffix), clientID.count > suffix.count else { return nil }
        let identifier = clientID.dropLast(suffix.count)
        return URL(string: "com.googleusercontent.apps.\(identifier):/oauth2redirect")
    }

    static func generatePKCE() throws -> PKCE {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw ProviderOAuthError.randomGenerationFailed
        }

        let verifier = Data(bytes).base64URLEncodedString()
        let digest = SHA256.hash(data: Data(verifier.utf8))
        let challenge = Data(digest).base64URLEncodedString()
        return PKCE(verifier: verifier, challenge: challenge)
    }

    static func authorizationURL(
        configuration: Configuration,
        state: String,
        challenge: String
    ) throws -> URL {
        var components = URLComponents(
            url: configuration.authorizationEndpoint,
            resolvingAgainstBaseURL: false
        )!
        var items = [
            URLQueryItem(name: "client_id", value: configuration.clientID),
            URLQueryItem(name: "redirect_uri", value: configuration.redirectUri.absoluteString),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: configuration.scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        if configuration.requestsOfflineAccess {
            items.append(URLQueryItem(name: "access_type", value: "offline"))
            items.append(URLQueryItem(name: "prompt", value: "consent"))
        }
        components.queryItems = items
        guard let url = components.url else { throw ProviderOAuthError.invalidAuthorizationURL }
        return url
    }

    static func parseCallback(_ url: URL, expectedState: String) throws -> Callback {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first(where: { $0.name == name })?.value }

        if let oauthError = value("error") {
            throw ProviderOAuthError.providerError(value("error_description") ?? oauthError)
        }
        guard let state = value("state"), state == expectedState else {
            throw ProviderOAuthError.stateMismatch
        }
        guard let code = value("code"), !code.isEmpty else {
            throw ProviderOAuthError.missingAuthorizationCode
        }
        return Callback(code: code, state: state)
    }
}

enum ProviderOAuthError: LocalizedError {
    case missingClientConfiguration(String)
    case randomGenerationFailed
    case invalidAuthorizationURL
    case couldNotStartSession
    case missingCallback
    case stateMismatch
    case missingAuthorizationCode
    case providerError(String)

    var errorDescription: String? {
        switch self {
        case .missingClientConfiguration(let provider):
            "\(provider) sign-in is not configured for this build."
        case .randomGenerationFailed:
            "A secure sign-in request couldn’t be created."
        case .invalidAuthorizationURL:
            "The provider sign-in address is invalid."
        case .couldNotStartSession:
            "Provider sign-in couldn’t be opened."
        case .missingCallback:
            "Provider sign-in did not return to Zine."
        case .stateMismatch:
            "Provider sign-in could not be verified. Please try again."
        case .missingAuthorizationCode:
            "The provider did not return an authorization code."
        case .providerError(let message):
            message
        }
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
