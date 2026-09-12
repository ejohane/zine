import SwiftUI

enum BookmarkDescription {
    private static let detector = try? NSDataDetector(
        types: NSTextCheckingResult.CheckingType.link.rawValue
    )

    static func attributedText(
        _ text: String,
        youtubeURL: URL? = nil,
        duration: Int? = nil
    ) -> AttributedString {
        var result = AttributedString(text)
        let matches = detector?.matches(
            in: text,
            range: NSRange(text.startIndex..<text.endIndex, in: text)
        ) ?? []

        for match in matches {
            guard let url = match.url,
                  let scheme = url.scheme?.lowercased(),
                  ["http", "https"].contains(scheme),
                  let stringRange = Range(match.range, in: text),
                  let range = Range(stringRange, in: result)
            else { continue }

            result[range].link = url
            result[range].foregroundColor = ZineTheme.bookmarkDescriptionLink
            result[range].font = .body.weight(.medium)
        }
        if let youtubeURL {
            for chapter in YouTubeDescriptionChapters.links(in: text, videoURL: youtubeURL, duration: duration) {
                guard !matches.contains(where: { NSIntersectionRange($0.range, chapter.range).length > 0 }),
                      let stringRange = Range(chapter.range, in: text),
                      let range = Range(stringRange, in: result)
                else { continue }
                result[range].link = chapter.url
                result[range].foregroundColor = ZineTheme.bookmarkDescriptionLink
                result[range].font = .body.weight(.medium)
            }
        }
        return result
    }
}
