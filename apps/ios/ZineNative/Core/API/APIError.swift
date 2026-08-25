import Foundation

enum APIError: LocalizedError {
    case invalidResponse
    case missingSession
    case server(status: Int, message: String, code: String?)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "Zine returned an invalid response."
        case .missingSession:
            "Your session is unavailable. Please sign in again."
        case .server(_, let message, _):
            message
        }
    }
}

struct APIErrorPayload: Decodable {
    let error: String?
    let code: String?
}

extension Error {
    var isRetryableOfflineMutationFailure: Bool {
        if let apiError = self as? APIError {
            switch apiError {
            case .missingSession:
                // Clerk may still be restoring the authenticated session during cold launch.
                return true
            case let .server(status, _, _):
                return status == 408 || status == 429 || status >= 500
            case .invalidResponse:
                return false
            }
        }

        let cocoaError = self as NSError
        // URL loading failures never prove that the server rejected the user's intent. Keep the
        // mutation until a request reaches the API and receives a definitive response.
        return cocoaError.domain == NSURLErrorDomain
    }
}
