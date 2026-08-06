import SwiftUI

enum PeopleDailyRoute: Hashable {
    case section(String)
}

struct PeopleDailyTodayView: View {
    let client: APIClient
    let store: PeopleDailyStore

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Today")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if store.isRefreshing {
                        ToolbarItem(placement: .topBarLeading) {
                            ProgressView()
                                .accessibilityLabel("Refreshing Today")
                        }
                    }
                }
                .navigationDestination(for: DailyAuthorRoute.self) { route in
                    DailyAuthorActivityView(
                        client: client,
                        author: route.author,
                        date: route.date
                    )
                }
                .navigationDestination(for: PeopleDailyRoute.self) { route in
                    switch route {
                    case let .section(id):
                        PeopleDailySectionView(client: client, sectionID: id)
                    }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading, store.response == nil {
            ProgressView("Loading Today…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = store.errorMessage, store.response == nil {
            ContentUnavailableView {
                Label("Today unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") { Task { await store.load() } }
            }
        } else if let response = store.response {
            PeopleDailyOverviewView(
                response: response,
                isShowingCachedEdition: store.isShowingCachedEdition,
                cachedAt: store.cachedAt,
                refreshErrorMessage: store.refreshErrorMessage
            )
            .refreshable { await store.load() }
        }
    }
}

private struct PeopleDailyOverviewView: View {
    let response: PeopleDailyOverviewResponse
    let isShowingCachedEdition: Bool
    let cachedAt: Date?
    let refreshErrorMessage: String?

    private var authorsByKey: [String: DailyAuthor] {
        Dictionary(uniqueKeysWithValues: response.authors.map { ($0.key, $0) })
    }

    private var moreCount: Int {
        response.more.favoriteConversationCount + response.more.supportingConversationCount
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(formattedDate)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(ZineTheme.secondaryText)
                    Text("What people are talking about")
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)

                PeopleDailyCoverageNotice(
                    response: response,
                    isShowingCachedEdition: isShowingCachedEdition,
                    cachedAt: cachedAt,
                    refreshErrorMessage: refreshErrorMessage
                )
                .padding(.horizontal, 18)
                .padding(.top, 12)

                if response.overviewSections.isEmpty, moreCount == 0 {
                    ContentUnavailableView(
                        "No conversations yet",
                        systemImage: "person.2.slash",
                        description: Text("Today’s edition does not contain enough evidence-backed conversation to publish sections.")
                    )
                    .padding(.top, 48)
                } else {
                    VStack(spacing: 0) {
                        ForEach(response.overviewSections) { section in
                            NavigationLink(value: PeopleDailyRoute.section(section.id)) {
                                DailyOverviewSectionRow(
                                    section: section,
                                    authors: section.authorKeys.compactMap { authorsByKey[$0] }
                                )
                            }
                            .buttonStyle(.plain)

                            Divider()
                                .padding(.leading, 58)
                        }

                        if moreCount > 0 {
                            NavigationLink(value: PeopleDailyRoute.section(response.more.id)) {
                                DailyMoreConversationsRow(count: moreCount)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
                }
            }
        }
    }

    private var formattedDate: String {
        let components = response.date.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return response.date }
        var value = DateComponents()
        value.calendar = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: response.timezone)
        value.year = components[0]
        value.month = components[1]
        value.day = components[2]
        return value.date?.formatted(.dateTime.weekday(.wide).month(.wide).day()) ?? response.date
    }
}

private struct PeopleDailyCoverageNotice: View {
    let response: PeopleDailyOverviewResponse
    let isShowingCachedEdition: Bool
    let cachedAt: Date?
    let refreshErrorMessage: String?

