import Foundation
import CoreGraphics

/// Layout depends on the current view and its reserved regions, never the device model.
enum AdaptiveContentLayout {
    static func readingRegion(size: CGSize, division: CGRect?) -> CGRect {
        let bounds = CGRect(origin: .zero, size: size)
        guard let division, division.intersects(bounds) else { return bounds }
        let fold = division.intersection(bounds)
        if fold.height > fold.width {
            let left = CGRect(x: 0, y: 0, width: max(0, fold.minX - 12), height: size.height)
            let right = CGRect(x: min(size.width, fold.maxX + 12), y: 0,
                               width: max(0, size.width - fold.maxX - 12), height: size.height)
            return left.width >= right.width ? left : right
        }
        // Reading stays on the upper face; controls can use the stable lower face.
        return CGRect(x: 0, y: 0, width: size.width, height: max(0, fold.minY - 12))
    }

    static func companionRegion(size: CGSize, division: CGRect?) -> CGRect? {
        guard let division else { return nil }
        let reading = readingRegion(size: size, division: division)
        let bounds = CGRect(origin: .zero, size: size)
        guard reading != bounds else { return nil }
        let fold = division.intersection(bounds)
        if fold.height > fold.width {
            if reading.minX > 0 {
                return CGRect(x: 0, y: 0, width: max(0, fold.minX - 12), height: size.height)
            }
            let x = min(size.width, fold.maxX + 12)
            return CGRect(x: x, y: 0, width: max(0, size.width - x), height: size.height)
        }
        let y = min(size.height, fold.maxY + 12)
        return CGRect(x: 0, y: y, width: size.width, height: max(0, size.height - y))
    }

    static func artworkSize(viewport: CGSize, square: Bool) -> CGSize {
        let ratio: CGFloat = square ? 1 : 9 / 16
        let width = min(max(0, viewport.width - 48), 560,
                        max(0, viewport.height * 0.42) / ratio)
        return CGSize(width: width, height: width * ratio)
    }
}
