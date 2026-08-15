import SwiftUI

enum ArticleReaderEndActions {
    static let revealThreshold = 0.985

    static func shouldReveal(for progress: Double) -> Bool {
        progress >= revealThreshold
    }
}

private enum ArticleReaderSheet: String, Identifiable {
    case tags

    var id: String { rawValue }
}

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
    @State private var readerChromeOffset: CGFloat = 0
    @State private var showsEndActions: Bool
    @State private var presentedSheet: ArticleReaderSheet?
    @State private var readerTags: [BookmarkTag]
    @State private var actionErrorMessage: String?

    private let onRead: () -> Void
    private let onProgressSaved: (BookmarkProgress) -> Void
    private let onFinishedChanged: (Bool, BookmarkChangePhase) -> Void
    private let onFinishedCommit: (Bool) -> Void
    private let onTagsChanged: ([BookmarkTag]) -> Void
    private let client: APIClient
    private let loadsOnAppear: Bool

    init(
        metadata: ArticleReaderMetadata,
        client: APIClient,
        initialPhase: ArticleReaderPhase = .loading,
        loadsOnAppear: Bool = true,
        onRead: @escaping () -> Void = {},
        onProgressSaved: @escaping (BookmarkProgress) -> Void = { _ in },
        onFinishedChanged: @escaping (Bool, BookmarkChangePhase) -> Void = { _, _ in },
        onFinishedCommit: @escaping (Bool) -> Void = { _ in },
        onTagsChanged: @escaping ([BookmarkTag]) -> Void = { _ in }
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
        _showsEndActions = State(
            initialValue: ArticleReaderEndActions.shouldReveal(for: initialProgress)
        )
        _readerTags = State(initialValue: metadata.tags)
        self.onRead = onRead
        self.onProgressSaved = onProgressSaved
        self.onFinishedChanged = onFinishedChanged
        self.onFinishedCommit = onFinishedCommit
        self.onTagsChanged = onTagsChanged
        self.client = client
        self.loadsOnAppear = loadsOnAppear
    }

    var body: some View {
        ZStack(alignment: .top) {
            ZineTheme.surface
                .ignoresSafeArea()

            phaseContent

            readerChromeViewport
        }
        .overlay(alignment: .bottom) {
            if store.readyDocument != nil, showsEndActions {
                readerEndActions
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .toolbarVisibility(.hidden, for: .navigationBar)
        .toolbarVisibility(.hidden, for: .tabBar)
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
        .sheet(item: $presentedSheet) { destination in
            switch destination {
            case .tags:
                ArticleTagEditorView(
                    bookmarkID: store.metadata.bookmarkID,
                    initialTags: readerTags,
                    client: client,
                    onSaved: { tags in
                        readerTags = tags
                        onTagsChanged(tags)
                    }
                )
            }
        }
        .alert("Couldn’t update article", isPresented: Binding(
            get: { actionErrorMessage != nil },
            set: { if !$0 { actionErrorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(actionErrorMessage ?? "Please try again.")
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
            onProgressChanged: updateScrollProgress,
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
            .foregroundStyle(ZineTheme.primaryText)
            .background(ZineTheme.surface.opacity(0.96), in: Circle())
            .overlay { Circle().stroke(ZineTheme.border, lineWidth: 1) }
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
            .foregroundStyle(ZineTheme.primaryText)
            .background(ZineTheme.surface.opacity(0.96), in: Capsule())
            .overlay { Capsule().stroke(ZineTheme.border, lineWidth: 1) }
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

    private var readerEndActions: some View {
        VStack(spacing: 12) {
            Capsule()
                .fill(ZineTheme.border)
                .frame(width: 36, height: 4)

            HStack {
                Text(store.isFinished ? "Reading complete" : "Finished reading?")
                    .font(.headline)
                    .foregroundStyle(ZineTheme.primaryText)

                Spacer()

            }

            HStack(spacing: 10) {
                Button {
                    toggleFinished()
                } label: {
                    Label(
                        store.isFinished ? "Mark unfinished" : "Mark complete",
                        systemImage: store.isFinished
                            ? "arrow.uturn.backward.circle"
                            : "checkmark.circle.fill"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(ZineTheme.brandAccent)
                .foregroundStyle(ZineTheme.onAccent)
                .allowsHitTesting(!store.isUpdatingFinished)
                .accessibilityIdentifier("article-reader-toggle-complete")

                Button {
                    presentedSheet = .tags
                } label: {
                    Label(
                        readerTags.isEmpty ? "Add tags" : "Edit tags",
                        systemImage: "tag"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(ZineTheme.primaryText)
                .accessibilityIdentifier("article-reader-edit-tags")
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 14)
        .padding(.top, 9)
        .padding(.bottom, 14)
        .background(ZineTheme.surface.opacity(0.98), in: .rect(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(ZineTheme.border, lineWidth: 1)
        }
        .shadow(color: ZineTheme.primaryText.opacity(0.12), radius: 18, y: 8)
        .accessibilityIdentifier("article-reader-end-actions")
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
        updateScrollProgress(progress)
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

    private func toggleFinished() {
        guard let mutation = store.beginFinishedToggle() else { return }
        onFinishedChanged(store.isFinished, .optimistic)

        Task {
            guard await store.persistFinishedToggle(mutation) else {
                onFinishedChanged(store.isFinished, .rollback)
                actionErrorMessage = "Zine couldn’t change the completion state. Check your connection and try again."
                return
            }
            onFinishedCommit(store.isFinished)
        }
    }

    private func updateScrollProgress(_ progress: Double) {
        scrollProgress = progress
        guard !showsEndActions,
              ArticleReaderEndActions.shouldReveal(for: progress)
        else { return }
        withAnimation(.snappy) {
            showsEndActions = true
        }
    }
}

private struct ArticleTagEditorView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var availableTags: [BookmarkTag]
    @State private var selectedTagNames: [String]
    @State private var query = ""
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var loadErrorMessage: String?
    @State private var saveErrorMessage: String?

    private let bookmarkID: String
    private let client: APIClient
    private let onSaved: ([BookmarkTag]) -> Void

    init(
        bookmarkID: String,
        initialTags: [BookmarkTag],
        client: APIClient,
        onSaved: @escaping ([BookmarkTag]) -> Void
    ) {
        self.bookmarkID = bookmarkID
        self.client = client
        self.onSaved = onSaved
        _availableTags = State(initialValue: initialTags)
        _selectedTagNames = State(initialValue: initialTags.map(\.name))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                TextField("Add or search tags", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit(addQuery)
                    .accessibilityLabel("Tag input")

                if normalizedQuery.count > BookmarkShareStore.maximumTagLength {
                    Text("Tags can be up to \(BookmarkShareStore.maximumTagLength) characters.")
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if canCreateQuery {
                    Button {
                        addQuery()
                    } label: {
                        Label("Create \"\(normalizedQuery)\"", systemImage: "plus")
                            .lineLimit(1)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .disabled(selectedTagNames.count >= BookmarkShareStore.maximumTagCount)
                }

                if isLoading, availableTags.isEmpty {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                        Text("Loading tags…")
                            .foregroundStyle(ZineTheme.secondaryText)
                    }
                } else if let loadErrorMessage {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(loadErrorMessage)
                            .font(.caption)
                            .foregroundStyle(ZineTheme.secondaryText)
                        Spacer()
                        Button("Retry") {
                            Task { await loadTags() }
                        }
                        .font(.caption.weight(.semibold))
                    }
                }

                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(filteredTags) { tag in
                            tagRow(tag)
                        }
                    }
                }

                if selectedTagNames.count >= BookmarkShareStore.maximumTagCount {
                    Text("You can add up to \(BookmarkShareStore.maximumTagCount) tags.")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(ZineTheme.canvas)
            .navigationTitle("Article tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .fontWeight(.semibold)
                    .disabled(isSaving)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(isSaving)
        .task { await loadTags() }
        .alert("Couldn’t save tags", isPresented: Binding(
            get: { saveErrorMessage != nil },
            set: { if !$0 { saveErrorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveErrorMessage ?? "Please try again.")
        }
    }

    private var normalizedQuery: String {
        BookmarkShareStore.normalizedTagName(query)
    }

    private var filteredTags: [BookmarkTag] {
        let key = tagKey(query)
        guard !key.isEmpty else { return availableTags }
        return availableTags.filter { tagKey($0.name).contains(key) }
    }

    private var canCreateQuery: Bool {
        guard !normalizedQuery.isEmpty,
              normalizedQuery.count <= BookmarkShareStore.maximumTagLength
        else { return false }
        let key = tagKey(normalizedQuery)
        return !availableTags.contains { tagKey($0.name) == key }
    }

    private func tagRow(_ tag: BookmarkTag) -> some View {
        let isSelected = containsTag(named: tag.name)
        let isDisabled = !isSelected
            && selectedTagNames.count >= BookmarkShareStore.maximumTagCount

        return Button {
            toggleTag(named: tag.name)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? ZineTheme.brandAccent : ZineTheme.secondaryText)
                Text(tag.name)
                    .foregroundStyle(ZineTheme.primaryText)
                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(ZineTheme.border, lineWidth: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .accessibilityLabel("\(tag.name) tag")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
    }

    private func addQuery() {
        guard canCreateQuery,
              selectedTagNames.count < BookmarkShareStore.maximumTagCount
        else { return }
        let name = normalizedQuery
        availableTags.insert(BookmarkTag(id: "local-\(UUID().uuidString)", name: name), at: 0)
        selectedTagNames.append(name)
        query = ""
    }

    private func toggleTag(named name: String) {
        let key = tagKey(name)
        if containsTag(named: name) {
            selectedTagNames.removeAll { tagKey($0) == key }
        } else if selectedTagNames.count < BookmarkShareStore.maximumTagCount {
            selectedTagNames.append(name)
        }
    }

    private func containsTag(named name: String) -> Bool {
        let key = tagKey(name)
        return selectedTagNames.contains { tagKey($0) == key }
    }

    private func tagKey(_ value: String) -> String {
        BookmarkShareStore.normalizedTagName(value).lowercased()
    }

    private func loadTags() async {
        isLoading = true
        loadErrorMessage = nil
        defer { isLoading = false }

        do {
            availableTags = uniqueTags(availableTags + (try await client.listTags()))
        } catch is CancellationError {
            return
        } catch {
            loadErrorMessage = "Couldn’t load your tags. You can still add one manually."
        }
    }

    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }

        do {
            let tags = try await client.setTags(id: bookmarkID, tags: selectedTagNames)
            onSaved(tags)
            dismiss()
        } catch is CancellationError {
            return
        } catch {
            saveErrorMessage = "Zine couldn’t save these tags. Check your connection and try again."
        }
    }

    private func uniqueTags(_ tags: [BookmarkTag]) -> [BookmarkTag] {
        var seen = Set<String>()
        return tags.filter { seen.insert(tagKey($0.name)).inserted }
    }
}
