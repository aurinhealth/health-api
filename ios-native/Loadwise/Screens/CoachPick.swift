import SwiftUI

// MARK: - Aktivita dne (GET/POST /app/api/coach/pick, src/coach-pick.js)

struct CoachPick: Decodable, Equatable {
    struct Option: Decodable, Equatable, Identifiable {
        let kind: String
        let title: String
        let detail: String?
        let reason: String?
        let best: Bool?
        /// "library" (ride, run), "gym" or "accept".
        let action: String
        /// The rows under the profile: a section and its length or target.
        var lines: [[String]]? = nil
        /// The ride or run, ready to plan (the coach's workout for today).
        var workout: LibraryWorkout? = nil
        /// The gym proposal, ready to save (or the day's plan already stored).
        var gym: Gym? = nil
        var id: String { kind }

        struct Gym: Decodable, Equatable {
            let draftId: Int?
            let rows: [[JSONValue]]?
            let planned: Bool?
        }

        var symbol: String { CoachPick.symbol(kind) }
        var color: Color { CoachPick.color(kind) }

        /// "1 h 05 · 72 TSS · trenažér" for a ride or run, else the server's line.
        var subtitle: String? {
            guard let w = workout else { return detail }
            var parts = [detail ?? w.duration_minutes.map { Fmt.duration(Int($0)) } ?? ""]
            if let load = w.target_load, load > 0 { parts.append(Fmt.int(load) + " TSS") }
            if w.environment == "indoor" { parts.append(L10n.tr(kind == "run" ? "pás" : "trenažér")) }
            return parts.filter { !$0.isEmpty }.joined(separator: " · ")
        }
    }
    let date: String?
    let options: [Option]
    /// Kinds the athlete asked to see less ("Doporučovat méně").
    var less: [String]? = nil
    /// What the athlete took today.
    let chosen: String?

    var best: Option? { options.first { $0.best == true } ?? options.first }
    var others: [Option] { options.filter { $0.id != best?.id } }

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "ride": return "bicycle"
        case "run": return "figure.run"
        case "gym": return "dumbbell.fill"
        case "swim": return "drop"
        case "sauna": return "flame"
        default: return "moon"
        }
    }

    static func color(_ kind: String) -> Color {
        switch kind {
        case "gym": return Palette.green
        case "sauna": return Palette.amberBar
        case "rest": return Palette.indigo
        default: return Palette.blue
        }
    }

    static func name(_ kind: String) -> String {
        L10n.tr(["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "swim": "Plavání", "sauna": "Sauna"][kind] ?? "Volno")
    }

    /// The day's pick as last fetched (also in the background), when it is today's.
    static var stored: CoachPick? {
        guard let saved = SnapshotCache.load(CoachPick.self, key: cacheKey)?.value,
              saved.date == AppModel.localDate(Date()) else { return nil }
        return saved
    }

    static let cacheKey = "activity-of-the-day"
}

extension APIClient {
    func coachPick() async throws -> CoachPick {
        try await get("/app/api/coach/pick", cacheKey: CoachPick.cacheKey)
    }

    func chooseCoachPick(kind: String, top: String?) async throws {
        let _: JSONValue = try await send("/app/api/coach/pick", method: "POST",
                                          body: ["kind": JSONValue.string(kind), "top": .string(top ?? "")])
    }

    /// "Doporučovat méně" (less) or back again.
    func recommendLess(kind: String, less: Bool) async throws {
        let _: JSONValue = try await send("/app/api/coach/pick/less", method: "POST",
                                          body: ["kind": JSONValue.string(kind), "less": .bool(less)])
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

/// What the option is made of: the ride's or run's profile and its sections,
/// the gym's exercises, the steps of the rest.
private struct PickDetails: View {
    let option: CoachPick.Option

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let blocks = option.workout?.steps, !blocks.isEmpty { StepsProfile(blocks: blocks).frame(height: 34) }
            if let lines = option.lines, !lines.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        HStack(alignment: .firstTextBaseline) {
                            Text(verbatim: line.first ?? "").font(Typo.small).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text(verbatim: line.dropFirst().first ?? "").font(Typo.small).foregroundStyle(Palette.muted).multilineTextAlignment(.trailing)
                        }
                        .padding(.vertical, 7)
                        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
            }
        }
    }
}

