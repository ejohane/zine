import Foundation
import CoreGraphics
import Testing
@testable import ZineCore

struct AdaptiveContentLayoutTests {
    @Test func flatWindowKeepsItsFullReadingArea() {
        let size = CGSize(width: 800, height: 600)
        #expect(AdaptiveContentLayout.readingRegion(size: size, division: nil) == CGRect(origin: .zero, size: size))
        #expect(AdaptiveContentLayout.readingRegion(size: size, division: CGRect(x: 900, y: 0, width: 20, height: 600)) == CGRect(origin: .zero, size: size))
    }

    @Test func bookPoseKeepsReadingAndControlsOffTheHinge() {
        let fold = CGRect(x: 390, y: 0, width: 20, height: 600)
        let region = AdaptiveContentLayout.readingRegion(size: CGSize(width: 800, height: 600), division: fold)
        #expect(region.width == 378)
        #expect(!region.intersects(fold))
    }

    @Test func choosesUsableSideOfAnAsymmetricDivision() {
        let region = AdaptiveContentLayout.readingRegion(size: CGSize(width: 800, height: 600), division: CGRect(x: 280, y: 0, width: 20, height: 600))
        #expect(region.minX == 312)
        #expect(region.width == 488)
    }

    @Test func seatedPoseKeepsReadingOnTheUpperFace() {
        let region = AdaptiveContentLayout.readingRegion(size: CGSize(width: 600, height: 800), division: CGRect(x: 0, y: 390, width: 600, height: 20))
        #expect(region == CGRect(x: 0, y: 0, width: 600, height: 378))
    }

    @Test func companionNeverOverlapsReadingOrFold() {
        let size = CGSize(width: 800, height: 600)
        for fold in [CGRect(x: 390, y: 0, width: 20, height: 600), CGRect(x: 0, y: 290, width: 800, height: 20)] {
            let reading = AdaptiveContentLayout.readingRegion(size: size, division: fold)
            let companion = AdaptiveContentLayout.companionRegion(size: size, division: fold)!
            #expect(!companion.intersects(reading))
            #expect(!companion.intersects(fold))
        }
        #expect(AdaptiveContentLayout.companionRegion(size: size, division: nil) == nil)
    }

    @Test func artworkFitsShortAndNarrowWindows() {
        for size in [CGSize(width: 320, height: 640), CGSize(width: 900, height: 320), CGSize(width: 250, height: 300)] {
            for square in [true, false] {
                let artwork = AdaptiveContentLayout.artworkSize(viewport: size, square: square)
                #expect(artwork.width <= size.width - 48)
                #expect(artwork.height <= size.height * 0.42)
                #expect(artwork.width > 0)
            }
        }
    }
}
