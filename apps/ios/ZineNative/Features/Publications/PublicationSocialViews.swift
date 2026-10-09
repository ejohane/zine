import SwiftUI

struct PublicationSubscribeControls: View {
    let id: String
    let context: PublicationContext
    @State private var subscription: PersonalSubscription?
    @State private var error: String?
    @State private var busy = false
    @State private var pending: PublicationPendingIntent?
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if subscription?.subscribed == true {
                HStack {
                    Label("Subscribed", systemImage: "checkmark")
                    Spacer()
                    Menu {
                        Button(subscription?.muted == true ? "Unmute push notifications" : "Mute push notifications") {
                            Task { await update("PATCH", muted: subscription?.muted != true) }
                        }
                        Button("Unsubscribe", role: .destructive) { Task { await update("DELETE") } }
                    } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("Subscription options") }
                }
            } else {
                Button("Subscribe to this Zine") {
                    if context.userID == nil { pending = PublicationPendingIntent(action: .subscribe(publicationID: id)); context.signIn() }
                    else { Task { await update("PUT") } }
                }.disabled(busy)
            }
            if let error { Text(error).font(.caption).foregroundStyle(ZineTheme.secondaryText) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .zinePublicationAuthCancelled)) { _ in pending = nil }
        .task(id: context.userID) {
            guard context.userID != nil else { subscription = nil; return }
            if let intent = pending { pending = nil; if intent.isValid() { await update("PUT") } }
            else { subscription = try? await context.client.publicationSubscription(id) }
        }
    }
    private func update(_ method: String, muted: Bool? = nil) async {
        busy = true; error = nil; defer { busy = false }
        do { subscription = try await context.client.publicationSubscription(id, method: method, muted: muted) }
        catch { self.error = error.localizedDescription }
    }
}

struct PublicationIssueReader: View {
    let id: String
    let context: PublicationContext
    @State private var issue: PersonalIssue?
    @State private var error: String?
    @State private var saveErrors: [String: String] = [:]
    @State private var saved: Set<String> = []
    @State private var busy: Set<String> = []
    @State private var saveKeys: [String: String] = [:]
    @State private var pendingSave: PublicationPendingIntent?
    @State private var activeUserID: String?
    @State private var baseline: Int?
    @State private var visitLoaded = false
    var body: some View {
        List {
            if let issue {
                Section {
                    PublicationArtwork(url: issue.coverUrl, baseURL: context.client.baseURL)
                    Text(issue.title).font(.largeTitle.bold())
                        .task(id: "\(context.userID ?? "anonymous")-\(issue.revision)") { await markVisit() }
                    NavigationLink(value: PublicationDestination.publication(issue.publication.id)) {
                        Text("\(issue.publication.displayName) · \(issue.publication.editor.displayName)").font(.subheadline)
                    }
                    if let introduction = issue.introduction { Text(introduction).font(.body) }
                    ShareLink(item: issue.shareURL) { Label("Share issue", systemImage: "square.and.arrow.up") }
                    PublicationSubscribeControls(id: issue.publication.id, context: context)
                }
                ForEach(issue.sections) { section in
                    Section(section.heading ?? "Selections") {
                        ForEach(section.selections) { selection in
                            VStack(alignment: .leading, spacing: 12) {
                                if let previous = baseline, let added = selection.firstPublishedRevision, added > previous {
                                    Label("Added since your last visit", systemImage: "circle.fill").font(.caption).foregroundStyle(ZineTheme.brandAccent)
                                }
                                Text(selection.title).font(.title3.bold())
                                Text("\(selection.creatorName) · \(selection.sourceName)").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                                if let commentary = selection.commentary { Text(commentary).font(.body) }
                                if selection.originalAvailability == "UNAVAILABLE" {
                                    Label("Original currently unavailable", systemImage: "link.badge.plus").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                                } else if let url = URL(string: selection.originalUrl), ["https", "http"].contains(url.scheme ?? "") {
                                    Link("Open original", destination: url)
                                }
                                Button { requestSave(selection.id) } label: {
                                    Label(saved.contains(selection.id) ? "Saved to Library" : "Save to Library", systemImage: saved.contains(selection.id) ? "bookmark.fill" : "bookmark")
                                }.disabled(busy.contains(selection.id) || saved.contains(selection.id))
                                if let failure = saveErrors[selection.id] { Text(failure).font(.caption).foregroundStyle(ZineTheme.secondaryText) }
                            }.padding(.vertical, 10)
                        }
                    }
                }
            } else if error == nil { ProgressView("Loading issue…") }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }.navigationTitle(issue?.publication.displayName ?? "Issue").navigationBarTitleDisplayMode(.inline).zineScreenChrome()
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .zinePublicationAuthCancelled)) { _ in pendingSave = nil }
        .task(id: context.userID) {
            if activeUserID != context.userID {
                saved = []; busy = []; saveKeys = [:]; baseline = nil; visitLoaded = false; activeUserID = context.userID
            }
            guard context.userID != nil else { return }
            if let intent = pendingSave {
                pendingSave = nil
                if intent.isValid(), case .save(let issueID, let selectionID) = intent.action, issueID == id {
                    saveKeys[selectionID] = intent.key; await save(selectionID)
                }
            }
        }
    }
    private func load() async {
        error = nil
        do { issue = try await context.client.personalIssue(id) }
        catch { self.error = error.localizedDescription }
    }
    private func markVisit() async {
        guard context.userID != nil, let issue, !visitLoaded else { return }
        do {
            let old: PublicationVisitEnvelope = try await context.client.publicationRequest("issues/\(id)/visit")
            baseline = old.visit.lastSeenRevision; visitLoaded = true
            // Let SwiftUI present this revision before advancing the server watermark.
            await Task.yield()
            let _: PublicationVisitEnvelope = try await context.client.publicationRequest("issues/\(id)/visit", method: "PUT", body: .object(["observedRevision": .integer(issue.revision)]))
        } catch { /* Reading stays available when visit recording is offline. */ }
    }
    private func requestSave(_ selectionID: String) {
        if context.userID == nil { pendingSave = PublicationPendingIntent(action: .save(issueID: id, selectionID: selectionID)); context.signIn() }
        else { Task { await save(selectionID) } }
    }
    private func save(_ selectionID: String) async {
        busy.insert(selectionID); saveErrors[selectionID] = nil; defer { busy.remove(selectionID) }
        let key = saveKeys[selectionID] ?? UUID().uuidString; saveKeys[selectionID] = key
        do {
            let _: PublicationSelectionSave = try await context.client.publicationRequest("issues/\(id)/selections/\(selectionID)/save", method: "POST", key: key)
            saved.insert(selectionID)
            NotificationCenter.default.post(name: .zineBookmarkSaved, object: nil)
        } catch { saveErrors[selectionID] = error.localizedDescription }
    }
}

