import SwiftUI
import UIKit
import WidgetKit

struct JumpBackInEntry: TimelineEntry {
    let date: Date
    let snapshot: JumpBackInWidgetSnapshot?
    var backgroundID: String = "clear"
    var customColor: WidgetRGB? = nil
}

struct JumpBackInProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> JumpBackInEntry { preview }

    func snapshot(for configuration: JumpBackInConfiguration, in context: Context) async -> JumpBackInEntry {
        var entry = context.isPreview ? preview : JumpBackInEntry(date: .now, snapshot: JumpBackInWidgetStorage().load())
        entry.backgroundID = configuration.background?.id ?? "clear"
        entry.customColor = WidgetColorStorage().color(for: entry.backgroundID)
        return entry
    }

    func timeline(for configuration: JumpBackInConfiguration, in context: Context) async -> Timeline<JumpBackInEntry> {
        let entry = await snapshot(for: configuration, in: context)
        return Timeline(entries: [entry], policy: .never)
    }

    var preview: JumpBackInEntry {
        JumpBackInEntry(date: .now, snapshot: JumpBackInWidgetSnapshot(
            scope: JumpBackInWidgetScope(userID: "preview", apiBaseURL: URL(string: "https://api.myzine.app")!),
            items: [
                ("The art of paying attention", "Essays", "doc.text"),
                ("A different kind of internet", "Technology", "doc.text"),
                ("Making room for good ideas", "Conversations", "headphones"),
                ("What we choose to keep", "Culture", "doc.text"),
                ("Inside the creative process", "Design", "play.rectangle"),
                ("A walk through the city", "Field notes", "doc.text"),
            ].enumerated().map { index, item in
                JumpBackInWidgetItem(id: "preview-\(index)", title: item.0, creator: item.1,
                                     symbol: item.2, artworkURL: nil)
            }
        ))
    }
}

struct JumpBackInWidgetView: View {
    let entry: JumpBackInEntry
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    private var customPalette: ZineTheme.WidgetPalette? {
        guard renderingMode == .fullColor, let color = entry.customColor else { return nil }
        return ZineTheme.WidgetPalette(rgb: color)
    }
    private var foreground: Color { customPalette?.text ?? ZineTheme.primaryText }
    private var background: Color {
        if let customPalette { return customPalette.background }
        return entry.backgroundID == "clear" ? .clear : ZineTheme.canvas
    }
    private let homeURL = URL(string: "zine://widget/home")!

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let snapshot = entry.snapshot, !snapshot.items.isEmpty {
                GeometryReader { geometry in
                    let columnCount = dynamicTypeSize.isAccessibilitySize ? 1 : 2
                    let rowCount = family == .systemMedium ? 2 : 3
                    let items = Array(snapshot.items.prefix(columnCount * rowCount))
                    let rowHeight = max(44, (geometry.size.height - CGFloat(rowCount - 1) * 8) / CGFloat(rowCount))
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: columnCount), spacing: 8) {
                        ForEach(items) { item in
                            Link(destination: JumpBackInWidgetLink(scope: snapshot.scope, bookmarkID: item.id).url) {
                                tile(item, height: rowHeight)
                            }
                            .accessibilityLabel("\(item.title), \(item.creator)")
                        }
                    }
                }
                .privacySensitive()
            } else {
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 8) {
                    Text(entry.snapshot == nil ? "Open Zine to get started" : "Nothing to pick up yet")
                        .font(.headline).foregroundStyle(foreground)
                    Text(entry.snapshot == nil ? "Your recently opened bookmarks will appear here." : "Open a bookmark in Zine to come back to it here.")
                        .font(.caption).foregroundStyle(customPalette?.text ?? ZineTheme.secondaryText)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(homeURL)
        .containerBackground(background, for: .widget)
    }

    private func tile(_ item: JumpBackInWidgetItem, height: CGFloat) -> some View {
        HStack(spacing: 8) {
            Group {
                if let data = item.artwork, let image = UIImage(data: data) {
                    Image(uiImage: image).resizable().widgetAccentedRenderingMode(.fullColor).scaledToFill()
                } else {
                    (renderingMode == .fullColor ? (customPalette?.placeholder ?? ZineTheme.raised) : .clear).overlay {
                        Image(systemName: item.symbol).font(.body).foregroundStyle(customPalette?.text ?? ZineTheme.secondaryText)
                    }
                }
            }
            .frame(width: min(48, height), height: min(48, height))
            .clipped()

            Text(item.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(foreground)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 8)
        }
        .frame(maxWidth: .infinity, minHeight: height, maxHeight: height, alignment: .leading)
        // Clear/Tinted appearances provide their own glass; avoid a white-on-white tile.
        .background(renderingMode == .fullColor && customPalette == nil ? ZineTheme.surface : .clear, in: .rect(cornerRadius: 10))
        .clipShape(.rect(cornerRadius: 10))
    }
}

@main
struct JumpBackInWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: JumpBackInWidgetSnapshot.kind, intent: JumpBackInConfiguration.self, provider: JumpBackInProvider()) { entry in
            JumpBackInWidgetView(entry: entry)
        }
        .configurationDisplayName("Jump Back In")
        .description("Pick up your recently opened bookmarks, just like in Zine.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

#Preview(as: .systemLarge) {
    JumpBackInWidget()
} timeline: {
    JumpBackInProvider().preview
}

#Preview(as: .systemMedium) {
    JumpBackInWidget()
} timeline: {
    JumpBackInProvider().preview
}
