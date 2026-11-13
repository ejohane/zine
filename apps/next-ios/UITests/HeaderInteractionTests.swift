import XCTest

final class HeaderInteractionTests: XCTestCase {
    func testAPIPreviewSearchCollectionsAndInbox() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        let search = app.buttons["open-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        let idea = app.buttons["designing with AI"]
        XCTAssertTrue(idea.waitForExistence(timeout: 5))
        idea.tap()
        XCTAssertTrue(app.staticTexts["Your coding agents made you a manager"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Matches a saved note"].firstMatch.exists)
        app.buttons["Done"].tap()

        app.buttons["open-collections"].tap()
        let collection = app.staticTexts["A little more intentional"]
        XCTAssertTrue(collection.waitForExistence(timeout: 5))
        collection.tap()
        XCTAssertTrue(app.buttons["Explore this collection"].waitForExistence(timeout: 5))
        app.buttons["Explore this collection"].tap()
        XCTAssertTrue(app.staticTexts["A little more intentional"].waitForExistence(timeout: 5))

        // Fresh screen-local filters, but the same deterministic fixture store.
        app.terminate()
        app.launch()
        app.buttons["open-inbox"].tap()
        XCTAssertTrue(app.staticTexts["Something new to explore"].waitForExistence(timeout: 5))
        app.buttons["featured-open"].tap()
        let keep = app.buttons["keep-arrival"]
        XCTAssertTrue(keep.waitForExistence(timeout: 5))
        keep.tap()
        XCTAssertFalse(app.buttons["keep-arrival"].exists)
        app.buttons["Done"].tap()
        XCTAssertTrue(app.staticTexts["Something new to explore"].waitForExistence(timeout: 5))
    }

    func testHeaderSwipeChangesFilterAndBodySwipeDoesNot() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        let home = app.buttons["section-home"]
        XCTAssertTrue(home.waitForExistence(timeout: 10))
        XCTAssertTrue(home.isSelected)

        // Begin inside the selected control, then drag by one filter interval.
        let start = home.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: -72, dy: 0)))
        let podcasts = app.buttons["section-podcasts"]
        let selected = NSPredicate(format: "selected == true")
        expectation(for: selected, evaluatedWith: podcasts)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(app.staticTexts["Let a conversation unfold"].exists)

        let body = app.buttons["featured-open"]
        XCTAssertTrue(body.waitForExistence(timeout: 5))
        let bodyStart = body.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.4))
        bodyStart.press(forDuration: 0.05, thenDragTo: bodyStart.withOffset(CGVector(dx: -100, dy: 0)))
        XCTAssertTrue(podcasts.isSelected)
        XCTAssertTrue(app.staticTexts["Let a conversation unfold"].exists)

        let oldY = podcasts.frame.minY
        let heading = app.staticTexts["Let a conversation unfold"]
        let oldHeadingY = heading.frame.minY
        XCTAssertFalse(app.buttons["Done"].exists)
        let vertical = app.scrollViews["vertical-content"]
        XCTAssertTrue(vertical.exists)
        vertical.swipeUp()
        XCTAssertLessThan(heading.frame.minY, oldHeadingY - 20)
        XCTAssertEqual(podcasts.frame.minY, oldY, accuracy: 2)
        XCTAssertTrue(podcasts.isHittable)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Pinned filters after vertical scroll"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        let backStart = podcasts.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5))
        backStart.press(forDuration: 0.05, thenDragTo: backStart.withOffset(CGVector(dx: 72, dy: 0)))
        expectation(for: selected, evaluatedWith: home)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(app.staticTexts["Follow your curiosity"].exists)
        app.buttons["featured-open"].tap()
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
        app.buttons["save-link"].tap()
        XCTAssertTrue(app.textFields["capture-url"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
    }
}
