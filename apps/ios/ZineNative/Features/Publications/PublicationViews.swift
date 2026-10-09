import SwiftUI
import PhotosUI
import UIKit

struct PublicationContext {
    let client: APIClient
    let userID: String?
    var signIn: () -> Void = {}
}

struct PublicationDestinationView: View {
    let destination: PublicationDestination
    let context: PublicationContext
    var body: some View {
        Group {
            switch destination {
            case .mine: MyPublicationView(context: context)
            case .publication(let id): PublicPublicationView(id: id, context: context)
            case .issue(let id): PublicationIssueReader(id: id, context: context)
            case .editor(let id): PublicationIssueEditorView(id: id, context: context)
            case .activity: PublicationActivityView(context: context)
            case .wrapped: PublicationWrappedView(context: context)
            case .subscriptions: PublicationSubscriptionsView(context: context)
            }
        }
        .tint(ZineTheme.brandAccent)
        .foregroundStyle(ZineTheme.primaryText)
        .zinePushedDestinationChrome()
    }
}

struct PublicationMessage: View {
    let text: String
    var retry: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text).font(.callout).foregroundStyle(ZineTheme.secondaryText)
            if let retry { Button("Try again", action: retry) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PublicationArtwork: View {
    let url: String?
    let baseURL: URL
    var height: CGFloat = 160
    var body: some View {
        Group {
            if let parsed = publicationAssetURL(url, baseURL: baseURL) {
                AsyncImage(url: parsed) { image in image.resizable().scaledToFill() } placeholder: {
                    ZineTheme.raised.overlay { Image(systemName: "book.closed").foregroundStyle(ZineTheme.secondaryText) }
                }
            } else {
                ZineTheme.raised.overlay {
                    Image(systemName: "book.closed").font(.largeTitle).foregroundStyle(ZineTheme.secondaryText)
                }
            }
        }.frame(height: height).frame(maxWidth: .infinity).clipped().accessibilityHidden(true)
    }
}

/// Private owner bytes stay in view memory and are cleared when the asset/account changes.
struct OwnerPublicationArtwork: View {
    let assetID: String
    let context: PublicationContext
    var height: CGFloat = 140
    @State private var image: UIImage?
    @State private var failed = false
    var body: some View {
        VStack {
            if let image { Image(uiImage: image).resizable().scaledToFill().frame(height: height).clipped().accessibilityLabel("Issue cover") }
            else {
                ZineTheme.raised.overlay {
                    if failed { Button("Retry cover preview") { Task { await load() } } }
                    else { ProgressView("Loading cover…") }
                }.frame(height: height)
            }
        }.task(id: "\(context.userID ?? "")|\(context.client.baseURL)|\(assetID)") { await load() }
    }
    private func load() async {
        image = nil; failed = false
        do {
            let bytes = try await context.client.ownPublicationCover(assetID)
            try Task.checkCancellation()
            guard let decoded = UIImage(data: bytes) else { throw APIError.invalidResponse }
            image = decoded
        } catch is CancellationError {} catch { failed = true }
    }
}

struct MyPublicationView: View {
    let context: PublicationContext
    @State private var publication: PersonalPublication?
    @State private var issues: [PersonalIssue] = []
    @State private var cursor: String?
    @State private var loading = true
    @State private var error: String?
    @State private var setup = false
    @State private var creating = false
    @State private var newIssue: PersonalIssue?
    @State private var createKey = UUID().uuidString
    @State private var subscribers = false
    var body: some View {
        List {
            if let publication {
                Section {
                    PublicationArtwork(url: publication.coverUrl, baseURL: context.client.baseURL)
                    Text(publication.displayName).font(.title2.bold())
                    Text("Edited by \(publication.editor.displayName)").foregroundStyle(ZineTheme.secondaryText)
                    if let description = publication.description { Text(description) }
                    ShareLink(item: publication.shareURL) { Label("Share your Zine", systemImage: "square.and.arrow.up") }
                    Button("Edit publication") { setup = true }
                    Button("Subscribers") { subscribers = true }
                }
                Section {
                    Button { Task { await createIssue() } } label: { Label("Create an issue", systemImage: "plus") }.disabled(creating)
                    NavigationLink(value: PublicationDestination.wrapped) { Label("Weekly Wrapped", systemImage: "sparkles") }
                    NavigationLink(value: PublicationDestination.activity) { Label("Activity", systemImage: "bell") }
                    NavigationLink(value: PublicationDestination.subscriptions) { Label("Subscriptions", systemImage: "person.2") }
                }
                issueSection("Drafts", matching: false)
                issueSection("Published", matching: true)
                if cursor != nil { Button("More issues") { Task { await loadMore() } } }
            } else if !loading {
                Section {
                    Text("Make it your Zine").font(.title2.bold())
                    Text("Collect the things worth sharing into issues of your own magazine.")
                    Button("Set up your publication") { setup = true }
                }
            }
            if loading { ProgressView("Loading your Zine…") }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }
        .navigationTitle("My Zine").zineScreenChrome()
        .task { await load() }.refreshable { await load() }
        .sheet(isPresented: $setup) {
            NavigationStack {
                PublicationSetupView(context: context, existing: publication) { saved in
                    publication = saved; setup = false; Task { await load() }
                }
            }
        }
        .sheet(isPresented: $subscribers) { NavigationStack { PublicationSubscribersView(context: context) } }
        .navigationDestination(item: $newIssue) { issue in
            PublicationIssueEditorView(id: issue.id, context: context)
        }
    }
    @ViewBuilder private func issueSection(_ title: String, matching published: Bool) -> some View {
        let matching = issues.filter { $0.isPublished == published }
        if !matching.isEmpty {
            Section(title) {
                ForEach(matching) { issue in
                    NavigationLink(value: PublicationDestination.editor(issue.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(issue.title.isEmpty ? "Untitled issue" : issue.title).font(.headline)
                            Text("\(issue.kind == "WEEKLY" ? "Weekly" : "Independent") · \(issue.selections.count) selections")
                                .font(.caption).foregroundStyle(ZineTheme.secondaryText)
                        }
                    }
                }
            }
        }
    }
    private func load() async {
        loading = true; error = nil; defer { loading = false }
        do {
            publication = try await context.client.ownPublication()
            let page = try await context.client.publicationIssues(); issues = page.issues; cursor = page.nextCursor
        } catch let e as PublicationRequestError where e.status == 404 { publication = nil }
        catch { self.error = error.localizedDescription }
    }
    private func loadMore() async {
        guard let cursor else { return }
        do { let p = try await context.client.publicationIssues(cursor: cursor); issues += p.issues; self.cursor = p.nextCursor }
        catch { self.error = error.localizedDescription }
    }
    private func createIssue() async {
        creating = true; defer { creating = false }
        do { newIssue = try await context.client.createPersonalIssue(key: createKey); createKey = UUID().uuidString }
        catch { self.error = error.localizedDescription }
    }
}

struct PublicationSetupView: View {
    let context: PublicationContext
    let existing: PersonalPublication?
    var onSaved: (PersonalPublication) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var editor = ""
    @State private var name = ""
    @State private var introduction = ""
    @State private var assetID: String?
    @State private var photo: PhotosPickerItem?
    @State private var loading = false
    @State private var error: String?
    @State private var key = UUID().uuidString
    var body: some View {
        Form {
            Section("Your publication") {
                if let assetID { OwnerPublicationArtwork(assetID: assetID, context: context) }
                TextField("Your public editor name", text: $editor).textContentType(.name)
                TextField("Publication name (optional)", text: $name)
                TextField("Description (optional)", text: $introduction, axis: .vertical).lineLimit(3...6)
                PhotosPicker(selection: $photo, matching: .images) { Label(assetID == nil ? "Choose cover" : "Change cover", systemImage: "photo") }
                if assetID != nil { Button("Remove cover") { assetID = nil } }
            }
            Section {
                Text("Published issues are public. Your editor name is shown alongside your magazine.")
                    .foregroundStyle(ZineTheme.secondaryText)
                Button(existing == nil ? "Create publication" : "Save changes") { Task { await save() } }
                    .disabled(editor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || loading)
                if loading { ProgressView() }
                if let error { PublicationMessage(text: error) }
            }
        }.navigationTitle(existing == nil ? "Start your Zine" : "Edit publication").zineScreenChrome()
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .task {
            editor = existing?.editor.displayName ?? ""; name = existing?.displayName ?? ""
            introduction = existing?.description ?? ""; assetID = existing?.coverAssetId
        }
        .onChange(of: photo) { _, item in Task { await upload(item) } }
    }
    private func upload(_ item: PhotosPickerItem?) async {
        guard let item else { return }; loading = true; defer { loading = false }
        do {
            guard let bytes = try await item.loadTransferable(type: Data.self), bytes.count <= 5 * 1024 * 1024,
                  let image = UIImage(data: bytes), let jpeg = image.jpegData(compressionQuality: 0.9) else { throw APIError.invalidResponse }
            assetID = try await context.client.uploadPublicationCover(jpeg, contentType: "image/jpeg")
        } catch { self.error = "Couldn’t upload cover: \(error.localizedDescription)" }
    }
    private func save() async {
        loading = true; error = nil; defer { loading = false }
        var input: PublicationOperation = ["editorName": .string(editor), "displayName": .text(name.isEmpty ? nil : name),
            "description": .text(introduction.isEmpty ? nil : introduction), "coverAssetId": .text(assetID)]
        if let revision = existing?.revision { input["expectedRevision"] = .integer(revision) }
        do {
            let r: PublicationEnvelope = try await context.client.publicationRequest("me/publication", method: existing == nil ? "POST" : "PATCH", body: .object(input), key: key)
            onSaved(r.publication)
        } catch { self.error = error.localizedDescription }
    }
}

struct PublicPublicationView: View {
    let id: String
    let context: PublicationContext
    @State private var publication: PersonalPublication?
    @State private var issues: [PersonalIssue] = []
    @State private var cursor: String?
    @State private var error: String?
    var body: some View {
        List {
            if let publication {
                Section {
                    PublicationArtwork(url: publication.coverUrl, baseURL: context.client.baseURL)
                    Text(publication.displayName).font(.title.bold())
                    Text("By \(publication.editor.displayName)").foregroundStyle(ZineTheme.secondaryText)
                    if let description = publication.description { Text(description) }
                    PublicationSubscribeControls(id: id, context: context)
                    ShareLink(item: publication.shareURL) { Label("Share publication", systemImage: "square.and.arrow.up") }
                }
                Section("Issues") {
                    ForEach(issues) { issue in NavigationLink(value: PublicationDestination.issue(issue.id)) {
                        VStack(alignment: .leading) {
                            Text(issue.title).font(.headline)
                            Text("\(issue.selections.count) selections").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                        }
                    } }
                    if issues.isEmpty { Text("No issues published yet").foregroundStyle(ZineTheme.secondaryText) }
                    if cursor != nil { Button("More issues") { Task { await loadMore() } } }
                }
            } else if error == nil { ProgressView("Loading publication…") }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }.navigationTitle(publication?.displayName ?? "Publication").zineScreenChrome()
        .task { await load() }.refreshable { await load() }
    }
    private func load() async {
        error = nil
        do { publication = try await context.client.publicPublication(id); let p = try await context.client.publicationIssues(id); issues = p.issues; cursor = p.nextCursor }
        catch { self.error = error.localizedDescription }
    }
    private func loadMore() async {
        guard let cursor else { return }
        do { let p = try await context.client.publicationIssues(id, cursor: cursor); issues += p.issues; self.cursor = p.nextCursor }
        catch { self.error = error.localizedDescription }
    }
}

struct PublicationSubscribersView: View {
    let context: PublicationContext
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [PublicationSubscribers.Subscriber] = []
    @State private var cursor: String?
    @State private var error: String?
    var body: some View {
        List {
            Text("\(rows.count) subscribers loaded").foregroundStyle(ZineTheme.secondaryText)
            ForEach(rows) { row in VStack(alignment: .leading) {
                Text("Subscriber \(row.userId.suffix(6))")
                Text(row.subscribedAt.prefix(10)).font(.caption).foregroundStyle(ZineTheme.secondaryText)
            } }
            if let error { PublicationMessage(text: error) }
            if cursor != nil { Button("More subscribers") { Task { await load() } } }
        }.navigationTitle("Subscribers").zineScreenChrome()
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .task { await load() }
    }
    private func load() async {
        do {
            let r: PublicationSubscribers = try await context.client.publicationRequest("me/publication/subscribers" + (cursor.map { "?cursor=\($0)" } ?? ""))
            rows += r.subscribers; cursor = r.nextCursor
        } catch { self.error = error.localizedDescription }
    }
}
