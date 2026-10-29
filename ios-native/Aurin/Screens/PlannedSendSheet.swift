import SwiftUI
import UIKit
import WorkoutKit

// MARK: - "Odeslat do" on a planned ride or run

/// Where a planned workout went (src/planned-send.js): Wahoo and Intervals.icu
/// as connected, each sent, on its way, failed or not sent.
struct PlannedDestinations: Decodable {
    struct Destination: Decodable, Identifiable {
        let id: String
        /// sent, sending, failed, notSent, or origin (the plan came from that calendar).
        let status: String
        let at: String?
    }
    let destinations: [Destination]
    let sent: Bool?
    let message: String?
}

extension APIClient {
    func plannedDestinations(eventId: String) async throws -> PlannedDestinations {
        try await get("/app/api/planned/destinations?id=" + Self.query(eventId))
    }

    func sendPlanned(eventId: String, destination: String) async throws -> PlannedDestinations {
        try await send("/app/api/planned/send", method: "POST",
                       body: ["eventId": JSONValue.string(eventId), "destination": .string(destination)], timeout: 40)
    }

    /// The planned ride as Zwift's .zwo (Zwift, MyWhoosh and other trainer apps open it).
    func plannedZwo(eventId: String) async throws -> Data {
        try await getData("/app/api/my-workouts/from-planned.zwo?id=" + Self.query(eventId))
    }
}

/// "Odeslat do": opens the places a planned ride or run can go.
struct SendToButton: View {
    let workout: PlannedWorkout.Workout
    let session: WeekSession
    @State private var showing = false

    var body: some View {
        Button { showing = true } label: {
            Label("Odeslat do", systemImage: "paperplane")
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity).frame(height: 46)
                .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showing) { PlannedSendSheet(workout: workout, session: session) }
    }
}

/// Wahoo and Intervals.icu with their status and "Odeslat znovu", the Apple
/// Watch (the system's preview adds it to the Workout app) and, for a ride,
/// the .zwo file through the share sheet. Only places Aurin can really send to.
struct PlannedSendSheet: View {
    @Environment(AppModel.self) private var model
    let workout: PlannedWorkout.Workout
    let session: WeekSession
    @State private var destinations: [PlannedDestinations.Destination]?
    @State private var sending: String?
    @State private var error: String?
    @State private var watchPlan: WorkoutPlan?
    @State private var watchShowing = false
    @State private var sharing = false

    var body: some View {
        VStack(spacing: 0) {
            Text("Odeslat do").font(Typo.bodyStrong).foregroundStyle(Palette.ink).padding(.top, 8).padding(.bottom, 10)
            VStack(spacing: 0) {
                ForEach(destinations ?? []) { d in
                    row(icon: AnyView(IntegrationIcon(id: d.id, size: 36)), name: d.id == "wahoo" ? "Wahoo" : "Intervals.icu",
                        status: statusText(d), statusColor: statusColor(d.status),
                        action: d.status == "origin" ? nil : (d.status == "sent" || d.status == "sending" ? "Odeslat znovu" : d.status == "failed" ? "Odeslat znovu" : "Odeslat"),
                        primary: d.status == "failed" || d.status == "notSent", busy: sending == d.id) { send(d.id) }
                }
                if destinations == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 14)
                }
                if let watchPlan {
                    row(icon: AnyView(symbol("applewatch")), name: "Apple Watch", status: L10n.tr("Aplikace Cvičení"), statusColor: Palette.muted,
                        action: "Přidat", primary: false, busy: false) { watchShowing = true }
                        .workoutPreview(watchPlan, isPresented: $watchShowing)
                }
                if session.sport == "ride", let id = session.eventId {
                    row(icon: AnyView(symbol("doc")), name: "Zwift, MyWhoosh", status: L10n.tr("soubor .zwo"), statusColor: Palette.muted,
                        action: "Sdílet", primary: false, busy: sharing) { share(id) }
                }
                if destinations?.isEmpty == true, watchPlan == nil, session.sport != "ride" {
                    Text("Připoj Wahoo nebo Intervals.icu v Nastavení.").font(Typo.small).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12)
                }
            }
            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22).padding(.top, 14)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
        .task {
            watchPlan = WatchWorkout.plan(workout, title: session.title)
            guard let id = session.eventId else { destinations = []; return }
            destinations = (try? await model.api.plannedDestinations(eventId: id))?.destinations ?? []
        }
    }

    private func row(icon: AnyView, name: String, status: String, statusColor: Color, action: String?, primary: Bool, busy: Bool, tap: @escaping () -> Void) -> some View {
        HStack(spacing: 14) {
            icon
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: status).font(Typo.caption).foregroundStyle(statusColor)
            }
            Spacer(minLength: 8)
            if let action {
                Button(action: tap) {
                    ZStack {
                        Text(action).opacity(busy ? 0 : 1)
                        if busy { ProgressView().controlSize(.small).tint(primary ? Palette.onButton : Palette.ink) }
                    }
                    .font(Typo.small.weight(.semibold)).foregroundStyle(primary ? Palette.onButton : Palette.ink)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(primary ? Palette.button : .clear, in: Capsule())
                    .overlay(Capsule().stroke(Palette.ink.opacity(primary ? 0 : 0.2), lineWidth: 1))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(sending != nil || sharing)
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }

    private func symbol(_ name: String) -> some View {
        Image(systemName: name).scaledFont(17, weight: .medium, cap: .denseCap).foregroundStyle(Palette.ink)
            .frame(width: 36, height: 36).background(Palette.card, in: Circle())
    }

    private func statusText(_ d: PlannedDestinations.Destination) -> String {
        switch d.status {
        case "sent": return d.at.flatMap(Self.when).map { L10n.f("Odesláno · %@", $0) } ?? L10n.tr("Odesláno")
        case "sending": return L10n.tr("Odesílá se")
        case "failed": return L10n.tr("Nedorazilo")
        case "origin": return L10n.tr("Je v kalendáři Intervals.icu")
        default: return L10n.tr("Neodesláno")
        }
    }

    private func statusColor(_ status: String) -> Color {
        status == "sent" || status == "origin" ? Palette.green : status == "failed" ? Palette.rust : Palette.muted
    }

    /// "dnes 8:12", "včera 18:40", or the date and time.
    static func when(_ iso: String) -> String? {
        guard let date = ISO8601DateFormatter().date(from: iso) else { return nil }
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let clock = ClockText.format(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0))
        return Fmt.relativeDay(AppModel.localDate(date), today: AppModel.localDate(Date())) + " " + clock
    }

    private func send(_ destination: String) {
        guard let id = session.eventId else { return }
        Task {
            sending = destination
            error = nil
            defer { sending = nil }
            do {
                let answer = try await model.api.sendPlanned(eventId: id, destination: destination)
                destinations = answer.destinations
                if answer.sent == false { error = answer.message }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func share(_ id: String) {
        Task {
            sharing = true
            error = nil
            defer { sharing = false }
            do {
                let data = try await model.api.plannedZwo(eventId: id)
                let name = session.title.folding(options: .diacriticInsensitive, locale: nil)
                    .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: "-")
                let url = FileManager.default.temporaryDirectory.appendingPathComponent((name.isEmpty ? "workout" : name) + ".zwo")
                try data.write(to: url, options: .atomic)
                present(url)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func present(_ url: URL) {
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard var top = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
        while let next = top.presentedViewController { top = next }
        sheet.popoverPresentationController?.sourceView = top.view
        top.present(sheet, animated: true)
    }
}
