import LinkPresentation
import SwiftUI
import UIKit

// MARK: - Sharing a workout by link

/// Sending a workout to a friend: the app draws the preview card, the server
/// keeps the workout without weights under a short link (/t/<id>), and the
/// share sheet sends the link. The server's link preview (WhatsApp and the
/// others) is the dark card; iMessage gets the card in the sender's own mode.
@MainActor
enum WorkoutSharing {
    /// The sender's first name as Profil shows it.
    static var senderName: String? {
        let defaults = UserDefaults.standard
        let name = defaults.string(forKey: AppModel.displayNameKey)?.nilIfBlank ?? defaults.string(forKey: AvatarStore.nameKey)?.nilIfBlank
        return name?.split(separator: " ").first.map(String.init)
    }

    static func share(api: APIClient, template: WorkoutTemplate, date: String?, groups: [String], scheme: ColorScheme) async throws {
        let from = senderName
        let dark = image(template, from: from, groups: groups, dark: true)
        let shown = scheme == .dark ? dark : image(template, from: from, groups: groups, dark: false)
        let future = date.flatMap { $0 >= AppModel.localDate(Date()) ? $0 : nil }
        // A PNG too big for the server goes without it; the link still works.
        let png = dark?.pngData().flatMap { $0.count < 500_000 ? $0 : nil }
        let url = try await api.shareWorkout(template, date: future, image: png)
        present(url: url, title: template.name, image: shown)
    }

    /// The card at 1200 × 630, the size link previews use.
    static func image(_ template: WorkoutTemplate, from: String?, groups: [String], dark: Bool) -> UIImage? {
        let renderer = ImageRenderer(content: SharePreviewCard(template: template, from: from, groups: groups, dark: dark)
            .frame(width: 600, height: 315))
        renderer.scale = 2
        return renderer.uiImage
    }

    private static func present(url: URL, title: String, image: UIImage?) {
        let item = WorkoutLinkItem(url: url, title: title, image: image)
        let sheet = UIActivityViewController(activityItems: [item], applicationActivities: nil)
        guard var top = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
        while let next = top.presentedViewController { top = next }
        sheet.popoverPresentationController?.sourceView = top.view
        top.present(sheet, animated: true)
    }

    /// The muscle groups a workout trains most (the card's bar), from the
    /// muscles of its exercises; the same groups as the server's link page.
    static func groups(_ muscles: [String: [String: Double]], template: WorkoutTemplate) -> [String] {
        var total: [String: Double] = [:]
        for e in template.exercises {
            for (muscle, share) in muscles[e.name] ?? [:] {
                if let g = groupOf[muscle] { total[g, default: 0] += share * Double(e.sets) }
            }
        }
        return total.sorted { $0.value > $1.value }.prefix(4).map { groupLabel[$0.key] ?? $0.key }
    }

    private static let groupOf = [
        "chest": "chest", "upper_back": "back", "lats": "back", "lower_back": "back", "traps": "back",
        "front_delts": "shoulders", "side_delts": "shoulders", "rear_delts": "shoulders",
        "biceps": "arms", "triceps": "arms", "forearms": "arms", "abs": "core", "obliques": "core",
        "hips": "glutes", "quads": "quads", "hamstrings": "hamstrings", "calves": "calves"
    ]
    private static let groupLabel = [
        "chest": "Hrudník", "back": "Záda", "shoulders": "Ramena", "arms": "Paže", "core": "Střed těla",
        "glutes": "Hýždě", "quads": "Stehna", "hamstrings": "Zadní stehna", "calves": "Lýtka"
    ].mapValues { L10n.tr($0) }
}

/// The link with its card for the share sheet and iMessage.
final class WorkoutLinkItem: NSObject, UIActivityItemSource {
    let url: URL
    let title: String
    let image: UIImage?

    init(url: URL, title: String, image: UIImage?) {
        self.url = url
        self.title = title
        self.image = image
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { url }

    func activityViewController(_ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?) -> Any? { url }

    func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
        let metadata = LPLinkMetadata()
        metadata.originalURL = url
        metadata.url = url
        metadata.title = title
        if let image {
            metadata.imageProvider = NSItemProvider(object: image)
            metadata.iconProvider = NSItemProvider(object: image)
        }
        return metadata
    }
}

/// The link preview, style C: who sends it, the name in serif, sport · length ·
/// exercises and the muscle groups it trains. Fixed colours, since the picture
/// is drawn once for whoever sees it.
struct SharePreviewCard: View {
    let template: WorkoutTemplate
    let from: String?
    let groups: [String]
    let dark: Bool

