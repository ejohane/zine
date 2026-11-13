import SwiftUI

enum LibraryPanel: String, Identifiable {
    case search, collections, following
    var id: Self { self }
}

struct LibraryPanelView: View {
    let panel: LibraryPanel
    @Bindable var space: SavedSpace
    let onChooseCollection: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch panel {
                case .search: SearchLibraryView(space: space)
                case .collections:
                    List(space.collections) { collection in
                        NavigationLink {
                            CollectionPreviewView(space: space, collection: collection) {
                                onChooseCollection(collection.id)
                                dismiss()
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(collection.name).font(.headline)
                                Text(collection.description ?? "").font(.subheadline).foregroundStyle(NextTheme.secondary)
                                Text("\(space.items.filter { $0.api?.collectionIds.contains(collection.id) == true }.count) saves")
                                    .font(.caption).foregroundStyle(NextTheme.secondary)
                            }.padding(.vertical, 8)
                        }
                    }
                    .navigationTitle("Collections")
                case .following: FollowingPreviewView()
                }
            }
            .scrollContentBackground(.hidden)
            .background(NextTheme.canvas)
            .foregroundStyle(NextTheme.ink)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .tint(NextTheme.selection)
    }
}

private struct SearchLibraryView: View {
    @Bindable var space: SavedSpace
    @State private var query = ""
    @State private var mode: SearchMode = .hybrid
    @State private var opened: SavedContent?

    var body: some View {
        List {
            Section {
                Picker("Match", selection: $mode) {
                    ForEach(SearchMode.allCases) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.segmented)
            }
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Section("Try an idea") {
                    ForEach(["designing with AI", "attention and craft"], id: \.self) { idea in
                        Button { query = idea } label: { Label(idea, systemImage: "sparkle.magnifyingglass") }
                    }
                }
            } else {
                let results = space.search(query, mode: mode)
                if results.isEmpty {
                    ContentUnavailableView.search(text: query)
                }
                ForEach(results) { hit in
                    Button { opened = hit.item } label: {
                        VStack(alignment: .leading, spacing: 9) {
                            Text(hit.item.title).font(.headline)
                            Text(hit.item.author).font(.subheadline).foregroundStyle(NextTheme.secondary)
                            if let evidence = hit.evidence.first {
                                Text(evidence.excerpt).font(.subheadline).lineLimit(3)
                                Label(evidence.field == "context" ? "Matches a saved note" : "Matches \(evidence.field)", systemImage: "text.quote")
                                    .font(.caption).foregroundStyle(NextTheme.secondary)
                            }
                        }.padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            }
            Section {
                Text("Words searches titles, creators, tags, and notes locally. Meaning matches are scripted for the two example ideas. The live API will provide semantic matches and source evidence; this preview does not run AI search.")
                    .font(.footnote).foregroundStyle(NextTheme.secondary)
            }
        }
        .searchable(text: $query, prompt: "A title, a note, or an idea")
        .navigationTitle("Find something good")
        .sheet(item: $opened) { StoryView(space: space, itemID: $0.id) }
    }
}

private struct CollectionPreviewView: View {
    @Bindable var space: SavedSpace
    let collection: APICollection
    let showFeed: () -> Void
    @State private var opened: SavedContent?

    var body: some View {
        List {
            Section {
                Text(collection.description ?? "")
                Button("Explore this collection", action: showFeed)
            }
            ForEach(collection.notes ?? []) { note in
                Section("Connections worth keeping") {
                    Text(note.text).font(.body)
                    ForEach(note.itemIds, id: \.self) { id in
                        if let item = space.items.first(where: { $0.apiID == id }) {
                            Button { opened = item } label: { Label(item.title, systemImage: item.section.symbol) }
                        }
                    }
                }
            }
            Section("In this collection") {
                ForEach(space.collectionItems(collection.id)) { item in
                    Button { opened = item } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.title).font(.headline)
                            Text(item.author).font(.subheadline).foregroundStyle(NextTheme.secondary)
                        }.padding(.vertical, 6)
                    }.buttonStyle(.plain)
                }
            }
            Section { Text("Collection notes and membership are mock examples. One item can belong to several collections.").font(.footnote).foregroundStyle(NextTheme.secondary) }
        }
        .navigationTitle(collection.name)
        .sheet(item: $opened) { StoryView(space: space, itemID: $0.id) }
    }
}

private struct FollowingPreviewView: View {
    @State private var subscriptions = APIFixtures.bundled.subscriptionList.subscriptions

    var body: some View {
        List {
            ForEach($subscriptions) { $subscription in
                let source = APIFixtures.bundled.sourceList.sources.first { $0.id == subscription.sourceId }
                Section(source?.name ?? "Source") {
                    Toggle("Save new arrivals automatically", isOn: $subscription.autoSave)
                    Text(subscription.autoSave ? "New matches go directly to your saves." : "New matches arrive in your inbox for review.")
                        .font(.subheadline).foregroundStyle(NextTheme.secondary)
                    if subscription.lastErrorCode != nil {
                        Label("Waiting to check this source again", systemImage: "clock")
                        Text("Your existing saves are safe. Provider delays can push the next check back.")
                            .font(.subheadline).foregroundStyle(NextTheme.secondary)
                    } else {
                        Label("Up to date", systemImage: "checkmark.circle")
                    }
                    Toggle("Following", isOn: Binding(get: { subscription.status == "active" }, set: { subscription.status = $0 ? "active" : "unsubscribed" }))
                }
            }
            Section {
                Text("Following starts with the latest matching item, then future arrivals. It does not import a source’s full history. Unfollowing keeps existing saves. These source controls are session-only mock behavior.")
                    .font(.footnote).foregroundStyle(NextTheme.secondary)
            }
        }
        .navigationTitle("Following")
    }
}

struct ReadingPositionView: View {
    @Bindable var space: SavedSpace
    let item: SavedContent
    @State private var fraction = 0.0

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Your place").font(.headline)
                Spacer()
                Text(item.resumeLabel).font(.subheadline).foregroundStyle(NextTheme.secondary)
            }
            Slider(value: $fraction, in: 0...1) { editing in
                if !editing { space.setProgress(fraction, for: item.id) }
            }
            .accessibilityLabel("Saved position")
            Text("Adjust your saved place. Completion is a separate choice.")
                .font(.caption).foregroundStyle(NextTheme.secondary)
        }
        .onAppear { fraction = item.progressFraction ?? 0 }
        .onChange(of: item.progressFraction) { _, value in fraction = value ?? 0 }
    }
}