struct PublicationActivityView: View {
    let context: PublicationContext
    @State private var rows: [PersonalPublicationActivity] = []
    @State private var cursor: String?
    @State private var error: String?
    @State private var loaded = false
    @State private var deliveryTimezone = TimeZone.current.identifier
    var body: some View {
        List {
            Section {
                Picker("Daily updates timezone", selection: $deliveryTimezone) {
                    ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0).tag($0) }
                }
                Button("Save delivery timezone") { Task {
                    do {
                        let _: PublicationValue = try await context.client.publicationRequest("me/publication-delivery-preferences", method: "PUT", body: .object(["timezone": .string(deliveryTimezone)]))
                    } catch { self.error = error.localizedDescription }
                } }
                Button("Enable push notifications") { Task { await PublicationPush.shared.requestPermission(client: context.client, userID: context.userID) } }
                Text(PublicationPush.shared.status).font(.caption).foregroundStyle(ZineTheme.secondaryText)
            }
            ForEach(rows) { activity in
                NavigationLink(value: activity.destination) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            if activity.readAt == nil { Image(systemName: "circle.fill").font(.caption2).foregroundStyle(ZineTheme.brandAccent) }
                            Text(activity.publicationName).font(.headline)
                        }
                        Text(activity.type == "ISSUE_PUBLISHED" ? "A new issue is ready" : "New selections in \(activity.issueIds.count) issue(s)")
                            .font(.subheadline).foregroundStyle(ZineTheme.secondaryText)
                        if !activity.available { Text("Publication unavailable").font(.caption) }
                    }
                }.disabled(!activity.available).simultaneousGesture(TapGesture().onEnded { Task { await markRead(activity.id) } })
            }
            if loaded && rows.isEmpty && error == nil { Text("New issues from your subscriptions will appear here.").foregroundStyle(ZineTheme.secondaryText) }
            if !loaded { ProgressView() }
            if cursor != nil { Button("More activity") { Task { await load(more: true) } } }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }.navigationTitle("Activity").zineScreenChrome().task { await load() }.refreshable { await load() }
    }
    private func load(more: Bool = false) async {
        error = nil; defer { loaded = true }
        do {
            let p: PublicationActivityPage = try await context.client.publicationRequest("me/publication-activity" + (more ? cursor.map { "?cursor=\($0)" } ?? "" : ""))
            rows = more ? rows + p.activities : p.activities; cursor = p.nextCursor
            if !more, let value: PublicationValue = try? await context.client.publicationRequest("me/publication-delivery-preferences"),
               case .object(let r) = value, case .object(let preferences) = r["preferences"], let zone = preferences["timezone"]?.string { deliveryTimezone = zone }
        } catch { self.error = error.localizedDescription }
    }
    private func markRead(_ id: String) async {
        do {
            let _: PublicationValue = try await context.client.publicationRequest("me/publication-activity/\(id)", method: "PATCH")
            if let i = rows.firstIndex(where: { $0.id == id }) { rows[i].readAt = ISO8601DateFormatter().string(from: Date()) }
        } catch { self.error = error.localizedDescription }
    }
}