    @State private var showsDetails = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showsDetails.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Circle()
                        .fill(
                            response.freshness.status == .complete
                                ? Color.green
                                : ZineTheme.brandAccent
                        )
                        .frame(width: 7, height: 7)
                    Text(isShowingCachedEdition ? "Saved edition" : statusTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                    Spacer()
                    Text("\(response.more.favoriteConversationCount) Favorites")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(ZineTheme.secondaryText)
                    Image(systemName: showsDetails ? "chevron.up" : "chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZineTheme.tertiaryText)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if showsDetails {
                Text(response.coverage.message)
                    .font(.caption)
                    .foregroundStyle(ZineTheme.secondaryText)
                if let cachedAt, isShowingCachedEdition {
                    Text("Saved \(cachedAt.formatted(.relative(presentation: .named)))")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
                if let refreshErrorMessage {
                    Label(refreshErrorMessage, systemImage: "wifi.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
                ForEach(response.freshness.warnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Divider() }
    }

    private var statusTitle: String {
        switch response.freshness.status {
        case .complete: "Complete daily edition"
        case .partial: "Partial review coverage"
        case .unavailable: "Coverage unavailable"
        }
    }
}

struct PeopleDailySectionView: View {
    let client: APIClient
    let sectionID: String

    @State private var store: PeopleDailySectionStore
    @State private var scope: DailyConversationScope = .favorites

    init(client: APIClient, sectionID: String) {
        self.client = client
        self.sectionID = sectionID
        _store = State(initialValue: PeopleDailySectionStore(client: client, sectionID: sectionID))
    }

    var body: some View {
        Group {
            if store.isLoading, store.response == nil {
                ProgressView("Loading conversations…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = store.errorMessage, store.response == nil {
                ContentUnavailableView {
                    Label("Conversations unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.load() } }
                }
            } else if let response = store.response {
                sectionContent(response)
            }
        }
        .navigationTitle(store.response?.section.title ?? "Conversations")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load() }
    }

    private func sectionContent(_ response: PeopleDailySectionResponse) -> some View {
        let unitsByID = Dictionary(uniqueKeysWithValues: response.threadUnits.map { ($0.id, $0) })
        let postsByID = Dictionary(uniqueKeysWithValues: response.posts.map { ($0.id, $0) })
        let sourceNames = Dictionary(uniqueKeysWithValues: response.sources.map { ($0.id, $0.name) })
        let favoriteIDs = response.section.favoriteThreadUnitIds
        let nearbyIDs = response.section.supportingThreadUnitIds
        let visibleUnits = (scope == .favorites ? favoriteIDs : nearbyIDs).compactMap { unitsByID[$0] }

        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 9) {
                    Text(response.section.title)
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(response.section.summary)
                        .font(.body)
                        .foregroundStyle(ZineTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(response.section.coverageWarnings, id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.circle")
                            .font(.caption)
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)

                if !nearbyIDs.isEmpty {
                    Picker("Conversation source", selection: $scope) {
                        Text("Favorites · \(favoriteIDs.count)")
                            .tag(DailyConversationScope.favorites)
                        Text("Nearby · \(nearbyIDs.count)")
                            .tag(DailyConversationScope.context)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 18)
                    .padding(.top, 20)
                }

                if visibleUnits.isEmpty {
                    ContentUnavailableView(
                        scope == .favorites ? "No Favorite conversations" : "No nearby conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("Nothing is available under this source in the frozen edition.")
                    )
                    .padding(.top, 48)
                } else {
                    ForEach(Array(visibleUnits.enumerated()), id: \.element.id) { index, threadUnit in
                        DailyThreadUnitCard(
                            threadUnit: threadUnit,
                            postsByID: postsByID,
                            sourceNames: sourceNames,
                            date: response.date,
                            isEmbedded: true
                        )
                        .padding(.horizontal, 18)
                        .padding(.top, 22)
                        if index < visibleUnits.count - 1 {
                            Divider()
                                .padding(.leading, 76)
                                .padding(.top, 20)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
        }
    }
}

private struct DailyAuthorRoute: Hashable {
    let author: DailyAuthor
    let date: String
}

private enum DailySectionRoute: Hashable {
    case topic(String)
    case more
}

private func resolvedOverviewSections(
    response: DailyFeedResponse,
    threadUnitsByID: [String: DailyThreadUnit]
) -> [DailyOverviewSection] {
    if let sections = response.overviewSections { return sections }
    return (response.topicClusters ?? []).map { topic in
        DailyOverviewSection(
            id: topic.id,
            title: topic.label,
            summary: "Related conversations from \(topic.favoriteAuthors.count) people you chose.",
            source: "LEGACY_FALLBACK",
            representativePostIds: Array(topic.favoritePostIds.prefix(4)),
            favoriteThreadUnitIds: topic.favoriteThreadUnitIds,
            supportingThreadUnitIds: topic.supportingThreadUnitIds,
            authorKeys: topic.threadUnitIds.flatMap { threadUnitsByID[$0]?.authorKeys ?? [] },
            favoriteConversationCount: topic.favoriteThreadUnitIds.count,
            supportingConversationCount: topic.supportingThreadUnitIds.count,
            latestActivityAt: topic.latestActivityAt,
            coverageWarnings: topic.coverageWarnings
        )
    }
}

struct DailyFeedReviewView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var store: DailyFeedStore

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
        _store = State(initialValue: DailyFeedStore(client: client))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Daily View")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Text("ZINE")
                            .font(.caption2.weight(.heavy))
                            .tracking(1.2)
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                    }
                }
                .navigationDestination(for: DailyAuthorRoute.self) { route in
                    DailyAuthorActivityView(
                        client: client,
                        author: route.author,
                        date: route.date
                    )
                }
                .navigationDestination(for: DailySectionRoute.self) { route in
                    if let response = store.response {
                        DailySectionDetailView(response: response, route: route)
                    } else {
                        ContentUnavailableView("Conversation unavailable", systemImage: "bubble.left.and.exclamationmark.bubble.right")
                    }
                }
        }
        .task { await store.load() }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading, store.response == nil {
            ProgressView("Loading frozen X posts…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = store.errorMessage, store.response == nil {
            ContentUnavailableView {
                Label("Daily View unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") { Task { await store.load() } }
            }
        } else if let response = store.response {
            DailyOverviewView(response: response)
                .refreshable { await store.load() }
        }
    }
}

private struct DailyOverviewView: View {
    let response: DailyFeedResponse

    private var threadUnitsByID: [String: DailyThreadUnit] {
        Dictionary(uniqueKeysWithValues: (response.threadUnits ?? []).map { ($0.id, $0) })
    }

    private var authorsByKey: [String: DailyAuthor] {
        var result: [String: DailyAuthor] = [:]
        for post in response.posts {
            result[post.author.key] = post.author
            if let repostedBy = post.repostedBy { result[repostedBy.key] = repostedBy }
        }
        return result
    }

    private var sections: [DailyOverviewSection] {
        resolvedOverviewSections(response: response, threadUnitsByID: threadUnitsByID)
    }

    private var moreConversationCount: Int {
        (response.sections?.favoriteThreadUnitIds?.count ?? 0) +
            (response.sections?.followingThreadUnitIds?.count ?? 0)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                DailyFeedHeader(response: response)
                    .padding(.horizontal, 18)
                    .padding(.top, 18)

                DailyCoverageNotice(response: response)
                    .padding(.horizontal, 18)
                    .padding(.top, 12)

                if sections.isEmpty {
                    ContentUnavailableView(
                        "No shared conversations yet",
                        systemImage: "person.2.slash",
                        description: Text("Today’s frozen slice does not contain enough independent Favorite voices for an overview section.")
                    )
                    .padding(.top, 48)
                } else {
                    VStack(spacing: 0) {
                        ForEach(sections) { section in
                            NavigationLink(value: DailySectionRoute.topic(section.id)) {
                                DailyOverviewSectionRow(
                                    section: section,
                                    authors: section.authorKeys.compactMap { authorsByKey[$0] }
                                )
                            }
                            .buttonStyle(.plain)

                            Divider()
                                .padding(.leading, 58)
                        }

                        if moreConversationCount > 0 {
                            NavigationLink(value: DailySectionRoute.more) {
                                DailyMoreConversationsRow(count: moreConversationCount)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
                }
            }
        }
    }
}

struct DailyOverviewSectionRow: View {
    let section: DailyOverviewSection
    let authors: [DailyAuthor]

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            DailyParticipantFacepile(authors: uniqueAuthors, size: 24, maximumVisible: 3)
                .frame(width: 68, alignment: .leading)

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(section.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ZineTheme.tertiaryText)
                }

                Text(section.summary)
                    .font(.subheadline)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                Text(conversationSummary)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
        }
        .padding(.vertical, 18)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the conversations in this section")
    }

    private var uniqueAuthors: [DailyAuthor] {
        var seen = Set<String>()
        return authors.filter { seen.insert($0.key).inserted }
    }

    private var conversationSummary: String {
        let favorites = "\(section.favoriteConversationCount) conversation\(section.favoriteConversationCount == 1 ? "" : "s")"
        guard section.supportingConversationCount > 0 else { return favorites }
        return "\(favorites) · \(section.supportingConversationCount) nearby"
    }
}

private struct DailyMoreConversationsRow: View {
    let count: Int

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "text.bubble")
                .font(.title3)
                .foregroundStyle(ZineTheme.secondaryText)
                .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 4) {
                Text("More conversations")
                    .font(.headline)
                Text("\(count) conversation\(count == 1 ? "" : "s") that stand on their own today")
                    .font(.subheadline)
                    .foregroundStyle(ZineTheme.secondaryText)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZineTheme.tertiaryText)
        }
        .padding(.vertical, 18)
        .contentShape(Rectangle())
    }
}

