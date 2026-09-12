import Foundation

enum YouTubeDescriptionChapters {
    struct ChapterLink {
        let range: NSRange
        let url: URL
    }

    // Only chapter-shaped lines: a timestamp followed by a title. Capture only
    // the timestamp, leaving bullets, parentheses, and chapter titles untouched.
    private static let timestamp = #"[0-9]{1,3}:[0-5][0-9](?::[0-5][0-9])?"#
    private static let pattern = try? NSRegularExpression(
        pattern: #"^[ \t]*(?:[-*•–—][ \t]+)?(?:\(("# + timestamp
            + #")\)|\[("# + timestamp + #")\]|("# + timestamp + #"))[ \t]+(?=\S)"#,
        options: .anchorsMatchLines
    )

    static func links(in text: String, videoURL: URL, duration: Int?) -> [ChapterLink] {
        guard let videoID = videoID(from: videoURL) else { return [] }
        let matches = pattern?.matches(in: text, range: NSRange(text.startIndex..<text.endIndex, in: text)) ?? []
        var candidates: [(range: NSRange, seconds: Int)] = []
        for match in matches {
            guard let range = (1...3).map({ match.range(at: $0) }).first(where: { $0.location != NSNotFound }),
                  let stringRange = Range(range, in: text)
            else { continue }
            let parts = text[stringRange].split(separator: ":").compactMap { Int($0) }
            let seconds = parts.reduce(0) { $0 * 60 + $1 }
            if let duration, duration > 0, seconds >= duration { continue }
            candidates.append((range, seconds))
        }
        // A lone clock time or an unordered collection of times isn't a chapter list.
        guard candidates.count >= 2,
              zip(candidates, candidates.dropFirst()).allSatisfy({ $0.seconds < $1.seconds })
        else { return [] }

        return candidates.compactMap { chapter in
            var url = URLComponents()
            url.scheme = "https"
            url.host = "www.youtube.com"
            url.path = "/watch"
            url.queryItems = [
                URLQueryItem(name: "v", value: videoID),
                URLQueryItem(name: "t", value: "\(chapter.seconds)s"),
            ]
            guard let destination = url.url else { return nil }
            return ChapterLink(range: chapter.range, url: destination)
        }
    }

    private static func videoID(from url: URL) -> String? {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              let host = url.host?.lowercased()
        else { return nil }
        let path = url.pathComponents.filter { $0 != "/" }
        let id: String?
        if ["youtu.be", "www.youtu.be"].contains(host), path.count == 1 {
            id = path.first
        } else if ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].contains(host) {
            if url.path == "/watch" {
                id = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "v" })?.value
            } else if path.count == 2, ["shorts", "live", "embed"].contains(path[0]) {
                id = path[1]
            } else {
                id = nil
            }
        } else {
            id = nil
        }
        guard let id, id.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil else { return nil }
        return id
    }
}
