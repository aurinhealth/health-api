import AuthenticationServices
import SwiftUI

/// The first screen: three pages of what Loadwise does, then the sign-in.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var page = 0
    @State private var emailLogin = false
    @State private var appleNonce = ""
    @Environment(\.colorScheme) private var colorScheme

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
                    SectionLabel(text: "Aurin")
                    Spacer()
                    if ServerChoice.current == .staging {
                        // Nastavení → Testování → Server: this sign-in is for the test server.
                        Label("Testovací server", systemImage: "server.rack")
                            .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.amber)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(Palette.amber.opacity(0.14), in: Capsule())
                        Spacer()
                    }
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
                    // A failed Google sign-in (not invited, cancelled, expired) says why here.
                    Label(message, systemImage: "exclamationmark.circle.fill")
                        .font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Palette.rust.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .padding(.bottom, 12)
                }
                // Three ways in, the same size: Apple (App Store rule 4.8), Google, the e-mail code.
                SignInWithAppleButton(.continue) { request in
                    model.errorMessage = nil
                    appleNonce = AuthService.randomVerifier()
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = AuthService.appleNonceHash(appleNonce)
                } onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else { return }
                        Task { await model.signIn(apple: credential, nonce: appleNonce) }
                    case .failure(let error):
                        if (error as? ASAuthorizationError)?.code != .canceled { model.errorMessage = error.localizedDescription }
                    }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 52)
                .clipShape(Capsule())
                .disabled(model.signingIn)
                .accessibilityLabel(L10n.tr("Pokračovat přes Apple"))
                Button {
                    model.errorMessage = nil
                    Task { await model.signIn() }
                } label: {
                    HStack(spacing: 10) {
                        if model.signingIn { ProgressView().tint(Palette.ink) } else { Text(verbatim: "G").font(.system(size: 17, weight: .bold)) }
                        Text("Pokračovat přes Google")
                    }
                    .modifier(SignInButtonLook())
                }
                .disabled(model.signingIn)
                .padding(.top, 10)
                Button { emailLogin = true } label: {
                    Label("Pokračovat e-mailem", systemImage: "envelope")
                        .modifier(SignInButtonLook())
                }
                .disabled(model.signingIn)
                .padding(.top, 10)
                if ServerChoice.current.passkeys && PasskeyService.mayHaveOne {
                    // A passkey was made on this phone (Data/Passkeys.swift).
                    Button { Task { await signInWithPasskey() } } label: {
                        Label("Přihlásit přes passkey", systemImage: "faceid")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 44)
                    }
                    .disabled(model.signingIn)
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 24)
        }
        .sheet(isPresented: $emailLogin) { EmailLoginSheet() }
    }

    /// The passkey sheet; when it fails for any reason but a cancel, the e-mail
    /// code takes over without a message.
    private func signInWithPasskey() async {
        model.errorMessage = nil
        do {
            try await model.signInWithPasskey()
        } catch is CancellationError {
            // The user closed the sheet.
        } catch {
            emailLogin = true
        }
    }
}

/// The outlined sign-in buttons under the Apple one, the same height as it.
private struct SignInButtonLook: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 52)
            .background(Palette.card.opacity(0.6), in: Capsule())
            .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            .contentShape(Capsule())
    }
}

/// After the first e-mail sign-in: a passkey, so next time Face ID is enough.
/// "Teď ne" and any failure just close it; Settings → Účet can add one later.
struct PasskeyOfferSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "faceid").font(.system(size: 40, weight: .light)).foregroundStyle(Palette.green)
                Text("Příště přes Face ID").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text("Aurin si uloží přístupový klíč do tvého iPhonu. Příště se přihlásíš obličejem nebo otiskem, bez kódu z e-mailu.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                Spacer()
                PrimaryButton(title: busy ? "Moment…" : "Zapnout", systemImage: "faceid", busy: busy) { Task { await register() } }
                    .disabled(busy)
                SecondaryButton(title: "Teď ne") { dismiss() }
                    .disabled(busy)
            }
            .padding(24)
            .background(ScreenBackground(glow: Palette.Glow.today))
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(busy)
    }

    private func register() async {
        busy = true
        defer { busy = false }
        // Errors fall back silently: the e-mail code keeps working.
        try? await model.passkeys.register(api: model.api)
        dismiss()
    }
}

/// Sign-in with a six-digit code sent to the e-mail (src/email-login.js).
struct EmailLoginSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text(sent ? "Zadej kód z e-mailu" : "Přihlášení e-mailem").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                if sent {
                    Text(L10n.f("Poslali jsme ho na %@. Platí 10 minut.", email)).font(Typo.small).foregroundStyle(Palette.muted)
                    TextField("123456", text: $code)
                        .keyboardType(.numberPad).textContentType(.oneTimeCode)
                        .font(Typo.number(34)).multilineTextAlignment(.center)
                        .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .focused($focused)
                        .onChange(of: code) { _, value in
                            code = String(value.filter(\.isNumber).prefix(6))
                            if code.count == 6 { Task { await verify() } }
                        }
                } else {
                    TextField("e-mail", text: $email)
                        .keyboardType(.emailAddress).textContentType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .focused($focused)
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: busy ? "Moment…" : sent ? "Přihlásit" : "Poslat kód", systemImage: sent ? "checkmark" : "envelope", busy: busy) {
                    Task { if sent { await verify() } else { await send() } }
                }
                .disabled(busy || (sent ? code.count != 6 : !email.contains("@")))
                if sent {
                    Button("Poslat nový kód") { Task { code = ""; await send() } }.font(Typo.bodyStrong).foregroundStyle(Palette.muted).disabled(busy)
                }
                Spacer()
            }
            .padding(24)
            .background(ScreenBackground(glow: Palette.Glow.today))
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zrušit") { dismiss() } } }
            .onAppear { focused = true }
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        do {
            try await model.api.startEmailLogin(email: email.trimmingCharacters(in: .whitespaces))
            sent = true
            error = nil
            focused = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func verify() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.signIn(email: email.trimmingCharacters(in: .whitespaces), code: code)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
