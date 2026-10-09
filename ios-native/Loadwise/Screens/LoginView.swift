import SwiftUI

/// The first screen: three pages of what Loadwise does, then the sign-in.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var page = 0

    private let pages: [(symbol: String, color: Color, title: String, text: String)] = [
        ("sun.max.fill", Palette.green, "Každé ráno víš, jak na tom jsi.", "Připravenost z HRV, tepu a spánku. Jedno číslo a jedna věta, co dnes dává smysl."),
        ("figure.strengthtraining.traditional", Palette.amberBar, "Trénink, který sedí k únavě.", "Kolo, běh i posilovna. AI sestaví trénink podle partií, vybavení a toho, co máš za sebou."),
        ("fork.knife", Palette.rust, "Jídlo, pití a spánek v jednom.", "Vyfoť talíř nebo naskenuj kód. Večerka podle budíku a potřeby spánku.")
    ]

    var body: some View {
        ZStack {
            ScreenBackground(glow: page == 1 ? Palette.Glow.training : page == 2 ? Palette.Glow.food : Palette.Glow.today)
                .animation(.easeInOut(duration: 0.4), value: page)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    SectionLabel(text: "Loadwise")
                    Spacer()
                    Button("Přeskočit") { withAnimation { page = pages.count - 1 } }
                        .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        .opacity(page < pages.count - 1 ? 1 : 0)
                }

                TabView(selection: $page) {
                    ForEach(pages.indices, id: \.self) { i in
                        VStack(alignment: .leading, spacing: 18) {
                            Spacer()
                            Image(systemName: pages[i].symbol)
                                .font(.system(size: 38, weight: .medium))
                                .foregroundStyle(.white)
                                .frame(width: 86, height: 86)
                                .background(pages[i].color, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                                .shadow(color: pages[i].color.opacity(0.35), radius: 18, y: 10)
                            Text(pages[i].title)
                                .font(Typo.sentence(40, relativeTo: .largeTitle))
                                .foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(pages[i].text)
                                .font(Typo.sentence(20))
                                .foregroundStyle(Palette.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                HStack(spacing: 6) {
                    ForEach(pages.indices, id: \.self) { i in
                        Capsule().fill(i == page ? Palette.ink : Palette.ink.opacity(0.18))
                            .frame(width: i == page ? 22 : 7, height: 7)
                    }
                }
                .animation(.spring(response: 0.3), value: page)
                .padding(.bottom, 22)

                if let message = model.errorMessage {
                    Text(message).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 12)
                }
                Button {
                    Task { await model.signIn() }
                } label: {
                    HStack(spacing: 10) {
                        if model.signingIn { ProgressView().tint(Palette.onButton) } else { Image(systemName: "person.crop.circle") }
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
