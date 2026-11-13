import SwiftUI

struct StoryCapabilitiesView: View {
    @Bindable var space: SavedSpace
    let item: SavedContent
    @State private var note = ""
    @State private var opened: SavedContent?

    private var detail: APIDetail? { APIFixtures.bundled.details[item.apiID] }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("Capability preview · Personal notes, summaries, and retained passages below are illustrative mock data.")
                .font(.footnote).foregroundStyle(NextTheme.secondary)
            if let api = item.api {
                if api.status == "received" {
                    HStack(spacing: 20) {
                        Button("Keep this") { space.setStatus("saved", for: item.id) }
                            .buttonStyle(.borderedProminent).accessibilityIdentifier("keep-arrival")
                        Button("Dismiss") { space.setStatus("dismissed", for: item.id) }
                            .buttonStyle(.bordered).accessibilityIdentifier("dismiss-arrival")
                    }
                    Text("An arrival from a followed source. The decision is yours.")
                        .font(.subheadline).foregroundStyle(NextTheme.secondary)
                } else if api.status == "dismissed" {
                    Button("Save after all") { space.setStatus("saved", for: item.id) }.buttonStyle(.bordered)
                }
                if item.section != .posts { ReadingPositionView(space: space, item: item) }
                if let summary = api.content.summary {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("At a glance", systemImage: "sparkles").font(.title2.bold())
                        Text(summary).font(.body).lineSpacing(4)
                        if let provenance = api.enrichment.fields["summary"]?.provenance {
                            Text(provenance.coverage == "metadata_only" ? "Based on metadata only · Full source not analyzed" : "Based on retained source text")
                                .font(.caption).foregroundStyle(NextTheme.secondary)
                        }
                        if let topics = api.content.topics, !topics.isEmpty {
                            Text(topics.joined(separator: " · ")).font(.subheadline).foregroundStyle(NextTheme.selection)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 14) {
                    Text("Why keep it?").font(.title2.bold())
                    ForEach(api.context) { context in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(context.text).font(.body)
                            Text(context.contributor == "you" ? "Your note · Kept on this device" : "Sample saved context")
                                .font(.caption).foregroundStyle(NextTheme.secondary)
                        }
                    }
                    TextField("Add a thought for later", text: $note, axis: .vertical)
                        .textFieldStyle(.roundedBorder).lineLimit(2...5)
                        .accessibilityIdentifier("context-input")
                    Button("Keep this note") {
                        space.addContext(note, to: item.id); note = ""
                    }
                    .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("context-save")
                }
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Collections").font(.title2.bold())
                        Spacer()
                        Menu {
                            ForEach(space.collections) { collection in
                                Button {
                                    space.toggleCollection(collection.id, for: item.id)
                                } label: {
                                    Label(collection.name, systemImage: api.collectionIds.contains(collection.id) ? "checkmark.circle.fill" : "circle")
                                }
                            }
                        } label: { Label("Organize", systemImage: "folder.badge.plus").frame(minHeight: 44) }
                    }
                    ForEach(space.collections.filter { api.collectionIds.contains($0.id) }) { collection in
                        Label(collection.name, systemImage: "rectangle.stack").font(.subheadline)
                    }
                    if api.collectionIds.isEmpty {
                        Text("Give this save a home in one or more collections.").font(.subheadline).foregroundStyle(NextTheme.secondary)
                    }
                    if !api.tags.isEmpty {
                        Text(api.tags.map { "#\($0)" }.joined(separator: "  ")).font(.subheadline).foregroundStyle(NextTheme.secondary)
                    }
                }
                if let material = detail?.material {
                    DisclosureGroup(material.field == "article" ? "Saved text · Partial preview" : "Transcript · Sample passages") {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(material.provenance.description ?? "Illustrative retained material")
                                .font(.caption).foregroundStyle(NextTheme.secondary)
                            if let text = material.value.text {
                                Text(text).font(.body).lineSpacing(7).textSelection(.enabled)
                            }
                            ForEach(Array((material.value.segments ?? []).enumerated()), id: \.offset) { _, segment in
                                VStack(alignment: .leading, spacing: 7) {
                                    if let seconds = segment.startSeconds {
                                        Button(SavedContent.timestamp(seconds)) {
                                            let duration = api.content.durationSeconds ?? 1
                                            space.setProgress(seconds / duration, for: item.id)
                                        }.font(.subheadline.monospacedDigit())
                                    }
                                    Text(segment.text).font(.body).lineSpacing(4)
                                }
                            }
                            if material.field == "transcript" {
                                Text("Timestamp buttons update your saved place. Media playback stays at the original source.")
                                    .font(.caption).foregroundStyle(NextTheme.secondary)
                            }
                        }.padding(.top, 14)
                    }.font(.headline)
                }
                if let annotations = detail?.annotations.annotations, !annotations.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Marked for later").font(.title2.bold())
                        ForEach(annotations) { annotation in
                            VStack(alignment: .leading, spacing: 8) {
                                if let exact = annotation.anchor?.exact {
                                    Text(exact).font(.body).padding(14).background(NextTheme.inset, in: .rect(cornerRadius: 12))
                                }
                                if let seconds = annotation.anchor?.startSeconds {
                                    Button { space.setProgress(seconds / (api.content.durationSeconds ?? 1), for: item.id) } label: {
                                        Label(SavedContent.timestamp(seconds), systemImage: "bookmark")
                                    }
                                }
                                if let text = annotation.text { Text(text).font(.subheadline).foregroundStyle(NextTheme.secondary) }
                            }
                        }
                    }
                }
                if let relationships = detail?.relationships.relationships, !relationships.isEmpty {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("A connection to follow").font(.title2.bold())
                        ForEach(relationships) { relationship in
                            if let target = space.items.first(where: { $0.apiID == relationship.target.itemId }) {
                                Button { opened = target } label: {
                                    Label(target.title, systemImage: target.section.symbol).frame(minHeight: 44, alignment: .leading)
                                }
                            }
                        }
                    }
                }
                DisclosureGroup("What’s available") {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(api.enrichment.components) { component in
                            HStack(alignment: .top) {
                                Image(systemName: component.status == "available" ? "checkmark.circle" : "clock")
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(component.component.capitalized).font(.subheadline.weight(.medium))
                                    Text(statusText(component)).font(.caption).foregroundStyle(NextTheme.secondary)
                                }
                            }
                        }
                        Text("A save is kept even when extraction or understanding is pending or unavailable.")
                            .font(.caption).foregroundStyle(NextTheme.secondary)
                    }.padding(.top, 14)
                }.font(.headline)
            }
        }
        .sheet(item: $opened) { StoryView(space: space, itemID: $0.id) }
    }

    private func statusText(_ component: APIComponent) -> String {
        switch component.status {
        case "available": "Available in this preview"
        case "pending": "Waiting to be prepared"
        case "processing": "Being prepared · Your save is already kept"
        case "failed": "Couldn’t prepare this yet · Your save is safe"
        default: "Source material isn’t available · Open the original instead"
        }
    }
}