private enum DailyConversationScope: String, CaseIterable, Identifiable {
    case favorites = "Favorites"
    case context = "Nearby"

    var id: String { rawValue }
}

private struct DailySectionDetailView: View {
    let response: DailyFeedResponse
    let route: DailySectionRoute

    @State private var scope: DailyConversationScope = .favorites

    private var postsByID: [String: DailyPost] {
        Dictionary(uniqueKeysWithValues: response.posts.map { ($0.id, $0) })
    }

    private var sourceNames: [String: String] {
        Dictionary(uniqueKeysWithValues: response.sources.map { ($0.id, $0.name) })
    }

    private var threadUnitsByID: [String: DailyThreadUnit] {
        Dictionary(uniqueKeysWithValues: (response.threadUnits ?? []).map { ($0.id, $0) })
    }

    private var section: DailyOverviewSection? {
        guard case let .topic(id) = route else { return nil }
        return resolvedOverviewSections(response: response, threadUnitsByID: threadUnitsByID)
            .first { $0.id == id }
    }

    private var title: String {
        switch route {
        case .topic: section?.title ?? "Conversation"
        case .more: "More conversations"
        }
    }

    private var summary: String {
        switch route {
        case .topic: section?.summary ?? "The underlying conversations from today’s frozen slice."
        case .more: "Conversations that did not need to be forced into a broader section."
        }
    }

    private var favoriteUnitIDs: [String] {
        switch route {
        case .topic: section?.favoriteThreadUnitIds ?? []
        case .more: response.sections?.favoriteThreadUnitIds ?? []
        }
    }

    private var contextUnitIDs: [String] {
        switch route {
        case .topic: section?.supportingThreadUnitIds ?? []
        case .more: response.sections?.followingThreadUnitIds ?? []
        }
    }

