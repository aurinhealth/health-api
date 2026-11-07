import SwiftUI
import os

// MARK: - Aktivita dne (GET/POST /app/api/coach/pick, src/coach-pick.js)

struct CoachPick: Decodable, Equatable {
    struct Option: Decodable, Equatable, Identifiable {
        let kind: String
        let title: String
        let detail: String?
        let reason: String?
        let best: Bool?
        /// "library" (ride, run, swim), "gym" or "accept".
        let action: String
        /// The rows under the profile: a section and its length or target.
        var lines: [[String]]? = nil
        /// The ride or run, ready to plan (the coach's workout for today).
        var workout: LibraryWorkout? = nil
        /// The gym proposal, ready to save (or the day's plan already stored).
        var gym: Gym? = nil
        /// A ride or run outdoors on a hot day: how to adjust it (src/heat-advice.js).
        var heat: String? = nil
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
    /// What the athlete took today ("skip" after Odmítnout).
    var chosen: String?
    /// The best ride or run's AI workout is still being written (src/coach-pick.js claimDetails).
    var aiPending: Bool? = nil

    var best: Option? { options.first { $0.best == true } ?? options.first }
    var others: [Option] { options.filter { $0.id != best?.id } }

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "ride": return "bicycle"
        case "run": return "figure.run"
        case "gym": return "dumbbell.fill"
        case "swim": return "figure.pool.swim"
        case "sauna": return "flame"
        case "stretch": return "figure.flexibility"
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
        L10n.tr(["ride": "Kolo", "run": "Běh", "gym": "Posilovna", "swim": "Plavání", "sauna": "Sauna", "stretch": "Protažení"][kind] ?? "Volno")
    }

    /// The day's pick as last fetched (also in the background), when it is today's.
    /// Read from disk once and then kept in memory: Today makes a new card on
    /// every redraw, and reading the file there held up the main thread.
    static var stored: CoachPick? {
        let today = AppModel.localDate(Date())
        let pick = memo.withLockUnchecked { $0 } ?? SnapshotCache.load(CoachPick.self, key: cacheKey)?.value
        if let pick { remember(pick) }
        return pick?.date == today ? pick : nil
    }

    /// The pick just fetched, for the next card.
    static func remember(_ pick: CoachPick) {
        memo.withLockUnchecked { $0 = pick }
    }

    /// Signing out: the next account starts without it.
    static func forget() {
        memo.withLockUnchecked { $0 = nil }
    }

    private static let memo = OSAllocatedUnfairLock<CoachPick?>(uncheckedState: nil)

    static let cacheKey = "activity-of-the-day"
}

extension APIClient {
    func coachPick() async throws -> CoachPick {
        let pick: CoachPick = try await get("/app/api/coach/pick", cacheKey: CoachPick.cacheKey)
        CoachPick.remember(pick)
        return pick
    }

    func chooseCoachPick(kind: String, top: String?) async throws {
        let _: JSONValue = try await send("/app/api/coach/pick", method: "POST",
                                          body: ["kind": JSONValue.string(kind), "top": .string(top ?? "")])
    }

    /// "Vrátit" after Odmítnout: the day's activity is back.
    func undoSkipCoachPick() async throws {
        let _: JSONValue = try await send("/app/api/coach/pick", method: "DELETE", body: JSONObject())
    }

    /// "Doporučovat méně" (less) or back again.
    func recommendLess(kind: String, less: Bool) async throws {
        let _: JSONValue = try await send("/app/api/coach/pick/less", method: "POST",
                                          body: ["kind": JSONValue.string(kind), "less": .bool(less)])
    }

    /// "Nenavrhovat kolo" and Sporty k navrhování: one sport (ride, run, swim,
    /// strength) off or back on (src/sport-choice.js).
    @discardableResult
    func setSportSuggested(_ sport: String, _ suggest: Bool) async throws -> JSONValue {
        try await send("/app/api/sports", method: "POST", body: ["sport": JSONValue.string(sport), "suggest": .bool(suggest)])
    }
}

