import SwiftUI
import XCTest
@testable import ZineNative

final class YouTubeDescriptionChaptersTests: XCTestCase {
    private let video = URL(string: "https://www.youtube.com/watch?v=cvxjqbfLVk0&t=999s&list=old#t=10")!

    func testAllInChapterFormatsAndOrdinaryLinks() {
        let text = """
        (0:00) Bestie intros!
        (0:35) AI Doomsday: Valid concern or Doomer psyop?
        (33:40) Steelmanning AI Doomsday scenarios
        (58:45) OpenAI math problem
        (1:19:55) Nike

        Follow: https://example.com/33:40
        """
        let result = BookmarkDescription.attributedText(text, youtubeURL: video, duration: 5757)
        XCTAssertEqual(String(result.characters), text)
        let runs = result.runs.filter { $0.link != nil }
        XCTAssertEqual(runs.map { String(result[$0.range].characters) }, [
            "0:00", "0:35", "33:40", "58:45", "1:19:55", "https://example.com/33:40",
        ])
        XCTAssertEqual(runs.compactMap(\.link).dropLast().map(\.absoluteString), [0, 35, 2020, 3525, 4795].map {
            "https://www.youtube.com/watch?v=cvxjqbfLVk0&t=\($0)s"
        })
        for run in runs {
            XCTAssertNil(run.underlineStyle)
            XCTAssertEqual(run.font, .body.weight(.medium))
            XCTAssertEqual(run.foregroundColor, ZineTheme.bookmarkDescriptionLink)
        }
    }

    func testBareBracketedBulletedAndHourTimestampsPreserveUnicode() {
        let text = "👋 Chapters\r\n00:00 Intro\r\n • [04:57] Topic\r\n- (01:04:05) More\r\n1:15:05 Finale"
        let links = YouTubeDescriptionChapters.links(in: text, videoURL: video, duration: nil)
        XCTAssertEqual(links.map { (text as NSString).substring(with: $0.range) }, ["00:00", "04:57", "01:04:05", "1:15:05"])
        XCTAssertEqual(links.compactMap { URLComponents(url: $0.url, resolvingAgainstBaseURL: false)?.queryItems?.last?.value }, ["0s", "297s", "3845s", "4505s"])
    }

    func testIncidentalMalformedAndUnorderedTimesStayPlain() {
        for text in [
            "Meet at 10:30 today\nLunch at 12:00",
            "10:30 Meeting",
            "0:00 Intro\n0:00 Duplicate",
            "2:00 Later\n1:00 Earlier",
            "0:99 Invalid\n1:60 Invalid\n1:99:00 Invalid",
            "0:00\n1:00",
            "(0:00] Mismatched\n[1:00) Mismatched",
        ] {
            XCTAssertTrue(YouTubeDescriptionChapters.links(in: text, videoURL: video, duration: nil).isEmpty, text)
        }
    }

    func testDurationAndYouTubeScope() {
        let text = "0:00 Intro\n0:35 Topic\n2:00 Beyond end"
        XCTAssertEqual(YouTubeDescriptionChapters.links(in: text, videoURL: video, duration: 120).count, 2)
        XCTAssertTrue(BookmarkDescription.attributedText(text).runs.compactMap(\.link).isEmpty)
        for url in ["https://example.com/watch?v=cvxjqbfLVk0", "https://youtube.com.evil.example/watch?v=cvxjqbfLVk0", "https://youtube.com/@allin", "https://youtube.com/watch?v=invalid"] {
            XCTAssertTrue(YouTubeDescriptionChapters.links(in: text, videoURL: URL(string: url)!, duration: nil).isEmpty)
        }
        for url in ["https://youtu.be/cvxjqbfLVk0?t=5", "https://m.youtube.com/watch?v=cvxjqbfLVk0", "https://youtube.com/live/cvxjqbfLVk0", "https://youtube.com/shorts/cvxjqbfLVk0", "https://youtube.com/embed/cvxjqbfLVk0"] {
            XCTAssertEqual(YouTubeDescriptionChapters.links(in: text, videoURL: URL(string: url)!, duration: nil).count, 3)
        }
    }
}
