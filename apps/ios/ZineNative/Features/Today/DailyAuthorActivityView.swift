import SwiftUI

struct DailyAuthorActivityView: View {
    let author: DailyAuthor

    @State private var store: DailyAuthorActivityStore
    @State private var range = DailyAuthorRange.today

    init(client: APIClient, author: DailyAuthor, date: String) {
        self.author = author
        _store = State(
            initialValue: DailyAuthorActivityStore(
                client: client,
                authorKey: author.key,
                date: date
            )
        )
    }

    var body: some View {
        content
            .navigationTitle(author.name)
            .navigationBarTitleDisplayMode(.inline)
            .task(id: range) { await store.load(range: range) }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading, store.response == nil {
            ProgressView("Loading @\(author.username)…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = store.errorMessage, store.response == nil {
            ContentUnavailableView {
                Label("Activity unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") { Task { await store.load(range: range) } }
            }
        } else if let response = store.response {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    authorHeader

                    Picker("Activity range", selection: $range) {
                        ForEach(DailyAuthorRange.allCases) { value in
                            Text(value.title).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("daily-author-range")

                    coverageNotice(response.coverage)

                    if response.posts.isEmpty, !store.isLoading {
                        ContentUnavailableView(
                            "No archived posts",
                            systemImage: "text.bubble",
                            description: Text(
                                range == .today
                                    ? "No posts from @\(author.username) are available for this day."
                                    : "No posts from @\(author.username) are available for this week."
                            )
                        )
                        .padding(.top, 30)
                    } else {
                        ForEach(response.posts) { post in
                            DailyFeedPostCard(
                                post: post,
                                sourceNames: [:]
                            )
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 36)
            }
            .overlay {
                if store.isLoading, store.response != nil {
                    ProgressView()
                        .padding(12)
                        .background(.regularMaterial, in: Circle())
                }
            }
        }
    }

    private var authorHeader: some View {
        HStack(spacing: 13) {
            AsyncImage(url: author.profileImageURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                ZStack {
                    Circle().fill(ZineTheme.raised)
                    Text(author.name.prefix(1).uppercased())
                        .font(.title2.weight(.bold))
                }
            }
            .frame(width: 58, height: 58)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(author.name)
                    .font(.title2.weight(.bold))
                Text("@\(author.username)")
                    .font(.subheadline)
                    .foregroundStyle(ZineTheme.secondaryText)
                Text("All posts available in Zine’s X archive")
                    .font(.caption)
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
        }
    }

    private func coverageNotice(_ coverage: DailyAuthorCoverage) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Label("Archive coverage", systemImage: "archivebox")
                .font(.caption.weight(.semibold))
            ForEach(coverage.warnings, id: \.self) { warning in
                Text(warning)
                    .font(.caption)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZineTheme.brandAccent.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
    }
}