/// The ⋯ of Aurin's day's activity: its words per sport.
enum PickMenuText {
    /// The profile's sport for a pick's kind; none for the sauna, stretching or rest.
    static func sport(_ kind: String) -> String? { ["ride": "ride", "run": "run", "swim": "swim", "gym": "strength"][kind] }
    static func less(_ kind: String) -> String {
        L10n.tr(["ride": "Navrhovat kolo méně často", "run": "Navrhovat běh méně často", "swim": "Navrhovat plavání méně často", "gym": "Navrhovat posilovnu méně často"][kind] ?? "Doporučovat méně")
    }
    static func never(_ kind: String) -> String {
        L10n.tr(["ride": "Nenavrhovat kolo", "run": "Nenavrhovat běh", "swim": "Nenavrhovat plavání", "gym": "Nenavrhovat posilovnu"][kind] ?? "Nenavrhovat")
    }
    static func off(_ sport: String) -> String {
        L10n.tr(["ride": "Kolo už nebudu navrhovat", "run": "Běh už nebudu navrhovat", "swim": "Plavání už nebudu navrhovat", "strength": "Posilovnu už nebudu navrhovat"][sport] ?? "Sport už nebudu navrhovat")
    }
    static func lessDone(_ kind: String) -> String {
        L10n.tr(["ride": "Kolo budu navrhovat méně často", "run": "Běh budu navrhovat méně často", "swim": "Plavání budu navrhovat méně často", "gym": "Posilovnu budu navrhovat méně často"][kind] ?? "Budu to navrhovat méně často")
    }
}

