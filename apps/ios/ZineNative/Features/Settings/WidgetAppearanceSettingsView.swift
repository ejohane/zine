import SwiftUI
import UIKit
import WidgetKit

struct WidgetAppearanceSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var colors: [WidgetSavedColor] = []
    @State private var original: [WidgetSavedColor] = []
    @State private var errorMessage: String?
    private let storage = WidgetColorStorage()

    var body: some View {
        List {
            Section {
                ForEach($colors) { $color in
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("Color name", text: $color.name)
                            .foregroundStyle(ZineTheme.primaryText)
                            .accessibilityLabel("Color name")
                        ColorPicker("Background", selection: selection(for: $color), supportsOpacity: false)
                            .foregroundStyle(ZineTheme.primaryText)
                            .accessibilityLabel("Background for \(color.name)")
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(ZineTheme.surface)
                }
                .onDelete { colors.remove(atOffsets: $0) }

                Button {
                    colors.append(WidgetSavedColor(id: UUID().uuidString, name: "Color \(colors.count + 1)",
                                                   hex: ZineTheme.Role.brandAccent.lightHex))
                } label: {
                    Label("Add color", systemImage: "plus")
                }
                .listRowBackground(ZineTheme.surface)
                .accessibilityIdentifier("widget-add-color")
            } header: {
                Text("Saved colors")
            } footer: {
                Text("Save your colors, then touch and hold a Zine widget and choose Edit Widget → Background. Each widget can use a different color. Removing a selected color returns that widget to Automatic.")
            }

            Section {
                Text("Clear and Tinted Home Screen appearances use the system glass and may override your background color. Choose the default Home Screen appearance to see your selected color.")
                    .font(.footnote)
                    .foregroundStyle(ZineTheme.secondaryText)
                    .listRowBackground(ZineTheme.surface)
            }
        }
        .scrollContentBackground(.hidden)
        .background(ZineTheme.canvas)
        .navigationTitle("Widget backgrounds")
        .navigationBarTitleDisplayMode(.inline)
        .zineScreenChrome()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save", action: save)
                    .disabled(colors == original || colors.contains { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
                    .accessibilityIdentifier("widget-save-colors")
            }
        }
        .onAppear {
            colors = storage.load()
            original = colors
        }
        .alert("Couldn’t save colors", isPresented: Binding(
            get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Please try again.")
        }
    }

    private func selection(for color: Binding<WidgetSavedColor>) -> Binding<Color> {
        Binding(get: {
            let rgb = WidgetRGB(hex: color.wrappedValue.hex)!
            return ZineTheme.WidgetPalette(rgb: rgb).background
        }, set: { value in
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            guard UIColor(value).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return }
            color.wrappedValue.hex = String(format: "%02X%02X%02X", Int((red * 255).rounded()),
                                           Int((green * 255).rounded()), Int((blue * 255).rounded()))
        })
    }

    private func save() {
        do {
            let trimmed = colors.map { color in
                WidgetSavedColor(id: color.id, name: color.name.trimmingCharacters(in: .whitespacesAndNewlines), hex: color.hex)
            }
            try storage.save(trimmed)
            WidgetCenter.shared.reloadTimelines(ofKind: JumpBackInWidgetSnapshot.kind)
            dismiss()
        } catch {
            errorMessage = "Your colors couldn’t be saved on this device. Please try again."
        }
    }
}
