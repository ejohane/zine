import SwiftUI

struct PodcastFollowSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var preview: PodcastShowPreview?
    @State private var isLoading = true
    @State private var isFollowing = false
    @State private var errorMessage: String?
    @State private var manualFeedURL = ""

    let bookmarkID: String
    let client: APIClient
    let onFollowed: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Finding the public feed…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let preview {
                    previewForm(preview)
                } else {
                    fallbackForm
                }
            }
            .navigationTitle("Follow show")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .zineAppTheme()
        .task { await loadPreview(manualFeedURL: nil) }
    }

    private func previewForm(_ podcast: PodcastShowPreview) -> some View {
        Form {
            Section {
                HStack(alignment: .top, spacing: 14) {
                    CachedRemoteImage(
                        url: podcast.artworkUrl,
                        targetSize: CGSize(width: 72, height: 72)
                    ) {
                        Image(systemName: "waveform")
                            .font(.title)
                            .foregroundStyle(ZineTheme.tertiaryText)
                    }
                    .frame(width: 72, height: 72)
                    .clipShape(.rect(cornerRadius: 14))

                    VStack(alignment: .leading, spacing: 5) {
                        Text(podcast.title)
                            .font(.headline)
                            .foregroundStyle(ZineTheme.primaryText)
                        if let description = podcast.description, !description.isEmpty {
                            Text(description)
                                .font(.caption)
                                .foregroundStyle(ZineTheme.secondaryText)
                                .lineLimit(3)
                        }
                    }
                }
            }
            .listRowBackground(ZineTheme.surface)

            Section("Recent episodes") {
                ForEach(podcast.recentEpisodes) { episode in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(episode.title)
                            .font(.subheadline.weight(.semibold))
                        HStack(spacing: 8) {
                            if let publishedAt = episode.publishedAt {
                                Text(Date(timeIntervalSince1970: TimeInterval(publishedAt) / 1000), style: .date)
                            }
                            if let duration = episode.durationSeconds {
                                Text(durationLabel(duration))
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                    }
                }
            }
            .listRowBackground(ZineTheme.surface)

            Section {
                Button {
                    Task { await follow() }
                } label: {
                    HStack {
                        Spacer()
                        if isFollowing {
                            ProgressView()
                        } else {
                            Label("Follow show", systemImage: "plus.circle.fill")
                                .font(.headline)
                        }
                        Spacer()
                    }
                }
                .disabled(isFollowing)
                .accessibilityIdentifier("podcast-follow-confirm")

                if let url = podcast.externalShowUrl, let label = podcast.externalShowLabel {
                    Link(destination: url) {
                        Label(label, systemImage: "arrow.up.forward.app")
                    }
                }

                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.brandAccent)
                }
            } footer: {
                Text("Future episodes will appear in Inbox. Episodes already in the feed stay out of Inbox.")
            }
            .listRowBackground(ZineTheme.surface)
        }
        .scrollContentBackground(.hidden)
        .background(ZineTheme.canvas)
    }

    private var fallbackForm: some View {
        Form {
            Section {
                ContentUnavailableView(
                    "Feed not found",
                    systemImage: "dot.radiowaves.left.and.right",
                    description: Text(errorMessage ?? "Paste the publisher's public RSS feed to continue.")
                )
            }
            .listRowBackground(ZineTheme.surface)

            Section {
                TextField("https://example.com/podcast.xml", text: $manualFeedURL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("podcast-rss-field")
                Button("Preview feed") {
                    Task { await loadPreview(manualFeedURL: manualFeedURL) }
                }
                .disabled(manualFeedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("podcast-rss-preview")
            } header: {
                Text("Public RSS feed")
            } footer: {
                Text("Only public podcast feeds are supported. Private and paid feeds aren't sent to Zine.")
            }
            .listRowBackground(ZineTheme.surface)
        }
        .scrollContentBackground(.hidden)
        .background(ZineTheme.canvas)
    }

    private func loadPreview(manualFeedURL: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            preview = try await client.previewPodcastShow(
                bookmarkId: bookmarkID,
                manualFeedUrl: manualFeedURL?.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        } catch is CancellationError {
            return
        } catch {
            preview = nil
            errorMessage = error.localizedDescription
        }
    }

    private func follow() async {
        guard !isFollowing else { return }
        isFollowing = true
        defer { isFollowing = false }
        do {
            _ = try await client.followPodcastShow(
                bookmarkId: bookmarkID,
                manualFeedUrl: manualFeedURL.isEmpty ? nil : manualFeedURL
            )
            onFollowed()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func durationLabel(_ seconds: Int) -> String {
        let minutes = max(1, seconds / 60)
        return minutes < 60 ? "\(minutes) min" : "\(minutes / 60) hr \(minutes % 60) min"
    }
}
