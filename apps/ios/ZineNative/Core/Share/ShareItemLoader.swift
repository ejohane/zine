import Foundation
import UniformTypeIdentifiers

enum ShareItemLoader {
    static func url(from context: NSExtensionContext?) async throws -> URL {
        guard let items = context?.inputItems as? [NSExtensionItem] else {
            throw BookmarkShareError.noSharedURL
        }

        return try await url(from: items)
    }

    static func url(from items: [NSExtensionItem]) async throws -> URL {
        let providers = items.flatMap { $0.attachments ?? [] }

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await loadURL(from: provider), SharedLinkText.isWebURL(url) {
                return url
            }
        }

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let url = try? await loadURLFromText(from: provider) {
                return url
            }
        }

        for item in items {
            if let text = item.attributedContentText?.string, let url = SharedLinkText.url(in: text) {
                return url
            }
        }
        throw BookmarkShareError.noSharedURL
    }

    static func text(from context: NSExtensionContext?) async -> String? {
        guard let items = context?.inputItems as? [NSExtensionItem] else { return nil }
        return await text(from: items)
    }

    static func text(from items: [NSExtensionItem]) async -> String? {
        var candidates: [String] = []
        for provider in items.flatMap({ $0.attachments ?? [] }) where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let item = try? await provider.zineLoadItem(forTypeIdentifier: UTType.plainText.identifier),
               let text = item as? String, text.utf16.count <= 4096, SharedLinkText.url(in: text) != nil {
                candidates.append(text)
            }
        }
        candidates += items.compactMap { $0.attributedContentText?.string }
            .filter { $0.utf16.count <= 4096 && SharedLinkText.url(in: $0) != nil }
        // Forward only the known book recommendation, never unrelated shared prose.
        // URL-only attachments must not hide the recommendation alongside them.
        return candidates.first { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().hasPrefix("i think you might like this book:") }
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
            return SharedLinkText.url(in: value)
        }

        return nil
    }

    private static func loadURLFromText(from provider: NSItemProvider) async throws -> URL? {
        let item = try await provider.zineLoadItem(forTypeIdentifier: UTType.plainText.identifier)
        guard let text = item as? String else { return nil }

        return SharedLinkText.url(in: text)
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
