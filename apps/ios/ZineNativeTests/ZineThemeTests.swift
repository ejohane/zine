import SwiftUI
import UIKit
import XCTest
@testable import ZineNative

final class ZineThemeTests: XCTestCase {
    @MainActor
    func testNavigationBackdropDoesNotCoverContentWithoutTopSafeArea() throws {
        // Side-mounted bars can leave no top inset. Test both aspect ratios;
        // the old 44-point minimum painted over the top of this content.
        for size in [CGSize(width: 320, height: 640), CGSize(width: 640, height: 320)] {
            let renderer = ImageRenderer(content:
                Color.white
                    .frame(width: size.width, height: size.height)
                    .zineNavigationBarContentBackdrop(.black)
            )
            renderer.scale = 1
            let image = try XCTUnwrap(renderer.cgImage)
            let context = try XCTUnwrap(CGContext(
                data: nil,
                width: 1,
                height: 1,
                bitsPerComponent: 8,
                bytesPerRow: 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ))
            let sample = try XCTUnwrap(image.cropping(to: CGRect(x: 20, y: 20, width: 1, height: 1)))
            context.draw(sample, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            let pixel = try XCTUnwrap(context.data).assumingMemoryBound(to: UInt8.self)
            XCTAssertEqual([pixel[0], pixel[1], pixel[2]], [255, 255, 255], "Backdrop covered content at \(size)")
        }
    }

    func testSemanticRolesResolveToApprovedLightPalette() {
        assertPalette(
            style: .light,
            expected: [
                .canvas: "F5F7F8",
                .surface: "FFFFFF",
                .raised: "E9EDF0",
                .primaryText: "151719",
                .readerBodyText: "151719",
                .secondaryText: "5D646C",
                .border: "CFD4DA",
                .brandAccent: "EF661F",
                .onAccent: "000000",
                .inlineLink: "B64012",
                .bookmarkDescriptionLink: "000000",
            ]
        )
    }

    func testSemanticRolesResolveToApprovedDarkPalette() {
        assertPalette(
            style: .dark,
            expected: [
                .canvas: "000000",
                .surface: "14171A",
                .raised: "20252A",
                .primaryText: "F5F7F8",
                .readerBodyText: "D8DCE0",
                .secondaryText: "B2BAC2",
                .border: "343A40",
                .brandAccent: "EF661F",
                .onAccent: "000000",
                .inlineLink: "FFAD7C",
                .bookmarkDescriptionLink: "FFFFFF",
            ]
        )
    }

    func testEveryRoleHasAValueInBothAppearances() {
        XCTAssertEqual(ZineTheme.Role.allCases.count, 11)
        for role in ZineTheme.Role.allCases {
            XCTAssertEqual(role.lightHex.count, 6)
            XCTAssertEqual(role.darkHex.count, 6)
        }
    }

    @MainActor
    func testUIKitBarsKeepSystemManagedMaterialsAndScrollEdges() {
        ZineTheme.configureUIKitAppearance()

        let navigationBar = UINavigationBar()
        XCTAssertNil(navigationBar.standardAppearance.backgroundColor)
        XCTAssertNil(navigationBar.scrollEdgeAppearance)

        let tabBar = UITabBar()
        XCTAssertNil(tabBar.standardAppearance.backgroundColor)
        XCTAssertNil(tabBar.scrollEdgeAppearance)

        let darkTraits = UITraitCollection(userInterfaceStyle: .dark)
        XCTAssertEqual(tabBar.tintColor.resolvedColor(with: darkTraits).hexRGB, "EF661F")
    }

    private func assertPalette(
        style: UIUserInterfaceStyle,
        expected: [ZineTheme.Role: String],
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(expected.count, ZineTheme.Role.allCases.count, file: file, line: line)
        for role in ZineTheme.Role.allCases {
            let color = ZineTheme.resolvedUIColor(role, interfaceStyle: style)
            XCTAssertEqual(color.hexRGB, expected[role], "Unexpected value for \(role)", file: file, line: line)
        }
    }
}

private extension UIColor {
    var hexRGB: String? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        return String(
            format: "%02X%02X%02X",
            Int((red * 255).rounded()),
            Int((green * 255).rounded()),
            Int((blue * 255).rounded())
        )
    }
}
