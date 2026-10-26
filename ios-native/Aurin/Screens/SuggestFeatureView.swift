import SwiftUI
import UIKit

/// "Navrhnout funkci": the user's idea in their own words with the app version,
/// e-mailed to the operator like a problem report (src/support-report.js, kind "idea").
struct SuggestFeatureView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false

    var body: some View {
        SettingsPage(title: "Navrhnout funkci") {
            if sent {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Díky, návrh odešel.").font(Typo.sentence(24)).foregroundStyle(Palette.ink)
                    PrimaryButton(title: "Hotovo", systemImage: "checkmark") { dismiss() }
                }
                .padding(.top, 8)
            } else {
                form
            }
        }
    }

    @ViewBuilder private var form: some View {
        SettingsGroup(title: "Co by ti v aplikaci pomohlo?") {
            TextEditor(text: $text)
                .font(.body)
                .foregroundStyle(Palette.ink)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 140)
                .padding(10)
        }

        if let error {
            Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
        }

        PrimaryButton(title: sending ? "Odesílám…" : "Odeslat", systemImage: "paperplane", busy: sending) { Task { await send() } }
            .disabled(sending || !canSend)
            .opacity(canSend ? 1 : 0.5)
    }

    private var canSend: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 }

    /// Which app the idea came from; no health data or connections.
    private var app: JSONObject {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return ["app": .string("\(version) (\(build))"), "ios": .string(UIDevice.current.systemVersion), "language": .string(L10n.language)]
    }

    private func send() async {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard message.count >= 3 else { return }
        guard !model.demo else { withAnimation { sent = true }; return }
        sending = true
        defer { sending = false }
        do {
            _ = try await model.api.suggestFeature(message: message, app: app)
            error = nil
            withAnimation { sent = true }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
