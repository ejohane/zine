import SwiftUI

struct SpaceView: View {
    @Bindable var space: SavedSpace
    @State private var section: ContentSection
    @State private var opened: SavedContent?
    @State private var capturing = false
    @State private var scope: LibraryScope = .saved
    @State private var collectionID: String?
    @State private var panel: LibraryPanel?
    @State private var headerHeight: CGFloat = 74
    @Environment(\.dynamicTypeSize) private var typeSize

    init(space: SavedSpace, section: ContentSection = .home) {
        self.space = space
        _section = State(initialValue: section)
    }

    private var visible: [SavedContent] {
        if let collectionID, scope == .saved {
            return space.collectionItems(collectionID).filter { section == .home || $0.section == section }
        }
        return space.contents(in: section, scope: scope, collectionID: collectionID)
    }

    var body: some View {
        GeometryReader { geometry in
            let mosaic = geometry.size.width >= 720 && typeSize <= .xxLarge
            let inset: CGFloat = mosaic ? 30 : 22
            let pageWidth = min(geometry.size.width, 1120) - inset * 2
            ScrollView(.vertical) {
                LazyVStack(alignment: .leading, spacing: 24) {
                    pageHeading
                    if section == .home && scope == .saved && collectionID == nil, let resume = space.resumeItems.first {
                        Button { opened = resume } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "bookmark.fill").foregroundStyle(NextTheme.selection)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Pick up where you left off").font(.subheadline).foregroundStyle(NextTheme.secondary)
                                    Text(resume.title).font(.headline).lineLimit(1)
                                }
                                Spacer(minLength: 8)
                                Text(resume.resumeLabel).font(.subheadline).foregroundStyle(NextTheme.secondary)
                            }
                            .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            .background(NextTheme.paper, in: .rect(cornerRadius: 20))
                        }.buttonStyle(StoryTapStyle()).accessibilityIdentifier("resume-item")
                    }
                    if !visible.isEmpty {
                        BentoFeed(items: visible, width: pageWidth, mosaic: mosaic) { opened = $0 }
                    } else {
                        ContentUnavailableView {
                            Label("Room for something new", systemImage: section.symbol)
                        } description: { Text("Save a link you’d like to come back to.") }
                        actions: { Button("Save a link") { capturing = true } }
                    }
                    Text("Local capability preview · Notes, progress, source states, and understanding are mock data.")
                        .font(.footnote).foregroundStyle(NextTheme.secondary)
                        .padding(.top, 8)
                }
                .padding(.horizontal, inset)
                .padding(.top, headerHeight + 30)
                .padding(.bottom, 44)
                .frame(maxWidth: 1120, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .id("\(section.rawValue)-\(scope.rawValue)-\(collectionID ?? "all")")
            .accessibilityIdentifier("vertical-content")
            .overlay(alignment: .top) {
                HeaderFilters(selection: section, onSelect: { section = $0 }, onCapture: { capturing = true })
                    .padding(.horizontal, 22)
                    .padding(.top, 10)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
            }
            .background(NextTheme.canvas.ignoresSafeArea())
        }
        .foregroundStyle(NextTheme.ink)
        .sheet(item: $opened) { item in StoryView(space: space, itemID: item.id) }
        .sheet(isPresented: $capturing) { CaptureView(space: space, section: section) }
        .sheet(item: $panel) { panel in
            LibraryPanelView(panel: panel, space: space) { id in
                collectionID = id; scope = .saved; section = .home
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let message = space.storageError {
                Text(message).font(.footnote).padding().frame(maxWidth: .infinity)
                    .background(NextTheme.paper).foregroundStyle(NextTheme.ink)
            }
        }
    }

    private var pageHeading: some View {
        VStack(alignment: .leading, spacing: 14) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) { heading; Spacer(); tools }
                VStack(alignment: .leading, spacing: 12) { heading; tools }
            }
            HStack(spacing: 16) {
                Menu {
                    ForEach(LibraryScope.allCases) { choice in
                        Button(choice.rawValue) { scope = choice; collectionID = nil }
                    }
                } label: {
                    Label(scope.rawValue, systemImage: "line.3.horizontal.decrease")
                        .font(.subheadline).frame(minHeight: 44)
                }
                .accessibilityIdentifier("library-scope")
                if let id = collectionID, let collection = space.collections.first(where: { $0.id == id }) {
                    Button { collectionID = nil } label: {
                        Label(collection.name, systemImage: "xmark.circle.fill").font(.subheadline).frame(minHeight: 44)
                    }
                } else if scope == .saved {
                    Button { scope = .received } label: {
                        Label("Inbox · \(space.contents(in: .home, scope: .received).count)", systemImage: "tray")
                            .font(.subheadline).frame(minHeight: 44)
                    }.accessibilityIdentifier("open-inbox")
                }
            }
            .foregroundStyle(NextTheme.secondary)
        }
    }

    private var heading: some View {
        Text(scope == .received ? "Something new to explore" : section.headline)
            .font(.largeTitle.bold()).tracking(-0.6)
    }

    private var tools: some View {
        HStack(spacing: 6) {
            Button { panel = .search } label: { Image(systemName: "magnifyingglass").frame(width: 44, height: 44) }
                .accessibilityLabel("Search your saves").accessibilityIdentifier("open-search")
            Button { panel = .collections } label: { Image(systemName: "rectangle.stack").frame(width: 44, height: 44) }
                .accessibilityLabel("Collections").accessibilityIdentifier("open-collections")
            Button { panel = .following } label: { Image(systemName: "dot.radiowaves.left.and.right").frame(width: 44, height: 44) }
                .accessibilityLabel("Following").accessibilityIdentifier("open-following")
        }.font(.title3).foregroundStyle(NextTheme.selection)
    }
}