struct PublicationSubscriptionsView: View {
    let context: PublicationContext
    @State private var rows: [PersonalPublication] = []
    @State private var cursor: String?
    @State private var error: String?
    @State private var loaded = false
    var body: some View {
        List {
            ForEach(rows) { publication in
                Section {
                    NavigationLink(publication.displayName, value: PublicationDestination.publication(publication.id))
                    PublicationSubscribeControls(id: publication.id, context: context)
                }
            }
            if loaded && rows.isEmpty && error == nil { Text("Subscribe to a Zine from an issue shared with you.").foregroundStyle(ZineTheme.secondaryText) }
            if !loaded { ProgressView() }
            if cursor != nil { Button("More subscriptions") { Task { await load(more: true) } } }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }.navigationTitle("Subscriptions").zineScreenChrome().task { await load() }.refreshable { await load() }
    }
    private func load(more: Bool = false) async {
        error = nil; defer { loaded = true }
        do {
            let p: PublicationSubscriptions = try await context.client.publicationRequest("me/publication-subscriptions" + (more ? cursor.map { "?cursor=\($0)" } ?? "" : ""))
            var publications: [PersonalPublication] = []
            for row in p.subscriptions { if let p = try? await context.client.publicPublication(row.publicationId) { publications.append(p) } }
            rows = more ? rows + publications : publications; cursor = p.nextCursor
        } catch { self.error = error.localizedDescription }
    }
}

struct PublicationWrappedView: View {
    let context: PublicationContext
    @State private var recaps: [PersonalWeeklyRecap] = []
    @State private var cursor: String?
    @State private var error: String?
    @State private var loaded = false
    @State private var timezone = TimeZone.current.identifier
    @State private var preferences: WeeklyRecapPreferencesEnvelope.Preferences?
    var body: some View {
        List {
            Section("Your private week") {
                Text("Look back, choose what stayed with you, and make an issue. Nothing is shared until you publish.")
                Picker("Week timezone", selection: $timezone) {
                    ForEach(TimeZone.knownTimeZoneIdentifiers, id: \.self) { Text($0).tag($0) }
                }
                Button("Save timezone") { Task { await setTimezone() } }
                if let pending = preferences?.pendingTimezone { Text("\(pending) takes effect next week.").font(.caption).foregroundStyle(ZineTheme.secondaryText) }
            }
            ForEach(recaps) { recap in
                NavigationLink {
                    PublicationRecapDetail(context: context, recap: recap)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Week of \(recap.weekStart)").font(.headline)
                        Text("\(recap.candidates.count) things to revisit").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                    }
                }
            }
            if loaded && recaps.isEmpty && error == nil { Text("Your first recap will be ready after Saturday night. Keep saving and exploring.").foregroundStyle(ZineTheme.secondaryText) }
            if !loaded { ProgressView() }
            if cursor != nil { Button("Earlier weeks") { Task { await load(more: true) } } }
            if let error { PublicationMessage(text: error) { Task { await load() } } }
        }.navigationTitle("Weekly Wrapped").zineScreenChrome().task { await load() }.refreshable { await load() }
    }
    private func load(more: Bool = false) async {
        error = nil; defer { loaded = true }
        do {
            let p: WeeklyRecapPage = try await context.client.publicationRequest("me/weekly-recaps" + (more ? cursor.map { "?cursor=\($0)" } ?? "" : ""))
            recaps = more ? recaps + p.recaps : p.recaps; cursor = p.nextCursor
            let pref: WeeklyRecapPreferencesEnvelope = try await context.client.publicationRequest("me/weekly-recap-preferences")
            preferences = pref.preferences; timezone = pref.preferences.timezone
        } catch { self.error = error.localizedDescription }
    }
    private func setTimezone() async {
        do {
            let p: WeeklyRecapPreferencesEnvelope = try await context.client.publicationRequest("me/weekly-recap-preferences", method: "PUT", body: .object(["timezone": .string(timezone)]))
            preferences = p.preferences
        } catch { self.error = error.localizedDescription }
    }
}

