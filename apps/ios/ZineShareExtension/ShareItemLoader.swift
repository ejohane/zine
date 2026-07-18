import Foundation
import UniformTypeIdentifiers

enum ShareItemLoader {
    static func url(from context: NSExtensionContext?) async throws -> URL {
        guard let items = context?.inputItems as? [NSExtensionItem] else {
            throw BookmarkShareError.noSharedURL
        }

        let providers = items.flatMap { $0.attachments ?? [] }

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try await loadURL(from: provider) {
                return url
            }
        }

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let url = try await loadURLFromText(from: provider) {
                return url
            }
        }

        throw BookmarkShareError.noSharedURL
    }

    private static func loadURL(from provider: NSItemProvider) async throws -> URL? {
        let item = try await provider.zineLoadItem(forTypeIdentifier: UTType.url.identifier)

        if let url = item as? URL {
            return url
        }
        if let url = item as? NSURL {
            return url as URL
        }
        if let value = item as? String {
            return URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        return nil
    }

    private static func loadURLFromText(from provider: NSItemProvider) async throws -> URL? {
        let item = try await provider.zineLoadItem(forTypeIdentifier: UTType.plainText.identifier)
        guard let text = item as? String else { return nil }

        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        return detector.firstMatch(in: text, options: [], range: range)?.url
    }
}

private extension NSItemProvider {
    func zineLoadItem(forTypeIdentifier typeIdentifier: String) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: item)
                }
            }
        }
    }
}
