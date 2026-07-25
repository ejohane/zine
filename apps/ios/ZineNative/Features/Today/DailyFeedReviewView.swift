import SwiftUI

private struct DailyAuthorRoute: Hashable {
    let author: DailyAuthor
    let date: String
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
                        Text("REVIEW")
                            .font(.caption2.weight(.heavy))
                            .tracking(1.2)
                            .foregroundStyle(Color.accentColor)
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
            DailyFeedContent(response: response)
            .refreshable { await store.load() }
        }
    }
}

private struct DailyFeedContent: View {
    let response: DailyFeedResponse

    private var postsByID: [String: DailyPost] {
        Dictionary(uniqueKeysWithValues: response.posts.map { ($0.id, $0) })
    }

    private var sourceNames: [String: String] {
        Dictionary(uniqueKeysWithValues: response.sources.map { ($0.id, $0.name) })
    }

    private var favoritePosts: [DailyPost] {
        let ids = response.sections?.favoritePostIds
            ?? response.posts.filter {
                $0.sourceIds.contains(where: isFavoriteSource) && !conversationPostIDs.contains($0.id)
            }.map(\.id)
        return ids.compactMap { postsByID[$0] }
    }

    private var followingPosts: [DailyPost] {
        let ids = response.sections?.followingPostIds
            ?? response.posts.filter {
                !$0.sourceIds.contains(where: isFavoriteSource) && !conversationPostIDs.contains($0.id)
            }.map(\.id)
        return ids.compactMap { postsByID[$0] }
    }

    private var conversationPostIDs: Set<String> {
        Set(response.conversations.flatMap(\.postIds))
    }

    private func isFavoriteSource(_ sourceID: String) -> Bool {
        response.sources.first(where: { $0.id == sourceID }).map {
            $0.type == .favorites || $0.type == .list
        } ?? false
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                DailyFeedHeader(response: response)
                    .padding(.horizontal, 18)
                    .padding(.top, 18)

                DailyCoverageNotice(response: response)
                    .padding(.horizontal, 18)
                    .padding(.top, 16)

                sectionTitle("FAVORITES", "Conversations from Favorites")
                    .padding(.horizontal, 18)
                    .padding(.top, 30)

                if response.conversations.isEmpty {
                    Text("No evidence-backed Favorite conversations were found in this frozen slice.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 18)
                        .padding(.top, 10)
                } else {
                    VStack(spacing: 12) {
                        ForEach(response.conversations) { conversation in
                            DailyConversationCard(
                                conversation: conversation,
                                posts: conversation.postIds.compactMap { id in
                                    postsByID[id]
                                },
                                date: response.date
                            )
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                }

                sectionTitle("FAVORITES", "More from Favorites")
                    .padding(.horizontal, 18)
                    .padding(.top, 34)

                if favoritePosts.isEmpty {
                    ContentUnavailableView(
                        "No additional Favorite posts",
                        systemImage: "person.2.slash",
                        description: Text("Favorite posts in this slice are either grouped above or unavailable under the disclosed coverage.")
                    )
                    .padding(.top, 34)
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(favoritePosts) { post in
                            DailyFeedPostCard(
                                post: post,
                                sourceNames: sourceNames,
                                authorDestinationDate: response.date
                            )
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 16)
                    .padding(.bottom, 38)
                }

                sectionTitle("FOLLOWING", "More from Following")
                    .padding(.horizontal, 18)
                    .padding(.top, 34)

                if followingPosts.isEmpty {
                    Text("No additional Following posts remain after conversation context and deduplication.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 18)
                        .padding(.top, 10)
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(followingPosts) { post in
                            DailyFeedPostCard(
                                post: post,
                                sourceNames: sourceNames,
                                authorDestinationDate: response.date
                            )
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 16)
                    .padding(.bottom, 38)
                }
            }
        }
    }

    private func sectionTitle(_ eyebrow: String, _ title: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(eyebrow)
                .font(.caption2.weight(.heavy))
                .tracking(1.2)
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.title2.weight(.bold))
        }
    }
}

private struct DailyFeedHeader: View {
    let response: DailyFeedResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("People-first prototype", systemImage: "person.2.fill")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("FROZEN")
                    .font(.caption2.weight(.heavy))
                    .tracking(0.9)
                    .foregroundStyle(.secondary)
            }

            Text(formattedDate)
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .tracking(-0.8)

            Text("The posts are the source of truth. Groups above them are navigation backed by explicit archive evidence, not generated headlines.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Image(systemName: statusIcon)
                    .foregroundStyle(statusColor)
                Text(statusTitle)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(response.coverage.collectedCount)/\(response.coverage.requestedCount)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Text(response.coverage.message)
                .font(.caption)
                .foregroundStyle(.secondary)

            ForEach(response.freshness.warnings, id: \.self) { warning in
                Label(warning, systemImage: "exclamationmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(statusColor.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private var statusTitle: String {
        switch response.coverage.status {
        case .complete: "Complete review coverage"
        case .partial: "Partial review coverage"
        case .unavailable: "Archive unavailable"
        }
    }

    private var statusIcon: String {
        response.coverage.status == .complete ? "checkmark.seal.fill" : "exclamationmark.triangle.fill"
    }

    private var statusColor: Color {
        response.coverage.status == .complete ? .green : .orange
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
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 3) {
                    Text(conversation.label)
                        .font(.headline)
                    Text(conversation.evidence)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ForEach(conversation.coverageWarnings ?? [], id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.circle")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
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
                                .foregroundStyle(.primary)
                            Text(post.text)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .lineLimit(3)
                                .multilineTextAlignment(.leading)
                            Text(isFavorite(post) ? "Favorite source" : "Conversation context")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(isFavorite(post) ? Color.accentColor : .secondary)
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
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
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

    init(
        post: DailyPost,
        sourceNames: [String: String],
        authorDestinationDate: String? = nil
    ) {
        self.post = post
        self.sourceNames = sourceNames
        self.authorDestinationDate = authorDestinationDate
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let repostedBy = post.repostedBy {
                Label("Reposted by @\(repostedBy.username)", systemImage: "arrow.2.squarepath")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
                            .background(Color.accentColor.opacity(0.1), in: Capsule())
                    }
                }
            }
        }
        .padding(14)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
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
                            .foregroundStyle(Color.accentColor)
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
                .foregroundStyle(.secondary)
            }
            Spacer()
            if authorDestinationDate != nil {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
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
                Circle().fill(Color.secondary.opacity(0.16))
                Text(author.name.prefix(1).uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
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
                .foregroundStyle(.secondary)

            if let target = relationship.target {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(target.author.name)  @\(target.author.username)")
                        .font(.caption.weight(.semibold))
                    Text(target.text)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(4)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
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
                            Color.secondary.opacity(0.12)
                            Image(systemName: item.type == "VIDEO" ? "play.fill" : "photo")
                                .foregroundStyle(.secondary)
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
                            Color.secondary.opacity(0.12)
                        }
                        .frame(width: 54, height: 54)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(link.card?.domain ?? domain)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(link.card?.title ?? link.displayUrl ?? link.normalizedUrl)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(9)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 11))
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
        .foregroundStyle(.secondary)
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
