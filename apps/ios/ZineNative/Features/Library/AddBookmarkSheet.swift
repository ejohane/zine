import SwiftUI

struct AddBookmarkSheet: View {
    let client: BookmarkShareClient
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var urlText = ""
    @State private var validationMessage: String?
    @State private var store: BookmarkShareStore?
    @FocusState private var isURLFocused: Bool

    var body: some View {
        NavigationStack {
            Group {
                if let store {
                    AddBookmarkFlow(store: store, onSaved: onSaved)
                } else {
                    input
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ZineTheme.canvas)
            .navigationTitle(store == nil ? "Add Bookmark" : "Preview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if store == nil {
                        Button("Cancel") { dismiss() }
                    } else {
                        Button("Back") { store = nil }
                    }
                }
            }
        }
        .zineAppTheme()
        .onAppear { isURLFocused = true }
    }

    private var input: some View {
        Form {
            Section {
                TextField("https://…", text: $urlText, axis: .vertical)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .focused($isURLFocused)
                    .submitLabel(.continue)
                    .onSubmit(preview)
                    .accessibilityIdentifier("add-bookmark-url")

                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
            } header: {
                Text("Link")
            } footer: {
                Text("Paste a public link to an episode, video, article, or post.")
            }

            Button("Preview Bookmark", action: preview)
                .frame(maxWidth: .infinity)
                .disabled(urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("add-bookmark-preview")
        }
        .scrollContentBackground(.hidden)
    }

    private func preview() {
        let value = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased()) else {
            validationMessage = "Enter a complete http or https URL."
            return
        }

        validationMessage = nil
        isURLFocused = false
        let nextStore = BookmarkShareStore(loadURL: { url }, client: client)
        store = nextStore
        Task { await nextStore.load() }
    }
}

private struct AddBookmarkFlow: View {
    @Bindable var store: BookmarkShareStore
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        switch store.phase {
        case .loadingLink, .loadingPreview:
            ProgressView("Fetching preview…")
                .foregroundStyle(ZineTheme.secondaryText)
        case .ready, .saving:
            if let preview = store.preview {
                ScrollView {
                    VStack(spacing: 20) {
                        AddBookmarkPreview(preview: preview)

                        Button {
                            Task {
                                guard await store.save() else { return }
                                onSaved()
                            }
                        } label: {
                            HStack(spacing: 8) {
                                if store.phase == .saving {
                                    ProgressView()
                                        .controlSize(.small)
                                        .tint(ZineTheme.onAccent)
                                }
                                Text(store.phase == .saving ? "Saving…" : "Save to Library")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(store.phase == .saving)
                        .accessibilityIdentifier("add-bookmark-save")
                    }
                    .padding()
                }
            }
        case .saved:
            ContentUnavailableView {
                Label(
                    store.saveStatus?.confirmationTitle ?? "Saved to Zine",
                    systemImage: "checkmark.circle.fill"
                )
            } description: {
                Text("The bookmark is ready in Library.")
            } actions: {
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
            }
            .accessibilityIdentifier("add-bookmark-saved")
        case .failed:
            ContentUnavailableView {
                Label(
                    store.preview == nil
                        ? "Couldn’t preview this link"
                        : "Couldn’t save this bookmark",
                    systemImage: "exclamationmark.triangle"
                )
            } description: {
                Text(store.errorMessage ?? "Something went wrong.")
            } actions: {
                Button("Try Again") { Task { await store.retry() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

private struct AddBookmarkPreview: View {
    let preview: BookmarkSharePreview

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            CachedRemoteImage(
                url: preview.thumbnailURL,
                targetSize: CGSize(width: 180, height: 180)
            ) {
                ZStack {
                    ZineTheme.raised
                    Image(systemName: preview.contentType.uppercased() == "PODCAST" ? "waveform" : "bookmark")
                        .font(.system(size: 36))
                        .foregroundStyle(ZineTheme.secondaryText)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 180)
            .clipped()

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Text(preview.contentTypeLabel)
                    if let length = preview.lengthLabel {
                        Text("·")
                        Text(length)
                    }
                }
                .font(.caption)
                .foregroundStyle(ZineTheme.secondaryText)

                Text(preview.title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(ZineTheme.primaryText)

                Text(preview.creatorLabel)
                    .font(.subheadline)
                    .foregroundStyle(ZineTheme.secondaryText)

                Text(preview.sourceLabel)
                    .font(.caption)
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
        .background(ZineTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(ZineTheme.border, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("add-bookmark-preview-card")
    }
}
