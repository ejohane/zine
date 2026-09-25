import SwiftUI

private enum ArticleReaderSheet: String, Identifiable {
    case tags, appearance, links

    var id: String { rawValue }
}

struct ArticleReaderView: View {
    @Environment(\.nativeCommandSession) private var commandSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    @ScaledMetric(relativeTo: .body) private var dynamicScale: Double = 1
    @AppStorage(ArticleReaderAppearance.scaleKey) private var textScale = ArticleReaderAppearance.scale()
    @AppStorage(ArticleReaderFontFamily.storageKey) private var storedFontFamily = ArticleReaderFontFamily.system.rawValue

    @State private var store: ArticleReaderStore
    @State private var scrollProgress: Double
    @State private var lastPersistedProgress: Double
    @State private var hasRecordedOpen = false
    @State private var hasRestoredLocalProgress = false
    @State private var chromeVisible = true
    @State private var presentedSheet: ArticleReaderSheet?
    @State private var articleLinks: [ArticleReaderLink]?
    @State private var linksFailed = false
    @State private var bookmarkHapticTrigger = 0
    @State private var completionHapticTrigger = 0
    @State private var linkSaveStates: [String: ArticleLinkSaveState] = [:]
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
        self.onRead = onRead
        self.onProgressSaved = onProgressSaved
        self.onFinishedChanged = onFinishedChanged
        self.onFinishedCommit = onFinishedCommit
        self.onTagsChanged = onTagsChanged
        self.client = client
        self.loadsOnAppear = loadsOnAppear
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .top) {
                ZineTheme.surface
                    .ignoresSafeArea()

                phaseContent(topInset: geometry.safeAreaInsets.top)

                readerChrome
                    .opacity(showsChrome ? 1 : 0)
                    .offset(y: showsChrome || reduceMotion ? 0 : -12)
                    .allowsHitTesting(showsChrome)
                    .accessibilityHidden(!showsChrome)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.22), value: showsChrome)
            }
            .overlay(alignment: .bottomTrailing) {
                if store.readyDocument != nil {
                    HStack(spacing: 0) {
                        Button {
                            presentedSheet = .tags
                        } label: {
                            readerControlSymbol("tag")
                                .frame(width: 48, height: 48)
                        }
                        .accessibilityLabel(store.tags.isEmpty ? "Add tags" : "Edit tags")
                        .accessibilityIdentifier("article-reader-edit-tags")

                        Button {
                            presentedSheet = .links
                        } label: {
                            readerControlSymbol("link")
                                .frame(width: 48, height: 48)
                        }
                        .accessibilityLabel("Article links")
                        .accessibilityIdentifier("article-reader-links")

                        Button {
                            completionHapticTrigger += 1
                            toggleFinished()
                        } label: {
                            readerControlSymbol(store.isFinished ? "checkmark.circle.fill" : "checkmark.circle")
                                .frame(width: 48, height: 48)
                                .foregroundStyle(store.isFinished ? .green : ZineTheme.primaryText)
                                .contentTransition(.symbolEffect(.replace))
                        }
                        .disabled(store.isUpdatingFinished)
                        .accessibilityLabel(store.isFinished ? "Mark unfinished" : "Mark complete")
                        .accessibilityHint("Updates the article immediately")
                        .accessibilityIdentifier("article-reader-completion")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(ZineTheme.primaryText)
                    .background(ZineTheme.surface.opacity(0.96), in: Capsule())
                    .overlay { Capsule().stroke(ZineTheme.border, lineWidth: 1) }
                    .padding(.trailing, 12)
                    .padding(.bottom, 8)
                    .opacity(showsChrome ? 1 : 0)
                    .offset(y: showsChrome || reduceMotion ? 0 : 12)
                    .allowsHitTesting(showsChrome)
                    .accessibilityHidden(!showsChrome)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.22), value: showsChrome)
                }
            }
        }
        .sensoryFeedback(.impact(weight: .heavy, intensity: 1), trigger: bookmarkHapticTrigger)
        .sensoryFeedback(.impact(weight: .heavy, intensity: 1), trigger: completionHapticTrigger)
        .accessibilityAction(.escape) { dismiss() }
        .statusBarHidden(!showsChrome)
        .toolbarVisibility(.hidden, for: .navigationBar)
        .zinePushedDestinationChrome()
        .task(id: store.metadata.bookmarkID) {
            commandSession?.reader = store
            commandSession?.route = "reader"
            commandSession?.bookmarkID = store.metadata.bookmarkID
            commandSession?.progressSaved = { progress in
                lastPersistedProgress = progress.fraction
                scrollProgress = progress.fraction
                onProgressSaved(progress)
            }
            commandSession?.tagsSaved = { tags in
                onTagsChanged(tags)
            }
            commandSession?.complete = persistFinishedToggle
            commandSession?.reconciled = { bookmark in
                onFinishedChanged(bookmark.isFinished, .rollback)
                onTagsChanged(bookmark.tags)
            }
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
            if !hasRestoredLocalProgress {
                hasRestoredLocalProgress = true
                scrollProgress = store.initialProgressFraction
                lastPersistedProgress = store.initialProgressFraction
            }
            recordOpenIfNeeded()
        }
        .onChange(of: store.tags) { _, _ in commandSession?.recordUIChange("reader.tags") }
        .onChange(of: store.isFinished) { _, _ in commandSession?.recordUIChange("reader.finished") }
        .onChange(of: store.progressFraction) { _, _ in commandSession?.recordUIChange("reader.progress") }
        .onChange(of: scenePhase) { _, phase in
            guard phase != .active else { return }
            flushProgress()
        }
        .onDisappear {
            flushProgress()
            if commandSession?.reader === store {
                commandSession?.reader = nil
                commandSession?.progressSaved = nil
                commandSession?.tagsSaved = nil
                commandSession?.complete = nil
            }
        }
        .sheet(item: $presentedSheet) { destination in
            switch destination {
            case .links:
                ArticleReaderLinksSheet(links: articleLinks, failed: linksFailed, saveStates: linkSaveStates, onSave: saveLink)
            case .appearance:
                ArticleReaderAppearanceSheet(textScale: $textScale, fontFamily: $storedFontFamily)
            case .tags:
                ArticleTagEditorView(
                    bookmarkID: store.metadata.bookmarkID,
                    initialTags: store.tags,
                    client: client,
                    saveTags: store.setTags,
                    onSaved: { tags in
                        onTagsChanged(tags)
                    }
                )
            }
        }
        .alert("Couldn’t update article", isPresented: Binding(
            get: { actionErrorMessage != nil },
            set: { if !$0 { actionErrorMessage = nil } }
        )) {
            Button("Try Again", action: toggleFinished)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(actionErrorMessage ?? "Please try again.")
        }
    }

    @ViewBuilder
    private func phaseContent(topInset: CGFloat) -> some View {
        switch store.phase {
        case .loading:
            loadingView(label: "Loading article…")
        case .preparing:
            loadingView(label: "Getting the article ready…")
        case let .ready(document):
            reader(document, topInset: topInset)
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
    private func reader(_ document: ArticleReaderDocument, topInset: CGFloat) -> some View {
        ArticleHTMLView(
            document: document,
            initialProgress: store.initialProgressFraction,
            initialPosition: store.initialReadingPosition,
            fontScale: min(max(textScale, 0.85), 1.6) * dynamicScale,
            fontFamily: ArticleReaderFontFamily(rawValue: storedFontFamily) ?? .system,
            onProgressChanged: updateScrollProgress,
            onScrollSettled: persistSettledProgress,
            onChromeVisibilityChanged: { chromeVisible = $0 },
            onPositionChanged: { position in
                Task { await client.saveArticleReadingPosition(id: store.metadata.bookmarkID, position: position) }
            },
            onOpenURL: { openURL($0) },
            topContentInset: topInset,
            onLinksLoaded: { result in
                switch result {
                case let .success(links): articleLinks = links; linksFailed = false
                case .failure: linksFailed = true
                }
            }
        )
        .ignoresSafeArea(.container, edges: .vertical)
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
                readerControlSymbol("chevron.left")
            }
            .buttonStyle(.plain)
            .foregroundStyle(ZineTheme.primaryText)
            .background(ZineTheme.surface.opacity(0.96), in: Circle())
            .overlay { Circle().stroke(ZineTheme.border, lineWidth: 1) }
            .accessibilityLabel("Back")

            Spacer(minLength: 8)

            HStack(spacing: 0) {
                Button {
                    presentedSheet = .appearance
                } label: {
                    readerControlSymbol("textformat.size")
                }
                .accessibilityLabel("Reader appearance")
                .accessibilityIdentifier("article-reader-appearance")

                ShareLink(item: store.metadata.canonicalURL) {
                    readerControlSymbol("square.and.arrow.up")
                }
                .accessibilityLabel("Share article")
                .accessibilityIdentifier("article-reader-share")

                Menu {
                    Button("Open Original", systemImage: "safari", action: openOriginal)
                    Button(
                        store.isFinished ? "Mark Unfinished" : "Mark Complete",
                        systemImage: store.isFinished ? "arrow.uturn.backward.circle" : "checkmark.circle",
                        action: toggleFinished
                    )
                    .disabled(store.isUpdatingFinished)
                } label: {
                    readerControlSymbol("ellipsis")
                }
                .accessibilityLabel("More article actions")
            }
            .foregroundStyle(ZineTheme.primaryText)
            .background(ZineTheme.surface.opacity(0.96), in: Capsule())
            .overlay { Capsule().stroke(ZineTheme.border, lineWidth: 1) }
        }
        .padding(.horizontal, 12)
        .frame(height: 56)
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier("article-reader-chrome")
    }

    private func readerControlSymbol(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 20))
            .symbolRenderingMode(.monochrome)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }

    private var showsChrome: Bool {
        chromeVisible || voiceOverEnabled || store.readyDocument == nil
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
        Task { _ = await persistFinishedToggle() }
    }

    private func persistFinishedToggle() async -> Bool {
        guard let mutation = store.beginFinishedToggle() else { return false }
        actionErrorMessage = nil
        onFinishedChanged(store.isFinished, .optimistic)
        guard await store.persistFinishedToggle(mutation) else {
            onFinishedChanged(store.isFinished, .rollback)
            actionErrorMessage = "Zine couldn’t change the completion state. Check your connection and try again."
            return false
        }
        onFinishedCommit(store.isFinished)
        return true
    }

    private func saveLink(_ link: ArticleReaderLink) {
        guard linkSaveStates[link.id] != .saving, linkSaveStates[link.id] != .saved else { return }
        linkSaveStates[link.id] = .saving
        bookmarkHapticTrigger += 1
        Task {
            do {
                _ = try await client.saveBookmark(url: link.url)
                linkSaveStates[link.id] = .saved
            } catch {
                linkSaveStates[link.id] = .failed
            }
        }
    }

    private func updateScrollProgress(_ progress: Double) {
        scrollProgress = progress

    }
}

