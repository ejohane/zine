import SwiftUI

/// A format-aware, three-column page. Rows are half a podcast square.
/// First-fit placement fills the gaps without dropping or duplicating saves.
struct BentoPlacement: Identifiable, Equatable {
    let index: Int
    let column: Int
    let row: Int
    let columns: Int
    let rows: Int
    var id: Int { index }
}

enum BentoPlan {
    static let gap: CGFloat = 14

    static func placements(for items: [SavedContent]) -> [BentoPlacement] {
        var occupied = Set<Int>()
        var result: [BentoPlacement] = []
        for (index, item) in items.enumerated() {
            let columns = item.section == .videos ? 2 : 1
            let rows = item.section == .articles ? 3 : item.section == .posts ? 1 : 2
            var row = 0
            var chosen: Int?
            while chosen == nil {
                for column in 0...(3 - columns) {
                    let cells = (row..<(row + rows)).flatMap { r in
                        (column..<(column + columns)).map { r * 3 + $0 }
                    }
                    if cells.allSatisfy({ !occupied.contains($0) }) {
                        occupied.formUnion(cells)
                        chosen = column
                        break
                    }
                }
                if chosen == nil { row += 1 }
            }
            result.append(BentoPlacement(index: index, column: chosen!, row: row, columns: columns, rows: rows))
        }
        return result.sorted { ($0.row, $0.column) < ($1.row, $1.column) }
    }

    static func frame(_ placement: BentoPlacement, width: CGFloat) -> CGRect {
        let column = (width - gap * 2) / 3
        let halfSquare = (column - gap) / 2
        return CGRect(x: CGFloat(placement.column) * (column + gap),
                      y: CGFloat(placement.row) * (halfSquare + gap),
                      width: CGFloat(placement.columns) * (column + gap) - gap,
                      height: CGFloat(placement.rows) * (halfSquare + gap) - gap)
    }
}

struct BentoFeed: View {
    let items: [SavedContent]
    let width: CGFloat
    let mosaic: Bool
    let onOpen: (SavedContent) -> Void

    var body: some View {
        if mosaic {
            let placements = BentoPlan.placements(for: items)
            let height = placements.map { BentoPlan.frame($0, width: width).maxY }.max() ?? 0
            ZStack(alignment: .topLeading) {
                ForEach(Array(placements.enumerated()), id: \.element.id) { order, placement in
                    let frame = BentoPlan.frame(placement, width: width)
                    tile(items[placement.index], first: placement.index == 0, constrained: true)
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                        .accessibilitySortPriority(Double(placements.count - order))
                }
            }
            .frame(width: width, height: height, alignment: .topLeading)
        } else {
            LazyVStack(spacing: BentoPlan.gap) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    tile(item, first: index == 0, constrained: false)
                }
            }
        }
    }

    private func tile(_ item: SavedContent, first: Bool, constrained: Bool) -> some View {
        Button { onOpen(item) } label: {
            BentoStoryCard(item: item, constrained: constrained)
        }
        .buttonStyle(StoryTapStyle())
        .accessibilityIdentifier(first ? "featured-open" : "story-\(item.id)")
        .accessibilityLabel("\(item.section.rawValue), \(item.title), \(item.author), \(item.duration)\(item.isFinished ? ", finished" : "")")
    }
}

private struct BentoStoryCard: View {
    let item: SavedContent
    let constrained: Bool
    @ScaledMetric(relativeTo: .body) private var artworkHeight: CGFloat = 310

    private var media: Bool { item.image != nil && item.section != .posts }

    var body: some View {
        Group {
            if media {
                ZStack(alignment: .bottomLeading) {
                    GeometryReader { geometry in
                        Image(item.image!).resizable().scaledToFill()
                            .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                    }
                    LinearGradient(colors: [.clear, NextTheme.mediaScrim.opacity(0.2), NextTheme.mediaScrim.opacity(0.94)],
                                   startPoint: .top, endPoint: .bottom)
                    copy.foregroundStyle(NextTheme.mediaText).padding(20)
                }
                .frame(minHeight: constrained ? nil : artworkHeight)
                .overlay(alignment: .topTrailing) {
                    if item.section == .videos {
                        Image(systemName: "play.fill").font(.subheadline)
                            .padding(12).background(.ultraThinMaterial, in: .circle).padding(16)
                            .accessibilityHidden(true)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    if item.section == .articles {
                        source.foregroundStyle(NextTheme.secondary)
                        Spacer(minLength: 12)
                    }
                    Text(item.title)
                        .font(item.section == .posts ? .headline : .title2.bold())
                        .lineLimit(constrained ? (item.section == .posts ? 2 : 6) : nil)
                        .fixedSize(horizontal: false, vertical: !constrained)
                    if item.section == .articles && !item.note.isEmpty {
                        Spacer(minLength: 12)
                        Text(item.note).font(.subheadline).foregroundStyle(NextTheme.secondary)
                            .lineLimit(constrained ? 5 : nil)
                    }
                    if item.section != .articles { source.foregroundStyle(NextTheme.secondary) }
                    if item.section != .posts { duration.foregroundStyle(NextTheme.secondary) }
                }
                .padding(20)
                .frame(maxWidth: .infinity, maxHeight: constrained ? .infinity : nil, alignment: .leading)
                .background(item.section == .posts ? NextTheme.inset.opacity(0.55) : NextTheme.paper)
            }
        }
        .clipShape(.rect(cornerRadius: 24))
        .contentShape(.rect(cornerRadius: 24))
    }

    private var copy: some View {
        VStack(alignment: .leading, spacing: 10) {
            source
            Text(item.title)
                .font(item.section == .podcasts ? .title3.bold() : .title2.bold())
                .lineLimit(constrained ? (item.section == .articles ? 5 : 3) : nil)
                .fixedSize(horizontal: false, vertical: !constrained)
            duration
            if let fraction = item.progressFraction, fraction > 0, !item.isFinished {
                ProgressView(value: fraction).tint(NextTheme.mediaText)
                    .accessibilityLabel(item.resumeLabel)
            }
        }
    }

    private var source: some View {
        Label(item.author, systemImage: item.section.symbol)
            .font(.caption.weight(.medium)).lineLimit(constrained ? 1 : nil)
    }

    private var duration: some View {
        HStack(spacing: 8) {
            Text(item.duration)
            if item.isFinished { Image(systemName: "checkmark.circle.fill") }
        }
        .font(.caption.weight(.medium))
    }
}

/// Activate only genuine taps; horizontal body drags never page or open a story.
struct StoryTapStyle: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.contentShape(.rect)
            .onTapGesture(perform: configuration.trigger)
            .accessibilityAction { configuration.trigger() }
    }
}
