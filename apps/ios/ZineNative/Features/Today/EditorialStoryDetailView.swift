import SwiftUI

struct EditorialStoryDetailView: View {
    let story: EditorialStory
    let issue: EditorialIssue?
    let presentation: EditorialPresentation
    let onImpression: () async -> Void
    let onFeedback: (EditorialFeedbackEventType) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                if let whyToday = story.whyToday?.text {
                    storySection("WHY TODAY", whyToday)
                }
                storySection("WHAT HAPPENED", story.whatHappened.text)
                storySection("WHY IT MATTERS", story.whyItMatters.text)
                storySection("THE CONVERSATION", story.conversation.text)
                storySection("ZINE’S READ", story.editorialAnalysis.text)
                xVoices
                zineConnections
                sources
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
        }
        .navigationTitle("Story")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                feedbackMenu
            }
        }
        .task {
            await onImpression()
        }
    }

    @ViewBuilder
    private var xVoices: some View {
        if let voices = story.representativeXVoices, !voices.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                detailSectionLabel("VOICES FROM YOUR X TIMELINE")

                ForEach(voices) { voice in
                    NavigationLink(value: TodayNavigationRoute.source(voice.sourceId)) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 5) {
                                Text(voice.name)
                                    .font(.subheadline.weight(.semibold))
                                if let handle = voice.handle {
                                    Text(handle.hasPrefix("@") ? handle : "@\(handle)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Text(voice.contribution)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var zineConnections: some View {
        if let connections = story.zineConnections, !connections.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                detailSectionLabel("FROM YOUR ZINE")

                ForEach(connections) { connection in
                    NavigationLink(value: TodayNavigationRoute.source(connection.sourceId)) {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "bookmark.fill")
                                .foregroundStyle(Color.accentColor)
                            Text(connection.reason)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func detailSectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.heavy))
            .tracking(1.2)
            .foregroundStyle(Color.accentColor)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(story.type.rawValue) · \(story.momentum.rawValue) MOMENTUM")
                .font(.caption2.weight(.bold))
                .tracking(1)
                .foregroundStyle(Color.accentColor)

            Text(story.title)
                .font(.system(size: 36, weight: .bold, design: .serif))
                .fixedSize(horizontal: false, vertical: true)

            Text(story.lede.text)
                .font(.title3)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func storySection(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.caption2.weight(.heavy))
                .tracking(1.2)
                .foregroundStyle(Color.accentColor)
            Text(text)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var sources: some View {
        if let issue {
            let sourceIDs = Set(story.sourceIds)
            let storySources = issue.sources.filter { sourceIDs.contains($0.id) }

            VStack(alignment: .leading, spacing: 14) {
                detailSectionLabel("ALL SOURCES")

                ForEach(storySources) { source in
                    NavigationLink(value: TodayNavigationRoute.source(source.id)) {
                        EditorialSourceRow(
                            source: source,
                            presentation: presentation.sources[source.id]
                        )
                    }
                    .buttonStyle(.plain)

                    if source.id != storySources.last?.id {
                        Divider()
                    }
                }
            }
        }
    }

    private var feedbackMenu: some View {
        Menu {
            Button("More like this", systemImage: "hand.thumbsup") {
                feedback(.moreLikeThis)
            }
            Button("Less like this", systemImage: "hand.thumbsdown") {
                feedback(.lessLikeThis)
            }
            Button("Already knew this", systemImage: "checkmark") {
                feedback(.alreadyKnew)
            }
            Button("Dismiss", systemImage: "xmark", role: .destructive) {
                feedback(.dismissed)
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .accessibilityLabel("Story options")
    }

    private func feedback(_ event: EditorialFeedbackEventType) {
        onFeedback(event)
    }
}

private struct EditorialSourceRow: View {
    let source: EditorialSource
    let presentation: EditorialSourcePresentation?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.headline)
                .foregroundStyle(source.origin == .x ? .primary : Color.accentColor)
                .frame(width: 26)

            VStack(alignment: .leading, spacing: 4) {
                Text(presentation?.title ?? source.title ?? source.creator ?? "Source")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                if let detail = presentation?.subtitle ?? source.creator ?? source.publisher {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let excerpt = presentation?.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
            }

            Spacer(minLength: 0)
            if presentation?.isFinished == true {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            } else if presentation?.isSaved == true {
                Image(systemName: "bookmark.fill")
                    .foregroundStyle(Color.accentColor)
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var systemImage: String {
        switch source.origin {
        case .x: "bubble.left"
        case .zine: "bookmark"
        case .external: "link"
        }
    }
}