private enum ArticleLinkSaveState { case saving, saved, failed }

private struct ArticleReaderLinksSheet: View {
    @Environment(\.dismiss) private var dismiss
    let links: [ArticleReaderLink]?
    let failed: Bool
    let saveStates: [String: ArticleLinkSaveState]
    let onSave: (ArticleReaderLink) -> Void

    var body: some View {
        NavigationStack {
            Group {
                if failed {
                    ContentUnavailableView("Couldn’t load links", systemImage: "link", description: Text("Close and reopen the article to try again."))
                } else if let links {
                    if links.isEmpty {
                        ContentUnavailableView("No links in this article", systemImage: "link", description: Text("Links to other pages will appear here."))
                    } else {
                        List {
                            Section {
                                ForEach(links) { link in
                                    HStack(alignment: .center, spacing: 12) {
                                        Link(destination: link.url) {
                                            VStack(alignment: .leading, spacing: 6) {
                                                Text(link.title)
                                                    .font(.body.weight(.medium))
                                                    .foregroundStyle(ZineTheme.primaryText)
                                                if !link.context.isEmpty {
                                                    Text(link.context)
                                                        .font(.subheadline)
                                                        .foregroundStyle(ZineTheme.secondaryText)
                                                        .lineLimit(4)
                                                }
                                                Label(link.destination, systemImage: "arrow.up.right")
                                                    .font(.caption)
                                                    .foregroundStyle(ZineTheme.secondaryText)
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityHint("Opens externally")
                                        VStack(spacing: 4) {
                                            Button { onSave(link) } label: {
                                                Image(systemName: saveStates[link.id] == .saving || saveStates[link.id] == .saved ? "bookmark.fill" : "bookmark")
                                                    .font(.system(size: 24, weight: .medium))
                                                    .frame(width: 48, height: 48)
                                                    .contentShape(Rectangle())
                                            }
                                            .buttonStyle(.borderless)
                                            .disabled(saveStates[link.id] == .saving || saveStates[link.id] == .saved)
                                            .foregroundStyle(ZineTheme.inlineLink)
                                            .accessibilityLabel(saveStates[link.id] == .saved ? "Saved to Zine" : "Save to Zine")
                                            .accessibilityValue(saveStates[link.id] == .saving ? "Saving" : "")
                                        }
                                        .overlay(alignment: .bottom) {
                                            Group {
                                                if saveStates[link.id] == .saved || saveStates[link.id] == .saving {
                                                    Text("Saved")
                                                } else if saveStates[link.id] == .failed {
                                                    Text("Try again")
                                                }
                                            }
                                            .font(.caption2)
                                            .offset(y: 14)
                                        }
                                        .foregroundStyle(ZineTheme.secondaryText)
                                    }
                                    .frame(minHeight: 72)
                                    .padding(.vertical, 6)
                                    .listRowBackground(ZineTheme.surface)
                                }
                            } header: {
                                Text("\(links.count) \(links.count == 1 ? "link" : "links")")
                                    .foregroundStyle(ZineTheme.secondaryText)
                            }
                        }
                        .listStyle(.plain)
                        .scrollContentBackground(.hidden)
                    }
                } else {
                    ProgressView("Loading links…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ZineTheme.surface)
            .foregroundStyle(ZineTheme.primaryText)
            .navigationTitle("Article links")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tint(ZineTheme.inlineLink)
        .presentationBackground(ZineTheme.surface)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

private struct ArticleReaderAppearanceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var textScale: Double
    @Binding var fontFamily: String

    var body: some View {
        NavigationStack {
            Form {
                Section("Typeface") {
                    Picker("Typeface", selection: $fontFamily) {
                        ForEach(ArticleReaderFontFamily.allCases) { family in
                            Text(family.title).tag(family.rawValue)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                .listRowBackground(ZineTheme.surface)
                Section {
                    Slider(value: $textScale, in: 0.85...1.6, step: 0.05) {
                        Text("Text size")
                    } minimumValueLabel: {
                        Image(systemName: "textformat.size.smaller")
                    } maximumValueLabel: {
                        Image(systemName: "textformat.size.larger")
                    }
                    .accessibilityValue("\(Int((textScale * 100).rounded())) percent")
                    .accessibilityIdentifier("article-reader-text-size")
                } header: {
                    Text("Text size")
                } footer: {
                    Text("Applies to all articles. Your reading position stays in place.")
                }
                .listRowBackground(ZineTheme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(ZineTheme.canvas)
            .foregroundStyle(ZineTheme.primaryText)
            .tint(ZineTheme.brandAccent)
            .navigationTitle("Appearance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

struct ArticleTagEditorView: View {
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
    private let saveTags: ([String]) async throws -> [BookmarkTag]
    private let onSaved: ([BookmarkTag]) -> Void

    init(
        bookmarkID: String,
        initialTags: [BookmarkTag],
        client: APIClient,
        saveTags: @escaping ([String]) async throws -> [BookmarkTag],
        onSaved: @escaping ([BookmarkTag]) -> Void
    ) {
        self.bookmarkID = bookmarkID
        self.client = client
        self.saveTags = saveTags
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
            let tags = try await saveTags(selectedTagNames)
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
