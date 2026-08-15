import SwiftUI

struct SourceDetailHero: View {
    let source: SubscriptionSource
    let title: String
    let detail: String
    var status: String?
    var needsAttention = false

    var body: some View {
        HStack(alignment: .top, spacing: 15) {
            Image(systemName: source.systemImage)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(ZineTheme.onAccent)
                .frame(width: 50, height: 50)
                .background(ZineTheme.brandAccent, in: .rect(cornerRadius: 15))

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(ZineTheme.primaryText)
                Text(detail)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                if let status {
                    SourceStatusPill(text: status, needsAttention: needsAttention)
                        .padding(.top, 2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(ZineTheme.border.opacity(0.7), lineWidth: 1)
        }
    }
}

struct SourceStatusPill: View {
    let text: String
    var needsAttention = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(needsAttention ? ZineTheme.brandAccent : statusColor)
                .frame(width: 7, height: 7)
            Text(text)
                .font(.system(.caption2, design: .rounded, weight: .bold))
        }
        .foregroundStyle(needsAttention ? ZineTheme.brandAccent : ZineTheme.secondaryText)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(ZineTheme.raised, in: .capsule)
    }

    private var statusColor: Color {
        text.localizedCaseInsensitiveContains("connected")
            || text.localizedCaseInsensitiveContains("active")
            ? .green
            : ZineTheme.secondaryText
    }
}

extension View {
    func sourceManagementListStyle() -> some View {
        listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(ZineTheme.canvas)
            .environment(\.defaultMinListRowHeight, 48)
    }

    func sourceManagementRow() -> some View {
        listRowBackground(ZineTheme.surface)
    }

    func sourceHeroRow() -> some View {
        listRowInsets(EdgeInsets(top: 8, leading: 18, bottom: 8, trailing: 18))
            .listRowBackground(ZineTheme.canvas)
            .listRowSeparator(.hidden)
    }
}
