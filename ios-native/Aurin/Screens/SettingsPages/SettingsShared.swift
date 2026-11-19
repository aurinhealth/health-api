import SwiftUI
import UserNotifications


// The pages behind the Settings menu. Each edits a copy and saves with the
// "Uložit" button in the bar; the server checks the values again.

/// "Uložit" in the navigation bar, greyed out until something changed.
struct SaveButton: ToolbarContent {
    let enabled: Bool
    let saving: Bool
    let action: () -> Void

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if saving {
                ProgressView()
            } else {
                Button("Uložit", action: action)
                    .font(.subheadline.weight(.semibold))
                    .disabled(!enabled)
            }
        }
    }
}

/// "Uložit" in the bar, and while something is changed the back button asks
/// "Zahodit změny?" first (D-NAST-7: Save stays, leaving no longer drops the
/// changes silently). The swipe back is off while it asks. `dirty` is
/// whether anything changed, also when it cannot be saved yet.
struct SettingsSaveBar: ViewModifier {
    let enabled: Bool
    let dirty: Bool
    let saving: Bool
    let action: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var asking = false

    func body(content: Content) -> some View {
        content
            .navigationBarBackButtonHidden(dirty)
            .toolbar {
                if dirty {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { asking = true } label: {
                            Image(systemName: "chevron.left").font(.body.weight(.semibold))
                        }
                        .accessibilityLabel("Zpět")
                    }
                }
                SaveButton(enabled: enabled, saving: saving, action: action)
            }
            .confirmationDialog("Zahodit změny?", isPresented: $asking, titleVisibility: .visible) {
                Button("Zahodit změny", role: .destructive) { dismiss() }
                Button("Zůstat", role: .cancel) {}
            } message: {
                Text("Změny na této stránce se neuložily.")
            }
    }
}

extension View {
    func settingsSaveBar(enabled: Bool, dirty: Bool? = nil, saving: Bool, action: @escaping () -> Void) -> some View {
        modifier(SettingsSaveBar(enabled: enabled, dirty: dirty ?? enabled, saving: saving, action: action))
    }
}

/// A picker row: title on the left, the chosen option on the right (menu).
struct SettingsPicker: View {
    let title: String
    @Binding var selection: String
    let options: [(String, String)]

    /// A menu with its own one-line label: the system menu picker wraps long
    /// names over the title.
    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(.body).foregroundStyle(Palette.ink).layoutPriority(1)
            Spacer(minLength: 8)
            Menu {
                Picker(title, selection: $selection) {
                    if !options.contains(where: { $0.0 == selection }) { Text("nevybráno").tag(selection) }
                    ForEach(options.indices, id: \.self) { i in Text(options[i].1).tag(options[i].0) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(options.first { $0.0 == selection }?.1 ?? "nevybráno")
                        .font(.subheadline).foregroundStyle(Palette.muted)
                        .lineLimit(1).truncationMode(.tail)
                    Image(systemName: "chevron.up.chevron.down").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                }
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 50)
    }
}
