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
