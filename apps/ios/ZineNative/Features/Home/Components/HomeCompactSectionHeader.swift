import SwiftUI

struct HomeCompactSectionHeader: View {
    let title: String
    var route: HomeSectionRoute? = nil

    @Environment(\.zineTabNavigationActions) private var navigation

    var body: some View {
        Group {
            if let route, let navigate = navigation.homeSection {
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
        .accessibilityLabel(route == nil ? title : "View all \(title)")
    }

    private var headerLabel: some View {
        HStack(spacing: 5) {
            Text(title)
                .font(.headline)
            if route != nil {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ZineTheme.tertiaryText)
            }
        }
        .foregroundStyle(ZineTheme.primaryText)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
