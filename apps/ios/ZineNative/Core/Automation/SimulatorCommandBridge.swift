import Foundation

#if DEBUG && targetEnvironment(simulator)
    import Foundation
    import CryptoKit

    /// Simulator filesystem mailbox only. No listener, production endpoint, token
    /// export, or access to persistence files. Absent from device/Release binaries.
    @MainActor
    final class SimulatorCommandBridge {
        private let session: NativeCommandSession
        private let directory: URL
        private let identity: BridgeIdentity

        init?(session: NativeCommandSession) {
            let env = ProcessInfo.processInfo.environment
            guard env["ZINE_AGENT_BRIDGE"] == "1",
                let simulator = env["SIMULATOR_UDID"],
                session.client.baseURL.scheme == "http",
                ["localhost", "127.0.0.1", "::1"].contains(session.client.baseURL.host ?? "")
            else { return nil }
            self.session = session
            directory = FileManager.default.temporaryDirectory.appending(
                path: "ZineAgent", directoryHint: .isDirectory)
            identity = BridgeIdentity(
                session: UUID().uuidString, capability: UUID().uuidString + UUID().uuidString,
                simulator: simulator, worktree: #filePath.components(separatedBy: "/apps/ios/")[0],
                build: Self.buildIdentity(),
                endpoint: session.client.baseURL.absoluteString, expiresAt: Date().addingTimeInterval(900))
        }

        private static func buildIdentity() -> String {
            guard let url = Bundle.main.executableURL,
                let data = try? Data(contentsOf: url, options: .mappedIfSafe)
            else { return "unavailable" }
            return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        }

        func run() async {
            let manager = FileManager.default
            do {
                try? manager.removeItem(at: directory)
                try manager.createDirectory(
                    at: directory, withIntermediateDirectories: true,
                    attributes: [.posixPermissions: 0o700])
                try JSONEncoder().encode(identity).write(
                    to: directory.appending(path: "identity.json"), options: .atomic)
                defer { try? manager.removeItem(at: directory) }
                while !Task.isCancelled && Date() < identity.expiresAt {
                    let requestURL = directory.appending(path: "request.json")
                    if let data = try? Data(contentsOf: requestURL) {
                        try? manager.removeItem(at: requestURL)
                        if data.count <= 65536,
                            let request = try? JSONDecoder().decode(BridgeRequest.self, from: data),
                            identity.accepts(request, now: Date())
                        {
                            let result = await session.execute(request.command)
                            try JSONEncoder().encode(result).write(
                                to: directory.appending(path: "response.json"), options: .atomic)
                        }
                    }
                    try await Task.sleep(for: .milliseconds(40))
                }
            } catch {
                // Cancellation or filesystem failure disables this session.
            }
        }
    }
#endif

struct BridgeIdentity: Codable {
    let session: String
    let capability: String
    let simulator: String
    let worktree: String
    let build: String
    let endpoint: String
    let expiresAt: Date

    func accepts(_ request: BridgeRequest, now: Date) -> Bool {
        request.session == session && request.capability == capability && now < expiresAt
    }
}

struct BridgeRequest: Codable {
    let session: String
    let capability: String
    let command: NativeCommand
}