    private var visibleUnits: [DailyThreadUnit] {
        (scope == .favorites ? favoriteUnitIDs : contextUnitIDs).compactMap { threadUnitsByID[$0] }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 9) {
                    Text(title)
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(summary)
                        .font(.body)
                        .foregroundStyle(ZineTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    ForEach(section?.coverageWarnings ?? [], id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.circle")
                            .font(.caption)
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)

                if !contextUnitIDs.isEmpty {
                    Picker("Conversation source", selection: $scope) {
                        Text("Favorites · \(favoriteUnitIDs.count)")
                            .tag(DailyConversationScope.favorites)
                        Text("Nearby · \(contextUnitIDs.count)")
                            .tag(DailyConversationScope.context)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 18)
                    .padding(.top, 20)
                }

                if visibleUnits.isEmpty {
                    ContentUnavailableView(
                        scope == .favorites ? "No Favorite conversations" : "No nearby conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text("Nothing is available under this source in the frozen slice.")
                    )
                    .padding(.top, 48)
                } else {
                    ForEach(Array(visibleUnits.enumerated()), id: \.element.id) { index, threadUnit in
                        DailyThreadUnitCard(
                            threadUnit: threadUnit,
                            postsByID: postsByID,
                            sourceNames: sourceNames,
                            date: response.date,
                            isEmbedded: true
                        )
                        .padding(.horizontal, 18)
                        .padding(.top, 22)

                        if index < visibleUnits.count - 1 {
                            Divider()
                                .padding(.leading, 76)
                                .padding(.top, 20)
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DailyFeedHeader: View {
    let response: DailyFeedResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(formattedDate)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(ZineTheme.secondaryText)

            Text("What people are talking about")
                .font(.largeTitle.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var formattedDate: String {
        let components = response.date.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return response.date }
        var value = DateComponents()
        value.calendar = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: response.timezone)
        value.year = components[0]
        value.month = components[1]
        value.day = components[2]
        return value.date?.formatted(.dateTime.weekday(.wide).month(.wide).day()) ?? response.date
    }
}

private struct DailyCoverageNotice: View {
    let response: DailyFeedResponse
    @State private var showsDetails = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { showsDetails.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 7, height: 7)
                    Text(statusTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZineTheme.primaryText)
                    Spacer()
                    Text(scopeSummary)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(ZineTheme.secondaryText)
                    Image(systemName: showsDetails ? "chevron.up" : "chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZineTheme.tertiaryText)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if showsDetails {
                Text(response.coverage.message)
                    .font(.caption)
                    .foregroundStyle(ZineTheme.secondaryText)

                ForEach(response.freshness.warnings, id: \.self) { warning in
                    Label(warning, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(response.overview?.warnings ?? [], id: \.self) { warning in
                    Label(warning, systemImage: "text.quote")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Divider() }
        .accessibilityElement(children: .contain)
    }

    private var statusTitle: String {
        switch response.coverage.status {
        case .complete: "Complete review coverage"
        case .partial: "Partial review coverage"
        case .unavailable: "Archive unavailable"
        }
    }

    private var scopeSummary: String {
        if let windowHours = response.coverage.windowHours {
            return "Last \(windowHours)h · \(response.coverage.collectedCount) posts"
        }
        return "\(response.coverage.collectedCount)/\(response.coverage.requestedCount)"
    }

    private var statusColor: Color {
        response.coverage.status == .complete ? .green : ZineTheme.secondaryText
    }

}

private struct DailyThreadUnitCard: View {
    let threadUnit: DailyThreadUnit
    let postsByID: [String: DailyPost]
    let sourceNames: [String: String]
    let date: String
    var isEmbedded = false

    @State private var isExpanded = false

    private var posts: [DailyPost] {
        threadUnit.postIds.compactMap { postsByID[$0] }
    }

    private var visiblePosts: [DailyPost] {
        isExpanded ? posts : Array(posts.prefix(threadUnit.isThread ? 3 : 1))
    }

    private var participants: [DailyAuthor] {
        var seen = Set<String>()
        return posts.compactMap { post in
            guard seen.insert(post.author.key).inserted else { return nil }
            return post.author
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if threadUnit.isThread {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("\(posts.count)-post thread", systemImage: "arrow.triangle.branch")
                            .font(.subheadline.weight(.semibold))
                        Text(participantSummary)
                            .font(.caption)
                            .foregroundStyle(ZineTheme.secondaryText)
                            .lineLimit(1)

                        if threadUnit.structureStatus != "EXACT" {
                            Label("Some replies may be missing", systemImage: "exclamationmark.circle")
                                .font(.caption2)
                                .foregroundStyle(ZineTheme.secondaryText)
                        }
                    }
                    Spacer(minLength: 8)
                    DailyParticipantFacepile(authors: participants)
                }
                .padding(.bottom, 14)
            }

            if threadUnit.isThread {
                VStack(spacing: 0) {
                    ForEach(Array(visiblePosts.enumerated()), id: \.element.id) { index, post in
                        DailyThreadPostRow(
                            post: post,
                            postsByID: postsByID,
                            sourceNames: sourceNames,
                            date: date,
                            connectsAbove: index > 0,
                            connectsBelow: index < visiblePosts.count - 1 || posts.count > visiblePosts.count
                        )
                    }
                }
            } else if let post = posts.first {
                DailyFeedPostCard(
                    post: post,
                    sourceNames: sourceNames,
                    authorDestinationDate: date,
                    isEmbedded: true
                )
            }

            if posts.count > 3 {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        Text(isExpanded ? "Collapse thread" : "Show complete \(posts.count)-post thread")
                    }
                }
                .font(.caption.weight(.semibold))
                .padding(.leading, threadUnit.isThread ? 58 : 0)
                .padding(.top, 2)
            }

            ForEach(threadUnit.coverageWarnings, id: \.self) { warning in
                Label(warning, systemImage: "exclamationmark.circle")
                    .font(.caption2)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .padding(.top, 8)
            }
        }
        .padding(isEmbedded ? 0 : 14)
        .background(
            isEmbedded ? Color.clear : ZineTheme.surface,
            in: RoundedRectangle(cornerRadius: 16)
        )
    }

    private var participantSummary: String {
        let visible = participants.prefix(3).map { "@\($0.username)" }
        let remainder = participants.count - visible.count
        return visible.joined(separator: " · ") + (remainder > 0 ? " · +\(remainder)" : "")
    }
}

struct DailyParticipantFacepile: View {
    let authors: [DailyAuthor]
    var size: CGFloat = 30
    var maximumVisible = 3

    var body: some View {
        HStack(spacing: -8) {
            ForEach(Array(authors.prefix(maximumVisible)), id: \.key) { author in
                DailyAuthorAvatar(author: author, size: size)
                    .overlay {
                        Circle()
                            .stroke(ZineTheme.canvas, lineWidth: 2)
                    }
            }

            if authors.count > maximumVisible {
                Text("+\(authors.count - maximumVisible)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .frame(width: size, height: size)
                    .background(ZineTheme.raised, in: Circle())
                    .overlay {
                        Circle()
                            .stroke(ZineTheme.canvas, lineWidth: 2)
                    }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Participants: \(authors.map(\.name).joined(separator: ", "))")
    }
}

private struct DailyThreadPostRow: View {
    let post: DailyPost
    let postsByID: [String: DailyPost]
    let sourceNames: [String: String]
    let date: String
    let connectsAbove: Bool
    let connectsBelow: Bool

    private var nonReplyRelationships: [DailyPostRelationship] {
        post.relationships.filter { $0.type != "REPLY_TO" }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            DailyThreadRail(
                author: post.author,
                connectsAbove: connectsAbove,
                connectsBelow: connectsBelow
            )

            VStack(alignment: .leading, spacing: 10) {
                authorHeader

                if let relationshipLabel {
                    Label(relationshipLabel.text, systemImage: relationshipLabel.icon)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ZineTheme.secondaryText)
                }

                if let repostedBy = post.repostedBy {
                    Label("Reposted by @\(repostedBy.username)", systemImage: "arrow.2.squarepath")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                }

                Text(post.text)
                    .font(.body)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)

                ForEach(nonReplyRelationships) { relationship in
                    DailyRelationshipContext(relationship: relationship)
                }

                if !post.media.isEmpty {
                    DailyPostMediaStrip(media: post.media)
                }

                ForEach(Array(post.links.prefix(2))) { link in
                    DailyPostLinkView(link: link)
                }

                HStack(spacing: 10) {
                    if let postURL = post.postURL {
                        Link(destination: postURL) {
                            Label("Open on X", systemImage: "arrow.up.right")
                                .foregroundStyle(ZineTheme.secondaryText)
                        }
                        .tint(ZineTheme.secondaryText)
                    }
                    Spacer(minLength: 8)
                    DailyPostMetricsView(metrics: post.metrics)
                }
                .font(.caption.weight(.semibold))

                if let sourceName {
                    HStack(spacing: 5) {
                        if sourceName.localizedCaseInsensitiveContains("favorite") {
                            Image(systemName: "star.fill")
                                .foregroundStyle(ZineTheme.brandAccent)
                        }
                        Text(sourceName)
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                    .font(.caption2.weight(.semibold))
                }
            }
            .padding(.bottom, 22)
        }
    }

    private var authorHeader: some View {
        NavigationLink(value: DailyAuthorRoute(author: post.author, date: date)) {
            HStack(spacing: 5) {
                Text(post.author.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZineTheme.primaryText)
                if post.author.verified == true {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.caption2)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
                Text("@\(post.author.username)")
                    .font(.caption)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if let effectiveDate = post.effectiveDate {
                    Text(effectiveDate, style: .relative)
                        .font(.caption)
                        .foregroundStyle(ZineTheme.tertiaryText)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var sourceName: String? {
        post.sourceIds.first.map { sourceNames[$0] ?? $0 }
    }

    private var relationshipLabel: (icon: String, text: String)? {
        guard let relationship = post.relationships.first(where: {
            $0.type == "REPLY_TO" || $0.type == "QUOTE_OF" || $0.type == "REPOST_OF"
        }) else { return nil }

        let targetAuthor = relationship.target?.author ?? postsByID[relationship.tweetId]?.author
        let handle = targetAuthor.map { " @\($0.username)" } ?? ""
        switch relationship.type {
        case "REPLY_TO": return ("arrowshape.turn.up.left", "Reply to\(handle)")
        case "QUOTE_OF": return ("quote.bubble", "Quoted\(handle)")
        case "REPOST_OF": return ("arrow.2.squarepath", "Reposted\(handle)")
        default: return nil
        }
    }
}

private struct DailyThreadRail: View {
    let author: DailyAuthor
    let connectsAbove: Bool
    let connectsBelow: Bool

    var body: some View {
        ZStack(alignment: .top) {
            DailyAuthorAvatar(author: author, size: 44)
                .overlay {
                    Circle()
                        .stroke(Color(uiColor: .separator), lineWidth: 1)
                }
                .background(ZineTheme.canvas, in: Circle())
        }
        .frame(width: 46)
        .frame(maxHeight: .infinity, alignment: .top)
        .background {
            GeometryReader { geometry in
                Path { path in
                    if connectsAbove {
                        path.move(to: CGPoint(x: geometry.size.width / 2, y: 0))
                        path.addLine(to: CGPoint(x: geometry.size.width / 2, y: 22))
                    }
                    if connectsBelow {
                        path.move(to: CGPoint(x: geometry.size.width / 2, y: 22))
                        path.addLine(to: CGPoint(x: geometry.size.width / 2, y: geometry.size.height))
                    }
                }
                .stroke(ZineTheme.border, lineWidth: 1.5)
            }
        }
        .accessibilityHidden(true)
    }
}

private struct DailyConversationCard: View {
    let conversation: DailyConversation
    let posts: [DailyPost]
    let date: String
    @State private var isExpanded = false

    private var visiblePosts: [DailyPost] {
        isExpanded ? posts : Array(posts.prefix(2))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: evidenceIcon)
                    .foregroundStyle(ZineTheme.brandAccent)
                VStack(alignment: .leading, spacing: 3) {
                    Text(conversation.label)
                        .font(.headline)
                    Text(conversation.evidence)
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)

                    ForEach(conversation.coverageWarnings ?? [], id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.circle")
                            .font(.caption2)
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                }
            }

            Divider()

            ForEach(visiblePosts) { post in
                NavigationLink(value: DailyAuthorRoute(author: post.author, date: date)) {
                    HStack(alignment: .top, spacing: 9) {
                        DailyAuthorAvatar(author: post.author, size: 30)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(post.author.name)  @\(post.author.username)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ZineTheme.primaryText)
                            Text(post.text)
                                .font(.subheadline)
                                .foregroundStyle(ZineTheme.primaryText)
                                .lineLimit(3)
                                .multilineTextAlignment(.leading)
                            Text(isFavorite(post) ? "Favorite source" : "Conversation context")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(
                                    isFavorite(post) ? ZineTheme.brandAccent : ZineTheme.secondaryText
                                )
                        }
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.plain)
            }

            if posts.count > 2 {
                Button(isExpanded ? "Show less" : "Show all \(posts.count) posts") {
                    withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
                }
                .font(.caption.weight(.semibold))
            }
        }
        .padding(14)
        .background(ZineTheme.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    private func isFavorite(_ post: DailyPost) -> Bool {
        conversation.favoritePostIds?.contains(post.id) ?? false
    }

    private var evidenceIcon: String {
        switch conversation.evidenceType {
        case .directRelationship: "arrow.triangle.branch"
        case .sharedLink: "link"
        case .topicSimilarity: "text.magnifyingglass"
        }
    }
}

struct DailyFeedPostCard: View {
    let post: DailyPost
    let sourceNames: [String: String]
    private let authorDestinationDate: String?
    private let isEmbedded: Bool

    init(
        post: DailyPost,
        sourceNames: [String: String],
        authorDestinationDate: String? = nil,
        isEmbedded: Bool = false
    ) {
        self.post = post
        self.sourceNames = sourceNames
        self.authorDestinationDate = authorDestinationDate
        self.isEmbedded = isEmbedded
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let repostedBy = post.repostedBy {
                Label("Reposted by @\(repostedBy.username)", systemImage: "arrow.2.squarepath")
                    .font(.caption)
                    .foregroundStyle(ZineTheme.secondaryText)
            }

            authorHeader

            Text(post.text)
                .font(.body)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

            if !post.relationships.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(post.relationships) { relationship in
                        DailyRelationshipContext(relationship: relationship)
                    }
                }
            }

            if !post.media.isEmpty {
                DailyPostMediaStrip(media: post.media)
            }

            ForEach(Array(post.links.prefix(2))) { link in
                DailyPostLinkView(link: link)
            }

            HStack(spacing: 12) {
                if let postURL = post.postURL {
                    Link(destination: postURL) {
                        Label("Open on X", systemImage: "arrow.up.right")
                    }
                }
                Spacer()
                DailyPostMetricsView(metrics: post.metrics)
            }
            .font(.caption.weight(.semibold))

            if !post.sourceIds.isEmpty {
                HStack(spacing: 5) {
                    ForEach(post.sourceIds, id: \.self) { sourceID in
                        Text(sourceNames[sourceID] ?? sourceID)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(ZineTheme.brandAccent.opacity(0.1), in: Capsule())
                    }
                }
            }
        }
        .padding(isEmbedded ? 0 : 14)
        .background(
            isEmbedded ? Color.clear : ZineTheme.surface,
            in: RoundedRectangle(cornerRadius: 16)
        )
    }

    @ViewBuilder
    private var authorHeader: some View {
        if let authorDestinationDate {
            NavigationLink(
                value: DailyAuthorRoute(author: post.author, date: authorDestinationDate)
            ) { authorIdentity }
                .buttonStyle(.plain)
        } else {
            authorIdentity
        }
    }

    private var authorIdentity: some View {
        HStack(spacing: 10) {
            DailyAuthorAvatar(author: post.author, size: 40)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(post.author.name)
                        .font(.subheadline.weight(.semibold))
                    if post.author.verified == true {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption2)
                            .foregroundStyle(ZineTheme.brandAccent)
                    }
                }
                HStack(spacing: 5) {
                    Text("@\(post.author.username)")
                    if let date = post.effectiveDate {
                        Text("·")
                        Text(date, style: .relative)
                    }
                    if post.kind != "POST" {
                        Text("· \(post.kind.capitalized)")
                    }
                }
                .font(.caption)
                .foregroundStyle(ZineTheme.secondaryText)
            }
            Spacer()
            if authorDestinationDate != nil {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
        }
        .contentShape(Rectangle())
    }
}

private struct DailyAuthorAvatar: View {
    let author: DailyAuthor
    let size: CGFloat