/// The option's sport in a ring, as on the training rows.
private struct PickIcon: View {
    let option: CoachPick.Option
    var size: CGFloat = 44
    var body: some View {
        Image(systemName: option.symbol).font(.system(size: size * 0.38, weight: .semibold)).foregroundStyle(option.color)
            .frame(width: size, height: size)
            .overlay { Circle().stroke(option.color, lineWidth: 2.5) }
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

/// Dnes: the day's activity with everything that belongs to it, "Dát na dnes",
/// "Další možnosti" and "Odmítnout". It shows what was fetched last (the
/// background refresh keeps it current), so it opens without loading. The
/// chevron folds it to one line and back (kept until unfolded). Once something
/// is taken for today it leaves: the choice is in Plán dne (+ → Aktivita dne
/// still changes it). Odmítnout takes it away for the day, a decline the
/// coach learns from, with "Vrátit" for a moment.
struct CoachPickCard: View {
    @Environment(AppModel.self) private var model
    /// Today's planned workouts (TodayTrainingCard, Petr 2026-11-02): with any,
    /// the card is a short suggestion under them, and nothing when the pick
    /// only confirms the plan.
    var planned: [TodaySnapshot.PlanItem] = []
    /// A red morning: a pick of the planned sport is an easier one, so it shows.
    var red = false
    /// The gap above the full card, only while it shows (an empty one left a hole).
    var top: CGFloat = 0
    @State private var pick: CoachPick? = CoachPick.stored
    @State private var busy = false
    @State private var error: String?
    @State private var declined = false
    /// After ⋯: what changed, with "Vrátit" for a moment.
    @State private var notice: Notice?
    @AppStorage("activity-of-the-day-folded") private var folded = false

    /// The pick's kinds of today's planned workouts ("gym" for strength).
    private var plannedKinds: Set<String> {
        Set(planned.map { $0.sport == "strength" ? "gym" : $0.sport ?? "other" })
    }

    var body: some View {
        // A stack, not a Group: hidden under a plan it agrees with, the task still runs.
        VStack(alignment: .leading, spacing: 0) {
            if let pick, pick.chosen == nil, let best = pick.best, !planned.isEmpty {
                if red || !plannedKinds.contains(best.kind) {
                    suggestion(best, pick).transition(.opacity)
                }
            } else if let pick, pick.chosen == nil, let best = pick.best {
                VStack(alignment: .leading, spacing: 12) {
                    Button { withAnimation(.snappy) { folded.toggle() } } label: {
                        HStack {
                            Label("Aktivita dne", systemImage: "sparkles")
                                .font(.caption.weight(.semibold)).textCase(.uppercase).tracking(1.2).foregroundStyle(Palette.green)
                            Spacer()
                            Image(systemName: "chevron.up").font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted)
                                .rotationEffect(.degrees(folded ? 180 : 0))
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(Text(L10n.tr(folded ? "Rozbalit" : "Sbalit")))
                    .padding(.trailing, 44)
                    .overlay(alignment: .trailing) { moreMenu(best) }
                    if folded {
                        Button { withAnimation(.snappy) { folded = false } } label: {
                            HStack(spacing: 12) {
                                PickIcon(option: best, size: 32)
                                Text(verbatim: best.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                                if let length = best.subtitle?.components(separatedBy: " · ").first {
                                    Text(verbatim: length).font(Typo.small).foregroundStyle(Palette.muted).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    } else {
                        expanded(best, pick)
                    }
                }
                .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface(cornerRadius: 24)
                .padding(.top, top)
                .transition(.opacity)
            }
            if let notice {
                undoBar(notice.text) { Task { await undoNotice(notice) } }
                    .padding(.top, 10)
                    .transition(.opacity)
            } else if pick?.chosen != nil, declined && planned.isEmpty {
                HStack(spacing: 10) {
                    Text("Aktivita dne odmítnuta").font(Typo.small).foregroundStyle(Palette.ink)
                    Spacer(minLength: 6)
                    Button { Task { await undo() } } label: {
                        Label("Vrátit", systemImage: "arrow.uturn.backward").font(Typo.small.weight(.semibold)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(Palette.ink.opacity(0.1), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.leading, 18).padding(.trailing, 8).frame(height: 52)
                .background(Palette.card, in: Capsule())
                .padding(.top, top)
                .transition(.opacity)
            }
        }
        // Again whenever Today comes from the server (a new workout, a sync, pull
        // to refresh); a meal or drink shown before it is sent does not ask.
        .task(id: model.todayRevision) {
            await model.afterTodayLoads()
            await reload()
        }
        // "Vrátit" stays for a moment only.
        .task(id: declined) {
            guard declined else { return }
            try? await Task.sleep(for: .seconds(6))
            withAnimation(.easeOut(duration: 0.2)) { declined = false }
        }
        .task(id: notice) {
            guard notice != nil else { return }
            try? await Task.sleep(for: .seconds(6))
            withAnimation(.easeOut(duration: 0.2)) { notice = nil }
        }
    }

    /// What ⋯ changed: a sport off (Sporty k navrhování) or suggested less often.
    struct Notice: Equatable {
        enum Kind: Equatable { case off(String), less(String) }
        let id = UUID()
        let kind: Kind
        let text: String
    }

    /// ⋯: Dnes ne (Odmítnout), less often, and never this sport.
    private func moreMenu(_ best: CoachPick.Option) -> some View {
        Menu {
            Button { Task { await decline(best) } } label: { Label("Dnes ne", systemImage: "xmark") }
            if best.kind != "rest" {
                Button { Task { await suggestLess(best.kind) } } label: { Label(PickMenuText.less(best.kind), systemImage: "minus.circle") }
            }
            if let sport = PickMenuText.sport(best.kind) {
                Button(role: .destructive) { Task { await turnOff(sport) } } label: { Label(PickMenuText.never(best.kind), systemImage: "nosign") }
            }
        } label: {
            Image(systemName: "ellipsis")
                .scaledFont(15, weight: .semibold)
                .foregroundStyle(Palette.muted)
                .frame(width: 36, height: 36)
                .background(Palette.ink.opacity(0.06), in: Circle())
                .contentShape(Circle())
        }
        .accessibilityLabel(Text("Možnosti aktivity dne"))
        .disabled(busy || model.demo)
    }

    /// A line with "Vrátit", as after Odmítnout.
    private func undoBar(_ text: String, undo: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Text(verbatim: text).font(Typo.small).foregroundStyle(Palette.ink).lineLimit(2)
            Spacer(minLength: 6)
            Button(action: undo) {
                Label("Vrátit", systemImage: "arrow.uturn.backward").font(Typo.small.weight(.semibold)).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 14).frame(height: 36)
                    .background(Palette.ink.opacity(0.1), in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 18).padding(.trailing, 8).frame(minHeight: 52)
        .background(Palette.card, in: Capsule())
    }

    /// "Nenavrhovat kolo": the sport is off everywhere and the next activity takes its place.
    private func turnOff(_ sport: String) async {
        error = nil
        do {
            try await model.api.setSportSuggested(sport, false)
            withAnimation(.snappy) { notice = Notice(kind: .off(sport), text: PickMenuText.off(sport)) }
            await model.refreshTraining()
        } catch { self.error = error.localizedDescription }
        await reload()
    }

    /// "Navrhovat kolo méně často": another activity goes first when it is close.
    private func suggestLess(_ kind: String) async {
        error = nil
        do {
            try await model.api.recommendLess(kind: kind, less: true)
            withAnimation(.snappy) { notice = Notice(kind: .less(kind), text: PickMenuText.lessDone(kind)) }
        } catch { self.error = error.localizedDescription }
        await reload()
    }

    private func undoNotice(_ shown: Notice) async {
        withAnimation(.easeOut(duration: 0.2)) { notice = nil }
        do {
            switch shown.kind {
            case .off(let sport): try await model.api.setSportSuggested(sport, true); await model.refreshTraining()
            case .less(let kind): try await model.api.recommendLess(kind: kind, less: false)
            }
        } catch { self.error = error.localizedDescription }
        await reload()
    }

    @ViewBuilder private func expanded(_ best: CoachPick.Option, _ pick: CoachPick) -> some View {
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
        if let heat = best.heat { HeatLine(text: heat) }
        if let reason = best.reason {
            Text(verbatim: reason).font(Typo.sentence(18)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
        }
        if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        HStack(spacing: 10) {
            PrimaryButton(title: L10n.tr("Dát na dnes"), systemImage: "calendar", busy: busy) {
                Task { await take(best, pick) }
            }
            if !pick.others.isEmpty {
                NavigationLink(value: AppRoute.coachPick(false)) {
                    Text("Další možnosti").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                }
                .buttonStyle(.plain)
            }
        }
        Button { Task { await decline(best) } } label: {
            Text("Odmítnout").font(Typo.small.weight(.medium)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity).frame(height: 32).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    /// Under today's plan: what the coach suggests instead, Vyměnit (the pick
    /// goes in, the first planned workout out) or Nechat plán (as Odmítnout).
    @ViewBuilder private func suggestion(_ best: CoachPick.Option, _ pick: CoachPick) -> some View {
        Rectangle().fill(Palette.hairline).frame(height: 1).padding(.top, 12)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: "sparkles").scaledFont(11, weight: .semibold).foregroundStyle(Palette.indigo)
                (Text(verbatim: L10n.tr("Aktivita dne") + ": ").fontWeight(.semibold).foregroundColor(Palette.indigo)
                 + Text(verbatim: best.reason ?? best.title).foregroundColor(Palette.secondary))
                    .font(Typo.small)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                PickIcon(option: best, size: 28)
                Text(verbatim: best.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                if let subtitle = best.subtitle {
                    Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            HStack(spacing: 10) {
                SecondaryButton(title: busy ? "Měním…" : "Vyměnit") { Task { await swap(best, pick) } }
                SecondaryButton(title: "Nechat plán") { Task { await decline(best) } }
            }
            .disabled(busy || model.demo)
        }
        .padding(.top, 12)
    }

    /// Vyměnit: the pick goes in as with "Dát na dnes"; once it is in the plan,
    /// the first workout planned for today goes out (a gym plan is cancelled,
    /// its sets stay saved). A pick that opens the library first changes nothing yet.
    private func swap(_ best: CoachPick.Option, _ pick: CoachPick) async {
        busy = true; error = nil
        defer { busy = false }
        do {
            guard try await CoachPickActions.take(best, pick: pick, model: model) else { return }
            if let session = planned.first?.session {
                if session.sport == "strength" {
                    try await GymPlanActions.cancel(model, date: session.date, eventId: session.eventId)
                } else if let id = session.eventId {
                    try await model.api.deletePlanned(eventId: id)
                }
                await model.refresh()
                await model.refreshTraining()
            }
        } catch {
            self.error = error.localizedDescription
        }
        await reload()
    }

    /// Odmítnout: gone at once, the server keeps it for the day.
    private func decline(_ best: CoachPick.Option) async {
        guard !model.demo else { return }
        error = nil
        withAnimation(.easeOut(duration: 0.2)) { pick?.chosen = "skip"; declined = true }
        do { try await model.api.chooseCoachPick(kind: "skip", top: best.kind) } catch {
            withAnimation { pick?.chosen = nil; declined = false }
            self.error = error.localizedDescription
        }
    }

    private func undo() async {
        withAnimation(.easeOut(duration: 0.2)) { declined = false; pick?.chosen = nil }
        do { try await model.api.undoSkipCoachPick() } catch { self.error = error.localizedDescription }
        await reload()
    }

    private func take(_ option: CoachPick.Option, _ pick: CoachPick) async {
        busy = true; error = nil
        do { _ = try await CoachPickActions.take(option, pick: pick, model: model) } catch { self.error = error.localizedDescription }
        busy = false
        await reload()
    }

    private func reload() async {
        guard !model.demo else { return }
        if let fresh = try? await model.api.coachPick() { pick = fresh }
        // The AI's workout comes some seconds after the answer: asked again for it, at most twice.
        for _ in 0..<2 where pick?.aiPending == true {
            try? await Task.sleep(for: .seconds(8))
            guard !Task.isCancelled else { return }
            if let fresh = try? await model.api.coachPick() { pick = fresh }
        }
    }
}

/// Další možnosti: each option its own card, folded; a tap anywhere opens its
/// details and "Dát na dnes", a long press offers "Doporučovat méně".
/// From Today's card the day's activity is left out (it was just seen there);
/// from + it comes first, open.
struct CoachPickView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
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
        .cardSurface(cornerRadius: 22)
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

    /// Taken, back to Today, where it now sits in Plán dne.
    private func take(_ option: CoachPick.Option, _ pick: CoachPick) async {
        busy = option.id; error = nil
        do {
            if try await CoachPickActions.take(option, pick: pick, model: model) { busy = nil; dismiss(); return }
        } catch { self.error = error.localizedDescription }
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
    /// proposal is saved as today's plan, and the server puts the rest into
    /// Plán dne (swimming, the sauna, a walk and stretching). The choice is
    /// saved too (another than the best one teaches the coach). Without a
    /// ready workout the library or the gym builder opens, and nothing is
    /// taken until it is planned there. True when the choice is in the plan.
    @MainActor @discardableResult
    static func take(_ option: CoachPick.Option, pick: CoachPick, model: AppModel) async throws -> Bool {
        guard !model.demo else { return false }
        let today = AppModel.localDate(Date())
        switch option.action {
        case "library":
            guard let w = option.workout else { model.push(.workoutLibrary(option.kind)); return false }
            try await model.api.scheduleWorkout(id: w.id, date: today, indoor: w.environment == "indoor")
        case "gym":
            if option.gym?.planned == true { break }
            guard let draft = option.gym?.draftId, let rows = option.gym?.rows else { model.push(.gymBuilder); return false }
            try await model.api.confirmGym(draftId: draft, rows: rows)
        default: break
        }
        try await model.api.chooseCoachPick(kind: option.kind, top: pick.best?.kind)
        await model.refresh()
        await model.refreshTraining()
        return true
    }
}