    private var background: Color { dark ? Color(hex: 0x17191A) : Color(hex: 0xF3EFE8) }
    private var ink: Color { dark ? Color(hex: 0xF4F2EE) : Color(hex: 0x1B1A17) }
    private var muted: Color { dark ? Color(hex: 0x9AA39F) : Color(hex: 0x6D6A63) }
    private var avatar: Color { dark ? Color(hex: 0x2E9C74) : Color(hex: 0x1F6B52) }
    private var bars: [Color] {
        dark ? [Color(hex: 0xF0B36E), Color(hex: 0x8FE6C4), Color(hex: 0xA5A1FF), Color(hex: 0x7CC3F0)]
             : [Color(hex: 0xA35A12), Color(hex: 0x1F6B52), Color(hex: 0x4F46C8), Color(hex: 0x1D6FA3)]
    }

    private var line: String {
        if template.isEndurance {
            return [L10n.tr(template.sport == "run" ? "Běh" : "Kolo"), template.summary].joined(separator: " · ")
        }
        var parts = [L10n.tr("Posilovna")]
        if let minutes = template.minutes { parts.append(Fmt.duration(minutes)) }
        parts.append(L10n.f("%@ %@", String(template.exercises.count), Fmt.plural(template.exercises.count, "cvik", "cviky", "cviků")))
        return parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Text(String((from ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 20, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 44, height: 44).background(avatar, in: Circle())
                Text(from.map { L10n.f("%@ ti posílá trénink", $0) } ?? L10n.tr("Posílám ti trénink"))
                    .font(.system(size: 20)).foregroundStyle(muted)
            }
            Text(template.name)
                .font(.custom("Newsreader-Regular", size: 52)).foregroundStyle(ink)
                .lineLimit(1).minimumScaleFactor(0.6)
                .padding(.top, 18)
            Text(line).font(.system(size: 22)).foregroundStyle(muted).padding(.top, 4)
            Spacer(minLength: 16)
            if template.isEndurance {
                intervals.frame(height: 92)
            } else if !groups.isEmpty {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(Array(groups.enumerated()), id: \.offset) { i, group in
                        VStack(alignment: .leading, spacing: 10) {
                            Capsule().fill(bars[i % bars.count]).frame(height: 10)
                            Text(group).font(.system(size: 18)).foregroundStyle(muted).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(background)
        .environment(\.colorScheme, dark ? .dark : .light)
    }

    /// A ride's or run's sections as bars: the width is the time, the height
    /// and colour the intensity, like the link page's graph.
    private var intervals: some View {
        let segments = WorkoutProfile.segments(template.profile())
        let total = max(1, segments.last?.end ?? 1)
        return GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                ForEach(segments) { s in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(zoneColor(s.percent))
                        .frame(width: max(2, geo.size.width * (s.end - s.start) / total - 2),
                               height: geo.size.height * min(1, max(0.18, s.percent / 125)))
                        .offset(x: geo.size.width * s.start / total)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .bottomLeading)
        }
    }

    private func zoneColor(_ percent: Double) -> Color {
        let colors: [UInt32] = dark ? [0x5C6662, 0x7CC3F0, 0x8FE6C4, 0xF0B36E, 0xF0907A, 0xA5A1FF]
                                    : [0xB9B4AA, 0x1D6FA3, 0x1F6B52, 0xA35A12, 0xB4532F, 0x4F46C8]
        let index = percent < 56 ? 0 : percent < 76 ? 1 : percent < 91 ? 2 : percent < 106 ? 3 : percent < 121 ? 4 : 5
        return Color(hex: colors[index])
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

// MARK: - Buttons

/// "Sdílet": makes the link and opens the share sheet.
struct ShareWorkoutButton: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    let template: WorkoutTemplate
    var date: String? = nil
    var groups: [String] = []
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SecondaryButton(title: busy ? "Připravuji odkaz…" : "Sdílet", systemImage: "square.and.arrow.up") {
                Task { await share() }
            }
            .disabled(busy || model.demo || template.isEmpty)
            if let error { Text(error).font(Typo.caption).foregroundStyle(Palette.rust) }
        }
    }

    private func share() async {
        busy = true
        defer { busy = false }
        do {
            try await WorkoutSharing.share(api: model.api, template: template, date: date, groups: groups, scheme: scheme)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "Uložit do Mých tréninků": keeps the workout without weights to plan again or share.
struct SaveWorkoutButton: View {
    @Environment(AppModel.self) private var model
    let template: WorkoutTemplate
    @State private var busy = false
    @State private var saved = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if saved {
                Label("Uloženo v Mých trénincích", systemImage: "checkmark.circle.fill")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    .frame(maxWidth: .infinity).frame(height: 46)
            } else {
                SecondaryButton(title: busy ? "Ukládám…" : "Uložit do Mých tréninků", systemImage: "bookmark") {
                    Task { await save() }
                }
                .disabled(busy || model.demo || template.isEmpty)
            }
            if let error { Text(error).font(Typo.caption).foregroundStyle(Palette.rust) }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.api.saveWorkout(template)
            saved = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