    var body: some View {
        AsyncImage(url: author.profileImageURL) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            ZStack {
                Circle().fill(ZineTheme.raised)
                Text(author.name.prefix(1).uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ZineTheme.secondaryText)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

private struct DailyRelationshipContext: View {
    let relationship: DailyPostRelationship

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(label, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZineTheme.secondaryText)

            if let target = relationship.target {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(target.author.name)  @\(target.author.username)")
                        .font(.caption.weight(.semibold))
                    Text(target.text)
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                        .lineLimit(4)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(ZineTheme.surface, in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var label: String {
        switch relationship.type {
        case "REPLY_TO": "Reply context"
        case "QUOTE_OF": "Quoted post"
        case "REPOST_OF": "Reposted post"
        default: relationship.type.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private var icon: String {
        switch relationship.type {
        case "REPLY_TO": "arrowshape.turn.up.left"
        case "QUOTE_OF": "quote.bubble"
        case "REPOST_OF": "arrow.2.squarepath"
        default: "link"
        }
    }
}

private struct DailyPostMediaStrip: View {
    let media: [DailyPostMedia]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(media.prefix(3))) { item in
                    AsyncImage(url: item.displayURL) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        ZStack {
                            ZineTheme.raised
                            Image(systemName: item.type == "VIDEO" ? "play.fill" : "photo")
                                .foregroundStyle(ZineTheme.secondaryText)
                        }
                    }
                    .frame(width: 220, height: 128)
                    .clipShape(RoundedRectangle(cornerRadius: 11))
                    .accessibilityLabel(item.altText ?? "Post media")
                }
            }
        }
    }
}

private struct DailyPostLinkView: View {
    let link: DailyPostLink

    var body: some View {
        if let destination = link.destinationURL {
            Link(destination: destination) {
                HStack(spacing: 10) {
                    if let imageUrl = link.card?.imageUrl, let imageURL = URL(string: imageUrl) {
                        AsyncImage(url: imageURL) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            ZineTheme.raised
                        }
                        .frame(width: 54, height: 54)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(link.card?.domain ?? domain)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(ZineTheme.secondaryText)
                        Text(link.card?.title ?? link.displayUrl ?? link.normalizedUrl)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZineTheme.primaryText)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
                .padding(9)
                .background(ZineTheme.surface, in: RoundedRectangle(cornerRadius: 11))
            }
            .buttonStyle(.plain)
        }
    }

    private var domain: String {
        link.destinationURL?.host() ?? link.normalizedUrl
    }
}

private struct DailyPostMetricsView: View {
    let metrics: DailyPostMetrics

    var body: some View {
        HStack(spacing: 8) {
            if let replies = metrics.replies, replies > 0 {
                Label("\(replies)", systemImage: "bubble")
            }
            if let reposts = metrics.reposts, reposts > 0 {
                Label("\(reposts)", systemImage: "arrow.2.squarepath")
            }
            if let likes = metrics.likes, likes > 0 {
                Label("\(likes)", systemImage: "heart")
            }
        }
        .foregroundStyle(ZineTheme.secondaryText)
    }
}

#Preview("Real post card") {
    NavigationStack {
        DailyFeedPostCard(
            post: .preview,
            sourceNames: ["favorites": "Favorites"],
            authorDestinationDate: "2026-07-24"
        )
        .padding()
    }
}

#if DEBUG
struct ScreenshotDailyOverviewView: View {
    var body: some View {
        NavigationStack {
            DailyOverviewView(response: DailyThreadScreenshotFixtures.overviewResponse)
                .navigationTitle("Daily View")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Text("ZINE")
                            .font(.caption2.weight(.heavy))
                            .tracking(1.2)
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") {}
                    }
                }
                .navigationDestination(for: DailySectionRoute.self) { route in
                    DailySectionDetailView(
                        response: DailyThreadScreenshotFixtures.overviewResponse,
                        route: route
                    )
                }
                .navigationDestination(for: DailyAuthorRoute.self) { _ in
                    Text("Author activity")
                }
        }
        .preferredColorScheme(.dark)
    }
}

