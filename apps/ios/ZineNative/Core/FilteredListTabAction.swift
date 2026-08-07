import SwiftUI

enum FilteredListTabAction: Equatable {
    case none
    case scrollToTop
    case resetFilter

    static func resolve(isVisible: Bool, isAtTop: Bool, hasActiveFilter: Bool) -> Self {
        guard isVisible, hasActiveFilter else { return .none }
        return isAtTop ? .resetFilter : .scrollToTop
    }

    @MainActor
    static func perform<ID: Hashable>(
        isVisible: Bool,
        collapseProgress: CGFloat,
        hasActiveFilter: Bool,
        proxy: ScrollViewProxy,
        topID: ID,
        resetFilter: () -> Void
    ) {
        switch resolve(
            isVisible: isVisible,
            isAtTop: collapseProgress <= 0.01,
            hasActiveFilter: hasActiveFilter
        ) {
        case .scrollToTop:
            withAnimation(.snappy) {
                proxy.scrollTo(topID, anchor: .top)
            }
        case .resetFilter:
            resetFilter()
        case .none:
            break
        }
    }
}