struct PublicationRecapDetail: View {
    let context: PublicationContext
    @State private var recap: PersonalWeeklyRecap
    init(context: PublicationContext, recap: PersonalWeeklyRecap) {
        self.context = context
        _recap = State(initialValue: recap)
    }
    @State private var selected: Set<String> = []
    @State private var issue: PersonalIssue?
    @State private var error: String?
    @State private var busy = false
    @State private var key = UUID().uuidString
    var body: some View {
        List {
            Section {
                Text("Your week, revisited").font(.title.bold())
                Text("\(recap.weekStart) · \(recap.timezone)").foregroundStyle(ZineTheme.secondaryText)
                if recap.coverage.state != "COMPLETE" {
                    Text("Some activity from this week wasn’t recorded.").font(.callout).foregroundStyle(ZineTheme.secondaryText)
                    ForEach(recap.coverage.limitations, id: \.self) { Text($0).font(.caption).foregroundStyle(ZineTheme.secondaryText) }
                }
                ForEach(recap.highlights, id: \.label) { Text("\($0.label): \($0.count)").font(.subheadline) }
            }
            Section("Choose what belongs in your issue") {
                ForEach(recap.candidates) { candidate in
                    Button {
                        if selected.contains(candidate.id) { selected.remove(candidate.id) } else { selected.insert(candidate.id) }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: selected.contains(candidate.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(ZineTheme.brandAccent)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(candidate.title).foregroundStyle(ZineTheme.primaryText)
                                if let creator = candidate.creatorName { Text(creator).font(.caption).foregroundStyle(ZineTheme.secondaryText) }
                                Text(Array(Set(candidate.evidence.map { $0.kind.capitalized })).sorted().joined(separator: " · ")).font(.caption).foregroundStyle(ZineTheme.secondaryText)
                                if !candidate.canSelect { Text(candidate.savedBookmarkId == nil ? "Save this to your Library before including it" : "Not available for public sharing").font(.caption).foregroundStyle(ZineTheme.secondaryText) }
                            }
                        }
                    }.disabled(!candidate.canSelect || recap.issueId != nil).accessibilityAddTraits(selected.contains(candidate.id) ? .isSelected : [])
                    if candidate.savedBookmarkId == nil, let url = candidate.originalURL {
                        HStack {
                            Link("Open original", destination: url)
                            if recap.issueId == nil {
                                Button("Save to Library") { Task { await saveCandidate(candidate) } }.disabled(busy)
                            }
                        }.font(.callout).buttonStyle(.borderless)
                    }
                }
                if recap.candidates.isEmpty { Text("A quiet week. You can still make an independent issue from your Library.").foregroundStyle(ZineTheme.secondaryText) }
            }
            Section {
                if let id = recap.issueId { NavigationLink("Open your weekly issue", value: PublicationDestination.editor(id)) }
                else { Button("Make an issue with \(selected.count) selections") { Task { await create() } }.disabled(selected.isEmpty || busy) }
                Text("You can add older saved content and arrange everything in the editor.").font(.caption).foregroundStyle(ZineTheme.secondaryText)
                if let error { PublicationMessage(text: error) }
            }
        }.navigationTitle("Week of \(recap.weekStart)").zineScreenChrome()
        .refreshable { await refreshRecap() }
        .navigationDestination(item: $issue) { issue in PublicationIssueEditorView(id: issue.id, context: context) }
    }
    private func refreshRecap() async {
        do {
            let response: WeeklyRecapEnvelope = try await context.client.publicationRequest("me/weekly-recaps/\(recap.weekStart)")
            recap = response.recap
            selected.formIntersection(Set(recap.candidates.filter(\.canSelect).map(\.id)))
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func saveCandidate(_ candidate: PersonalWeeklyRecap.Candidate) async {
        guard let url = candidate.originalURL else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await context.client.saveBookmark(url: url)
            await refreshRecap()
            if error == nil && !recap.candidates.contains(where: { $0.id == candidate.id && $0.canSelect }) {
                error = "Saved to Library. Refresh this recap when the saved item is ready to include."
            }
        } catch { self.error = error.localizedDescription }
    }
    private func create() async {
        busy = true; defer { busy = false }
        do {
            let response: IssueEnvelope = try await context.client.publicationRequest("me/weekly-recaps/\(recap.weekStart)/issue", method: "POST",
                body: .object(["selectedCandidateIds": .array(recap.candidates.filter { selected.contains($0.id) }.map { .string($0.id) })]), key: key)
            issue = response.issue
        } catch { self.error = error.localizedDescription }
    }
}
