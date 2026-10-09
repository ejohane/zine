import SwiftUI
import PhotosUI
import UIKit

struct PublicationIssueEditorView: View {
    let context: PublicationContext
    @State private var store: IssueEditorStore
    @State private var picker = false
    @State private var selectedSection: String?
    @State private var photo: PhotosPickerItem?
    @State private var uploadError: String?
    @State private var uploading = false
    @State private var confirmPublish = false
    @State private var confirmDelete = false
    @State private var published: PersonalIssue?
    @State private var deleteKey = UUID().uuidString
    @Environment(\.dismiss) private var dismiss
    init(id: String, context: PublicationContext) {
        self.context = context
        _store = State(initialValue: IssueEditorStore(id: id, client: context.client, userID: context.userID ?? ""))
    }
    var body: some View {
        Form {
            if let issue = store.issue {
                if let remote = store.conflict {
                    Section("Changes from another device") {
                        Text("The latest issue is revision \(remote.revision). Your local edits are still stored on this device.")
                        Button("Use latest server version", role: .destructive) { store.useServerCopy() }
                        Button("Apply my edits to latest version") { Task { await store.applyLocalEditsToLatest() } }
                        Text("Applying your edits retries them against the latest version. Any invalid selections or ordering will need review.").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                    }
                }
                Section("Issue") {
                    if let assetID = issue.coverAssetId { OwnerPublicationArtwork(assetID: assetID, context: context) }
                    TextField("Title", text: textBinding(issue.title, field: "title"))
                    TextField("Introduction (optional)", text: textBinding(issue.introduction ?? "", field: "introduction"), axis: .vertical).lineLimit(3...8)
                    PhotosPicker(selection: $photo, matching: .images) { Label(issue.coverAssetId == nil ? "Choose cover" : "Change cover", systemImage: "photo") }.disabled(uploading)
                    if issue.coverAssetId != nil { Button("Remove cover") { presentation(["coverAssetId": .null]) { $0.coverAssetId = nil; $0.coverUrl = nil } } }
                    if uploading { ProgressView("Uploading cover…") }
                    if let uploadError { PublicationMessage(text: uploadError) }
                    Text(issue.kind == "WEEKLY" ? "Weekly issue" : "Independent issue").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                    if issue.isPublished && !issue.canAddSelections {
                        Text("This weekly issue is published. You can correct writing or remove selections; new selections belong in another issue.").font(.callout).foregroundStyle(ZineTheme.secondaryText)
                    }
                }.disabled(store.conflict != nil)
                ForEach(Array(issue.sections.enumerated()), id: \.element.id) { index, section in
                    Section {
                        TextField("Section heading (optional)", text: Binding(get: {
                            store.issue?.sections.first(where: { $0.id == section.id })?.heading ?? ""
                        }, set: { value in
                            store.edit(["type": .string("setSectionHeading"), "sectionId": .string(section.id), "heading": .text(value.isEmpty ? nil : value)]) {
                                if let i = $0.sections.firstIndex(where: { $0.id == section.id }) { $0.sections[i].heading = value }
                            }
                        }))
                        ForEach(Array(section.selections.enumerated()), id: \.element.id) { selectionIndex, selection in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(selection.title).font(.headline)
                                Text("\(selection.creatorName) · \(selection.sourceName)").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                                TextField("Why include this? (optional)", text: Binding(get: {
                                    store.issue?.selections.first(where: { $0.id == selection.id })?.commentary ?? ""
                                }, set: { value in
                                    store.edit(["type": .string("setCommentary"), "selectionId": .string(selection.id), "commentary": .text(value.isEmpty ? nil : value)]) { issue in
                                        for s in issue.sections.indices {
                                            if let i = issue.sections[s].selections.firstIndex(where: { $0.id == selection.id }) { issue.sections[s].selections[i].commentary = value }
                                        }
                                    }
                                }), axis: .vertical).lineLimit(2...6)
                                HStack {
                                    Button { reorder(section: index, selection: selectionIndex, delta: -1) } label: { Image(systemName: "arrow.up") }
                                        .disabled(selectionIndex == 0).accessibilityLabel("Move \(selection.title) earlier")
                                    Button { reorder(section: index, selection: selectionIndex, delta: 1) } label: { Image(systemName: "arrow.down") }
                                        .disabled(selectionIndex == section.selections.count - 1).accessibilityLabel("Move \(selection.title) later")
                                    if issue.sections.count > 1 {
                                        Menu("Move to section") {
                                            ForEach(issue.sections.filter { $0.id != section.id }) { target in
                                                Button(target.heading?.isEmpty == false ? target.heading! : "Untitled section") { move(selection.id, to: target.id) }
                                            }
                                        }
                                    }
                                    Spacer()
                                    Button(role: .destructive) { remove(selection.id) } label: { Image(systemName: "trash") }.accessibilityLabel("Remove \(selection.title)")
                                }.buttonStyle(.borderless)
                            }.padding(.vertical, 6)
                        }
                        if issue.canAddSelections {
                            Button { selectedSection = section.id; picker = true } label: { Label("Add saved content", systemImage: "plus") }
                        }
                        HStack {
                            Button("Move section earlier") { reorderSection(index, delta: -1) }.disabled(index == 0)
                            if section.selections.isEmpty && issue.sections.count > 1 {
                                Button("Remove section", role: .destructive) {
                                    store.edit(["type": .string("removeSection"), "sectionId": .string(section.id)]) { $0.sections.removeAll { $0.id == section.id } }
                                }
                            }
                        }.font(.caption).buttonStyle(.borderless)
                    }.disabled(store.conflict != nil)
                }
                Section {
                    Button("Add section") {
                        let id = publicationID()
                        store.edit(["type": .string("addSection"), "sectionId": .string(id)]) { $0.sections.append(.init(id: id, heading: nil, selections: [])) }
                    }.disabled(issue.sections.count >= 20 || store.conflict != nil)
                    Text(store.saveDescription).font(.caption).foregroundStyle(ZineTheme.secondaryText)
                    Button(store.isSaving ? "Saving…" : "Save now") { Task { await store.save(force: true) } }.disabled(store.isSaving || !store.hasLocalEdits || store.conflict != nil)
                    if issue.isPublished {
                        NavigationLink(value: PublicationDestination.issue(issue.id)) { Label("Read published issue", systemImage: "book") }
                        ShareLink(item: issue.shareURL) { Label("Share issue", systemImage: "square.and.arrow.up") }
                    } else {
                        Button("Publish issue") { confirmPublish = true }
                            .disabled(issue.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || issue.selections.isEmpty || store.isSaving || store.conflict != nil)
                    }
                    Button("Delete issue", role: .destructive) { confirmDelete = true }.disabled(store.isSaving)
                }
            } else { ProgressView("Loading draft…") }
            if let error = store.error { PublicationMessage(text: error) { Task { if store.issue == nil { await store.load() } else { await store.save(force: true) } } } }
        }
        .navigationTitle(store.issue?.title.isEmpty == false ? store.issue!.title : "Compose issue")
        .navigationBarTitleDisplayMode(.inline).zineScreenChrome()
        .task { await store.load(); while !Task.isCancelled { try? await Task.sleep(for: .seconds(2)); if !Task.isCancelled { await store.save() } } }
        .onChange(of: photo) { _, item in Task { await upload(item) } }
        .sheet(isPresented: $picker) { NavigationStack {
            SavedPublicationPicker(context: context) { bookmark in
                guard let sectionID = selectedSection, let index = store.issue?.sections.firstIndex(where: { $0.id == sectionID }) else { return }
                let selectionID = publicationID()
                let selection = PersonalIssueSelection(id: selectionID, contentType: bookmark.contentType.rawValue, title: bookmark.title,
                    creatorName: bookmark.creator, sourceName: bookmark.publisher ?? bookmark.provider.title, originalUrl: bookmark.canonicalUrl.absoluteString,
                    artworkUrl: bookmark.thumbnailUrl?.absoluteString, commentary: nil, firstPublishedRevision: nil, originalAvailability: "UNKNOWN", itemId: bookmark.itemId, bookmarkId: bookmark.id)
                store.edit(["type": .string("addSelection"), "selectionId": .string(selectionID), "sectionId": .string(sectionID), "bookmarkId": .string(bookmark.id)]) { $0.sections[index].selections.append(selection) }
                picker = false; Task { await store.save() }
            }
        } }
        .confirmationDialog("Publish this issue publicly?", isPresented: $confirmPublish, titleVisibility: .visible) {
            Button("Publish") { Task { published = await store.publish() } }
        } message: { Text("Anyone can read or forward its link. Subscribers will be notified.") }
        .confirmationDialog("Delete this issue?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete issue", role: .destructive) { Task { await delete() } }
        } message: { Text("Its public link will become unavailable. Readers keep bookmarks they already saved.") }
    }
    private func textBinding(_ value: String, field: String) -> Binding<String> {
        Binding(get: { field == "title" ? (store.issue?.title ?? value) : (store.issue?.introduction ?? "") }, set: { text in
            presentation([field: field == "title" ? .string(text) : .text(text.isEmpty ? nil : text)]) { issue in
                if field == "title" { issue.title = text } else { issue.introduction = text }
            }
        })
    }
    private func presentation(_ fields: PublicationOperation, update: (inout PersonalIssue) -> Void) {
        var op = fields; op["type"] = .string("setPresentation"); store.edit(op, update: update)
    }
    private func remove(_ id: String) {
        store.edit(["type": .string("removeSelection"), "selectionId": .string(id)]) { issue in
            for i in issue.sections.indices { issue.sections[i].selections.removeAll { $0.id == id } }
        }
    }
    private func reorder(section: Int, selection: Int, delta: Int) {
        guard var issue = store.issue else { return }
        issue.sections[section].selections.swapAt(selection, selection + delta); order(issue)
    }
    private func reorderSection(_ index: Int, delta: Int) {
        guard var issue = store.issue else { return }; issue.sections.swapAt(index, index + delta); order(issue)
    }
    private func move(_ id: String, to sectionID: String) {
        guard var issue = store.issue, let selection = issue.selections.first(where: { $0.id == id }) else { return }
        for i in issue.sections.indices { issue.sections[i].selections.removeAll { $0.id == id } }
        if let i = issue.sections.firstIndex(where: { $0.id == sectionID }) { issue.sections[i].selections.append(selection) }; order(issue)
    }
    private func order(_ issue: PersonalIssue) {
        let sections = issue.sections.map { section in PublicationValue.object(["sectionId": .string(section.id), "selectionIds": .array(section.selections.map { .string($0.id) })]) }
        store.edit(["type": .string("setOrder"), "sections": .array(sections)]) { $0.sections = issue.sections }
    }
    private func upload(_ item: PhotosPickerItem?) async {
        guard let item else { return }; uploading = true; defer { uploading = false }
        do {
            guard let bytes = try await item.loadTransferable(type: Data.self), bytes.count <= 5 * 1024 * 1024,
                  let image = UIImage(data: bytes), let jpeg = image.jpegData(compressionQuality: 0.9) else { throw APIError.invalidResponse }
            let id = try await context.client.uploadPublicationCover(jpeg, contentType: "image/jpeg")
            presentation(["coverAssetId": .string(id)]) { $0.coverAssetId = id }; await store.save()
        } catch { uploadError = error.localizedDescription }
    }
    private func delete() async {
        guard let issue = store.issue else { return }
        do {
            let _: PublicationValue = try await context.client.publicationRequest("me/issues/\(issue.id)", method: "DELETE", body: .object(["expectedRevision": .integer(issue.revision)]), key: deleteKey)
            dismiss()
        } catch { store.error = error.localizedDescription }
    }
}

struct SavedPublicationPicker: View {
    let context: PublicationContext
    var choose: (Bookmark) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var items: [Bookmark] = []
    @State private var cursor: String?
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        List {
            ForEach(items) { bookmark in Button { choose(bookmark) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(bookmark.title).foregroundStyle(ZineTheme.primaryText)
                    Text(bookmark.creator).font(.caption).foregroundStyle(ZineTheme.secondaryText)
                }
            } }
            if loading { ProgressView() }
            if !loading && items.isEmpty && error == nil { Text("No saved content matches").foregroundStyle(ZineTheme.secondaryText) }
            if cursor != nil { Button("More saved content") { Task { await load(more: true) } } }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }.searchable(text: $search).navigationTitle("Saved content").zineScreenChrome()
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .task(id: search) { try? await Task.sleep(for: .milliseconds(250)); if !Task.isCancelled { await load() } }
    }
    private func load(more: Bool = false) async {
        loading = true; error = nil; defer { loading = false }
        do {
            let page = try await context.client.listBookmarks(query: LibraryQuery(search: search, includesFinished: true), cursor: more ? cursor : nil)
            if Task.isCancelled { return }
            items = more ? items + page.items : page.items; cursor = page.nextCursor
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
