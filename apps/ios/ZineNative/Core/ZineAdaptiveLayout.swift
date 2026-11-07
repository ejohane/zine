import SwiftUI

extension GeometryProxy {
    var zineDivision: CGRect? {
        if #available(iOS 27.1, *) {
            return reservedRegions(kind: .division).first?.frame
        }
        return nil
    }

    var zineReadingRegion: CGRect {
        AdaptiveContentLayout.readingRegion(size: size, division: zineDivision)
    }
}
