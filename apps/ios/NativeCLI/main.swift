import Foundation
import ZineCore

@main struct Main {
    static func main() async {
        do {
            let data = try await NativeCLI.run(Array(CommandLine.arguments.dropFirst()))
            FileHandle.standardOutput.write(data + Data("\n".utf8))
            if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                object["status"] as? String == "failed"
            {
                exit(1)
            }
        } catch {
            let data = try! JSONSerialization.data(withJSONObject: [
                "version": 1, "status": "failed", "error": String(describing: error),
            ])
            FileHandle.standardOutput.write(data + Data("\n".utf8))
            exit(1)
        }
    }
}