/// Dnes: the day's activity with everything that belongs to it, "Dát na dnes"
/// and "Další možnosti". It shows what was fetched last (the background
/// refresh keeps it current), so it opens without loading.
struct CoachPickCard: View {
    @Environment(AppModel.self) private var model
    @State private var pick: CoachPick? = CoachPick.stored
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Group {
            if let pick, let best = pick.best {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Aktivita dne", systemImage: "sparkles")
                        .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.green)
                    HStack(spacing: 14) {
                        PickIcon(option: best)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(verbatim: best.title).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                                if best.workout?.ai != nil { AIMark() }
                            }
                            if let subtitle = best.subtitle { Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Palette.muted) }
                        }
                    }
                    PickDetails(option: best)
                    if let reason = best.reason {
                        Text(verbatim: reason).font(Typo.sentence(18)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    HStack(spacing: 10) {
                        if let chosen = pick.options.first(where: { $0.kind == pick.chosen }) {
                            Label(L10n.f("Dnes: %@", chosen.title), systemImage: "checkmark").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            PrimaryButton(title: L10n.tr("Dát na dnes"), systemImage: "calendar", busy: busy) {
                                Task { await take(best, pick) }
                            }
                        }
                        if !pick.others.isEmpty {
                            NavigationLink(value: AppRoute.coachPick(false)) {
                                Text("Další možnosti").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
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
        // Again whenever Today comes from the server (a new workout, a sync, pull
        // to refresh); a meal or drink shown before it is sent does not ask.
        .task(id: model.todayRevision) { await reload() }
    }

    private func take(_ option: CoachPick.Option, _ pick: CoachPick) async {
        busy = true; error = nil
        do { try await CoachPickActions.take(option, pick: pick, model: model) } catch { self.error = error.localizedDescription }
        busy = false
        await reload()
    }

    private func reload() async {
        guard !model.demo else { return }
        if let fresh = try? await model.api.coachPick() { pick = fresh }
    }
}

/// Další možnosti: each option its own card, folded; a tap anywhere opens its
/// details and "Dát na dnes", a long press offers "Doporučovat méně".
/// From Today's card the day's activity is left out (it was just seen there);
/// from + it comes first, open.
struct CoachPickView: View {
    @Environment(AppModel.self) private var model
    /// Also the day's activity (the + menu).
    var all = false
    @State private var pick: CoachPick? = CoachPick.stored
    @State private var open: String?
    @State private var busy: String?
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: all ? "Aktivita dne" : "Další možnosti") {
            VStack(alignment: .leading, spacing: 10) {
                if let pick {
                    ForEach(all ? pick.options : pick.others) { option in card(option, pick) }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    if let less = pick.less, !less.isEmpty { lessSection(less) }
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.top, 20)
        }
        .navigationTitle(L10n.tr(all ? "Aktivita dne" : "Další možnosti"))
        .task {
            if all, open == nil { open = pick?.best?.id }
            guard !model.demo else { if pick == nil { error = L10n.tr("V ukázce se doporučení nenačítá.") }; return }
            do {
                pick = try await model.api.coachPick()
                if all, open == nil { open = pick?.best?.id }
            } catch { if pick == nil { self.error = error.localizedDescription } }
        }
    }

    private func card(_ option: CoachPick.Option, _ pick: CoachPick) -> some View {
        let expanded = open == option.id
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                PickIcon(option: option, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(verbatim: option.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                        if option.workout?.ai != nil { AIMark() }
                    }
                    if let subtitle = option.subtitle { Text(verbatim: subtitle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
                }
                Spacer(minLength: 4)
                if pick.chosen == option.kind {
                    Image(systemName: "checkmark").font(.footnote.weight(.semibold)).foregroundStyle(Palette.green)
                }
            }
            if expanded {
                VStack(alignment: .leading, spacing: 12) {
                    PickDetails(option: option)
                    if pick.chosen != option.kind {
                        PrimaryButton(title: L10n.tr("Dát na dnes"), systemImage: "calendar", busy: busy == option.id) {
                            Task { await take(option, pick) }
                        }
                    }
                }
                .padding(.top, 14)
            }
            Image(systemName: "chevron.down")
                .font(.footnote.weight(.semibold)).foregroundStyle(Palette.faint)
                .rotationEffect(.degrees(expanded ? 180 : 0))
                .frame(maxWidth: .infinity).padding(.top, 6)
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 8)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .onTapGesture { withAnimation(.snappy) { open = expanded ? nil : option.id } }
        .contextMenu {
            if option.best != true {
                Button { Task { await setLess(option.kind, true) } } label: { Label("Doporučovat méně", systemImage: "minus.circle") }
            }
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(Text(expanded ? "Sbalit" : "Rozbalit"))
    }

    /// What the athlete sees less, each with "Doporučovat znovu".
    private func lessSection(_ less: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Doporučuješ méně").font(Typo.caption.weight(.semibold)).textCase(.uppercase).tracking(1).foregroundStyle(Palette.muted)
            ForEach(less, id: \.self) { kind in
                HStack {
                    Image(systemName: CoachPick.symbol(kind)).foregroundStyle(Palette.muted).frame(width: 24)
                    Text(verbatim: CoachPick.name(kind)).font(Typo.small).foregroundStyle(Palette.secondary)
                    Spacer()
                    Button("Doporučovat znovu") { Task { await setLess(kind, false) } }
                        .font(Typo.small.weight(.semibold)).foregroundStyle(Palette.green)
                }
            }
        }
        .padding(.top, 18)
    }

    private func take(_ option: CoachPick.Option, _ pick: CoachPick) async {
        busy = option.id; error = nil
        do { try await CoachPickActions.take(option, pick: pick, model: model) } catch { self.error = error.localizedDescription }
        busy = nil
        if let fresh = try? await model.api.coachPick() { self.pick = fresh }
    }

    private func setLess(_ kind: String, _ less: Bool) async {
        guard !model.demo else { return }
        do {
            try await model.api.recommendLess(kind: kind, less: less)
            pick = try await model.api.coachPick()
        } catch { self.error = error.localizedDescription }
    }
}

enum CoachPickActions {
    /// "Dát na dnes": the ready ride or run goes to today's calendar, the gym
    /// proposal is saved as today's plan, the rest is noted. The choice is
    /// saved too (another than the best one teaches the coach). Without a
    /// ready workout the library or the gym builder opens, as before.
    @MainActor
    static func take(_ option: CoachPick.Option, pick: CoachPick, model: AppModel) async throws {
        guard !model.demo else { return }
        let today = AppModel.localDate(Date())
        switch option.action {
        case "library":
            guard let w = option.workout else { model.push(.workoutLibrary(option.kind)); break }
            try await model.api.scheduleWorkout(id: w.id, date: today, indoor: w.environment == "indoor")
        case "gym":
            if option.gym?.planned == true { break }
            guard let draft = option.gym?.draftId, let rows = option.gym?.rows else { model.push(.gymBuilder); break }
            try await model.api.confirmGym(draftId: draft, rows: rows)
        default: break
        }
        try? await model.api.chooseCoachPick(kind: option.kind, top: pick.best?.kind)
        await model.refresh()
        await model.refreshTraining()
    }
}
