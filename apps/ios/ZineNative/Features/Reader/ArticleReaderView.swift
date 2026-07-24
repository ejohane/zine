import SwiftUI

struct ArticleReaderView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var store: ArticleReaderStore
    @State private var scrollProgress: Double
    @State private var lastPersistedProgress: Double
    @State private var hasRecordedOpen = false
    @State private var isUpdatingFinished = false

    private let onRead: () -> Void
    private let onProgressSaved: (BookmarkProgress) -> Void
    private let onFinishedChanged: (Bool) -> Void
    private let loadsOnAppear: Bool

    init(
        metadata: ArticleReaderMetadata,
        client: APIClient,
        initialPhase: ArticleReaderPhase = .loading,
        loadsOnAppear: Bool = true,
        onRead: @escaping () -> Void = {},
        onProgressSaved: @escaping (BookmarkProgress) -> Void = { _ in },
        onFinishedChanged: @escaping (Bool) -> Void = { _ in }
    ) {
        let initialProgress = min(max((metadata.initialProgress?.percent ?? 0) / 100, 0), 1)
        _store = State(
            initialValue: ArticleReaderStore(
                metadata: metadata,
                client: client,
                initialPhase: initialPhase
            )
        )
        _scrollProgress = State(initialValue: initialProgress)
        _lastPersistedProgress = State(initialValue: initialProgress)
        self.onRead = onRead
        self.onProgressSaved = onProgressSaved
        self.onFinishedChanged = onFinishedChanged
        self.loadsOnAppear = loadsOnAppear
    }

    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
                .ignoresSafeArea()

            phaseContent
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(dynamicTypeSize.isAccessibilitySize ? "" : "Reader")
        .toolbar { readerToolbar }
        .task(id: store.metadata.bookmarkID) {
            guard loadsOnAppear else { return }
            await store.load()
        }
        .task(id: progressWriteKey) {
            guard store.readyDocument != nil,
                  scrollProgress > 0,
                  abs(scrollProgress - lastPersistedProgress) >= 0.01
            else { return }
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
            await persistProgress()
        }
        .onChange(of: store.readyDocument?.contentHash, initial: true) { _, hash in
            guard hash != nil else { return }
            recordOpenIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase != .active else { return }
            flushProgress()
        }
        .onDisappear {
            flushProgress()
        }
    }

    @ViewBuilder
    private var phaseContent: some View {
        switch store.phase {
        case .loading:
            loadingView(label: "Loading article…")
        case .preparing:
            loadingView(label: "Getting the article ready…")
        case let .ready(document):
            reader(document)
        case let .unavailable(message):
            unavailableView(message: message, retryable: false)
        case let .failed(message):
            unavailableView(message: message, retryable: true)
        }
    }

    private func loadingView(label: String) -> some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
            Text(label)
                .font(.headline)
            Button("Open Original") {
                openOriginal()
            }
            .buttonStyle(.bordered)
        }
        .padding(24)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func reader(_ document: ArticleReaderDocument) -> some View {
        VStack(spacing: 0) {
            if document.isDegraded {
                degradedNotice
            }

            ArticleHTMLView(
                document: document,
                initialProgress: store.initialProgressFraction,
                onProgressChanged: { scrollProgress = $0 },
                onOpenURL: { openURL($0) }
            )
            .accessibilityIdentifier("article-reader-content")
        }
    }

    private var degradedNotice: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text("This article may be incomplete.")
                .font(.subheadline.weight(.medium))
            Spacer(minLength: 8)
            Button("View Original") {
                openOriginal()
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.orange.opacity(0.1))
    }

    private func unavailableView(message: String, retryable: Bool) -> some View {
        ContentUnavailableView {
            Label("Reader unavailable", systemImage: "doc.text.magnifyingglass")
        } description: {
            Text(message)
        } actions: {
            if retryable {
                Button("Try Again") {
                    Task { await store.load() }
                }
                .buttonStyle(.borderedProminent)
            }
            Button("Open Original") {
                openOriginal()
            }
            .buttonStyle(.bordered)
        }
    }

    @ToolbarContentBuilder
    private var readerToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            ShareLink(item: store.metadata.canonicalURL) {
                Image(systemName: "square.and.arrow.up")
            }
            .accessibilityLabel("Share article")

            Button {
                openOriginal()
            } label: {
                Image(systemName: "safari")
            }
            .accessibilityLabel("Open original article")

            Button {
                Task { await toggleFinished() }
            } label: {
                Image(systemName: store.isFinished ? "checkmark.circle.fill" : "checkmark.circle")
                    .foregroundStyle(store.isFinished ? .green : .primary)
            }
            .disabled(isUpdatingFinished)
            .accessibilityLabel(store.isFinished ? "Mark unfinished" : "Mark finished")
        }
    }

    private var progressWriteKey: Int {
        Int((scrollProgress * 100).rounded(.down))
    }

    private func recordOpenIfNeeded() {
        guard !hasRecordedOpen else { return }
        hasRecordedOpen = true
        onRead()
    }

    private func openOriginal() {
        recordOpenIfNeeded()
        openURL(store.metadata.canonicalURL)
    }

    private func persistProgress() async {
        guard let progress = await store.persistProgress(scrollProgress) else { return }
        lastPersistedProgress = scrollProgress
        onProgressSaved(progress)
    }

    private func flushProgress() {
        guard store.readyDocument != nil,
              scrollProgress > 0,
              abs(scrollProgress - lastPersistedProgress) >= 0.005
        else { return }
        let progress = scrollProgress
        Task {
            guard let saved = await store.persistProgress(progress) else { return }
            await MainActor.run {
                lastPersistedProgress = progress
                onProgressSaved(saved)
            }
        }
    }

    private func toggleFinished() async {
        guard !isUpdatingFinished else { return }
        isUpdatingFinished = true
        defer { isUpdatingFinished = false }
        guard let value = await store.toggleFinished() else { return }
        onFinishedChanged(value)
    }
}
