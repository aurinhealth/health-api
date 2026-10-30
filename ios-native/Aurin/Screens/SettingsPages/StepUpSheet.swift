import SwiftUI

// MARK: - Confirm it's you

/// A sensitive change the server refused until the user confirms (Data/StepUp.swift):
/// why it asks, and the change to run again once confirmed.
struct StepUpRequest: Identifiable {
    let id = UUID()
    let info: StepUpInfo
    /// One line under the title, e.g. "Downloading all your data needs a quick check."
    let reason: String
    /// Deleting the account: the Face ID button is red and says so.
    var destructive = false
    let retry: @MainActor () async -> Void
}

extension View {
    /// Shows "Confirm it's you" while `request` is set.
    func stepUpSheet(_ request: Binding<StepUpRequest?>) -> some View {
        sheet(item: request) { StepUpSheet(request: $0) }
    }
}

/// Face ID with the account's passkey when it has one, otherwise (or instead)
/// a six-digit code sent to the account's current e-mail. Once confirmed, the
/// sheet closes and the change goes on by itself.
struct StepUpSheet: View {
    let request: StepUpRequest
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var codeSent = false
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var codeFocused: Bool

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: codeSent ? "envelope" : "checkmark.shield")
                .scaledFont(22).foregroundStyle(Palette.ink)
                .frame(width: 56, height: 56).background(Palette.card, in: Circle())
                .accessibilityHidden(true)
            Text(L10n.tr(codeSent ? "Zadej kód" : "Potvrď, že jsi to ty")).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Text(verbatim: codeSent ? L10n.f("Poslali jsme ho na %@. Platí 10 minut.", request.info.email ?? "") : request.reason)
                .font(Typo.body).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if codeSent { codeEntry } else { choices }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center) }
            Spacer(minLength: 0)
        }
        .padding(24)
        .presentationDetents([.medium, .large])
        .glassSheetBackground()
        .interactiveDismissDisabled(busy)
    }

    @ViewBuilder private var choices: some View {
        if request.info.passkey {
            Button { Task { await confirmWithPasskey() } } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(Palette.onButton) } else { Image(systemName: "faceid") }
                    Text(L10n.tr(request.destructive ? "Smazat přes Face ID" : "Pokračovat přes Face ID"))
                }
                .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(request.destructive ? Palette.rust : Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .padding(.top, 8)
            if request.info.email != nil {
                Button("Poslat mi radši kód e-mailem") { Task { await sendCode() } }
                    .font(Typo.bodyStrong).foregroundStyle(Palette.muted).disabled(busy)
            }
        } else if let email = request.info.email {
            PrimaryButton(title: L10n.f("Poslat kód na %@", email), systemImage: "envelope", busy: busy) { Task { await sendCode() } }
                .disabled(busy)
                .padding(.top, 8)
        }
    }

    private var codeEntry: some View {
        VStack(spacing: 14) {
            TextField("123456", text: $code)
                .keyboardType(.numberPad).textContentType(.oneTimeCode)
                .font(Typo.number(34)).multilineTextAlignment(.center)
                .padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .focused($codeFocused)
                .onAppear { codeFocused = true }
                .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(6)) }
            PrimaryButton(title: L10n.tr(busy ? "Moment…" : "Potvrdit"), systemImage: "checkmark", busy: busy) { Task { await verifyCode() } }
                .disabled(busy || code.count != 6)
            Button("Poslat nový kód") { Task { code = ""; await sendCode() } }
                .font(Typo.bodyStrong).foregroundStyle(Palette.muted).disabled(busy)
        }
        .padding(.top, 8)
    }

    private func confirmWithPasskey() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.passkeys.confirm(api: model.api)
            confirmed()
        } catch is CancellationError {
        } catch {
            self.error = APIClient.readable(error).localizedDescription
        }
    }

    private func sendCode() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.api.startStepUp()
            codeSent = true
            error = nil
        } catch {
            self.error = APIClient.readable(error).localizedDescription
        }
    }

    private func verifyCode() async {
        guard !busy, code.count == 6 else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.api.verifyStepUp(code: code)
            confirmed()
        } catch {
            self.error = APIClient.readable(error).localizedDescription
        }
    }

    /// The sheet closes and the refused change runs again, now allowed.
    private func confirmed() {
        let retry = request.retry
        dismiss()
        Task { @MainActor in await retry() }
    }
}
