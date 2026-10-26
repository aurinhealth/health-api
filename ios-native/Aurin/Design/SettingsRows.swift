import SwiftUI

// The Settings building blocks ("Nastavení"), in Aurin's own quiet style:
// rounded cards like Dnes and Propojení, a thin coloured symbol on the left,
// a small spaced capital title above each card, and the app's own switch.

/// A group of rows on one card, with an optional title above it.
struct SettingsGroup<Content: View>: View {
    var title: String? = nil
    var footer: String? = nil
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let title {
                Text(title).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4)
                    .accessibilityAddTraits(.isHeader)
            }
            VStack(spacing: 0) { content }
            .cardSurface(cornerRadius: 22)
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

/// A thin symbol in its colour, without a tile under it.
struct SettingsIcon: View {
    let systemImage: String
    let color: Color

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 18, weight: .regular))
            .foregroundStyle(color)
            .frame(width: 26, height: 26)
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
    /// A count waiting to be looked at, in an amber capsule.
    var badge: Int? = nil

    var body: some View {
        HStack(spacing: 14) {
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
            if let badge, badge > 0 {
                Text(verbatim: String(badge)).font(.footnote.weight(.bold)).foregroundStyle(Palette.onButton)
                    .padding(.horizontal, 7).frame(minWidth: 22, minHeight: 22)
                    .background(Palette.amber, in: Capsule())
            }
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .frame(minHeight: 52)
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
        .toggleStyle(AurinToggleStyle())
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
            TextField(L10n.tr(placeholder), text: $text)
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
        PageScroll {
            VStack(alignment: .leading, spacing: 26) { content }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 48)
        }
        .background(Palette.settingsBackground.ignoresSafeArea())
        .navigationTitle(L10n.tr(title))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The switch of the design: a light capsule in the ink colour with a dark
/// knob when on, a faint one when off (instead of the green system switch).
struct AurinToggleStyle: ToggleStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.78)) { configuration.isOn.toggle() }
        } label: {
            HStack(spacing: 12) {
                configuration.label
                Spacer(minLength: 8)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule()
                        .fill(configuration.isOn ? Palette.button : Palette.ink.opacity(0.12))
                        .frame(width: 50, height: 30)
                    Circle()
                        .fill(configuration.isOn ? Palette.onButton : Palette.muted)
                        .frame(width: 24, height: 24)
                        .padding(3)
                }
                .opacity(isEnabled ? 1 : 0.45)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(L10n.tr(configuration.isOn ? "zapnuto" : "vypnuto"))
        .accessibilityAddTraits(.isButton)
    }
}

/// A switch on its own card, with an icon: for the switches that matter
/// ("Zapisovat do Intervals.icu", "Jen s mým vybavením").
struct PillToggle: View {
    let title: String
    var subtitle: String? = nil
    var systemImage: String? = nil
    @Binding var isOn: Bool
    var disabled = false

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 12) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(isOn ? Palette.onButton : Palette.muted)
                        .frame(width: 34, height: 34)
                        .background(isOn ? Palette.green : Palette.track, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    if let subtitle {
                        Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .toggleStyle(AurinToggleStyle())
        .disabled(disabled)
        .padding(.horizontal, 14).padding(.vertical, 12)
        .cardSurface(cornerRadius: 18)
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(isOn ? Palette.green.opacity(0.5) : Palette.hairline, lineWidth: 1))
    }
}

/// A choice among long names (zone presets): the row shows the choice on one
/// line, the list opens on its own page where every name fits.
struct OptionListRow: View {
    let title: String
    @Binding var selection: String
    let options: [(String, String)]
    var footer: String? = nil

    var body: some View {
        NavigationLink {
            OptionListPage(title: title, selection: $selection, options: options, footer: footer)
        } label: {
            HStack(spacing: 12) {
                Text(title).font(.body).foregroundStyle(Palette.ink).layoutPriority(1)
                Spacer(minLength: 8)
                Text(options.first { $0.0 == selection }?.1 ?? "nevybráno")
                    .font(.subheadline).foregroundStyle(Palette.muted)
                    .lineLimit(1).truncationMode(.tail)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct OptionListPage: View {
    let title: String
    @Binding var selection: String
    let options: [(String, String)]
    var footer: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        SettingsPage(title: title) {
            SettingsGroup(footer: footer) {
                ForEach(options.indices, id: \.self) { i in
                    if i > 0 { SettingsDivider() }
                    Button {
                        selection = options[i].0
                        dismiss()
                    } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(options[i].1).font(.body).foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            if options[i].0 == selection {
                                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 13)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
