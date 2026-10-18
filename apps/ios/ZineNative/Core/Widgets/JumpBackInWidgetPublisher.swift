import Nuke
import UIKit
import WidgetKit

@MainActor
final class JumpBackInWidgetPublisher {
    static let shared = JumpBackInWidgetPublisher()
    private let storage: JumpBackInWidgetStorage
    private let reload: () -> Void
    private let loadArtwork: (URL) async -> Data?

    init(storage: JumpBackInWidgetStorage = JumpBackInWidgetStorage(),
         reload: @escaping () -> Void = { WidgetCenter.shared.reloadTimelines(ofKind: JumpBackInWidgetSnapshot.kind) },
         loadArtwork: @escaping (URL) async -> Data? = JumpBackInWidgetPublisher.artwork) {
        self.storage = storage
        self.reload = reload
        self.loadArtwork = loadArtwork
    }

    private static func artwork(_ url: URL) async -> Data? {
        let request = ImageRequest(url: url, processors: [
            ImageProcessors.Resize(size: CGSize(width: 144, height: 144), unit: .pixels,
                                   contentMode: .aspectFill, crop: true),
        ])
        let image = try? await AppImagePipeline.shared.image(for: request)
        return image?.jpegData(compressionQuality: 0.75)
    }
    private var activeScope: JumpBackInWidgetScope?
    private var revision = 0

    func activate(_ scope: JumpBackInWidgetScope?) {
        guard activeScope != scope || storage.load()?.scope != scope else { return }
        revision += 1
        activeScope = scope
        if scope == nil || storage.load()?.scope != scope {
            storage.clear()
            reload()
        }
    }

    func publish(_ items: [HomeItem], scope: JumpBackInWidgetScope) async {
        guard activeScope == scope else { return }
        revision += 1
        let requestRevision = revision
        let previous = storage.load()
        var snapshot = JumpBackInWidgetSnapshot(scope: scope, items: items.prefix(6).map { item in
            let cached = previous?.scope == scope ? previous?.items.first {
                $0.id == item.id && $0.artworkURL == item.thumbnailUrl
            }?.artwork : nil
            return JumpBackInWidgetItem(id: item.id, title: item.title, creator: item.creator,
                symbol: item.contentType.systemImage, artworkURL: item.thumbnailUrl, artwork: cached)
        })
        // Publish filtering/order immediately, before any artwork request can suspend.
        saveIfChanged(snapshot)
        for index in snapshot.items.indices where snapshot.items[index].artwork == nil {
            guard let url = snapshot.items[index].artworkURL else { continue }
            let artwork = await loadArtwork(url)
            guard !Task.isCancelled, activeScope == scope, revision == requestRevision else { return }
            snapshot.items[index].artwork = artwork
        }
        guard !Task.isCancelled, activeScope == scope, revision == requestRevision else { return }
        saveIfChanged(snapshot)
    }

    private func saveIfChanged(_ snapshot: JumpBackInWidgetSnapshot) {
        guard storage.load() != snapshot else { return }
        do {
            try storage.save(snapshot)
            reload()
        } catch {
            // Preserve the last complete snapshot if protected storage is unavailable.
        }
    }
}