struct ScreenshotDailyThreadView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Favorites")
                        .font(.caption.weight(.heavy))
                        .tracking(1.1)
                        .foregroundStyle(ZineTheme.secondaryText)

                    Text("Conversations from people you chose")
                        .font(.title2.weight(.bold))

                    DailyThreadUnitCard(
                        threadUnit: DailyThreadScreenshotFixtures.thread,
                        postsByID: DailyThreadScreenshotFixtures.postsByID,
                        sourceNames: ["favorites": "Favorites"],
                        date: "2026-07-26"
                    )

                    Text("Related conversation")
                        .font(.headline)
                        .padding(.top, 6)

                    DailyFeedPostCard(
                        post: DailyThreadScreenshotFixtures.relatedPost,
                        sourceNames: ["favorites": "Favorites"],
                        authorDestinationDate: "2026-07-26"
                    )
                }
                .padding(18)
            }
            .navigationTitle("Daily View")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {}
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private enum DailyThreadScreenshotFixtures {
    static let dan = author("dandigangi", "Dan DiGangi")
    static let ken = author("kenwheeler", "Ken Wheeler", verified: true)
    static let joel = author("joelhooks", "joel")
    static let matt = author("elithrar", "Matt Silverlock")

    static let root = post(
        id: "2081092447354912941",
        author: dan,
        text: "@AdamRackis @kenwheeler pretty sure I saw you guys talking about how you can access your clankers from mobile. how were you guys doing that?",
        publishedAt: "2026-07-26T10:12:00.000Z",
        replies: 3,
        likes: 3
    )

    static let reply = post(
        id: "2081093440104800434",
        author: ken,
        text: "so you establish a tailnet with tailscale and set up a dual redundancy interface. i like pi with codex and a telegram channel and a custom channel to a custom ios and web app.",
        publishedAt: "2026-07-26T10:18:00.000Z",
        relationships: [relationship(type: "REPLY_TO", target: root)],
        replies: 2,
        likes: 4
    )

    static let nestedReply = post(
        id: "2081159242606850138",
        author: joel,
        text: "the way @t3dotcodes works in a tailnet is wild\n\nherdr in termious is pretty good too",
        publishedAt: "2026-07-26T10:24:00.000Z",
        relationships: [relationship(type: "REPLY_TO", target: reply)],
        replies: 1,
        likes: 1
    )

    static let relatedPost = post(
        id: "2081159242606850199",
        author: matt,
        text: "given the huge uptake of voice and speaking-to-your-agent tooling, I’d like to think I was ahead of the curve on this one.",
        publishedAt: "2026-07-26T11:04:00.000Z",
        replies: 2,
        likes: 6
    )

    static let posts = [root, reply, nestedReply]
    static let postsByID = Dictionary(uniqueKeysWithValues: posts.map { ($0.id, $0) })

    static let thread = DailyThreadUnit(
        id: "conversation:2081092447354912941",
        conversationId: "2081092447354912941",
        rootPostId: root.id,
        postIds: posts.map(\.id),
        favoritePostIds: posts.map(\.id),
        followingPostIds: [],
        contextPostIds: [],
        authorKeys: posts.map(\.author.key),
        favoriteAuthorKeys: posts.map(\.author.key),
        authors: posts.map(\.author.username),
        favoriteAuthors: posts.map(\.author.username),
        relationshipTypes: ["REPLY_TO"],
        structureStatus: "EXACT",
        latestActivityAt: nestedReply.publishedAt,
        firstSourcePosition: 0,
        coverageWarnings: []
    )

    static let relatedUnit = DailyThreadUnit(
        id: "conversation:\(relatedPost.id)",
        conversationId: relatedPost.id,
        rootPostId: relatedPost.id,
        postIds: [relatedPost.id],
        favoritePostIds: [relatedPost.id],
        followingPostIds: [],
        contextPostIds: [],
        authorKeys: [relatedPost.author.key],
        favoriteAuthorKeys: [relatedPost.author.key],
        authors: [relatedPost.author.username],
        favoriteAuthors: [relatedPost.author.username],
        relationshipTypes: [],
        structureStatus: "EXACT",
        latestActivityAt: relatedPost.publishedAt,
        firstSourcePosition: 4,
        coverageWarnings: []
    )

    static let overviewResponse = DailyFeedResponse(
        schemaVersion: 3,
        variant: DailyFeedVariant(id: "people-first-v4-editorial-overview", mode: .review),
        date: "2026-07-26",
        timezone: "America/Chicago",
        frozenAt: "2026-07-26T13:00:00.000Z",
        freshness: DailyFeedFreshness(isCurrent: true, status: .partial, warnings: []),
        coverage: DailyFeedCoverage(
            status: .partial,
            archiveStatus: .complete,
            selectionStatus: .complete,
            runId: "fixture-run",
            requestedCount: 5_000,
            collectedCount: 101,
            message: "This frozen review slice is usable with partial thread-expansion coverage.",
            collectionMode: "ROLLING_WINDOW",
            windowHours: 24,
            safetyLimit: 5_000,
            terminationReason: "WINDOW_BOUNDARY_REACHED"
        ),
        sources: [],
        conversations: [],
        topicClusters: nil,
        threadUnits: [thread, relatedUnit],
        overview: DailyOverviewMetadata(
            version: "daily-overview-v1",
            status: "COMPLETE",
            model: "fixture-model",
            frozen: true,
            inputFingerprint: "fixture",
            warnings: []
        ),
        overviewSections: [
            DailyOverviewSection(
                id: "agents",
                title: "How developers are teaching their agents",
                summary: "People are comparing durable project memory, session review, and the tools that let agents improve across repeated work.",
                source: "GENERATED",
                representativePostIds: posts.map(\.id),
                favoriteThreadUnitIds: [thread.id],
                supportingThreadUnitIds: [relatedUnit.id],
                authorKeys: posts.map(\.author.key),
                favoriteConversationCount: 8,
                supportingConversationCount: 1,
                latestActivityAt: nestedReply.publishedAt,
                coverageWarnings: []
            ),
            DailyOverviewSection(
                id: "voice",
                title: "Voice becomes a working interface",
                summary: "The conversation is moving from speech recognition toward practical ways to direct computers and coding agents by voice.",
                source: "GENERATED",
                representativePostIds: [relatedPost.id],
                favoriteThreadUnitIds: [relatedUnit.id],
                supportingThreadUnitIds: [],
                authorKeys: [matt.key, dan.key, ken.key],
                favoriteConversationCount: 5,
                supportingConversationCount: 1,
                latestActivityAt: relatedPost.publishedAt,
                coverageWarnings: []
            ),
            DailyOverviewSection(
                id: "open-models",
                title: "The argument over open model access",
                summary: "Several voices are focusing on who gets to distribute, regulate, and build on open-weight models.",
                source: "GENERATED",
                representativePostIds: [root.id, relatedPost.id],
                favoriteThreadUnitIds: [thread.id],
                supportingThreadUnitIds: [relatedUnit.id],
                authorKeys: [dan.key, ken.key, joel.key, matt.key],
                favoriteConversationCount: 6,
                supportingConversationCount: 3,
                latestActivityAt: root.publishedAt,
                coverageWarnings: []
            )
        ],
        clustering: nil,
        posts: posts + [relatedPost],
        sections: DailyFeedSections(
            favoritePostIds: [],
            followingPostIds: [],
            favoriteThreadUnitIds: [],
            followingThreadUnitIds: []
        ),
        inputs: nil,
        requestId: "fixture-request",
        traceId: "fixture-trace"
    )

    private static func author(
        _ username: String,
        _ name: String,
        verified: Bool = false
    ) -> DailyAuthor {
        DailyAuthor(
            key: "username:\(username)",
            username: username,
            name: name,
            profileUrl: "https://x.com/\(username)",
            profileImageUrl: nil,
            verified: verified
        )
    }

    private static func relationship(type: String, target: DailyPost) -> DailyPostRelationship {
        DailyPostRelationship(
            type: type,
            tweetId: target.id,
            url: target.url,
            evidenceSource: "SCREENSHOT_FIXTURE",
            target: DailyRelatedPost(
                tweetId: target.id,
                text: target.text,
                url: target.url,
                author: target.author
            )
        )
    }

    private static func post(
        id: String,
        author: DailyAuthor,
        text: String,
        publishedAt: String,
        relationships: [DailyPostRelationship] = [],
        replies: Int,
        likes: Int
    ) -> DailyPost {
        DailyPost(
            id: id,
            url: "https://x.com/\(author.username)/status/\(id)",
            text: text,
            publishedAt: publishedAt,
            observedAt: publishedAt,
            kind: relationships.contains(where: { $0.type == "REPLY_TO" }) ? "REPLY" : "POST",
            conversationId: "2081092447354912941",
            structure: DailyPostStructure(
                status: "EXACT",
                source: "X_WEB_GRAPHQL_LIST",
                observedAt: publishedAt
            ),
            author: author,
            media: [],
            links: [],
            metrics: DailyPostMetrics(
                replies: replies,
                reposts: nil,
                likes: likes,
                views: nil,
                bookmarks: nil
            ),
            relationships: relationships,
            presentation: "POST",
            repostedBy: nil,
            sourceIds: ["favorites"],
            sourcePosition: 0
        )
    }
}
#endif

private extension DailyAuthor {
    static let preview = DailyAuthor(
        key: "id:ada",
        username: "ada",
        name: "Ada Example",
        profileUrl: "https://x.com/ada",
        profileImageUrl: nil,
        verified: true
    )
}

private extension DailyPost {
    static let preview = DailyPost(
        id: "123",
        url: "https://x.com/ada/status/123",
        text: "The prototype should keep this real post visible instead of replacing it with a generated headline.",
        publishedAt: "2026-07-24T15:00:00.000Z",
        observedAt: "2026-07-24T15:01:00.000Z",
        kind: "POST",
        conversationId: "123",
        structure: DailyPostStructure(
            status: "EXACT",
            source: "X_WEB_GRAPHQL_LIST",
            observedAt: "2026-07-24T15:01:00.000Z"
        ),
        author: .preview,
        media: [],
        links: [],
        metrics: DailyPostMetrics(replies: 2, reposts: 1, likes: 12, views: 200, bookmarks: 3),
        relationships: [],
        presentation: "POST",
        repostedBy: nil,
        sourceIds: ["favorites"],
        sourcePosition: 0
    )
}
