#if os(macOS)
    import Foundation

    public enum NativeCLI {
        @MainActor
        public static func run(_ arguments: [String]) async throws -> Data {
            if arguments.count == 3, arguments[0...1] == ["scenario", "run"] {
                return try await NativeScenario.run(arguments[2])
            }
            guard arguments.count >= 3, arguments[0] == "remote" else {
                throw CommandError(
                    "usage: scenario run reader-offline|reader-rollback; remote SIMULATOR identity; remote SIMULATOR COMMAND --expect-session SESSION [--id ID] [--fraction 0.4] [--tags JSON_ARRAY]"
                )
            }
            let simulator = arguments[1]
            guard UUID(uuidString: simulator) != nil else { throw CommandError("simulator_uuid_required") }
            let process = Process()
            let pipe = Pipe()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
            process.arguments = ["simctl", "get_app_container", simulator, "app.zine.native", "data"]
            process.standardOutput = pipe
            try process.run()
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0,
                let container = String(data: output, encoding: .utf8)?.trimmingCharacters(
                    in: .whitespacesAndNewlines)
            else { throw CommandError("container_unavailable") }
            let directory = URL(fileURLWithPath: container).appending(path: "tmp/ZineAgent")
            let identity = try JSONDecoder().decode(
                BridgeIdentity.self, from: Data(contentsOf: directory.appending(path: "identity.json")))
            guard identity.simulator == simulator, identity.expiresAt > Date() else {
                throw CommandError("expired_or_wrong_simulator")
            }
            if arguments[2] == "identity" {
                return try JSONSerialization.data(
                    withJSONObject: [
                        "version": 1, "session": identity.session,
                        "simulator": identity.simulator, "worktree": identity.worktree,
                        "build": identity.build,
                        "endpoint": identity.endpoint, "expiresAt": identity.expiresAt.timeIntervalSince1970,
                    ], options: [.sortedKeys])
            }
            func option(_ name: String) -> String? {
                guard let index = arguments.firstIndex(of: name), arguments.indices.contains(index + 1) else {
                    return nil
                }
                return arguments[index + 1]
            }
            guard option("--expect-session") == identity.session else {
                throw CommandError("inspect_identity_then_supply_expect_session")
            }
            let lockURL = directory.appending(path: "client.lock")
            let descriptor = open(lockURL.path, O_CREAT | O_WRONLY, 0o600)
            guard descriptor >= 0 else { throw CommandError("client_lock_failed") }
            let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
            guard flock(handle.fileDescriptor, LOCK_EX | LOCK_NB) == 0 else {
                throw CommandError("another_command_is_running")
            }
            defer { try? handle.close() }
            let tags = try option("--tags").map {
                try JSONDecoder().decode([String].self, from: Data($0.utf8))
            }
            let command = NativeCommand(
                name: arguments[2], bookmarkID: option("--id"),
                fraction: option("--fraction").flatMap(Double.init), tags: tags)
            let request = BridgeRequest(
                session: identity.session, capability: identity.capability, command: command)
            try JSONEncoder().encode(request).write(
                to: directory.appending(path: "request.json"), options: .atomic)
            let deadline = min(identity.expiresAt, Date().addingTimeInterval(60))
            while Date() < deadline {
                if let data = try? Data(contentsOf: directory.appending(path: "response.json")),
                    let result = try? JSONDecoder().decode(NativeCommandResult.self, from: data),
                    result.requestID == command.requestID
                {
                    return data
                }
                try await Task.sleep(for: .milliseconds(40))
            }
            throw CommandError("timeout_outcome_unknown_do_not_retry_mutation_inspect_state")
        }
    }
#endif
