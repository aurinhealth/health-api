import SwiftUI

// MARK: - Doporučení trenéra (GET/POST /app/api/coach/pick, src/coach-pick.js)

struct CoachPick: Decodable, Equatable {
    struct Option: Decodable, Equatable, Identifiable {
        let kind: String
        let title: String
        let detail: String?
        let reason: String?
        let best: Bool?
        /// "library" (ride, run), "gym" (Sestavit trénink) or "accept".
        let action: String
        var id: String { kind }

        var symbol: String {
            switch kind {
            case "ride": return "bicycle"
            case "run": return "figure.run"
            case "gym": return "dumbbell.fill"
            case "swim": return "drop"
            case "sauna": return "flame"
            default: return "moon"
            }
        }

        var color: Color {
            switch kind {
            case "gym": return Palette.green
            case "sauna": return Palette.amberBar
            case "rest": return Palette.indigo
            default: return Palette.blue
            }
        }
    }
    let date: String?
    let options: [Option]
    /// What the athlete took today.
    let chosen: String?

    var best: Option? { options.first { $0.best == true } ?? options.first }
}

extension APIClient {
    func coachPick() async throws -> CoachPick {
        try await get("/app/api/coach/pick")
    }

    func chooseCoachPick(kind: String, top: String?) async throws {
        let _: JSONValue = try await send("/app/api/coach/pick", method: "POST",
                                          body: ["kind": JSONValue.string(kind), "top": .string(top ?? "")])
    }
}

/// The option's sport in a ring, as on the training rows.
private struct PickIcon: View {
    let option: CoachPick.Option
    var size: CGFloat = 44
    var body: some View {
        Image(systemName: option.symbol).font(.system(size: size * 0.38, weight: .semibold)).foregroundStyle(option.color)
            .frame(width: size, height: size)
            .overlay(Circle().stroke(option.color, lineWidth: 2.5))
    }
}

/// Dnes: the coach's pick with "Dát na dnes" (or "Beru") and "Jiné možnosti".
struct CoachPickCard: View {
    @Environment(AppModel.self) private var model
    @State private var pick: CoachPick?

    var body: some View {
        Group {
            if let pick, let best = pick.best {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Doporučení trenéra", systemImage: "sparkles")
                        .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.green)
                    HStack(spacing: 14) {
                        PickIcon(option: best)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: best.title).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                            if let detail = best.detail { Text(verbatim: detail).font(Typo.small).foregroundStyle(Palette.muted) }
                        }
                    }
                    if let reason = best.reason {
                        Text(verbatim: reason).font(Typo.sentence(18)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    if let chosen = pick.options.first(where: { $0.kind == pick.chosen }) {
                        Label(L10n.f("Dnes: %@", chosen.title), systemImage: "checkmark").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    } else {
                        HStack(spacing: 10) {
                            PrimaryButton(title: L10n.tr(best.action == "accept" ? "Beru" : "Dát na dnes"), systemImage: best.action == "accept" ? "checkmark" : "calendar") {
                                Task { await CoachPickActions.take(best, pick: pick, model: model); await reload() }
                            }
                            NavigationLink(value: AppRoute.coachPick) {
                                Text("Jiné možnosti").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                    .frame(maxWidth: .infinity).frame(height: 50)
                                    .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
        }
        .task { await reload() }
    }

    private func reload() async {
        guard !model.demo else { return }
        pick = try? await model.api.coachPick()
    }
}

/// "Doporučení trenéra": every option, the best first (Trénink dne in + too).
struct CoachPickView: View {
    @Environment(AppModel.self) private var model
    @State private var pick: CoachPick?
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Doporučení trenéra") {
            VStack(alignment: .leading, spacing: 0) {
                Text("Co dnes sedí nejlíp, seřazené podle tvé připravenosti a týdne.")
                    .font(Typo.sentence(22)).foregroundStyle(Palette.secondary).padding(.top, 24)
                if let pick {
                    VStack(spacing: 0) {
                        ForEach(Array(pick.options.enumerated()), id: \.element.id) { i, option in
                            if i > 0 { Divider().overlay(Palette.hairline).padding(.leading, 60) }
                            row(option, pick)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 4)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .padding(.top, 20)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .navigationTitle(L10n.tr("Doporučení trenéra"))
        .task {
            guard pick == nil else { return }
            guard !model.demo else { error = L10n.tr("V ukázce se doporučení nenačítá."); return }
            do { pick = try await model.api.coachPick() } catch { self.error = error.localizedDescription }
        }
    }

    private func row(_ option: CoachPick.Option, _ pick: CoachPick) -> some View {
        Button {
            Task {
                await CoachPickActions.take(option, pick: pick, model: model)
                self.pick = try? await model.api.coachPick()
            }
        } label: {
            HStack(spacing: 14) {
                PickIcon(option: option, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(verbatim: option.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                        if option.best == true {
                            Text("Nejlepší").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.green)
                                .padding(.horizontal, 8).frame(height: 22).background(Palette.greenSoft, in: Capsule())
                        }
                    }
                    if let detail = option.detail { Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
                }
                Spacer(minLength: 4)
                Image(systemName: pick.chosen == option.kind ? "checkmark" : "chevron.right")
                    .font(.footnote.weight(.semibold)).foregroundStyle(pick.chosen == option.kind ? Palette.green : Palette.faint)
            }
            .padding(.vertical, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

enum CoachPickActions {
    /// The choice is saved (another than the best one teaches the coach); a
    /// ride or run opens its library with the coach's proposal, the gym
    /// Sestavit trénink.
    @MainActor
    static func take(_ option: CoachPick.Option, pick: CoachPick, model: AppModel) async {
        guard !model.demo else { return }
        try? await model.api.chooseCoachPick(kind: option.kind, top: pick.best?.kind)
        switch option.action {
        case "library": model.push(.workoutLibrary(option.kind))
        case "gym": model.push(.gymBuilder)
        default: break
        }
    }
}
