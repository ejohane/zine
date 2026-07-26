import SwiftUI

struct ArticleReaderView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage(ArticleReaderFontSize.storageKey) private var storedFontSize =
        ArticleReaderFontSize.standard.rawValue

    @State private var store: ArticleReaderStore
    @State private var scrollProgress: Double
    @State private var lastPersistedProgress: Double
    @State private var hasRecordedOpen = false
    @State private var isUpdatingFinished = false
    @State private var readerChromeOffset: CGFloat = 0

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
        let initialProgress = metadata.initialProgress?.fraction ?? 0
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
        ZStack(alignment: .top) {
            Color(uiColor: .systemBackground)
                .ignoresSafeArea()

            phaseContent

            readerChromeViewport
        }
        .toolbarVisibility(.hidden, for: .navigationBar)
        .task(id: store.metadata.bookmarkID) {
            guard loadsOnAppear else { return }
            await store.load()
        }
        .task(id: progressWriteKey) {
            guard store.readyDocument != nil,
                  abs(scrollProgress - lastPersistedProgress) >= 0.01
            else { return }
            let progress = scrollProgress
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
            guard abs(progress - lastPersistedProgress) >= 0.0001 else { return }
            await persistProgress(progress)
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
            readerChromeOffset = 0
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
        ArticleHTMLView(
            document: document,
            initialProgress: store.initialProgressFraction,
            fontScale: readerFontSize.scale,
            onProgressChanged: { scrollProgress = $0 },
            onScrollSettled: persistSettledProgress,
            onChromeOffsetChanged: { readerChromeOffset = $0 },
            onOpenURL: { openURL($0) }
        )
        .accessibilityIdentifier("article-reader-content")
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

    private var readerChrome: some View {
        HStack(spacing: 10) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.headline.weight(.semibold))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .background(.thinMaterial, in: Circle())
            .accessibilityLabel("Back")

            Spacer(minLength: 8)

            HStack(spacing: 0) {
                Menu {
                    ForEach(ArticleReaderFontSize.allCases) { fontSize in
                        Button {
                            storedFontSize = fontSize.rawValue
                        } label: {
                            if fontSize == readerFontSize {
                                Label(fontSize.title, systemImage: "checkmark")
                            } else {
                                Text(fontSize.title)
                            }
                        }
                    }
                } label: {
                    Image(systemName: "textformat.size")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Reader text size")

                ShareLink(item: store.metadata.canonicalURL) {
                    Image(systemName: "square.and.arrow.up")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Share article")

                Button {
                    openOriginal()
                } label: {
                    Image(systemName: "safari")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Open original article")
            }
            .background(.thinMaterial, in: Capsule())
        }
        .padding(.horizontal, 12)
        .frame(height: ArticleReaderChromeOffsetTracker.maximumOffset)
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier("article-reader-chrome")
    }

    private var readerChromeViewport: some View {
        ZStack(alignment: .top) {
            readerChrome
                .offset(y: -readerChromeOffset)
        }
        .frame(maxWidth: .infinity)
        .frame(height: ArticleReaderChromeOffsetTracker.maximumOffset, alignment: .top)
        .clipped()
    }

    private var progressWriteKey: Int {
        Int((scrollProgress * 100).rounded(.down))
    }

    private var readerFontSize: ArticleReaderFontSize {
        ArticleReaderFontSize(rawValue: storedFontSize) ?? .standard
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

    private func persistSettledProgress(_ progress: Double) {
        scrollProgress = progress
        guard store.readyDocument != nil,
              abs(progress - lastPersistedProgress) >= 0.0001
        else { return }
        Task { await persistProgress(progress) }
    }

    private func persistProgress(_ fraction: Double) async {
        guard let progress = await store.persistProgress(fraction) else { return }
        lastPersistedProgress = progress.fraction
        onProgressSaved(progress)
    }

    private func flushProgress() {
        guard store.readyDocument != nil,
              abs(scrollProgress - lastPersistedProgress) >= 0.0001
        else { return }
        let progress = scrollProgress
        Task { await persistProgress(progress) }
    }

    private func toggleFinished() async {
        guard !isUpdatingFinished else { return }
        isUpdatingFinished = true
        defer { isUpdatingFinished = false }
        guard let value = await store.toggleFinished() else { return }
        onFinishedChanged(value)
    }
}
