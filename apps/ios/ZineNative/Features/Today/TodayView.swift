import SwiftUI

struct TodayView: View {
    let client: APIClient
    let refreshRevision: Int
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var store: TodayStore
    @State private var labStore: EditorialLabStore
    @State private var isShowingLab = false

    init(
        client: APIClient,
        cache: EditorialIssueCache,
        refreshRevision: Int,
        onContentChanged: @escaping () -> Void,
        onExternalOpen: @escaping (Bookmark) -> Void
    ) {
        self.client = client
        self.refreshRevision = refreshRevision
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        _store = State(initialValue: TodayStore(
            client: client,
            cache: cache,
            onContentChanged: onContentChanged
        ))
        _labStore = State(initialValue: EditorialLabStore(client: client))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Today")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if store.isRefreshing {
                        ToolbarItem(placement: .topBarLeading) {
                            ProgressView()
                                .accessibilityLabel("Refreshing today’s issue")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            isShowingLab = true
                        } label: {
                            Image(systemName: "flask")
                                .overlay(alignment: .topTrailing) {
                                    if labStore.readyExperimentCount > 0 {
                                        Circle()
                                            .fill(Color.accentColor)
                                            .frame(width: 7, height: 7)
                                            .offset(x: 3, y: -2)
                                    }
                                }
                        }
                        .accessibilityLabel("Open Editorial Lab")
                        .accessibilityValue(
                            labStore.readyExperimentCount > 0
                                ? "\(labStore.readyExperimentCount) ready for review"
                                : "No experiments ready for review"
                        )
                    }
                }
                .navigationDestination(for: TodayNavigationRoute.self) { route in
                    destination(for: route)
                }
        }
        .task(id: refreshRevision) {
            async let today: Void = store.reload()
            async let experiments: Void = labStore.load()
            _ = await (today, experiments)
        }
        .sheet(isPresented: $isShowingLab) {
            EditorialLabView(
                store: labStore,
                onPreview: store.showPreview
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .alert("Couldn’t update Today", isPresented: actionErrorBinding) {
            Button("OK", role: .cancel) {
                store.dismissActionError()
            }
        } message: {
            Text(store.actionErrorMessage ?? "Please try again.")
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.response == nil {
            TodayLoadingView()
        } else if let error = store.errorMessage, store.issue == nil {
            ContentUnavailableView {
                Label("Today unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload() }
                }
            }
        } else if let response = store.response, response.issue != nil {
            VStack(spacing: 0) {
                if let experiment = store.previewExperiment,
                   let variant = store.previewVariant
                {
                    previewBanner(experiment: experiment, variant: variant)
                }
                TodayEditionView(
                    response: response,
                    isShowingCachedIssue: store.previewVariant == nil && store.isShowingCachedIssue,
                    refreshErrorMessage: store.previewVariant == nil ? store.refreshErrorMessage : nil,
                    onSaveSource: { sourceID in
                        Task {
                            guard await store.saveSource(id: sourceID) else { return }
                            for recommendation in store.issue?.recommendations
                                .filter({ $0.sourceId == sourceID }) ?? []
                            {
                                await store.recordAction(
                                    targetType: .recommendation,
                                    targetID: recommendation.id,
                                    eventType: .saved
                                )
                            }
                        }
                    },
                    onFeedback: { targetType, targetID, eventType in
                        Task {
                            if eventType == .impression {
                                await store.recordImpression(
                                    targetType: targetType,
                                    targetID: targetID
                                )
                            } else {
                                await store.recordAction(
                                    targetType: targetType,
                                    targetID: targetID,
                                    eventType: eventType
                                )
                            }
                        }
                    }
                )
            }
            .refreshable {
                await store.reload()
            }
            .task(id: response.issue?.id) {
                guard let issueID = response.issue?.id else { return }
                await store.recordImpression(targetType: .edition, targetID: issueID)
            }
        } else if let response = store.response {
            emptyIssueView(response)
        } else {
            TodayLoadingView()
        }
    }

    private func previewBanner(
        experiment: EditorialExperiment,
        variant: EditorialExperimentVariant
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "flask.fill")
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text("PREVIEWING VARIANT \(variant.label.rawValue)")
                    .font(.caption2.bold())
                    .tracking(0.8)
                Text(experiment.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Button("Live Today") {
                store.returnToLiveEdition()
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(.thinMaterial)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func destination(for route: TodayNavigationRoute) -> some View {
        switch route {
        case .story(let id):
            if let story = store.issue?.stories.first(where: { $0.id == id }) {
                EditorialStoryDetailView(
                    story: story,
                    issue: store.issue,
                    presentation: store.response?.presentation ?? EditorialPresentation(sources: [:]),
                    onImpression: {
                        await store.recordImpression(targetType: .story, targetID: story.id)
                    },
                    onFeedback: { event in
                        Task {
                            await store.recordAction(
                                targetType: .story,
                                targetID: story.id,
                                eventType: event
                            )
                        }
                    }
                )
            } else {
                ContentUnavailableView("Story unavailable", systemImage: "newspaper")
            }
        case .source(let id):
            EditorialSourceDestination(
                sourceID: id,
                client: client,
                store: store,
                onContentChanged: onContentChanged,
                onExternalOpen: onExternalOpen
            )
        }
    }

    private func emptyIssueView(_ response: EditorialTodayResponse) -> some View {
        ContentUnavailableView {
            Label(emptyTitle(response), systemImage: emptySystemImage(response))
        } description: {
            Text(
                response.generation.message
                    ?? "Zine will publish the next issue when its sources are ready."
            )
        } actions: {
            Button("Check again") {
                Task { await store.reload() }
            }
        }
    }

    private func emptyTitle(_ response: EditorialTodayResponse) -> String {
        switch response.generation.status {
        case .preparing: "Today’s issue is being prepared"
        case .unavailable: "No issue is available"
        case .published, .stale: "Today’s issue is unavailable"
        }
    }

    private func emptySystemImage(_ response: EditorialTodayResponse) -> String {
        response.generation.status == .preparing ? "clock" : "newspaper"
    }

    private var actionErrorBinding: Binding<Bool> {
        Binding(
            get: { store.actionErrorMessage != nil },
            set: { if !$0 { store.dismissActionError() } }
        )
    }
}

private struct EditorialSourceDestination: View {
    let sourceID: String
    let client: APIClient
    let store: TodayStore
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    var body: some View {
        Group {
            if let userItemID, let source {
                BookmarkDetailView(
                    source: source,
                    presentation: presentation,
                    userItemID: userItemID,
                    client: client,
                    onUpdate: { updated in
                        store.setSourceFinished(id: sourceID, isFinished: updated.isFinished)
                        onContentChanged()
                    },
                    onBookmarkChange: { _, isBookmarked, _ in
                        store.setSourceSaved(id: sourceID, isSaved: isBookmarked)
                    },
                    onBookmarkCommit: { _, _ in onContentChanged() },
                    onExternalOpen: { bookmark in
                        if let bookmark {
                            onExternalOpen(bookmark)
                            Task {
                                await store.recordAction(
                                    targetType: .source,
                                    targetID: sourceID,
                                    eventType: .opened
                                )
                            }
                        } else {
                            Task { await store.sourceOpened(id: sourceID) }
                        }
                    }
                )
            } else {
                EditorialExternalSourceView(sourceID: sourceID, store: store)
            }
        }
    }

    private var userItemID: String? {
        store.presentation(for: sourceID)?.zineUserItemId
            ?? store.source(id: sourceID)?.zineUserItemId
    }

    private var source: EditorialSource? { store.source(id: sourceID) }
    private var presentation: EditorialSourcePresentation? { store.presentation(for: sourceID) }
}

private struct EditorialExternalSourceView: View {
    let sourceID: String
    let store: TodayStore

    @State private var isSaving = false

    private var source: EditorialSource? { store.source(id: sourceID) }
    private var presentation: EditorialSourcePresentation? { store.presentation(for: sourceID) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let imageURL = presentation?.imageURL {
                    CachedRemoteImage(
                        url: imageURL,
                        targetSize: CGSize(width: 390, height: 220)
                    ) {
                        Color.secondary.opacity(0.1)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 220)
                    .clipped()
                    .clipShape(.rect(cornerRadius: 18))
                }

                VStack(alignment: .leading, spacing: 9) {
                    Text(sourceLabel.uppercased())
                        .font(.caption2.weight(.bold))
                        .tracking(1)
                        .foregroundStyle(Color.accentColor)

                    Text(presentation?.title ?? source?.title ?? "Source")
                        .font(.system(size: 30, weight: .bold, design: .serif))

                    if let subtitle = presentation?.subtitle ?? source?.creator {
                        Text(subtitle)
                            .font(.headline)
                            .foregroundStyle(.secondary)
                    }
                }

                if let excerpt = presentation?.excerpt, !excerpt.isEmpty {
                    Text(excerpt)
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                actions
            }
            .padding(20)
        }
        .navigationTitle("Source")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.recordImpression(targetType: .source, targetID: sourceID)
        }
    }

    @ViewBuilder
    private var actions: some View {
        if let source {
            VStack(alignment: .leading, spacing: 16) {
                ProviderLinkButton(
                    provider: provider,
                    destination: source.canonicalUrl,
                    title: provider.openAction.title,
                    onOpen: {
                        Task { await store.sourceOpened(id: sourceID) }
                    }
                )

                HStack(spacing: 18) {
                    if presentation?.isSaved == true {
                        Label("Saved", systemImage: "bookmark.fill")
                            .foregroundStyle(Color.accentColor)
                    } else {
                        Button {
                            Task {
                                isSaving = true
                                _ = await store.saveSource(id: sourceID)
                                isSaving = false
                            }
                        } label: {
                            Label(isSaving ? "Saving…" : "Save", systemImage: "bookmark")
                        }
                        .disabled(isSaving)
                    }

                    ShareLink(item: source.canonicalUrl) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }

                    Menu {
                        Button("More like this", systemImage: "hand.thumbsup") {
                            feedback(.moreLikeThis)
                        }
                        Button("Less like this", systemImage: "hand.thumbsdown") {
                            feedback(.lessLikeThis)
                        }
                    } label: {
                        Label("Tune", systemImage: "ellipsis")
                    }
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.plain)
            }
        }
    }

    private var provider: Provider {
        presentation?.zineProvider ?? (source?.origin == .x ? .x : .web)
    }

    private var sourceLabel: String {
        source?.origin == .x ? "From your X timeline" : (source?.publisher ?? "Source")
    }

    private func feedback(_ event: EditorialFeedbackEventType) {
        Task {
            await store.recordAction(
                targetType: .source,
                targetID: sourceID,
                eventType: event
            )
        }
    }
}
