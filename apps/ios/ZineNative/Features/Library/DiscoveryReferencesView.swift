import SwiftUI

struct DiscoveryReferencesView: View {
    let bookmarkID: String
    let client: APIClient
    var foreground: Color = ZineTheme.primaryText
    var secondary: Color = ZineTheme.secondaryText
    @State private var references: [PersonalDiscoveryReference] = []
    @State private var expanded = false
    var body: some View {
        if let first = references.first {
            VStack(alignment: .leading, spacing: 10) {
                reference(first)
                if references.count > 1 {
                    DisclosureGroup("\(references.count - 1) more discoveries", isExpanded: $expanded) {
                        ForEach(Array(references.dropFirst())) { reference($0).padding(.top, 8) }
                    }.font(.caption).tint(foreground)
                }
            }.task(id: bookmarkID) { await load() }
        } else {
            Color.clear.frame(height: 0).task(id: bookmarkID) { await load() }
        }
    }
    @ViewBuilder private func reference(_ value: PersonalDiscoveryReference) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if value.available {
                NavigationLink(value: PublicationDestination.issue(value.issueId)) {
                    Text("Found in \(value.publicationName) · \(value.issueTitle)").font(.caption).foregroundStyle(foreground)
                }
            } else {
                Text("Found in \(value.publicationName) · \(value.issueTitle)").font(.caption).foregroundStyle(secondary)
            }
            if let commentary = value.commentary, !commentary.isEmpty {
                Text("\(value.editorName): \(commentary)").font(.caption).foregroundStyle(secondary)
            }
        }
    }
    private func load() async {
        if let result: DiscoveryReferencesEnvelope = try? await client.publicationRequest("bookmarks/\(bookmarkID)/discovery-references") { references = result.discoveryReferences }
    }
}
