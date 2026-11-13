import SwiftUI

/// A swipe moves through selections; the page itself never becomes a pager.
enum SectionSwipe {
    static let stepDistance = 64.0

    static func selection(from start: ContentSection, translation: Double, ended: Bool = false) -> ContentSection {
        let all = ContentSection.allCases
        let origin = all.firstIndex(of: start) ?? 0
        let progress = -translation / stepDistance
        let steps = Int(ended ? progress.rounded() : progress.rounded(.towardZero))
        return all[min(all.count - 1, max(0, origin + steps))]
    }
}

struct HeaderFilters: View {
    let selection: ContentSection
    let onSelect: (ContentSection) -> Void
    let onCapture: () -> Void
    @ScaledMetric(relativeTo: .body) private var controlHeight = 54.0
    @State private var swipeOrigin: ContentSection?
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 18) {
                Group {
                    if typeSize.isAccessibilitySize { accessibleFilter }
                    else { filterStrip }
                }
                .frame(width: max(44, geometry.size.width - controlHeight - 18))
                .clipped()
                Button(action: onCapture) {
                    Image(systemName: "plus")
                        .font(.title3.weight(.medium))
                        .foregroundStyle(NextTheme.ink)
                        .frame(width: controlHeight, height: controlHeight)
                        .glassEffect(.regular.interactive(), in: .circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Save a link")
                .accessibilityIdentifier("save-link")
            }
        }
        .frame(height: controlHeight + 10)
        .frame(maxWidth: 860)
        .frame(maxWidth: .infinity)
        .sensoryFeedback(.selection, trigger: selection)
    }

    private var filterStrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal) {
                // Scope compositing inside the viewport: an outer glass container
                // can otherwise draw offscreen filter effects over the save button.
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 10) {
                        ForEach(ContentSection.allCases) { choice in
                            Button { onSelect(choice) } label: {
                                Label(choice.rawValue, systemImage: choice.symbol)
                                    .font(.body.weight(selection == choice ? .semibold : .medium))
                                    .labelStyle(.titleAndIcon)
                                    .fixedSize(horizontal: true, vertical: false)
                                    .foregroundStyle(selection == choice ? NextTheme.selection : NextTheme.ink)
                                    .padding(.horizontal, 17)
                                    .frame(minHeight: controlHeight)
                                    .contentShape(.rect(cornerRadius: 19))
                                    .glassEffect(.regular.tint(selection == choice ? NextTheme.selection.opacity(0.10) : .clear).interactive(), in: .rect(cornerRadius: 19))
                            }
                            .buttonStyle(.plain)
                            .id(choice)
                            .accessibilityLabel(choice.rawValue)
                            .accessibilityIdentifier("section-\(choice.rawValue.lowercased())")
                            .accessibilityAddTraits(selection == choice ? .isSelected : [])
                        }
                    }
                    .padding(.horizontal, 3)
                    .padding(.vertical, 5)
                    .frame(minHeight: controlHeight + 10)
                    .contentShape(.rect)
                    .highPriorityGesture(DragGesture(minimumDistance: 12)
                        .onChanged { value in
                            guard abs(value.translation.width) > abs(value.translation.height) * 1.25 else { return }
                            if swipeOrigin == nil { swipeOrigin = selection }
                            if let origin = swipeOrigin {
                                onSelect(SectionSwipe.selection(from: origin, translation: value.translation.width))
                            }
                        }
                        .onEnded { value in
                            if let origin = swipeOrigin {
                                onSelect(SectionSwipe.selection(from: origin, translation: value.translation.width, ended: true))
                            }
                            swipeOrigin = nil
                            center(proxy)
                        })
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity)
            .clipped()
            .scrollIndicators(.hidden)
            // The strip is a scrub control, with one gesture owner. Centering
            // the selected tile reveals overflow without a competing pan.
            .scrollDisabled(true)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityScrollAction { edge in
                guard edge == .leading || edge == .trailing else { return }
                let delta = edge == .leading ? SectionSwipe.stepDistance : -SectionSwipe.stepDistance
                onSelect(SectionSwipe.selection(from: selection, translation: delta))
            }
            .onChange(of: selection) { _, _ in
                if swipeOrigin == nil { center(proxy) }
            }
            .accessibilityIdentifier("header-filters")
        }
    }

    // At accessibility sizes, one named native menu preserves every filter and
    // leaves the save action reachable instead of shrinking the user's text.
    private var accessibleFilter: some View {
        Menu {
            ForEach(ContentSection.allCases) { choice in
                Button { onSelect(choice) } label: {
                    Label(choice.rawValue, systemImage: selection == choice ? "checkmark" : choice.symbol)
                }
                .accessibilityAddTraits(selection == choice ? .isSelected : [])
            }
        } label: {
            HStack(spacing: 12) {
                Label(selection.rawValue, systemImage: selection.symbol)
                    .font(.body.weight(.semibold))
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down").font(.body)
            }
            .foregroundStyle(NextTheme.selection)
            .padding(.horizontal, 17)
            .frame(maxWidth: .infinity, minHeight: controlHeight)
            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 19))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Section, \(selection.rawValue)")
        .accessibilityIdentifier("section-menu")
        .highPriorityGesture(DragGesture(minimumDistance: 12)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 1.25 else { return }
                if swipeOrigin == nil { swipeOrigin = selection }
                if let origin = swipeOrigin {
                    onSelect(SectionSwipe.selection(from: origin, translation: value.translation.width))
                }
            }
            .onEnded { value in
                if let origin = swipeOrigin {
                    onSelect(SectionSwipe.selection(from: origin, translation: value.translation.width, ended: true))
                }
                swipeOrigin = nil
            })
    }

    private func center(_ proxy: ScrollViewProxy) {
        if reduceMotion { proxy.scrollTo(selection, anchor: .center) }
        else { withAnimation(.easeOut(duration: 0.22)) { proxy.scrollTo(selection, anchor: .center) } }
    }
}
