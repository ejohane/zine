import SwiftUI

struct HomeCompactSectionHeader: View {
    let title: String
    var route: HomeSectionRoute? = nil
    var homeLabCollectionID: String? = nil

    @Environment(\.zineTabNavigationActions) private var navigation

    var body: some View {
        Group {
            if let id = homeLabCollectionID {
                if let navigate = navigation.homeLabCollection {
                    Button { navigate(HomeLabCollectionRoute(id: id)) } label: { headerLabel }
                } else {
                    NavigationLink(value: HomeLabCollectionRoute(id: id)) { headerLabel }
                }
            } else if let route, let navigate = navigation.homeSection {
                Button {
                    navigate(route)
                } label: {
                    headerLabel
                }
            } else if let route {
                NavigationLink(value: route) {
                    headerLabel
                }
            } else {
                headerLabel
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(route == nil && homeLabCollectionID == nil ? title : "View all \(title)")
    }

    private var headerLabel: some View {
        HStack(spacing: 5) {
            Text(title)
                .font(.headline)
            if route != nil || homeLabCollectionID != nil {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
        }
        .foregroundStyle(ZineTheme.primaryText)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
