#if DEBUG
import SwiftUI

/// Uses the same item fixtures and component implementations as the regular Home preview.
struct HomeCompositionPreviewView: View {
    @Binding var dark: Bool
    @State private var arrangement = 0
    @State private var titleState = ListTitleCollapseState()
    @Namespace private var transitions
    private let client = APIClient(baseURL: URL(string: "https://example.invalid")!, tokenProvider: { "fixture" })

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Arrangement", selection: $arrangement) {
                    Text("Home").tag(0)
                    Text("Mixed cards").tag(1)
                    Text("Rails first").tag(2)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16).padding(.vertical, 8)
                Text("Component preview · Home item fixtures")
                    .font(.caption).foregroundStyle(ZineTheme.secondaryText)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        ObservedListTitle(title: arrangement == 0 ? "Home" : "Home Lab", state: titleState)
                            .padding(.horizontal, 18)
                        if arrangement == 0 {
                            ForEach(HomeLayoutDensity.compact.visibleSections(from: ScreenshotHomeFixtures.sections)) { section in
                                HomeDashboardSectionView(section: section, density: .compact, transitionNamespace: transitions)
                            }
                        } else {
                            ForEach(composition.resolve(items: items)) { section in
                                HomeComposedSectionView(resolved: section, transitionNamespace: transitions)
                            }
                        }
                    }
                    .padding(.vertical, 6).padding(.bottom, 16)
                }
                .id(arrangement)
            }
            .background(ZineTheme.canvas)
            .navigationTitle("Home components")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button { dark.toggle() } label: { Image(systemName: dark ? "sun.max" : "moon") }
                    .accessibilityLabel("Toggle preview appearance")
            }
            .navigationDestination(for: HomeNavigationRoute.self) { route in
                switch route.destination {
                case .item(let item), .resumeArticle(let item):
                    BookmarkDetailView(item: item, client: client, onUpdate: { _ in },
                                       onBookmarkCommit: { _, _ in }, onExternalOpen: { _, _ in })
                case .bookmark(let bookmark):
                    BookmarkDetailView(bookmark: bookmark, client: client, onUpdate: { _ in },
                                       onBookmarkCommit: { _, _ in }, onExternalOpen: { _ in })
                }
            }
        }
    }
    private var items: [HomeItem] {
        ScreenshotHomeFixtures.sections.flatMap { section -> [HomeItem] in
            switch section {
            case .jumpBackIn(let items), .quickWins(let items), .recentlySaved(let items),
                 .podcasts(let items), .articles(let items), .videos(let items): return items
            case .featuredArticle(let item): return [item]
            case .collection(let collection): return collection.items
            case .inbox: return []
            }
        }
    }
    private var composition: HomeComposition {
        let unique = items.reduce(into: [HomeItem]()) { result, item in
            if !result.contains(where: { $0.id == item.id }) { result.append(item) }
        }
        let featured = unique.first(where: { $0.contentType == .article })!
        let podcasts = unique.filter { $0.contentType == .podcast }
        let lead = HomeComposition.Section(id: "lead", layout: .single, card: .featured, itemIds: [featured.id])
        let tiles = HomeComposition.Section(id: "tiles", title: "Jump Back In", layout: .twoColumn,
                                            card: .tile, itemIds: Array(unique.dropFirst().prefix(6).map(\.id)))
        let rail = HomeComposition.Section(id: "reads", title: "Saved Reads", layout: .horizontal,
                                           card: .landscape, itemIds: Array(unique.filter { $0.contentType == .article }.prefix(6).map(\.id)))
        var sections = arrangement == 1 ? [lead, tiles, rail] : [rail, lead, tiles]
        if !podcasts.isEmpty {
            sections.append(.init(id: "listen", title: "Listen Next", layout: .horizontal,
                                  card: .cover, itemIds: Array(podcasts.prefix(6).map(\.id))))
        }
        sections.append(.init(id: "rows", title: "Recently Saved", layout: .vertical,
                              card: .row, itemIds: Array(unique.suffix(3).map(\.id))))
        return .init(sections: sections)
    }
}
#endif
