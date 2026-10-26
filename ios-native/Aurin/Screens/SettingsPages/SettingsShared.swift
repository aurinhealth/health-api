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
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.faint)
                }
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 50)
    }
}
