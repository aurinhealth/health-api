import SwiftUI

// The Settings building blocks from the design ("Nastavení"): grouped white
// cards with rows like the iOS Settings app, a coloured square icon on the
// left, the current value and a chevron on the right.

/// A group of rows on one card, with an optional title above it.
struct SettingsGroup<Content: View>: View {
    var title: String? = nil
    var footer: String? = nil
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.secondary)
                    .padding(.horizontal, 4)
                    .accessibilityAddTraits(.isHeader)
            }
            VStack(spacing: 0) { content }
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
            if let footer {
                Text(footer).font(Typo.caption).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// The hairline between two rows of a group (iOS 17 has no API to put it there
/// automatically).
struct SettingsDivider: View {
    var body: some View {
        Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 16)
    }
}

/// The coloured rounded square with a white symbol.
struct SettingsIcon: View {
    let systemImage: String
    let color: Color

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(color, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// One row: icon, title (and subtitle), value, chevron when it opens something.
struct SettingsRow: View {
    var icon: SettingsIcon? = nil
    let title: String
    var subtitle: String? = nil
    var value: String? = nil
    var chevron = true
    var titleColor: Color = Palette.ink

    var body: some View {
        HStack(spacing: 12) {
            if let icon { icon }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body).foregroundStyle(titleColor)
                if let subtitle {
                    Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if let value {
                Text(value).font(.subheadline).foregroundStyle(Palette.muted).lineLimit(1)
            }
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 50)
        .contentShape(Rectangle())
    }
}

/// A row with a switch.
struct SettingsToggle: View {
    let title: String
    var subtitle: String? = nil
    @Binding var isOn: Bool
    var disabled = false

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                if let subtitle {
                    Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Palette.green)
        .disabled(disabled)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 50)
    }
}

/// A row with a text field on the right, e.g. "Výška · 182 cm".
struct SettingsField: View {
    let title: String
    @Binding var text: String
    var unit: String? = nil
    var keyboard: UIKeyboardType = .decimalPad
    var placeholder = "–"

    var body: some View {
        HStack(spacing: 8) {
            Text(title).font(.body).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
                .font(.body)
                .foregroundStyle(Palette.ink)
                .frame(maxWidth: 140)
            if let unit {
                Text(unit).font(.subheadline).foregroundStyle(Palette.muted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 50)
    }
}

/// The settings screen frame: plain paper background, title bar with a back
/// button (from the navigation stack) and a scrolling column.
struct SettingsPage<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) { content }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 48)
        }
        .background(Palette.settingsBackground.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
