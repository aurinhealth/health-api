import PhotosUI
import SwiftUI
import UIKit

/// "Nahlásit problém": what went wrong in the user's words, an optional
/// screenshot from the photo library and the app's diagnostics (versions,
/// connections, the last sync, the last error messages and crashes), sent to the
/// operator (src/support-report.js).
struct ReportProblemView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let store: SettingsStore
    /// Opened from "Report this answer…" under a coach answer: the answer is
    /// already in the description, and nothing goes until Odeslat.
    var startText: String? = nil
    var title = "Nahlásit problém"
    @State private var text = ""
    @State private var started = false
    @State private var photo: PhotosPickerItem?
    @State private var screenshot: Data?
    @State private var preview: UIImage?
    @State private var includeDiagnostics = true
    /// "iphone" or "watch": where the problem happened, asked only with Aurin on a paired watch.
    @State private var place = "iphone"
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false

    /// The server takes up to about 1 MB of JPEG.
    private static let maxScreenshotBytes = 1_000_000

    var body: some View {
        SettingsPage(title: title, trail: false) {
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
        .onAppear {
            guard !started else { return }
            started = true
            if let startText, text.isEmpty { text = startText }
        }
    }

    @ViewBuilder private var form: some View {
        if Self.watchHasAurin {
            SettingsGroup(title: "Kde se to stalo") {
                placeRow("iphone", title: "iPhone", systemImage: "iphone")
                SettingsDivider()
                placeRow("watch", title: "Apple Watch", systemImage: "applewatch")
            }
        }

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
                        Image(systemName: "trash").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.rust)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Odebrat")
                }
                .padding(12)
                SettingsDivider()
            }
            let hasPreview = preview != nil
            PhotosPicker(selection: $photo, matching: .images) {
                SettingsRow(icon: SettingsIcon(systemImage: "photo", color: Palette.blue), title: !hasPreview ? "Vybrat z fotek" : "Vybrat jiný")
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

    @MainActor private static var watchHasAurin: Bool {
        let state = WatchBridge.shared.watchState
        return state.paired && state.installed
    }

    private func placeRow(_ value: String, title: String, systemImage: String) -> some View {
        Button {
            place = value
        } label: {
            HStack(spacing: 14) {
                SettingsIcon(systemImage: systemImage, color: Palette.ink)
                Text(title).font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                if place == value {
                    Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(place == value ? .isSelected : [])
    }

    /// Where it happened goes with the report also without the diagnostics.
    private var placeOnly: JSONObject? {
        Self.watchHasAurin ? ["happenedOn": .string(place)] : nil
    }

    // MARK: - Screenshot

    private func load(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let raw = try? await item.loadTransferable(type: Data.self), let image = await UIImage.photo(raw) else {
            error = L10n.tr("Obrázek se nepodařilo načíst.")
            return
        }
        var jpeg = await image.jpegForUpload(side: 1400)
        if let data = jpeg, data.count > Self.maxScreenshotBytes { jpeg = await image.jpegForUpload(side: 1000) }
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
            "deviceModel": .string(WatchDiagnostics.hardwareModel),
            "language": .string(L10n.language),
            "units": .string(UserDefaults.standard.string(forKey: Units.key) ?? "metric"),
            "timeZone": .string(TimeZone.current.identifier),
            "offline": .bool(model.offline),
            "demo": .bool(model.demo),
            "reportedAt": .string(ISO8601DateFormatter().string(from: Date()))
        ]
        // The user's own answer to "Kde se to stalo", asked only with Aurin on the watch.
        if Self.watchHasAurin { d["happenedOn"] = .string(place) }
        let stamp = ISO8601DateFormatter()
        // Where the user was: the tab and its open detail, a sheet, a page of Settings; the last one last.
        d["screens"] = .array(ScreenTrail.entries.map { JSONValue.object(["screen": .string($0.name), "at": .string(stamp.string(from: $0.at))]) })
        // What the app asked the server for just before, also what went fine, and how long it took.
        d["recentRequests"] = .array(RequestTrail.entries.map { entry -> JSONValue in
            var o: JSONObject = ["at": .string(stamp.string(from: entry.at)), "path": .string(entry.path), "ms": .number(Double(entry.ms))]
            if let status = entry.status { o["status"] = .number(Double(status)) }
            return .object(o)
        })
        d["appleWatch"] = .object(Self.watchDiagnostics(stamp))
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
            // "Synchronizovat vše" in Zdroje dat, not the providers' own syncs.
            d["lastSyncEverything"] = .object(s)
        }
        // What this iPhone reads and sends; the server only knows the last upload.
        let apple = AppleHealth.shared
        if apple.isAvailable {
            var a: JSONObject = ["on": .bool(apple.enabled)]
            if let at = apple.lastSync { a["lastSync"] = .string(ISO8601DateFormatter().string(from: at)) }
            if apple.enabled { a["categories"] = .array(apple.categories.map(\.rawValue).sorted().map { JSONValue.string($0) }) }
            if let error = apple.message { a["lastError"] = .string(error) }
            d["appleHealth"] = .object(a)
        }
        // The week's failed requests, also from earlier launches (ErrorLog).
        d["recentErrors"] = .array(ErrorLog.entries.map { entry -> JSONValue in
            var o: JSONObject = ["at": .string(stamp.string(from: entry.at)), "path": .string(entry.path), "message": .string(entry.message)]
            if let status = entry.status { o["status"] = .number(Double(status)) }
            if let count = entry.count { o["count"] = .number(Double(count)) }
            return .object(o)
        })
        // The app's latest crashes, as iOS reported them (CrashReports).
        let crashes = CrashReports.shared.entries
        if !crashes.isEmpty {
            d["crashes"] = .array(crashes.map { crash -> JSONValue in
                var o: JSONObject = ["at": .string(stamp.string(from: crash.at)), "app": .string(crash.app), "ios": .string(crash.ios),
                                     "frames": .array(crash.frames.map { JSONValue.string($0) })]
                if let exception = crash.exception { o["exception"] = .string(exception) }
                if let signal = crash.signal { o["signal"] = .number(Double(signal)) }
                if let reason = crash.reason { o["reason"] = .string(reason) }
                return .object(o)
            })
        }
        // The app's latest freezes, as iOS reported them (CrashReports).
        let hangs = CrashReports.shared.hangs
        if !hangs.isEmpty {
            d["hangs"] = .array(hangs.map { hang -> JSONValue in
                .object(["at": .string(stamp.string(from: hang.at)), "app": .string(hang.app), "ios": .string(hang.ios),
                         "seconds": .number((hang.seconds * 10).rounded() / 10), "frames": .array(hang.frames.map { JSONValue.string($0) })])
            })
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

    /// The watch: paired, Aurin on it, and what its app last said about itself
    /// (WatchDiagnostics): its version, watchOS, model, last pages and failures.
    @MainActor private static func watchDiagnostics(_ stamp: ISO8601DateFormatter) -> JSONObject {
        let state = WatchBridge.shared.watchState
        var o: JSONObject = ["paired": .bool(state.paired), "aurinInstalled": .bool(state.installed), "reachable": .bool(state.reachable)]
        guard state.paired, state.installed, let watch = WatchBridge.shared.watchDiagnostics else { return o }
        o["app"] = .string(watch.app)
        o["watchOS"] = .string(watch.watchOS)
        o["model"] = .string(watch.model)
        o["signedIn"] = .bool(watch.signedIn)
        if let date = watch.todayDate { o["todayDate"] = .string(date) }
        o["sentAt"] = .string(stamp.string(from: watch.sentAt))
        o["screens"] = .array(watch.screens.map { JSONValue.object(["screen": .string($0.name), "at": .string(stamp.string(from: $0.at))]) })
        o["recentErrors"] = .array(watch.errors.reversed().map { e -> JSONValue in
            var f: JSONObject = ["at": .string(stamp.string(from: e.at)), "path": .string(e.what)]
            if let status = e.status { f["status"] = .number(Double(status)) }
            if let message = e.message { f["message"] = .string(message) }
            return .object(f)
        })
        return o
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
            _ = try await model.api.reportProblem(message: message, screenshot: screenshot, diagnostics: includeDiagnostics ? diagnostics : placeOnly)
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
        .background { Palette.settingsBackground.ignoresSafeArea() }
        .navigationTitle(L10n.tr("Diagnostika"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
