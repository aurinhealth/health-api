import AuthenticationServices
import SwiftUI

/// The first screen: an opening and three pages of what Aurin does
/// (WelcomePages.swift), then the sign-in.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var page = 0
    @State private var emailLogin = false
    @State private var appleNonce = ""
    @Environment(\.colorScheme) private var colorScheme

    /// The sign-in comes after the welcome's pages.
    private static let signIn = WelcomePage.allCases.count
    /// The website's waitlist (src/site-pages.js, #join).
    private static let waitlistURL = URL(string: "https://aurin.health/#join")!

    var body: some View {
        ZStack {
            ScreenBackground(glow: page < Self.signIn ? WelcomePage.allCases[page].glow : WelcomeGlow.signIn)
                .animation(.easeInOut(duration: 0.5), value: page)
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    if page == Self.signIn {
                        Button { withAnimation { page = Self.signIn - 1 } } label: {
                            Image(systemName: "chevron.left").scaledFont(17, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                                .frame(width: 40, height: 40).background(Palette.card.opacity(0.7), in: Circle())
                        }
                        .accessibilityLabel(L10n.tr("Zpět"))
                    }
                    if ServerChoice.current == .staging {
                        // Nastavení → Testování → Server: this sign-in is for the test server.
                        Label("Testovací server", systemImage: "server.rack")
                            .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.amber)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(Palette.amber.opacity(0.14), in: Capsule())
                    }
                    Spacer()
                    if page < Self.signIn {
                        // Straight to the sign-in, for someone who has an account.
                        Button("Přeskočit") { withAnimation { page = Self.signIn } }
                            .font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                    }
                }
                .frame(height: 40)
                .padding(.horizontal, 24)

                TabView(selection: $page) {
                    ForEach(WelcomePage.allCases) { welcome in
                        WelcomePageView(page: welcome, active: page == welcome.rawValue)
                            .padding(.horizontal, 24)
                            .tag(welcome.rawValue)
                    }
                    signInPage
                        .padding(.horizontal, 24)
                        .tag(Self.signIn)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                if page < Self.signIn {
                    VStack(spacing: 18) {
                        WelcomeProgress(count: Self.signIn + 1, index: page)
                            .padding(.horizontal, 6)
                        PrimaryButton(title: L10n.tr(page == 0 ? "Pojďme na to" : "Pokračovat")) {
                            withAnimation { page += 1 }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 16)
                    .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: page == Self.signIn)
        }
        .sheet(isPresented: $emailLogin) { EmailLoginSheet() }
    }

    /// "Tvoje data pracují jen pro tebe." over a lock, then the three ways in.
    private var signInPage: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            WelcomeLock(shut: page == Self.signIn)
            Text("Tvoje data pracují jen pro tebe.")
                .font(Typo.sentence(32, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
            Text("Nikdy je neprodáváme ani nepoužíváme k reklamě.")
                .font(Typo.sentence(18)).foregroundStyle(Palette.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
            Spacer(minLength: 16)

            if let message = model.errorMessage {
                // A failed sign-in (not invited, cancelled, expired, an unknown passkey) says why here;
                // without an invite the way on is the waitlist on aurin.health.
                VStack(alignment: .leading, spacing: 10) {
                    Label(message, systemImage: "exclamationmark.circle.fill")
                        .font(Typo.small).foregroundStyle(Palette.rust)
                        .fixedSize(horizontal: false, vertical: true)
                    if model.notInvited {
                        Link(destination: Self.waitlistURL) {
                            Text("Přidat se na čekací listinu")
                                .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                                .padding(.horizontal, 14).frame(height: 34)
                                .background(Palette.button, in: Capsule())
                        }
                        .padding(.leading, 26)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Palette.rust.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(.bottom, 12)
            }
            // Three ways in, the same size: Apple (App Store rule 4.8), Google, the e-mail code.
            SignInWithAppleButton(.continue) { request in
                model.errorMessage = nil
                model.notInvited = false
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
            .overlay {
                // While the server signs in with what Apple returned.
                if model.signingInWith == .apple {
                    Capsule().fill(colorScheme == .dark ? Color.white : Color.black)
                        .overlay { ProgressView().tint(colorScheme == .dark ? Color.black : Color.white) }
                }
            }
            .disabled(model.signingIn)
            .accessibilityLabel(L10n.tr("Pokračovat přes Apple"))
            Button {
                model.errorMessage = nil
                model.notInvited = false
                Task { await model.signIn() }
            } label: {
                HStack(spacing: 10) {
                    if model.signingInWith == .google { ProgressView().tint(Palette.ink) } else { Text(verbatim: "G").scaledFont(17, weight: .bold) }
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
                    HStack(spacing: 8) {
                        if model.signingInWith == .passkey { ProgressView().tint(Palette.ink) } else { Image(systemName: "faceid") }
                        Text("Přihlásit přes passkey")
                    }
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 44)
                }
                .disabled(model.signingIn)
                .padding(.top, 4)
            }
            Text("Pokračováním souhlasíš s [podmínkami](https://aurin.health/terms?lang=cs) a [zásadami ochrany soukromí](https://aurin.health/privacy?lang=cs).")
                .font(Typo.caption).foregroundStyle(Palette.muted)
                .tint(Palette.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)
                .padding(.bottom, 16)
        }
    }

    /// The passkey sheet. A failure says why above the buttons (a passkey of a
    /// deleted account, a refused signature); only a cancel stays silent.
    private func signInWithPasskey() async {
        model.errorMessage = nil
        do {
            try await model.signInWithPasskey()
        } catch is CancellationError {
            // The user closed the sheet.
        } catch APIError.unknownPasskey {
            model.errorMessage = L10n.tr("Tenhle přístupový klíč patří k účtu, který už neexistuje. Přihlas se jinak, iPhone ho přestane nabízet.")
        } catch {
            model.errorMessage = error.localizedDescription
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
            .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
            .contentShape(Capsule())
    }
}

/// After the first e-mail sign-in, the next time the app opens: a passkey, so
/// from then on Face ID is enough. "Teď ne" and any failure just close it;
/// Settings → Účet can add one later.
struct PasskeyOfferSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "faceid").scaledFont(40, weight: .light).foregroundStyle(Palette.green)
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
            .background { ScreenBackground(glow: Palette.Glow.today) }
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

/// The passkey offer waits for the next start of the app after the first
/// e-mail sign-in, so nothing stands between the sign-in and the setup.
/// `due` is read once when the app starts (AurinApp), before any sign-in.
enum PasskeyOfferLater {
    private static let key = "passkeyOfferLater"
    static let due = UserDefaults.standard.bool(forKey: key)

    static func note() { UserDefaults.standard.set(true, forKey: key) }
    static func forget() { UserDefaults.standard.removeObject(forKey: key) }
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
            .background { ScreenBackground(glow: Palette.Glow.today) }
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
