import SwiftUI

/// The explicit consent (GDPR art. 9) before sensitive data is used: what it
/// gives, what goes where, the legal line, then Zapnout or Teď ne. Already on,
/// it only explains (Zavřít). The cycle for the coach, the journal's sensitive
/// items and sexual activity from Apple Health use it.
struct ConsentSheet<Content: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: LocalizedStringKey
    let lead: LocalizedStringKey
    let legal: LocalizedStringKey
    let isOn: Bool
    let accept: () -> Void
    let content: Content

    init(title: LocalizedStringKey, lead: LocalizedStringKey, legal: LocalizedStringKey, isOn: Bool = false,
         accept: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.title = title
        self.lead = lead
        self.legal = legal
        self.isOn = isOn
        self.accept = accept
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(Typo.sentence(26, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text(lead)
                    .font(Typo.sentence(17)).foregroundStyle(Palette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
                content
                Text(legal)
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
                if !isOn {
                    Button {
                        accept()
                        dismiss()
                    } label: {
                        Text("Zapnout").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 18)
                }
                Button { dismiss() } label: {
                    Text(isOn ? "Zavřít" : "Teď ne").font(Typo.body).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18)) }
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }
}

/// A small heading in a ConsentSheet.
struct ConsentSection: View {
    let title: LocalizedStringKey
    init(_ title: LocalizedStringKey) { self.title = title }

    var body: some View {
        Text(title).font(Typo.caption).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.muted)
            .padding(.top, 18).padding(.bottom, 4)
    }
}

/// A line in a ConsentSheet: a check for what happens, a cross for what does not.
struct ConsentPoint: View {
    let text: LocalizedStringKey
    var included = true
    init(_ text: LocalizedStringKey, included: Bool = true) {
        self.text = text
        self.included = included
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: included ? "checkmark" : "xmark").font(.footnote.weight(.semibold))
                .foregroundStyle(included ? Palette.green : Palette.muted)
            Text(text).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 5)
    }
}
