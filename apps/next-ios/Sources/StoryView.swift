import SwiftUI

struct StoryView: View {
    @Bindable var space: SavedSpace
    let itemID: UUID
    @Environment(\.dismiss) private var dismiss
    private var item: SavedContent? { space.items.first { $0.id == itemID } }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical) {
                if let item {
                    VStack(alignment: .leading, spacing: 24) {
                        if let image = item.image {
                            Image(image).resizable().scaledToFill().frame(height: 240).clipped()
                                .clipShape(.rect(cornerRadius: 24)).accessibilityHidden(true)
                        }
                        Text(item.title).font(.largeTitle.bold())
                        Text("\(item.author) · \(item.duration)")
                            .font(.subheadline).foregroundStyle(NextTheme.secondary)
                        Text(item.note).font(.title3).lineSpacing(4)
                        Divider().overlay(NextTheme.line)
                        StoryCapabilitiesView(space: space, item: item)
                        Divider().overlay(NextTheme.line)
                        if let url = item.url {
                            Link(destination: url) {
                                Label("Open original", systemImage: "arrow.up.right.square")
                                    .font(.headline).frame(minHeight: 44)
                            }
                            Text("The original content stays at its source. This local preview is not connected to your account on the new API.")
                                .font(.subheadline).foregroundStyle(NextTheme.secondary)
                        } else if item.isSample {
                            Text(item.section == .articles || item.section == .posts ? item.body : "This is a fictional media preview. Playback will be designed as part of the new experience.\n\n" + item.body)
                                .font(.body).lineSpacing(7).textSelection(.enabled)
                            Text("Sample story · Fictional content for this first look")
                                .font(.footnote).foregroundStyle(NextTheme.secondary)
                        }
                        Button {
                            space.toggleFinished(item.id)
                        } label: {
                            Label(item.isFinished ? "Mark unfinished" : "Mark finished", systemImage: item.isFinished ? "arrow.uturn.backward" : "checkmark.circle")
                                .font(.headline).padding(.horizontal, 20).frame(minHeight: 48)
                                .background(NextTheme.inset, in: .capsule)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("mark-finished")
                        Button {
                            space.toggleArchive(item.id)
                        } label: {
                            Label(item.api?.archived == true ? "Unarchive" : "Archive", systemImage: "archivebox")
                                .font(.headline).frame(minHeight: 44)
                        }
                        .accessibilityIdentifier("archive-item")
                    }
                    .frame(maxWidth: 650, alignment: .leading)
                    .padding(28).frame(maxWidth: .infinity)
                }
            }
            .background(NextTheme.canvas)
            .foregroundStyle(NextTheme.ink)
            .navigationTitle("Saved for you")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .tint(NextTheme.selection)
    }
}

struct CaptureView: View {
    @Bindable var space: SavedSpace
    @State private var urlText = ""
    @State private var title = ""
    @State private var section: ContentSection
    @State private var error: String?
    @State private var context = ""
    @State private var tags = ""
    @Environment(\.dismiss) private var dismiss

    init(space: SavedSpace, section: ContentSection) {
        self.space = space
        _section = State(initialValue: section == .home ? .articles : section)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $urlText)
                        .textContentType(.URL).keyboardType(.URL)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityLabel("Link")
                        .accessibilityIdentifier("capture-url")
                    TextField("Give it a name (optional)", text: $title)
                        .accessibilityLabel("Title")
                    Picker("Save to", selection: $section) {
                        ForEach(ContentSection.allCases.filter { $0 != .home }) { kind in
                            Text(kind.rawValue).tag(kind)
                        }
                    }
                    TextField("Why do you want to keep it?", text: $context, axis: .vertical)
                        .lineLimit(2...4).accessibilityIdentifier("capture-context")
                    TextField("Tags, separated by commas", text: $tags)
                } footer: {
                    Text("Kept on this device for now. No account or connection is needed to save the link.")
                }
                if let error { Text(error).foregroundStyle(NextTheme.ink).accessibilityLabel("Couldn’t save: \(error)") }
            }
            .scrollContentBackground(.hidden).background(NextTheme.canvas)
            .foregroundStyle(NextTheme.ink)
            .navigationTitle("Keep something good")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        do {
                            try space.save(urlText: urlText, title: title, section: section, contextText: context,
                                           tags: tags.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) })
                            dismiss()
                        }
                        catch { self.error = error.localizedDescription }
                    }
                    .disabled(urlText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("capture-save")
                }
            }
        }
        .tint(NextTheme.selection)
    }
}
