import Foundation

/// Shared with WidgetKit. Contains presentation data only; never a Clerk token.
struct JumpBackInWidgetScope: Codable, Equatable, Hashable {
    let userID: String
    let apiBaseURL: URL
}

struct JumpBackInWidgetItem: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let creator: String
    let symbol: String
    let artworkURL: URL?
    var artwork: Data? = nil
}

struct JumpBackInWidgetSnapshot: Codable, Equatable {
    static let kind = "ZineJumpBackIn"
    static let appGroup = "group.app.zine.native"
    let scope: JumpBackInWidgetScope
    var items: [JumpBackInWidgetItem]
}

struct JumpBackInWidgetLink: Equatable {
    let scope: JumpBackInWidgetScope
    let bookmarkID: String

    var url: URL {
        var components = URLComponents()
        components.scheme = "zine"
        components.host = "widget"
        components.path = "/bookmark"
        components.queryItems = [
            URLQueryItem(name: "id", value: bookmarkID),
            URLQueryItem(name: "user", value: scope.userID),
            URLQueryItem(name: "api", value: scope.apiBaseURL.absoluteString),
        ]
        return components.url!
    }

    init(scope: JumpBackInWidgetScope, bookmarkID: String) {
        self.scope = scope
        self.bookmarkID = bookmarkID
    }

    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "zine", components.host == "widget",
              components.path == "/bookmark", components.fragment == nil,
              components.user == nil, components.password == nil, components.port == nil
        else { return nil }
        let queries = components.queryItems ?? []
        func single(_ key: String) -> String? {
            let matches = queries.filter { $0.name == key }
            guard matches.count == 1, let value = matches.first?.value, !value.isEmpty else { return nil }
            return value
        }
        guard let id = single("id"), let user = single("user"), let api = single("api"),
              let apiURL = URL(string: api), ["https", "http"].contains(apiURL.scheme), apiURL.host != nil
        else { return nil }
        scope = JumpBackInWidgetScope(userID: user, apiBaseURL: apiURL)
        bookmarkID = id
    }
}

/// An atomic, protected file gives the extension one consistent account's snapshot.
struct JumpBackInWidgetStorage {
    let directory: URL?

    init(directory: URL? = Self.sharedDirectory) { self.directory = directory }

    static var sharedDirectory: URL? {
#if os(iOS)
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: JumpBackInWidgetSnapshot.appGroup)
#else
        nil
#endif
    }

    func load() -> JumpBackInWidgetSnapshot? {
        guard let directory, let data = try? Data(contentsOf: directory.appendingPathComponent("jump-back-in.json"))
        else { return nil }
        return try? JSONDecoder().decode(JumpBackInWidgetSnapshot.self, from: data)
    }

    func save(_ snapshot: JumpBackInWidgetSnapshot) throws {
        guard let directory else { return }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
#if os(iOS)
        try data.write(to: directory.appendingPathComponent("jump-back-in.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
#else
        try data.write(to: directory.appendingPathComponent("jump-back-in.json"), options: .atomic)
#endif
    }

    func clear() {
        guard let directory else { return }
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("jump-back-in.json"))
    }
}

/// Opaque user-selected sRGB colors. This is a widget preference, not account data.
struct WidgetRGB: Equatable {
    let red: Double
    let green: Double
    let blue: Double

    init?(hex: String) {
        let value = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard value.count == 6, value.allSatisfy({ $0.isASCII && $0.isHexDigit }),
              let number = UInt32(value, radix: 16) else { return nil }
        red = Double((number >> 16) & 255) / 255
        green = Double((number >> 8) & 255) / 255
        blue = Double(number & 255) / 255
    }

    var luminance: Double {
        func linear(_ value: Double) -> Double {
            value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }

    var usesDarkText: Bool { (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) }
    var textContrast: Double {
        usesDarkText ? (luminance + 0.05) / 0.05 : 1.05 / (luminance + 0.05)
    }
}

struct WidgetSavedColor: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var hex: String
}

struct WidgetColorStorage {
    let directory: URL?
    init(directory: URL? = JumpBackInWidgetStorage.sharedDirectory) { self.directory = directory }

    func load() -> [WidgetSavedColor] {
        guard let directory, let data = try? Data(contentsOf: directory.appendingPathComponent("widget-colors.json")),
              let colors = try? JSONDecoder().decode([WidgetSavedColor].self, from: data) else { return [] }
        var seen = Set<String>()
        return colors.filter {
            !["clear", "automatic"].contains($0.id) && !$0.id.isEmpty
                && WidgetRGB(hex: $0.hex) != nil && seen.insert($0.id).inserted
        }
    }

    func save(_ colors: [WidgetSavedColor]) throws {
        guard let directory else { throw CocoaError(.fileNoSuchFile) }
        guard colors.allSatisfy({ WidgetRGB(hex: $0.hex) != nil }) else { throw CocoaError(.fileWriteInapplicableStringEncoding) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(colors)
#if os(iOS)
        try data.write(to: directory.appendingPathComponent("widget-colors.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
#else
        try data.write(to: directory.appendingPathComponent("widget-colors.json"), options: .atomic)
#endif
    }

    func color(for id: String?) -> WidgetRGB? {
        guard let color = load().first(where: { $0.id == id }) else { return nil }
        return WidgetRGB(hex: color.hex)
    }
}
