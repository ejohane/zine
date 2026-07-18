import SwiftUI

struct BookmarkShareView: View {
    @State private var store: BookmarkShareStore
    @State private var tagQuery = ""

    let onCancel: () -> Void
    let onComplete: () -> Void

    init(
        store: BookmarkShareStore,
        onCancel: @escaping () -> Void,
        onComplete: @escaping () -> Void
    ) {
        _store = State(initialValue: store)
        self.onCancel = onCancel
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemGroupedBackground))
                .navigationTitle("Save to Zine")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(action: onCancel) {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel("Cancel")
                        .disabled(store.phase == .saving)
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if store.phase == .ready || store.phase == .saving {
                        saveButton
                    }
                }
        }
        .tint(Color(red: 0.937, green: 0.400, blue: 0.122))
        .task {
            await store.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch store.phase {
        case .loadingLink:
            LoadingView(title: "Reading link…")
        case .loadingPreview:
            LoadingView(title: "Fetching preview…")
        case .ready, .saving:
            if let preview = store.preview, let url = store.url {
                ScrollView {
                    VStack(spacing: 16) {
                        BookmarkPreviewCard(preview: preview, originalURL: url)
                        BookmarkTagSelector(store: store, query: $tagQuery)
                    }
                    .padding()
                }
            }
        case .saved:
            ConfirmationView(
                title: store.saveStatus?.confirmationTitle ?? "Saved to Zine"
            )
        case .failed:
            ErrorView(
                message: store.errorMessage ?? "Something went wrong.",
                onRetry: {
                    Task { await store.retry() }
                }
            )
        }
    }

    private var saveButton: some View {
        VStack(spacing: 0) {
            Divider()
            Button {
                Task {
                    guard await store.save() else { return }
                    try? await Task.sleep(for: .milliseconds(700))
                    guard !Task.isCancelled else { return }
                    onComplete()
                }
            } label: {
                HStack(spacing: 8) {
                    if store.phase == .saving {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    }
                    Text(store.phase == .saving ? "Saving…" : "Save Bookmark")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.phase == .saving)
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        .background(.bar)
    }
}

private struct BookmarkTagSelector: View {
    let store: BookmarkShareStore
    @Binding var query: String

    private var normalizedQuery: String {
        BookmarkShareStore.normalizedTagName(query)
    }

    private var visibleTags: [BookmarkShareTag] {
        store.tags(matching: query)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Tags", systemImage: "tag")
                    .font(.headline)

                Spacer()

                if !store.selectedTags.isEmpty {
                    Text("\(store.selectedTags.count) selected")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

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
            }

            if store.canCreateTag(named: query) {
                Button(action: addQuery) {
                    Label("Create \"\(normalizedQuery)\"", systemImage: "plus")
                        .lineLimit(1)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .disabled(store.selectedTags.count >= BookmarkShareStore.maximumTagCount)
            }

            if store.isLoadingTags, store.availableTags.isEmpty {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading tags…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if let message = store.tagsErrorMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Retry") {
                        Task { await store.retryTags() }
                    }
                    .font(.caption.weight(.semibold))
                }
            }

            if !visibleTags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 8) {
                        ForEach(visibleTags) { tag in
                            TagChip(
                                name: tag.name,
                                isSelected: store.isTagSelected(tag.name),
                                isDisabled: !store.isTagSelected(tag.name)
                                    && store.selectedTags.count
                                        >= BookmarkShareStore.maximumTagCount,
                                onToggle: { store.toggleTag(named: tag.name) }
                            )
                        }
                    }
                }
            } else if !store.isLoadingTags, normalizedQuery.isEmpty {
                Text("No tags yet. Add one above.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if store.selectedTags.count >= BookmarkShareStore.maximumTagCount {
                Text("You can add up to \(BookmarkShareStore.maximumTagCount) tags.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .disabled(store.phase == .saving)
    }

    private func addQuery() {
        guard store.selectTag(named: query) else { return }
        query = ""
    }
}

private struct TagChip: View {
    let name: String
    let isSelected: Bool
    let isDisabled: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 5) {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                }
                Text(name)
                    .lineLimit(1)
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(isSelected ? Color.white : Color.primary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.accentColor : Color(.tertiarySystemFill))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .accessibilityLabel("\(name) tag")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
        .accessibilityHint(isSelected ? "Removes this tag" : "Adds this tag")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct LoadingView: View {
    let title: String

    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
            Text(title)
                .foregroundStyle(.secondary)
        }
        .padding()
        .accessibilityElement(children: .combine)
    }
}

private struct ConfirmationView: View {
    let title: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.green)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
        }
        .padding()
        .accessibilityElement(children: .combine)
    }
}

private struct ErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn’t save this link", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again", action: onRetry)
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

private struct BookmarkPreviewCard: View {
    let preview: BookmarkSharePreview
    let originalURL: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            previewImage

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Label(preview.contentTypeLabel, systemImage: contentTypeIcon)
                        .lineLimit(1)
                    if let lengthLabel = preview.lengthLabel {
                        Text("·")
                        Text(lengthLabel)
                            .lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                Text(preview.title)
                    .font(.headline)
                    .lineLimit(3)

                HStack(spacing: 4) {
                    Text(preview.creator)
                    Text("·")
                    Text(preview.sourceLabel)
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)

                Text(originalURL.absoluteString)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .padding()
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(.separator.opacity(0.35), lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var previewImage: some View {
        ZStack {
            Rectangle()
                .fill(Color(.tertiarySystemFill))

            if let thumbnailURL = preview.thumbnailURL {
                AsyncImage(url: thumbnailURL) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                    } else if phase.error != nil {
                        imagePlaceholder
                    } else {
                        ProgressView()
                    }
                }
            } else {
                imagePlaceholder
            }
        }
        .frame(height: 170)
        .clipped()
    }

    private var imagePlaceholder: some View {
        Image(systemName: contentTypeIcon)
            .font(.system(size: 34))
            .foregroundStyle(.secondary)
    }

    private var contentTypeIcon: String {
        switch preview.contentType.uppercased() {
        case "VIDEO": "play.rectangle"
        case "PODCAST": "waveform"
        case "POST": "text.bubble"
        default: "doc.text"
        }
    }
}
