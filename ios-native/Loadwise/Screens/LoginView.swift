import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Loadwise")
                Spacer()
                Text("Trénink, spánek a jídlo v jednom.")
                    .font(Typo.sentence(40, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Každé ráno víš, jak na tom jsi a co dnes dává smysl.")
                    .font(Typo.sentence(20))
                    .foregroundStyle(Palette.secondary)
                    .padding(.top, 14)
                Spacer()
                if let message = model.errorMessage {
                    Text(message).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 12)
                }
                Button {
                    Task { await model.signIn() }
                } label: {
                    HStack(spacing: 10) {
                        if model.signingIn { ProgressView().tint(Palette.onButton) }
                        Text("Přihlásit se přes Google")
                    }
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Palette.button, in: Capsule())
                }
                .disabled(model.signingIn)
                Button("Prohlédnout ukázku") { model.showDemo() }
                    .font(Typo.bodyStrong)
                    .foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                Text("Přihlášení se otevře v Safari. Přístup mají pozvaní uživatelé.")
                    .font(Typo.caption)
                    .foregroundStyle(Palette.faint)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 24)
        }
    }
}
