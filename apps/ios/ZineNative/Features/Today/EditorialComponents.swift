import SwiftUI

enum TodayNavigationRoute: Hashable {
    case story(String)
    case source(String)
}

struct TodayEditionView: View {
    let response: EditorialTodayResponse
    var isShowingCachedIssue = false
    var refreshErrorMessage: String?
    let onSaveSource: (String) -> Void
    let onFeedback: (
        EditorialFeedbackTargetType,
        String,
        EditorialFeedbackEventType
    ) -> Void

    private var issue: EditorialIssue? { response.issue }

    var body: some View {
        if let issue {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let notice = TodayIssueNotice.make(
                        response: response,
                        isShowingCachedIssue: isShowingCachedIssue,
                        refreshErrorMessage: refreshErrorMessage
                    ) {
                        TodayIssueNoticeView(notice: notice)
                            .padding(.horizontal, 20)
                            .padding(.top, 10)
                    }

                    TodayMasthead(issue: issue)
                        .padding(.horizontal, 20)
                        .padding(.top, 18)

                    if let cover = issue.stories.sorted(by: { $0.rank < $1.rank }).first {
                        TodayCoverStory(
                            story: cover,
                            issue: issue,
                            presentation: response.presentation
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                    }

                    TodayBriefing(items: issue.briefing)
                        .padding(.horizontal, 20)
                        .padding(.top, 34)

                    let remainingStories = issue.stories
                        .sorted(by: { $0.rank < $1.rank })
                        .dropFirst()
                    if !remainingStories.isEmpty {
                        TodaySectionTitle(
                            eyebrow: "THE DAY",
                            title: "What’s moving"
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 38)

                        VStack(spacing: 0) {
                            ForEach(Array(remainingStories)) { story in
                                TodayStoryCard(
                                    story: story,
                                    issue: issue,
                                    presentation: response.presentation
                                )
                                .padding(.vertical, 20)

                                if story.id != remainingStories.last?.id {
                                    Divider()
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    if !issue.recommendations.isEmpty {
                        TodaySectionTitle(
                            eyebrow: "RECOMMENDATIONS",
                            title: "Worth your time"
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 40)

                        VStack(spacing: 14) {
                            ForEach(issue.recommendations) { recommendation in
                                TodayRecommendationCard(
                                    recommendation: recommendation,
                                    source: issue.sources.first {
                                        $0.id == recommendation.sourceId
                                    },
                                    presentation: response.presentation.sources[
                                        recommendation.sourceId
                                    ],
                                    onSave: {
                                        onSaveSource(recommendation.sourceId)
                                    },
                                    onFeedback: { event in
                                        onFeedback(.recommendation, recommendation.id, event)
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    }

                    if !issue.emergingSignals.isEmpty {
                        TodaySectionTitle(
                            eyebrow: "WATCHLIST",
                            title: "Still emerging"
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 40)

                        VStack(spacing: 14) {
                            ForEach(issue.emergingSignals) { signal in
                                TodayEmergingSignalCard(signal: signal)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    }

                    TodayBigPicture(text: issue.bigPicture.text)
                        .padding(.horizontal, 20)
                        .padding(.top, 40)

                    TodayCoverageFooter(issue: issue)
                        .padding(.horizontal, 20)
                        .padding(.top, 30)
                        .padding(.bottom, 42)
                }
            }
        }
    }
}

private struct TodayMasthead: View {
    let issue: EditorialIssue

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("ZINE")
                    .font(.caption.weight(.heavy))
                    .tracking(2.6)
                Spacer()
                Text(issueDate)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            Divider()

            Text(issue.headline)
                .font(.system(size: 40, weight: .bold, design: .serif))
                .tracking(-0.7)
                .fixedSize(horizontal: false, vertical: true)

            Text(issue.dek)
                .font(.title3)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(coverageWindow)
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    private var issueDate: String {
        let parts = issue.editionDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return issue.editionDate }
        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.timeZone = TimeZone(identifier: issue.timezone)
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        guard let date = components.date else { return issue.editionDate }
        return date.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }

    private var coverageWindow: String {
        guard let through = try? Date(issue.window.through, strategy: .iso8601) else {
            return "Yesterday’s perspective"
        }
        return "Yesterday’s perspective · through \(through.formatted(.dateTime.hour().minute()))"
    }
}

private struct TodayCoverStory: View {
    let story: EditorialStory
    let issue: EditorialIssue
    let presentation: EditorialPresentation

    var body: some View {
        NavigationLink(value: TodayNavigationRoute.story(story.id)) {
            VStack(alignment: .leading, spacing: 14) {
                if let imageURL {
                    CachedRemoteImage(
                        url: imageURL,
                        targetSize: CGSize(width: 390, height: 220)
                    ) {
                        coverPlaceholder
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 220)
                    .clipped()
                }

                Text("COVER STORY")
                    .font(.caption2.weight(.heavy))
                    .tracking(1.4)
                    .foregroundStyle(Color.accentColor)

                Text(story.title)
                    .font(.system(size: 28, weight: .bold, design: .serif))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(story.lede.text)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineLimit(4)

                TodayStorySignalLine(story: story, issue: issue)
            }
            .padding(.bottom, 18)
            .background(alignment: .bottom) { Divider() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Cover story: \(story.title)")
    }

    private var imageURL: URL? {
        story.sourceIds.lazy.compactMap { presentation.sources[$0]?.imageURL }.first
    }

    private var coverPlaceholder: some View {
        ZStack {
            Color.secondary.opacity(0.1)
            Image(systemName: "newspaper")
                .font(.system(size: 42))
                .foregroundStyle(.secondary)
        }
    }
}

private struct TodayBriefing: View {
    let items: [EditorialCitedText]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TodaySectionTitle(eyebrow: "BRIEFING", title: "In a few minutes")

            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: .top, spacing: 14) {
                    Text(String(format: "%02d", index + 1))
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(Color.accentColor)
                        .padding(.top, 3)
                    Text(item.text)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 15)

                if index < items.count - 1 {
                    Divider()
                        .padding(.leading, 36)
                }
            }
        }
    }
}

private struct TodayStoryCard: View {
    let story: EditorialStory
    let issue: EditorialIssue
    let presentation: EditorialPresentation

    var body: some View {
        NavigationLink(value: TodayNavigationRoute.story(story.id)) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(story.type.rawValue) · \(story.lifecycle.rawValue)")
                        .font(.caption2.weight(.bold))
                        .tracking(0.7)
                        .foregroundStyle(.secondary)

                    Text(story.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(story.lede.text)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)

                    TodayStorySignalLine(story: story, issue: issue)
                }

                if let imageURL {
                    CachedRemoteImage(
                        url: imageURL,
                        targetSize: CGSize(width: 104, height: 104)
                    ) {
                        Color.secondary.opacity(0.1)
                    }
                    .frame(width: 104, height: 104)
                    .clipped()
                    .clipShape(.rect(cornerRadius: 12))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(story.title)
    }

    private var imageURL: URL? {
        story.sourceIds.lazy.compactMap { presentation.sources[$0]?.imageURL }.first
    }
}

private struct TodayStorySignalLine: View {
    let story: EditorialStory
    let issue: EditorialIssue

    var body: some View {
        HStack(spacing: 7) {
            if xCount > 0 {
                Label("\(xCount) X \(xCount == 1 ? "voice" : "voices")", systemImage: "bubble.left.and.bubble.right")
            }
            if zineCount > 0 {
                Label("\(zineCount) in Zine", systemImage: "bookmark")
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var storySources: [EditorialSource] {
        let ids = Set(story.sourceIds)
        return issue.sources.filter { ids.contains($0.id) }
    }

    private var xCount: Int { storySources.count { $0.origin == .x } }
    private var zineCount: Int { storySources.count { $0.origin == .zine } }
}

private struct TodayRecommendationCard: View {
    let recommendation: EditorialRecommendation
    let source: EditorialSource?
    let presentation: EditorialSourcePresentation?
    let onSave: () -> Void
    let onFeedback: (EditorialFeedbackEventType) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink(value: TodayNavigationRoute.source(recommendation.sourceId)) {
                HStack(alignment: .top, spacing: 13) {
                    Image(systemName: recommendation.format.systemImage)
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 28)

                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(recommendation.priority.title.uppercased())
                            if let minutes = recommendation.estimatedMinutes {
                                Text("· \(minutes) min")
                            }
                        }
                        .font(.caption2.weight(.bold))
                        .tracking(0.7)
                        .foregroundStyle(.secondary)

                        Text(recommendation.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(recommendation.reason)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)
            .simultaneousGesture(TapGesture().onEnded {
                onFeedback(.opened)
            })

            HStack {
                if presentation?.isFinished == true || recommendation.alreadyConsumed {
                    Label("Finished", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else if presentation?.isSaved == true {
                    Label("Saved", systemImage: "bookmark.fill")
                        .foregroundStyle(Color.accentColor)
                } else if source != nil {
                    Button(action: onSave) {
                        Label("Save", systemImage: "bookmark")
                    }
                    .buttonStyle(.borderless)
                }

                Spacer()

                Menu {
                    Button {
                        onFeedback(.moreLikeThis)
                    } label: {
                        Label("More like this", systemImage: "hand.thumbsup")
                    }
                    Button {
                        onFeedback(.lessLikeThis)
                    } label: {
                        Label("Less like this", systemImage: "hand.thumbsdown")
                    }
                    Button {
                        onFeedback(.alreadyKnew)
                    } label: {
                        Label("Already knew this", systemImage: "checkmark")
                    }
                    Button(role: .destructive) {
                        onFeedback(.dismissed)
                    } label: {
                        Label("Dismiss", systemImage: "xmark")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 40, height: 32)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Recommendation options")
            }
            .font(.caption.weight(.semibold))
        }
        .padding(16)
        .background(.secondary.opacity(0.08), in: .rect(cornerRadius: 16))
        .task {
            onFeedback(.impression)
        }
    }
}

private struct TodayEmergingSignalCard: View {
    let signal: EditorialEmergingSignal

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(signal.momentum.rawValue)
                .font(.caption2.weight(.bold))
                .tracking(0.7)
                .foregroundStyle(Color.accentColor)
            Text(signal.title)
                .font(.headline)
            Text(signal.summary.text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Why watch: \(signal.whyWatch.text)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.secondary.opacity(0.08), in: .rect(cornerRadius: 16))
    }
}

private struct TodayBigPicture: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("THE BIG PICTURE")
                .font(.caption2.weight(.heavy))
                .tracking(1.3)
                .foregroundStyle(Color.accentColor)
            Text(text)
                .font(.system(.title3, design: .serif, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.secondary.opacity(0.1), in: .rect(cornerRadius: 18))
    }
}

private struct TodayCoverageFooter: View {
    let issue: EditorialIssue

    var body: some View {
        DisclosureGroup("About this issue") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(issue.coverageNotes, id: \.self) { note in
                    Text(note)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.top, 10)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
    }
}

private struct TodaySectionTitle: View {
    let eyebrow: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(eyebrow)
                .font(.caption2.weight(.heavy))
                .tracking(1.4)
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.title2.bold())
        }
    }
}

struct TodayIssueNotice {
    enum Kind: Equatable {
        case stale
        case cached
        case partial
        case xUnavailable
    }

    let kind: Kind
    let title: String
    let message: String

    static func make(
        response: EditorialTodayResponse,
        isShowingCachedIssue: Bool,
        refreshErrorMessage: String?
    ) -> TodayIssueNotice? {
        if response.freshness.sourceStatus?.xArchive == .unavailable {
            return TodayIssueNotice(
                kind: .xUnavailable,
                title: "X coverage unavailable",
                message: "This issue relies more heavily on your Zine sources."
            )
        }
        if response.freshness.sourceStatus?.hasLimitedCoverage == true {
            return TodayIssueNotice(
                kind: .partial,
                title: "Limited source coverage",
                message: response.freshness.warnings.first
                    ?? "Some inputs were incomplete when this issue was prepared."
            )
        }
        if response.generation.status == .stale || !response.freshness.isCurrent {
            return TodayIssueNotice(
                kind: .stale,
                title: "Showing the latest available issue",
                message: response.generation.message
                    ?? "Today’s issue is still being prepared."
            )
        }
        if isShowingCachedIssue || refreshErrorMessage != nil {
            return TodayIssueNotice(
                kind: .cached,
                title: "Reading offline",
                message: "Showing the issue saved on this device."
            )
        }
        return nil
    }
}

private struct TodayIssueNoticeView: View {
    let notice: TodayIssueNotice

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: systemImage)
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 3) {
                Text(notice.title)
                    .font(.subheadline.weight(.semibold))
                Text(notice.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.secondary.opacity(0.09), in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private var systemImage: String {
        switch notice.kind {
        case .stale: "clock.arrow.circlepath"
        case .cached: "wifi.slash"
        case .partial: "exclamationmark.triangle"
        case .xUnavailable: "bubble.left.and.exclamationmark.bubble.right"
        }
    }
}

struct TodayLoadingView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("ZINE")
                    Spacer()
                    Text("Today")
                }
                Text("The day’s most important story goes here")
                    .font(.system(size: 40, weight: .bold, design: .serif))
                Text("A concise perspective on what changed and why it matters to you.")
                    .font(.title3)
                RoundedRectangle(cornerRadius: 16)
                    .frame(height: 210)
                ForEach(0..<3, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("A developing story from your timeline")
                            .font(.title3.bold())
                        Text("Supporting analysis and context from Zine.")
                    }
                    Divider()
                }
            }
            .padding(20)
            .redacted(reason: .placeholder)
        }
        .accessibilityLabel("Loading today’s issue")
    }
}
