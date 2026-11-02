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
            .scaledFont(18, weight: .regular, cap: .denseCap)
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
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
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

/// The handle on the left of a row that can be dragged to a new place.
struct SettingsGrip: View {
    var body: some View {
        Image(systemName: "line.3.horizontal")
            .scaledFont(15, weight: .medium, cap: .denseCap)
            .foregroundStyle(Palette.faint)
            .frame(width: 26)
            .padding(.leading, 14)
            .accessibilityHidden(true)
    }
}

/// Reordering rows on a card (not a List): a row is dragged onto another and
/// takes its place. `accepts` lists the ids that may be dropped here.
struct SettingsReorder: ViewModifier {
    let id: String
    var movable = true
    let accepts: [String]
    let drop: (String) -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if movable {
            content
                .draggable(id)
                .dropDestination(for: String.self) { items, _ in take(items) }
        } else {
            content.dropDestination(for: String.self) { items, _ in take(items) }
        }
    }

    private func take(_ items: [String]) -> Bool {
        guard let moved = items.first, accepts.contains(moved) else { return false }
        drop(moved)
        return true
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
        .background { Palette.settingsBackground.ignoresSafeArea() }
        .navigationTitle(L10n.tr(title))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The switch of the design, in the shape of the iOS 26 switch (64 × 28 with a
/// long knob): green with a white knob when on, only a thin outline with a small
/// knob when off, so an off switch is never a grey block on the card.
struct AurinToggleStyle: ToggleStyle {
    @Environment(\.isEnabled) private var isEnabled
    private static let outline = Color(light: 0x1B1A17, dark: 0xECEAE6, alpha: 0.28)
    private static let offKnob = Color(light: 0x1B1A17, dark: 0xECEAE6, alpha: 0.45)

    func makeBody(configuration: Configuration) -> some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.78)) { configuration.isOn.toggle() }
        } label: {
            HStack(spacing: 12) {
                configuration.label
                Spacer(minLength: 8)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule()
                        .fill(configuration.isOn ? Palette.green : Color.clear)
                        .overlay {
                            Capsule().strokeBorder(Self.outline, lineWidth: 1.5)
                                .opacity(configuration.isOn ? 0 : 1)
                        }
                        .frame(width: 64, height: 28)
                    if configuration.isOn {
                        Capsule()
                            .fill(Color.white)
                            .frame(width: 38, height: 24)
                            .shadow(color: .black.opacity(0.14), radius: 2.5, y: 1.5)
                            .padding(2)
                    } else {
                        Circle()
                            .fill(Self.offKnob)
                            .frame(width: 14, height: 14)
                            .padding(7)
                    }
                }
                .opacity(isEnabled ? 1 : 0.45)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(L10n.tr(configuration.isOn ? "zapnuto" : "vypnuto"))
        .accessibilityAddTraits(.isToggle)
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
                        .scaledFont(15, weight: .semibold, cap: .denseCap)
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
        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(isOn ? Palette.green.opacity(0.5) : Palette.hairline, lineWidth: 1) }
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
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
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
