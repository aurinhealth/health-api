import PhotosUI
import SwiftUI
import UIKit

/// "Nahlásit problém": what went wrong in the user's words, an optional
/// screenshot from the photo library and the app's diagnostics (versions,
/// connections, the last sync and the last error messages), sent to the
/// operator (src/support-report.js).
struct ReportProblemView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let store: SettingsStore
    @State private var text = ""
    @State private var photo: PhotosPickerItem?
    @State private var screenshot: Data?
    @State private var preview: UIImage?
    @State private var includeDiagnostics = true
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false

    /// The server takes up to about 1 MB of JPEG.
    private static let maxScreenshotBytes = 1_000_000

    var body: some View {
        SettingsPage(title: "Nahlásit problém") {
            if sent {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Díky, hlášení odešlo.").font(Typo.sentence(24)).foregroundStyle(Palette.ink)
                    PrimaryButton(title: "Hotovo", systemImage: "checkmark") { dismiss() }
                }
                .padding(.top, 8)
            } else {
                form
            }
        }
        .onChange(of: photo) { _, item in Task { await load(item) } }
    }

    @ViewBuilder private var form: some View {
        SettingsGroup(title: "Co se stalo") {
            TextEditor(text: $text)
                .font(.body)
                .foregroundStyle(Palette.ink)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 140)
                .padding(10)
        }

        SettingsGroup(title: "Snímek obrazovky") {
            if let preview {
                HStack(alignment: .top) {
                    Image(uiImage: preview)
                        .resizable().scaledToFit()
                        .frame(maxHeight: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Spacer(minLength: 8)
                    Button {
                        withAnimation { self.preview = nil; screenshot = nil; photo = nil }
                    } label: {
                        Image(systemName: "trash").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.rust)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Odebrat")
                }
                .padding(12)
                SettingsDivider()
            }
            PhotosPicker(selection: $photo, matching: .images) {
                SettingsRow(icon: SettingsIcon(systemImage: "photo", color: Palette.blue), title: preview == nil ? "Vybrat z fotek" : "Vybrat jiný")
            }
            .buttonStyle(.plain)
        }

        SettingsGroup(title: "Diagnostika") {
            SettingsToggle(title: "Přiložit diagnostiku", isOn: $includeDiagnostics)
            SettingsDivider()
            NavigationLink { ReportDiagnosticsView(text: diagnosticsText) } label: {
                SettingsRow(title: "Zobrazit diagnostiku")
            }
            .buttonStyle(.plain)
        }

        if let error {
            Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
        }

        PrimaryButton(title: sending ? "Odesílám…" : "Odeslat", systemImage: "paperplane", busy: sending) { Task { await send() } }
            .disabled(sending || !canSend)
            .opacity(canSend ? 1 : 0.5)
    }

    private var canSend: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 }

    // MARK: - Screenshot

    private func load(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let raw = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: raw) else {
            error = L10n.tr("Obrázek se nepodařilo načíst.")
            return
        }
        var jpeg = image.jpegForUpload(side: 1400)
        if let data = jpeg, data.count > Self.maxScreenshotBytes { jpeg = image.jpegForUpload(side: 1000) }
        guard let jpeg, jpeg.count <= Self.maxScreenshotBytes else {
            error = L10n.tr("Obrázek je příliš velký. Vyber menší.")
            return
        }
        screenshot = jpeg
        preview = UIImage(data: jpeg)
        error = nil
    }

    // MARK: - Diagnostics

    /// What the app knows about its state; no keys, tokens or health data.
    private var diagnostics: JSONObject {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        var d: JSONObject = [
            "app": .string("\(version) (\(build))"),
            "ios": .string(UIDevice.current.systemVersion),
            "device": .string(UIDevice.current.model),
            "language": .string(L10n.language),
            "units": .string(UserDefaults.standard.string(forKey: Units.key) ?? "metric"),
            "timeZone": .string(TimeZone.current.identifier),
            "offline": .bool(model.offline),
            "demo": .bool(model.demo),
            "reportedAt": .string(ISO8601DateFormatter().string(from: Date()))
        ]
        d["connections"] = .array(store.connections.map { provider -> JSONValue in
            var o: JSONObject = ["id": .string(provider.id), "connected": .bool(provider.connected == true)]
            if provider.needsReconnect == true { o["needsReconnect"] = .bool(true) }
            if let error = provider.lastError { o["lastError"] = .string(error) }
            if let at = provider.lastErrorAt { o["lastErrorAt"] = .string(at) }
            if let at = provider.lastSuccessAt { o["lastSuccessAt"] = .string(at) }
            let missing = (provider.missingPermissions ?? []).compactMap { $0.string }
            if !missing.isEmpty { o["missingPermissions"] = .array(missing.map { JSONValue.string($0) }) }
            return .object(o)
        })
        if let sync = store.sync {
            var s: JSONObject = [:]
            if let status = sync.status { s["status"] = .string(status) }
            if let at = sync.updatedAt { s["updatedAt"] = .string(at) }
            if let google = sync.googleStatus { s["googleStatus"] = .string(google) }
            s["results"] = .array((sync.results ?? []).map { r -> JSONValue in
                var o: JSONObject = [:]
                if let source = r.source { o["source"] = .string(source) }
                if let status = r.status { o["status"] = .string(status) }
                if let message = r.message { o["message"] = .string(message) }
                return .object(o)
            })
            d["lastSync"] = .object(s)
        }
        var errors: JSONObject = [:]
        if let e = model.errorMessage { errors["today"] = .string(e) }
        if let e = model.trainingError { errors["training"] = .string(e) }
        if let e = model.foodError { errors["food"] = .string(e) }
        if let e = model.healthError { errors["health"] = .string(e) }
        if let e = store.errorMessage { errors["settings"] = .string(e) }
        d["lastErrors"] = .object(errors)
        return d
    }

    private var diagnosticsText: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(diagnostics), let text = String(data: data, encoding: .utf8) else { return "" }
        return text
    }

    // MARK: - Sending

    private func send() async {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard message.count >= 3 else { return }
        guard !model.demo else { withAnimation { sent = true }; return }
        sending = true
        defer { sending = false }
        do {
            _ = try await model.api.reportProblem(message: message, screenshot: screenshot, diagnostics: includeDiagnostics ? diagnostics : nil)
            error = nil
            withAnimation { sent = true }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The diagnostics as they will be sent.
struct ReportDiagnosticsView: View {
    let text: String

    var body: some View {
        ScrollView {
            Text(verbatim: text)
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(Palette.ink)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
        }
        .background(Palette.settingsBackground.ignoresSafeArea())
        .navigationTitle(L10n.tr("Diagnostika"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
