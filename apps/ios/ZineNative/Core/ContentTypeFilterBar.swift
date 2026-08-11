import SwiftUI

struct CollapsingListTitle: View {
    let title: String
    let progress: CGFloat

    var body: some View {
        Text(title)
            .font(.largeTitle.weight(.bold))
            .foregroundStyle(ZineTheme.primaryText)
            .scaleEffect(1 - (progress * 0.12), anchor: .leading)
            .opacity(1 - progress)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
            .padding(.bottom, 2)
            .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
            .listRowBackground(ZineTheme.canvas)
            .listRowSeparator(.hidden)
            .accessibilityAddTraits(.isHeader)
            .accessibilityHidden(progress >= 0.5)
    }

    static func collapseProgress(scrollOffset: CGFloat) -> CGFloat {
        min(max(scrollOffset / 44, 0), 1)
    }
}

struct CollapsedListTitle: View {
    let title: String
    let progress: CGFloat

    var body: some View {
        Text(title)
            .font(.headline.weight(.semibold))
            .foregroundStyle(ZineTheme.primaryText)
            .opacity(progress)
            .accessibilityHidden(progress < 0.5)
    }
}

struct ContentTypeFilterBar: View {
    @Binding var selection: ContentType?

    private let options: [ContentType?] = [nil, .article, .podcast, .video, .post]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            chips
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZineTheme.canvas)
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityLabel("Content format filters")
    }

    private var chips: some View {
        LazyHStack(spacing: 8) {
            ForEach(options, id: \.self) { contentType in
                ContentTypeFilterChip(
                    title: contentType.map { "\($0.title)s" } ?? "All",
                    systemImage: contentType?.systemImage,
                    isSelected: selection == contentType
                ) {
                    selection = Self.toggledSelection(
                        current: selection,
                        option: contentType
                    )
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
    }

    static func toggledSelection(
        current: ContentType?,
        option: ContentType?
    ) -> ContentType? {
        current == option ? nil : option
    }
}

private struct ContentTypeFilterChip: View {
    let title: String
    let systemImage: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        chipButton
            .background(isSelected ? ZineTheme.brandAccent : ZineTheme.surface, in: Capsule())
            .overlay {
                Capsule()
                    .strokeBorder(
                        isSelected
                            ? ZineTheme.brandAccent
                            : ZineTheme.border,
                        lineWidth: 1
                    )
            }
            .accessibilityLabel("\(title) filter")
            .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var chipButton: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.caption.weight(.semibold))
                }

                Text(title)
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(isSelected ? ZineTheme.onAccent : ZineTheme.secondaryText)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

extension View {
    func contentTypeFilterChrome() -> some View {
        toolbarBackground(ZineTheme.canvas, for: .navigationBar)
    }
}
