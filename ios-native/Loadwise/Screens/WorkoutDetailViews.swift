import Charts
import SwiftUI

// MARK: - The week's sessions

/// Training → Tento týden: every session of the week, tap for its detail.
struct WeekSessionsList: View {
    @Environment(AppModel.self) private var model
    let sessions: [WeekSession]
    let today: String
    /// The result of a move or a cancel with its undo, shown by the screen at the bottom.
    var toast: Binding<PlanToast?> = .constant(nil)
    @State private var changing: WeekSession?
    @State private var cancelling: WeekSession?
    @State private var moving: WeekSession?
    /// Cancelled sessions leave the list at once; the server hears of it when the undo is gone.
    @State private var hidden: Set<String> = []
    @State private var error: String?

    private var shown: [WeekSession] { sessions.filter { !hidden.contains($0.id) } }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, session in
                HStack(spacing: 0) {
                    NavigationLink(value: Self.destination(session)) {
                        SessionRow(session: session, today: today)
                    }
                    .buttonStyle(.plain)
                    .disabled(Self.destination(session) == nil)
                    let upcoming = PlanSessionActions.upcoming(session)
                    let changeable = GymPlanActions.changeable(session) && !upcoming
                    let candidates = pairCandidates(session)
                    if (upcoming || changeable || !candidates.isEmpty || session.plannedId != nil) && !model.demo {
                        Menu {
                            if upcoming {
                                Button { moving = session } label: { Label("Přesunout", systemImage: "arrow.right") }
                                if let route = Self.destination(session) {
                                    Button { model.paths[model.tab, default: []].append(route) } label: { Label("Upravit", systemImage: "pencil") }
                                }
                            }
                            if changeable {
                                Button { changing = session } label: { Label("Změnit trénink", systemImage: "calendar") }
                            }
                            // When the automatic pairing missed it: the activity that fulfilled this plan.
                            if !candidates.isEmpty {
                                Menu {
                                    ForEach(candidates) { activity in
                                        Button(activity.title + (activity.time.map { " · " + ClockText.format($0) } ?? "")) {
                                            Task { await pair(plannedId: session.id, activityId: activity.id, date: session.date) }
                                        }
                                    }
                                } label: { Label("Spárovat s aktivitou", systemImage: "link") }
                            }
                            if let plannedId = session.plannedId {
                                Button { Task { await pair(plannedId: plannedId, activityId: nil, date: session.date) } } label: {
                                    Label("Zrušit spárování", systemImage: "link.badge.plus")
                                }
                            }
                            // A session ahead, or a missed one, leaves the list in one step.
                            if upcoming || (changeable && session.status == "missed") {
                                Button(role: .destructive) { cancelling = session } label: { Label("Zrušit trénink", systemImage: "xmark") }
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.muted)
                                .frame(width: 36, height: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel(L10n.tr("Změnit trénink"))
                    }
                }
                if index < shown.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8) }
        }
        .sheet(item: $changing) { s in
            GymPlanActionsSheet(date: s.date, title: s.title, eventId: s.eventId)
        }
        .sheet(item: $moving) { s in
            MovePlannedSheet(session: s, today: today) { date, note in moved(s, to: date, note: note) }
        }
        .confirmationDialog(cancelling.map { L10n.f("Zrušit %@?", $0.title) } ?? "",
                            isPresented: Binding(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } }),
                            titleVisibility: .visible, presenting: cancelling) { s in
            Button("Zrušit trénink", role: .destructive) { cancel(s) }
            Button("Nechat", role: .cancel) {}
        } message: { _ in
            Text("Plán týdne se přepočítá.")
        }
    }

    /// The day's done sessions a plan can be paired with by hand.
    private func pairCandidates(_ s: WeekSession) -> [WeekSession] {
        guard s.kind == "planned", s.id.hasPrefix("planned:"), s.date <= today else { return [] }
        return sessions.filter { $0.kind == "activity" && $0.date == s.date }
    }

    private func pair(plannedId: String, activityId: String?, date: String) async {
        do {
            try await model.api.pairActivity(plannedId: plannedId, activityId: activityId, date: date)
            error = nil
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reload() async {
        await model.refreshTraining()
        await model.refresh()
    }

    /// Moved: the toast says where, "Zpět" moves it back.
    private func moved(_ s: WeekSession, to date: String, note: String?) {
        // The undo may run after this screen is gone: the model is taken now.
        let model: AppModel = self.model
        Task { await reload() }
        toast.wrappedValue = PlanToast(
            title: L10n.f("Přesunuto na %@", Fmt.weekdayName(date)),
            note: note,
            cancelled: false,
            undo: {
                do {
                    try await PlanSessionActions.moveBack(model, session: s, from: date)
                    error = nil
                } catch {
                    self.error = error.localizedDescription
                }
                await model.refreshTraining()
                await model.refresh()
            })
    }

    /// Cancelled: gone from the list now, deleted once the undo is gone.
    private func cancel(_ s: WeekSession) {
        hidden.insert(s.id)
        let model: AppModel = self.model
        let tss: Double = s.tss ?? 0
        let note: String? = tss > 0 ? L10n.f("Týden má o %@ TSS méně.", Fmt.int(tss)) : nil
        toast.wrappedValue = PlanToast(
            title: L10n.tr("Trénink zrušen"),
            note: note,
            cancelled: true,
            undo: {
                _ = hidden.remove(s.id)
            },
            commit: {
                do {
                    try await GymPlanActions.cancel(model, date: s.date, eventId: s.eventId)
                    error = nil
                } catch {
                    _ = hidden.remove(s.id)
                    self.error = error.localizedDescription
                }
                await model.refreshTraining()
                await model.refresh()
            })
    }

    /// Where a session opens (also Today → Plán dne).
    static func destination(_ s: WeekSession) -> AppRoute? {
        // A done lifting session opens the day's gym sheet too, wherever it was
        // recorded (Google Health has no detail of its own): the sets and weights.
        // A gym session typed in by hand (Zapsat trénink) has no sheet yet:
        // its detail is the planned one, where it can move or be deleted.
        if s.kind == "planned", let id = s.eventId, id.hasPrefix("planned:local-"), s.sport == "strength" { return .planned(s) }
        if s.kind == "activity" && s.sport == "strength" && s.status == "done" { return .gymSession(s) }
        if s.kind == "gym" || s.sport == "strength" { return .gym(s.date) }
        // An activity from another source (typed in) opens too: its
        // numbers from the list, with the ⋯ to delete it.
        if s.kind == "activity" { return .activity(s) }
        if s.kind == "planned", s.eventId != nil { return .planned(s) }
        return nil
    }
}

struct SessionRow: View {
    let session: WeekSession
    let today: String

    var body: some View {
        let state = PlanState(session)
        HStack(spacing: 14) {
            // The plan's colours: green kept to it, amber done differently, rust
            // missed, a dashed grey ring still ahead, blue outside the plan.
            PlanStateIcon(symbol: SportIcon.symbol(session.sport, type: session.type), state: state, percent: session.compliance)
                .accessibilityLabel(L10n.tr(state.title))
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                // Only a session done differently says why; one with a percent shows just that.
                if state == .off, session.compliance == nil, let reason = session.adherenceReason, !reason.isEmpty {
                    Text(reason).font(Typo.caption).foregroundStyle(Palette.amber).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let percent = session.compliance, session.status == "done" {
                Text(verbatim: "\(percent) %").font(Typo.bodyStrong).foregroundStyle(ComplianceScale.color(percent))
                    .accessibilityLabel(L10n.f("%@ %% plánu", String(percent)))
            } else if let tss = session.tss, tss > 0 {
                Text(Fmt.int(tss)).font(Typo.number(18)).foregroundStyle(Palette.ink)
            }
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private var subtitle: String {
        var parts = [session.date < today ? Fmt.weekdayShort(session.date) + " " + Fmt.dayMonth(session.date)
                                          : Fmt.capitalized(Fmt.relativeDay(session.date, today: today))]
        if let t = session.time { parts.append(ClockText.format(t)) }
        if let m = session.minutes { parts.append(Fmt.duration(m)) }
        return parts.joined(separator: " · ")
    }
}

enum SportIcon {
    /// The icon of a sport group, or of an Intervals.icu type when the
    /// session has one (src/activity-type.js ACTIVITY_TYPES).
    static func symbol(_ sport: String, type: String? = nil) -> String {
        if let type, let symbol = byType[type] { return symbol }
        switch sport {
        case "ride": return "figure.outdoor.cycle"
        case "run": return "figure.run"
        case "strength": return "dumbbell.fill"
        case "swim": return "figure.pool.swim"
        case "walk": return "figure.walk"
        default: return "figure.mixed.cardio"
        }
    }

    private static let byType: [String: String] = [
        "Hike": "figure.hiking", "Snowshoe": "figure.hiking",
        "VirtualRide": "figure.indoor.cycle",
        "OpenWaterSwim": "figure.open.water.swim",
        "Crossfit": "figure.cross.training", "HighIntensityIntervalTraining": "figure.highintensity.intervaltraining",
        "Rowing": "figure.rower", "VirtualRow": "figure.rower",
        "Kayaking": "oar.2.crossed", "Canoeing": "oar.2.crossed", "StandUpPaddling": "oar.2.crossed",
        "Surfing": "figure.surfing", "Windsurf": "figure.surfing", "Kitesurf": "figure.surfing", "Sail": "figure.sailing",
        "NordicSki": "figure.skiing.crosscountry", "RollerSki": "figure.skiing.crosscountry", "BackcountrySki": "figure.skiing.crosscountry",
        "AlpineSki": "figure.skiing.downhill", "Snowboard": "figure.snowboarding",
        "IceSkate": "figure.skating", "InlineSkate": "figure.skating", "RockClimbing": "figure.climbing",
        "Yoga": "figure.yoga", "Pilates": "figure.pilates", "Elliptical": "figure.elliptical", "StairStepper": "figure.stair.stepper",
        "Tennis": "figure.tennis", "Padel": "figure.tennis", "Squash": "figure.squash", "Badminton": "figure.badminton",
        "TableTennis": "figure.table.tennis", "Pickleball": "figure.pickleball",
        "Soccer": "figure.soccer", "Hockey": "figure.hockey", "Rugby": "figure.rugby", "Golf": "figure.golf",
        "Basketball": "figure.basketball", "Volleyball": "figure.volleyball", "Handball": "figure.handball",
        "Baseball": "figure.baseball", "Softball": "figure.softball", "AmericanFootball": "figure.american.football",
        "AustralianFootball": "figure.australian.football", "Cricket": "figure.cricket", "Lacrosse": "figure.lacrosse",
        "Racquetball": "figure.racquetball", "Boxing": "figure.boxing", "Kickboxing": "figure.kickboxing",
        "MartialArts": "figure.martial.arts", "Wrestling": "figure.wrestling", "Fencing": "figure.fencing",
        "Dance": "figure.dance", "Barre": "figure.barre", "TaiChi": "figure.taichi", "MindAndBody": "figure.mind.and.body",
        "Flexibility": "figure.flexibility", "Cooldown": "figure.cooldown", "JumpRope": "figure.jumprope",
        "StepTraining": "figure.step.training", "Gymnastics": "figure.gymnastics", "TrackAndField": "figure.track.and.field",
        "Archery": "figure.archery", "Bowling": "figure.bowling", "Curling": "figure.curling", "DiscSports": "figure.disc.sports",
        "EquestrianSports": "figure.equestrian.sports", "Fishing": "figure.fishing", "Hunting": "figure.hunting",
        "WaterPolo": "figure.waterpolo", "WaterFitness": "figure.water.fitness", "Handcycle": "figure.hand.cycling",
        "Wheelchair": "figure.roll", "Play": "figure.play", "FitnessGaming": "gamecontroller"
    ]
}

// MARK: - Activity detail

struct ActivityDetailView: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    @State private var detail: ActivityDetail?
    @State private var error: String?
    @State private var feedback = false
    /// Counts closed "Jak to šlo?" sheets, so the row under the numbers reloads.
    @State private var feedbackClosed = 0
    @State private var changingType = false
    @State private var deleting = false
    @State private var editingKcal = false
    /// No source detail to load: the numbers Training lists.
    @State private var basicOnly = false
    /// An Apple Health workout's route, read on the iPhone.
    @State private var localRoute: [ActivityDetail.StreamPoint] = []
    @State private var sharing = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: detail?.activity.name ?? session.title) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    SectionLabel(text: Fmt.weekdayShort(session.date) + " " + Fmt.dayMonth(session.date) + (session.time.map { " · " + ClockText.format($0) } ?? ""))
                    Spacer()
                    if session.status == "done" {
                        CoachPill(subject: .activity(model.liveSession(session))).padding(.trailing, 4)
                    }
                    if session.status == "done", detail != nil {
                        Button { sharing = true } label: {
                            Image(systemName: "square.and.arrow.up").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.muted)
                                .frame(width: 36, height: 32).contentShape(Rectangle())
                        }
                        .accessibilityLabel("Sdílet")
                    }
                    if !model.demo, session.status == "done" {
                        Menu {
                            if typeSource != nil {
                                Button { changingType = true } label: { Label("Změnit typ aktivity", systemImage: "arrow.triangle.2.circlepath") }
                            }
                            Button { editingKcal = true } label: { Label("Upravit kalorie", systemImage: "flame") }
                            Button(role: .destructive) { deleting = true } label: { Label("Smazat aktivitu", systemImage: "trash") }
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.muted)
                                .frame(width: 36, height: 32).contentShape(Rectangle())
                        }
                        .accessibilityLabel("Další volby")
                    }
                }
                .padding(.top, 24)
                Text(detail?.activity.name ?? session.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let origin = detail?.origin { ActivityOriginLine(origin: origin).padding(.top, 8) }
                if let detail {
                    ActivityRouteMap(detail: detail, localRoute: localRoute)
                    ActivityDetailContent(detail: detail, kcal: countedKcal, kcalNote: kcalNote,
                                          compliance: session.plannedId == nil ? nil : AnyView(ActivityComplianceSection(session: session)),
                                          rating: model.demo ? nil : AnyView(FeedbackRow(session: session, reload: feedbackClosed) { feedback = true }),
                                          comparison: comparisonSection)
                    // Device calories that look like a measurement error (src/activity-energy-check.js).
                    if !model.demo { KcalCheck(session: model.liveSession(session), date: session.date) }
                } else if basicOnly {
                    BasicActivityNumbers(session: model.liveSession(session), kcal: countedKcal)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 50)
                }
                // A ride or run done to a plan: its sections kept or sent on.
                if let planned = session.plannedId, session.sport == "ride" || session.sport == "run" {
                    PlannedTemplateButtons(eventId: planned).padding(.top, 28)
                }
            }
        }
        .activityEditing(id: session.id, title: detail?.activity.name ?? session.title, kcal: countedKcal ?? detail?.activity.calories,
                         edited: model.liveSession(session).kcalEdited == true, deleting: $deleting, editingKcal: $editingKcal) { dismiss() }
        .sheet(isPresented: $feedback, onDismiss: { feedbackClosed += 1 }) { FeedbackSheet(session: session) }
        .sheet(isPresented: $sharing) { ShareSheet(source: .activity(model.liveSession(session), withRoute)) }
        .sheet(isPresented: $changingType) {
            ActivityTypeSheet(activityId: session.id, current: detail?.activity.type, source: typeSource) { dismiss() }
        }
        .task { await load() }
    }

    /// "Minule vs dnes" of a ride or run from Intervals.icu (its work intervals).
    private var comparisonSection: AnyView? {
        guard let id = session.activityId, session.sport == "ride" || session.sport == "run" else { return nil }
        return AnyView(ActivityComparisonSection(activityId: id))
    }

    /// Where Změnit typ aktivity goes: Intervals.icu, or the watch's own record
    /// (Google Health, Apple Health, Wahoo), whose change stays in Aurin.
    private var typeSource: String? {
        if session.activityId != nil { return "intervals" }
        if let watch = session.watch, watch.id == session.id { return watch.source }
        return nil
    }

    /// The detail with the iPhone's own route when it has none.
    private var withRoute: ActivityDetail? {
        guard var detail else { return nil }
        if !localRoute.isEmpty, !(detail.streams ?? []).contains(where: { $0.type == "latlng" }) {
            detail.streams = (detail.streams ?? []) + [ActivityDetail.Stream(type: "latlng", points: localRoute)]
        }
        return detail
    }

    /// The calories Aurin counts for it: set in Aurin, the estimate the user
    /// chose for a flagged number, else the device's (the week's copy, fresher
    /// than the detail).
    private var countedKcal: Double? {
        let live = model.liveSession(session)
        if KcalChoiceStore.shared.choice(for: live) == "estimate", let estimate = live.kcalEstimate?.value { return estimate }
        return live.kcal
    }
    /// "upraveno, zařízení 772" under a number set in Aurin.
    private var kcalNote: String? {
        let live = model.liveSession(session)
        if live.kcalEdited == true { return live.kcalDevice.map { L10n.f("upraveno, zařízení %@", Fmt.int($0)) } ?? L10n.tr("upraveno") }
        if KcalChoiceStore.shared.choice(for: live) == "estimate", let device = live.kcal { return L10n.f("odhad, hodinky %@", Fmt.int(device)) }
        return nil
    }

    /// Intervals.icu's detail (with the watch's heart rate and route where it
    /// has none) or the watch (or Wahoo) workout's own; an Apple route from the iPhone.
    private func load() async {
        guard detail == nil else { return }
        if model.demo { error = L10n.tr("V ukázce se detail nenačítá."); return }
        guard session.activityId != nil || session.watch != nil else { basicOnly = true; return }
        let key = session.activityId.map { "intervals:" + $0 } ?? session.watch.map { "watch:" + $0.source + ":" + $0.id }
        // Opened before in this launch: at once, and asked again only when data changed since.
        if let key, let kept = ActivityDetailMemory.values[key] {
            detail = kept.detail
            if kept.revision != model.dataRevision, let fresh = try? await fetch() {
                detail = fresh
                ActivityDetailMemory.keep(fresh, key: key, revision: model.dataRevision)
            }
        } else {
            do {
                detail = try await fetch()
                if let key, let detail { ActivityDetailMemory.keep(detail, key: key, revision: model.dataRevision) }
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        // Apple Health is the route's source when it has one (it stays on the iPhone).
        if let uuid = detail?.watch?.appleUUID { localRoute = await AppleWorkoutRoute.points(workout: uuid) }
    }

    private func fetch() async throws -> ActivityDetail? {
        if let id = session.activityId { return try await model.api.activityDetail(id: id) }
        if let watch = session.watch { return try await model.api.watchDetail(watch) }
        return nil
    }
}

/// Under an activity's name: the logo and name of what recorded it.
struct ActivityOriginLine: View {
    let origin: ActivityDetail.Origin

    var body: some View {
        HStack(spacing: 8) {
            if let logo = origin.logo { IntegrationIcon(id: logo, size: 20) }
            Text(verbatim: origin.name).font(Typo.small).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

/// An activity without a source detail (typed in): time, load and energy.
private struct BasicActivityNumbers: View {
    let session: WeekSession
    var kcal: Double?

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 16) {
            if let m = session.minutes { stat("Čas", Fmt.duration(m)) }
            if let t = session.tss { stat("Zátěž", Fmt.int(t) + " TSS") }
            if let k = kcal { stat("Energie", Fmt.int(k) + " kcal") }
        }
        .padding(.top, 22)
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(verbatim: value).font(Typo.number(24)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

/// Activity details opened in this launch (the last 20), so opening a workout
/// again shows it at once.
@MainActor
enum ActivityDetailMemory {
    static var values: [String: (detail: ActivityDetail, revision: Int, at: Date)] = [:]

    static func keep(_ detail: ActivityDetail, key: String, revision: Int) {
        values[key] = (detail, revision, Date())
        if values.count > 20, let oldest = values.min(by: { $0.value.at < $1.value.at })?.key { values[oldest] = nil }
    }
}

struct ActivityDetailContent: View {
    let detail: ActivityDetail
    /// What Aurin counts, when it differs from the source's number, and why.
    var kcal: Double?
    var kcalNote: String?
    /// "Splnění plánu" of a session done to a plan, right under the numbers.
    var compliance: AnyView?
    /// "Jak to šlo?" under the numbers (and the plan's percent).
    var rating: AnyView?
    /// "Minule vs dnes" under them: the same workout done before.
    var comparison: AnyView?
    /// The minute the finger is on, shared by the power and heart-rate charts.
    @State private var cursor: Double?
    /// The charts' points, made once: dragging the cursor redraws the body every frame.
    private let watts: [StreamChart.Sample]
    private let hr: [StreamChart.Sample]

    init(detail: ActivityDetail, kcal: Double? = nil, kcalNote: String? = nil, compliance: AnyView? = nil, rating: AnyView? = nil, comparison: AnyView? = nil) {
        self.detail = detail
        self.kcal = kcal
        self.kcalNote = kcalNote
        self.compliance = compliance
        self.rating = rating
        self.comparison = comparison
        watts = Self.samples("watts", in: detail)
        hr = Self.samples("heartrate", in: detail)
    }

    var body: some View {
        let a = detail.activity
        VStack(alignment: .leading, spacing: 0) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 16) {
                if let t = a.moving_time { stat("Čas", Fmt.duration(Int(t / 60))) }
                if let d = a.distance, d > 0 { stat("Vzdálenost", Units.distanceText(d / 1000)) }
                if let load = a.icu_training_load { stat("Zátěž", Fmt.int(load) + " TSS") }
                if let w = a.icu_normalized_watts ?? a.average_watts { stat(a.icu_normalized_watts != nil ? "NP" : "Výkon", Fmt.int(w) + " W") }
                if let hr = a.average_heartrate { stat("Prům. tep", Fmt.int(hr) + " bpm") }
                if let hr = a.max_heartrate { stat("Max. tep", Fmt.int(hr) + " bpm") }
                if let i = a.icu_intensity { stat("IF", Fmt.decimal(i > 2 ? i / 100 : i, digits: 2)) }
                if let pace = runPace { stat(L10n.isEnglish ? "Pace" : "Tempo", pace) }
                if let e = a.total_elevation_gain, e > 0 { stat("Převýšení", Fmt.int(e) + " m") }
                if let h = detail.recoveryHours { stat("Regenerace", "\(h) h") }
                if let c = kcal ?? a.calories {
                    VStack(alignment: .leading, spacing: 2) {
                        stat("Energie", Fmt.int(c) + " kcal")
                        if let kcalNote { Text(verbatim: kcalNote).font(Typo.caption).foregroundStyle(Palette.muted) }
                    }
                }
            }
            .padding(.top, 22)
            if let compliance { compliance.padding(.top, 18) }
            if let rating { rating.padding(.top, compliance == nil ? 18 : 12) }
            if let comparison { comparison }

            let span = max(watts.last?.minute ?? 0, hr.last?.minute ?? 0, 1)
            if watts.count > 10 {
                StreamChart(title: "Výkon", unit: "W", color: Palette.amberBar, samples: watts, span: span, floorZero: true, cursor: $cursor)
                    .padding(.top, 22)
            }
            if hr.count > 10 {
                StreamChart(title: "Tep", unit: "bpm", color: Palette.rust, samples: hr, span: span, floorZero: false, cursor: $cursor)
                    .padding(.top, watts.count > 10 ? 12 : 22)
            }

            if let zones = detail.hrZones, !zones.isEmpty {
                zoneHeader("Čas v tepových zónách", Fmt.duration(Int((zones.compactMap(\.seconds).reduce(0, +) / 60).rounded())))
                Card { ZoneList(rows: zoneRows(zones, names: ZoneList.heartNames(zones.count), unit: "bpm"), bars: true) }
                    .padding(.top, 12)
            }
            if let zones = detail.analysis?.zones, zones.contains(where: { ($0.seconds ?? 0) >= 30 }) {
                zoneHeader("Čas ve výkonových zónách", detail.analysis?.ftp.map { "FTP " + Fmt.int($0) + " W" } ?? "")
                Card { ZoneList(rows: zoneRows(zones, names: ZoneList.powerNames, unit: nil).filter { $0.seconds >= 30 }, bars: false) }
                    .padding(.top, 12)
            }

            if let laps = detail.intervals, !laps.isEmpty {
                let hasWatts = laps.contains { $0.watts != nil }, hasHr = laps.contains { $0.hr != nil }
                let showPace = !hasWatts && isRun && laps.contains { ($0.speed ?? 0) > 0 }
                HStack(spacing: 0) {
                    Text("Úsek").frame(maxWidth: .infinity, alignment: .leading)
                    Text("Čas").frame(width: 56, alignment: .trailing)
                    if hasWatts { Text("Výkon").frame(width: 70, alignment: .trailing) }
                    if showPace { Text(L10n.isEnglish ? "Pace" : "Tempo").frame(width: 70, alignment: .trailing) }
                    if hasHr { Text("Tep").frame(width: 48, alignment: .trailing) }
                }
                .font(.system(size: 12, weight: .medium)).tracking(1.2).textCase(.uppercase).foregroundStyle(Palette.muted)
                .padding(.top, 28).padding(.bottom, 8)
                VStack(spacing: 0) {
                    ForEach(Array(laps.prefix(30).enumerated()), id: \.offset) { i, lap in
                        HStack(spacing: 0) {
                            Text(verbatim: lap.label ?? "\(i + 1)").font(.subheadline).foregroundStyle(Palette.ink).lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(verbatim: lap.seconds.map { clock($0) } ?? "").font(Typo.caption).foregroundStyle(Palette.muted)
                                .frame(width: 56, alignment: .trailing)
                            if hasWatts { Text(verbatim: lap.watts.map { Fmt.int($0) + " W" } ?? "").font(Typo.number(17)).frame(width: 70, alignment: .trailing) }
                            if showPace { Text(verbatim: lap.speed.flatMap { $0 > 0 ? Units.paceText(1000 / $0) : nil } ?? "").font(Typo.number(17)).frame(width: 70, alignment: .trailing) }
                            if hasHr { Text(verbatim: lap.hr.map { Fmt.int($0) } ?? "").font(Typo.number(17)).foregroundStyle(Palette.rust).frame(width: 48, alignment: .trailing) }
                        }
                        .padding(.vertical, 10)
                        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    }
                }
            }

            if let hrr = detail.hrr, let drop = hrr.drop {
                StatRow(title: "Zotavení tepu", value: Fmt.int(drop), unit: L10n.f("tepů za %@ s", Fmt.int(hrr.seconds ?? 60)))
                    .padding(.top, 18)
            }
        }
    }

    private var isRun: Bool { (detail.activity.type ?? "").lowercased().contains("run") }

    private var runPace: String? {
        guard isRun, let v = detail.activity.average_speed, v > 0 else { return nil }
        return Units.paceText(1000 / v)
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(verbatim: value).font(Typo.number(22)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
    }

    private func zoneHeader(_ title: String, _ trailing: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            SectionLabel(text: title)
            Spacer()
            Text(verbatim: trailing).font(Typo.caption).foregroundStyle(Palette.faint)
        }
        .padding(.top, 28)
    }

    private func zoneRows(_ zones: [ActivityDetail.Zone], names: [String], unit: String?) -> [ZoneList.Row] {
        let total = max(zones.compactMap(\.seconds).reduce(0, +), 1)
        return zones.enumerated().map { i, z in
            var range: String? = nil
            if let unit {
                if let lo = z.min, let hi = z.max { range = Fmt.int(lo) + "–" + Fmt.int(hi) + " " + unit }
                else if let hi = z.max { range = "< " + Fmt.int(hi + 1) + " " + unit }
                else if let lo = z.min { range = Fmt.int(lo) + "+ " + unit }
            }
            let seconds = z.seconds ?? 0
            return ZoneList.Row(id: i, name: i < names.count ? names[i] : "Z\(i + 1)", range: range, seconds: seconds, percent: z.percent ?? seconds / total * 100)
        }
    }

    /// About 240 averaged points with their minute, enough for a phone-wide line.
    private static func samples(_ type: String, in detail: ActivityDetail) -> [StreamChart.Sample] {
        let points = (detail.streams?.first { $0.type == type }?.points ?? []).filter { $0.v != nil }
        let step = max(1, points.count / 240)
        return stride(from: 0, to: points.count, by: step).map { i in
            let slice = points[i..<min(points.count, i + step)]
            let sum = slice.reduce(0.0) { $0 + ($1.v ?? 0) }
            return StreamChart.Sample(id: i, minute: slice.first!.t / 60, value: sum / Double(slice.count))
        }
    }

    /// 600 → "10:00", 3725 → "1:02:05".
    private func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s % 3600 / 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// Power or heart rate over the ride with minutes and values on the axes. Hold
/// and drag a finger to read the value at that moment; the cursor is shared
/// with the other chart of the same activity.
struct StreamChart: View {
    struct Sample: Identifiable {
        let id: Int
        let minute: Double
        let value: Double
    }

    let title: String
    let unit: String
    let color: Color
    let samples: [Sample]
    let span: Double
    let floorZero: Bool
    @Binding var cursor: Double?

    var body: some View {
        let values = samples.map(\.value)
        let average = values.reduce(0, +) / Double(max(values.count, 1))
        let top = values.max() ?? 1, bottom = values.min() ?? 0
        let lo = floorZero ? 0 : max(0, (bottom - 8).rounded(.down))
        let hi = floorZero ? top * 1.05 : top + 5
        let picked: Sample? = cursor.flatMap { c in samples.min { abs($0.minute - c) < abs($1.minute - c) } }

        Card {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(Typo.bodyStrong).foregroundStyle(color)
                Spacer()
                if let picked {
                    Text(verbatim: Self.clock(picked.minute) + "   " + Fmt.int(picked.value) + " " + unit)
                        .font(Typo.number(17)).foregroundStyle(Palette.ink)
                } else {
                    Text(verbatim: L10n.tr("prům.") + " " + Fmt.int(average) + " " + unit).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            Chart {
                ForEach(samples) { s in
                    AreaMark(x: .value("Minuta", s.minute), yStart: .value("Spodek", lo), yEnd: .value(title, s.value))
                        .foregroundStyle(color.opacity(0.12))
                    LineMark(x: .value("Minuta", s.minute), y: .value(title, s.value))
                        .foregroundStyle(color)
                        .lineStyle(StrokeStyle(lineWidth: 1.4, lineJoin: .round))
                }
                if let picked {
                    RuleMark(x: .value("Minuta", picked.minute)).foregroundStyle(Palette.faint.opacity(0.6))
                    PointMark(x: .value("Minuta", picked.minute), y: .value(title, picked.value))
                        .foregroundStyle(color).symbolSize(40)
                }
            }
            .chartXScale(domain: 0...span)
            .chartYScale(domain: lo...max(hi, lo + 1))
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                    AxisGridLine().foregroundStyle(Palette.hairline)
                    AxisValueLabel().foregroundStyle(Palette.faint)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                    AxisGridLine().foregroundStyle(Palette.hairline)
                    AxisValueLabel().foregroundStyle(Palette.faint)
                }
            }
            .chartXSelection(value: $cursor)
            .frame(height: 150)
            Text("min").font(Typo.tiny).foregroundStyle(Palette.faint).frame(maxWidth: .infinity, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: L10n.tr(title) + ", " + L10n.tr("prům.") + " " + Fmt.int(average) + " " + unit))
    }

    /// 31.5 → "31:30".
    static func clock(_ minute: Double) -> String {
        let s = Int((minute * 60).rounded())
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s % 3600 / 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}

/// Time in each zone on its own row: the zone, its range, minutes and share.
struct ZoneList: View {
    struct Row: Identifiable {
        let id: Int
        let name: String
        let range: String?
        let seconds: Double
        let percent: Double
    }

    let rows: [Row]
    var bars = true

    static let powerNames = ["Regenerace", "Vytrvalost", "Tempo", "Práh", "VO2max", "Anaerobní", "Neuromuskulární"]

    static func heartNames(_ count: Int) -> [String] {
        count >= 7 ? ["Regenerace", "Vytrvalost", "Tempo", "Pod prahem", "Nad prahem", "VO2max", "Anaerobní"]
            : ["Regenerace", "Vytrvalost", "Tempo", "Práh", "VO2max", "Anaerobní"]
    }

    static func color(_ i: Int) -> Color {
        let colors = [Palette.sand, Palette.green.opacity(0.5), Palette.amberBar.opacity(0.6), Palette.amberBar, Palette.rust, Palette.indigo, Palette.ink]
        return colors[min(i, colors.count - 1)]
    }

    var body: some View {
        let top = max(rows.map(\.percent).max() ?? 1, 1)
        VStack(spacing: 0) {
            ForEach(rows) { r in
                VStack(spacing: 10) {
                    HStack(spacing: 12) {
                        Text(verbatim: "Z\(r.id + 1)").font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(r.id >= 3 ? Palette.onAccent : Palette.ink)
                            .frame(width: 30, height: 30)
                            .background(Self.color(r.id), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(LocalizedStringKey(r.name)).font(.body).foregroundStyle(Palette.ink)
                            if let range = r.range { Text(verbatim: range).font(Typo.caption).foregroundStyle(Palette.muted) }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(verbatim: Fmt.duration(Int((r.seconds / 60).rounded()))).font(Typo.number(20)).foregroundStyle(Palette.ink)
                            if bars { Text(verbatim: Fmt.int(r.percent) + " %").font(Typo.caption).foregroundStyle(Palette.muted) }
                        }
                    }
                    if bars {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Palette.track)
                                Capsule().fill(Self.color(r.id)).frame(width: max(4, geo.size.width * r.percent / top))
                            }
                        }
                        .frame(height: 7)
                    }
                }
                .padding(.vertical, 11)
                .overlay(alignment: .top) { if r.id != rows.first?.id { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: - Planned session

struct PlannedWorkoutView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let session: WeekSession
    @State private var plan: PlannedWorkout?
    @State private var moveDate = Date()
    @State private var moving = false
    @State private var working = false
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var rating = false
    @State private var ratingClosed = 0
    /// The time of day set here (Čas): .some(nil) after "Bez času".
    @State private var timeSet: String??
    @State private var pickingTime = false

    private var libraryId: String? { plan?.source == "library" ? plan?.workout.id?.string : nil }

    /// Today's or a past session can be rated: it may be done without being paired yet.
    private var ratable: Bool { session.date <= AppModel.localDate(Date()) && !model.demo }

    private var shownTime: String? { timeSet ?? session.time }

    /// A session still ahead on the calendar can get a time of day of its own,
    /// optional (Oznámení → Trénink reminds an hour before it).
    private var timeEditable: Bool { session.eventId != nil && PlanSessionActions.upcoming(session) && !model.demo }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: session.title) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    SectionLabel(text: Fmt.capitalized(Fmt.relativeDay(session.date, today: AppModel.localDate(Date()))) + (shownTime.map { " · " + ClockText.format($0) } ?? ""))
                    Spacer()
                    if session.status != "done" { CoachPill(subject: .planned(session)) }
                }
                .padding(.top, 24)
                Text(session.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                HStack(spacing: 18) {
                    if let m = session.minutes { meta("Délka", Fmt.duration(m)) }
                    if let t = session.tss { meta("Zátěž", Fmt.int(t) + " TSS") }
                    if let f = plan?.workout.intensity_factor { meta("IF", Fmt.decimal(f, digits: 2)) }
                    if timeEditable { timeMeta }
                }
                .padding(.top, 16)
                if let heat = plan?.heat { HeatLine(text: heat).padding(.top, 14) }
                if ratable {
                    FeedbackRow(session: session, workoutId: libraryId, reload: ratingClosed) { rating = true }.padding(.top, 16)
                }
                if let blocks = plan?.workout.steps, !WorkoutProfile.segments(blocks).isEmpty, session.sport == "ride" || session.sport == "run" {
                    Card { WorkoutProfile(blocks: blocks, sport: session.sport) }.padding(.top, 16)
                }
                if let description = plan?.workout.description, !description.isEmpty {
                    Text(description).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true).padding(.top, 14)
                }
                if let blocks = plan?.workout.steps, !blocks.isEmpty {
                    SectionLabel(text: "Průběh").padding(.top, 26)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                            StepBlockRow(block: block)
                        }
                    }
                    .padding(.top, 10)
                    if let workout = plan?.workout, session.sport == "ride" || session.sport == "run", !model.demo {
                        WatchWorkoutButton(workout: workout, title: session.title).padding(.top, 18)
                    }
                    if let id = session.eventId, session.sport == "ride" || session.sport == "run" {
                        PlannedTemplateButtons(eventId: id, date: session.date).padding(.top, 10)
                    }
                }

                if session.sport == "strength", session.date == AppModel.localDate(Date()), !model.demo {
                    NavigationLink(value: AppRoute.trainingMode(session.date)) {
                        Label("Začít trénink", systemImage: "play.fill")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                            .frame(maxWidth: .infinity).frame(height: 54)
                            .background(Palette.green, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 28)
                }

                SectionLabel(text: "Změnit").padding(.top, 30)
                VStack(spacing: 10) {
                    if moving {
                        DatePicker("Nový den", selection: $moveDate, in: Date()..., displayedComponents: .date)
                            .environment(\.locale, Fmt.locale)
                        Button { Task { await move() } } label: { action("Přesunout na tento den", filled: true) }
                    } else {
                        Button { moving = true } label: { action("Přesunout na jiný den", filled: false) }
                    }
                    if session.sport == "ride" || session.sport == "run" {
                        HStack(spacing: 10) {
                            Button { Task { await environment(indoor: true) } } label: { action("Uvnitř", filled: false) }
                            Button { Task { await environment(indoor: false) } } label: { action("Venku", filled: false) }
                        }
                    }
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Text("Smazat z plánu").font(Typo.bodyStrong).foregroundStyle(Palette.rust).frame(maxWidth: .infinity).frame(height: 46)
                    }
                }
                .disabled(working || model.demo)
                .padding(.top, 10)
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8) }
            }
        }
        .sheet(isPresented: $rating, onDismiss: { ratingClosed += 1 }) { FeedbackSheet(session: session, workoutId: libraryId) }
        .sheet(isPresented: $pickingTime) { PlannedTimeSheet(initial: shownTime) { await saveTime($0) } }
        .confirmationDialog("Smazat „\(session.title)“ z plánu?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Zmizí i z kalendáře v Intervals.icu.")
        }
        .task {
            guard let id = session.eventId, !model.demo, plan == nil else { return }
            let today = session.date == AppModel.localDate(Date())
            plan = try? await model.api.plannedWorkout(eventId: id, date: today ? session.date : nil, time: today ? shownTime : nil)
        }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
    }

    /// "Čas": the session's time, or "+ přidat" while it has none.
    private var timeMeta: some View {
        Button { pickingTime = true } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("Čas").font(Typo.caption).foregroundStyle(Palette.muted)
                if let time = shownTime {
                    Text(verbatim: ClockText.format(time)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                } else {
                    Label("přidat", systemImage: "plus")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.amber)
                        .frame(minHeight: 28)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(working)
    }

    /// value "" leaves the day without a time. The screen stays open.
    private func saveTime(_ value: String) async -> Bool {
        guard let id = session.eventId else { return false }
        do {
            let _: PlannedChange = try await model.api.reschedulePlanned(eventId: id, to: session.date, time: value)
            timeSet = .some(value.isEmpty ? nil : value)
            error = nil
            await model.refreshTraining()
            await model.refresh()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    private func action(_ title: String, filled: Bool) -> some View {
        Text(title).font(Typo.bodyStrong).foregroundStyle(filled ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 46)
            .background(filled ? Palette.button : .clear, in: Capsule())
            .overlay(Capsule().stroke(Palette.ink.opacity(filled ? 0 : 0.2), lineWidth: 1))
    }

    private func run(_ work: () async throws -> Void) async {
        working = true
        defer { working = false }
        do {
            try await work()
            await model.refreshTraining()
            await model.refresh()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func move() async {
        guard let id = session.eventId else { return }
        await run { try await model.api.movePlanned(eventId: id, to: AppModel.localDate(moveDate)) }
    }

    /// Gone from the screen now, from the server after "Zpět" had its 6 s.
    private func delete() async {
        guard let id = session.eventId else { return }
        let model = model
        model.deleteLater(L10n.tr("Trénink smazán"), hide: id) {
            do { try await model.api.deletePlanned(eventId: id) } catch { model.notice = error.localizedDescription }
            await model.refreshTraining()
            await model.refresh()
        }
        dismiss()
    }

    private func environment(indoor: Bool) async {
        guard let id = session.eventId else { return }
        await run { try await model.api.setPlannedEnvironment(eventId: id, indoor: indoor) }
    }
}

/// "Čas tréninku": a wheel for the planned session's time of day; "Bez času"
/// takes a time set earlier off. Empty until the athlete picks one.
struct PlannedTimeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let initial: String?
    /// "HH:MM", or "" for no time; true when the server took it.
    let onSave: (String) async -> Bool
    @State private var picked: Date
    @State private var busy = false

    init(initial: String?, onSave: @escaping (String) async -> Bool) {
        self.initial = initial
        self.onSave = onSave
        let parts = (initial ?? "17:00").split(separator: ":").compactMap { Int($0) }
        let hour = parts.first ?? 17, minute = parts.count > 1 ? parts[1] : 0
        _picked = State(initialValue: Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date())
    }

    private var clock: String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: picked)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    var body: some View {
        VStack(spacing: 0) {
            Text("Čas tréninku").font(Typo.bodyStrong).foregroundStyle(Palette.ink).padding(.top, 8)
            DatePicker("", selection: $picked, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: .infinity)
                .environment(\.locale, Fmt.locale)
            PrimaryButton(title: L10n.f("Uložit %@", ClockText.format(clock)), busy: busy) { save(clock) }
            if initial != nil {
                Button { save("") } label: {
                    Text("Bez času").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).frame(height: 46)
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.background)
    }

    private func save(_ value: String) {
        Task {
            busy = true
            let saved = await onSave(value)
            busy = false
            if saved { dismiss() }
        }
    }
}

/// "3× · 12 min 88–94 %" for one block of a structured workout.
struct StepBlockRow: View {
    let block: PlannedWorkout.Block

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text((block.repeats ?? 1) > 1 ? "\(block.repeats!)×" : "·").font(Typo.number(18)).foregroundStyle(Palette.amber).frame(width: 30, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array((block.steps ?? []).enumerated()), id: \.offset) { _, step in
                    Text(describe(step)).font(Typo.small).foregroundStyle(Palette.secondary)
                }
                if let note = block.note { Text(note).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
        }
    }

    private func describe(_ s: PlannedWorkout.Step) -> String {
        var parts: [String] = []
        if let d = s.durationSeconds { parts.append(d >= 60 ? Fmt.duration(Int(d / 60)) : Fmt.int(d) + " s") }
        if let lo = s.wattsLow, let hi = s.wattsHigh { parts.append(Fmt.int(lo) + "–" + Fmt.int(hi) + " W") }
        else if let lo = s.percentLow, let hi = s.percentHigh { parts.append(Fmt.int(lo) + "–" + Fmt.int(hi) + " %") }
        if let slow = s.paceSlow, let fast = s.paceFast { parts.append(ZonesSettingsView.pace(Units.pace(fast)) + "–" + ZonesSettingsView.pace(Units.pace(slow)) + " " + Units.paceUnit) }
        if let note = s.note { parts.append(note) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Feedback and manual entry

/// "Jak to šlo?": RPE 1–10 and a note. A library workout from the calendar is
/// rated through /app/api/workouts/feedback (paired with its activity, the RPE
/// written to Intervals.icu, the coach asked in the background); any other
/// session goes to the coach directly (/app/api/coach/reflections). The
/// coach's note on the session shows under the form. Below the note: how well
/// the generated workout fitted (/app/api/feedback/workout), for any sport.
struct FeedbackSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let session: WeekSession
    /// The library workout of a planned session, when its plan names one.
    var workoutId: String? = nil
    @State private var rpe = 6.0
    @State private var notes = ""
    @State private var link: ScheduledWorkout?
    @State private var reflection: CoachReflection?
    @State private var known = 0
    @State private var loading = true
    @State private var saving = false
    @State private var saved = false
    @State private var waiting = false
    @State private var status: String?
    @State private var error: String?
    @State private var fit: String?
    @State private var fitText = ""

    /// The library workout and its calendar day, when the session has one.
    private var target: (id: String, date: String)? {
        if let link, !link.workoutId.isEmpty { return (link.workoutId, link.scheduledDate) }
        if let workoutId, !workoutId.isEmpty { return (workoutId, session.date) }
        return nil
    }

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 16) {
                Text("Jak to šlo?").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                Text(session.title).font(Typo.small).foregroundStyle(Palette.muted)
                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                } else {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Náročnost").font(.body)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(Int(rpe)) / 10").font(Typo.number(24))
                            Text(Self.effortWord(Int(rpe))).font(Typo.small.weight(.medium)).foregroundStyle(Palette.amber)
                        }
                    }
                    VStack(spacing: 4) {
                        Slider(value: $rpe, in: 1...10, step: 1).tint(Palette.amberBar).disabled(saved)
                        HStack {
                            Text(verbatim: L10n.isEnglish ? "Easy" : "Lehké")
                            Spacer()
                            Text(verbatim: L10n.isEnglish ? "Very hard" : "Velmi těžké")
                        }
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    TextField("Poznámka pro trenéra (nohy těžké, spal jsem málo…)", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                        .padding(12)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .disabled(saved)
                    Text("Sedělo ti sestavení tréninku?").font(.body).padding(.top, 4)
                    PlanFitPicker(rating: $fit).disabled(saved)
                    if fit != nil {
                        TextField("Co nesedělo? (nepovinné)", text: $fitText, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(12)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .disabled(saved)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                    if let status { Text(status).font(Typo.small).foregroundStyle(Palette.muted) }
                    if saved {
                        PrimaryButton(title: "Hotovo") { dismiss() }
                    } else {
                        PrimaryButton(title: saving ? "Ukládám…" : "Uložit", busy: saving) { Task { await save() } }
                            .disabled(saving)
                    }
                    coachNote
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .task { await load() }
    }

    @ViewBuilder private var coachNote: some View {
        if waiting {
            HStack(spacing: 10) {
                ProgressView()
                Text("Trenér píše zpětnou vazbu…").font(Typo.small).foregroundStyle(Palette.muted)
            }
            .padding(.top, 8)
        } else if let text = reflection?.text {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Trenér")
                CoachMarkdown(text: text)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .padding(.top, 8)
        }
    }

    /// The calendar link (with a rating saved before) and the coach's notes on the day.
    private func load() async {
        defer { loading = false }
        guard !model.demo else { return }
        let api = model.api, date = session.date
        async let links = try? api.scheduledWorkouts()
        async let notesOfDay = try? api.coachReflections(date: date)
        async let ratingsOfDay = try? api.workoutRatings(date: date)
        let allLinks: [ScheduledWorkout] = (await links) ?? []
        let reflections: [CoachReflection] = (await notesOfDay) ?? []
        let ratings: [WorkoutRating] = (await ratingsOfDay) ?? []
        if let own = ratings.first(where: { $0.sessionId == session.id }) {
            fit = own.rating
            fitText = own.text ?? ""
        }
        link = ScheduledWorkout.link(for: session, in: allLinks)
        known = reflections.count
        let id = target?.id
        reflection = reflections.first(where: { id != nil && $0.workoutId == id }) ?? reflections.first
        if let r = link?.feedbackRpe ?? reflection?.rpe { rpe = min(10, max(1, r.rounded())) }
        if let n = reflection?.notes?.nilIfBlank { notes = n }
    }

    private func save() async {
        if model.demo { dismiss(); return }
        saving = true
        error = nil
        defer { saving = false }
        let text = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let fit {
                try await model.api.rateWorkout(date: session.date, sessionId: session.id, sport: session.sport, rating: fit,
                                                text: fitText.trimmingCharacters(in: .whitespacesAndNewlines))
            }
            if let target, link?.rated != true {
                do {
                    // A session kept only in the app has no activity: its planned length counts.
                    let minutes: Int? = link?.local == true ? (session.minutes ?? link?.durationMinutes.map { Int($0) }) : nil
                    let result = try await model.api.workoutFeedback(workoutId: target.id, scheduledDate: target.date, rpe: Int(rpe), notes: text, minutes: minutes)
                    saved = true
                    status = Self.intervalsText(result.intervals)
                    await model.refreshTraining()
                    if result.reflection == "pending" { await awaitReflection(date: target.date) }
                    return
                } catch where session.kind == "activity" {
                    // The plan did not pair with this activity: the note still goes to the coach.
                }
            }
            if let note = try await model.api.coachReflection(date: session.date, rpe: Int(rpe), notes: text) { reflection = note }
            saved = true
            await model.refreshTraining()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The coach writes in the background: the day's notes are asked again for a while.
    private func awaitReflection(date: String) async {
        waiting = true
        defer { waiting = false }
        for _ in 0..<8 {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if Task.isCancelled { return }
            if let list = try? await model.api.coachReflections(date: date), list.count > known, let newest = list.first {
                reflection = newest
                return
            }
        }
    }

    /// What each step of the effort scale (RPE, Borg CR10) means.
    /// Both languages written here: the same Czech words mean other things elsewhere in the app.
    static func effortWord(_ rpe: Int) -> String {
        let words = L10n.isEnglish
            ? ["Very easy", "Easy", "Comfortable", "Moderate", "Somewhat hard", "Hard",
               "Very hard", "Really hard", "Near max", "Max effort"]
            : ["Velmi lehké", "Lehké", "Pohodové", "Mírně náročné", "Střední", "Náročné",
               "Hodně náročné", "Velmi těžké", "Na hraně", "Maximum"]
        return words[min(10, max(1, rpe)) - 1]
    }

    static func intervalsText(_ intervals: WorkoutFeedbackResult.Intervals?) -> String? {
        switch intervals?.status {
        case "ok": return L10n.tr("RPE je uložené i v Intervals.icu.")
        case "error": return L10n.f("RPE je uložené, zápis do Intervals.icu selhal: %@", intervals?.message ?? "")
        default: return nil
        }
    }
}

/// A session typed in by hand: done today or before, or planned ahead.
/// Zapsat trénink: a workout already done. The length from the sport's
/// presets, the day and when it ended (now unless moved); the heart rate and
/// calories of that window come from Apple or Google Health.
struct ManualWorkoutSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var sport = "gym"
    @State private var minutes = 60
    @State private var day = Date()
    @State private var end = Date()
    @State private var endMoved = false
    @State private var pickingEnd = false
    @State private var heart: WindowHeartRate?
    @State private var watch: WatchMatch?
    @State private var pair = true
    @State private var rpe = 6.0
    @State private var saving = false
    @State private var error: String?

    static let presets: [String: [Int]] = ["gym": [30, 45, 60, 75, 90], "ride": [60, 90, 120, 180, 240], "run": [20, 30, 45, 60, 90]]
    private static let defaults: [String: Int] = ["gym": 60, "ride": 90, "run": 45]

    /// The day's date with the end's clock time; today and not moved means now.
    private var endAt: Date {
        let calendar = Calendar.current
        let clock = calendar.dateComponents([.hour, .minute], from: endMoved ? end : Date())
        let at = calendar.date(bySettingHour: clock.hour ?? 0, minute: clock.minute ?? 0, second: 0, of: day) ?? day
        return min(at, Date())
    }
    private var startAt: Date { endAt.addingTimeInterval(-Double(minutes) * 60) }
    private var windowKey: String { "\(sport)|\(minutes)|\(Int(endAt.timeIntervalSince1970 / 60))" }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Zapsat trénink") {
                sportTiles
                lengthChips
                SettingsGroup {
                    DatePicker("Den", selection: $day, in: ...Date(), displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16).frame(minHeight: 50)
                    SettingsDivider()
                    endRow
                }
                watchCard
                heartCard
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await save() } } label: { Text(saving ? "Ukládám…" : "Uložit").bold() }.disabled(saving)
                }
            }
            .task(id: windowKey) { await loadHeart() }
        }
        .tint(Palette.ink)
    }

    private var sportTiles: some View {
        HStack(spacing: 8) {
            sportTile("ride", "Kolo", "figure.outdoor.cycle")
            sportTile("run", "Běh", "figure.run")
            sportTile("gym", "Posilovna", "dumbbell.fill")
        }
    }

    private func sportTile(_ id: String, _ title: String, _ symbol: String) -> some View {
        let on = sport == id
        return Button {
            sport = id
            minutes = Self.defaults[id] ?? 60
        } label: {
            VStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 17, weight: .semibold))
                Text(title).font(Typo.small).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 64)
            .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var lengthChips: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Délka").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.secondary).padding(.horizontal, 4)
            HStack(spacing: 6) {
                ForEach(Self.presets[sport] ?? [], id: \.self) { value in lengthChip(value) }
            }
        }
    }

    private func lengthChip(_ value: Int) -> some View {
        let on = minutes == value
        return Button { minutes = value } label: {
            Text("\(value)").font(Typo.bodyStrong).monospacedDigit()
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(on ? Palette.button : Palette.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("\(value) min"))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    @ViewBuilder private var endRow: some View {
        Button {
            if !endMoved { end = endAt }
            withAnimation(.snappy) { pickingEnd.toggle() }
        } label: {
            HStack {
                Text("Skončil").foregroundStyle(Palette.ink)
                Spacer()
                Text(endMoved ? endAt.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(Fmt.locale)) : L10n.tr("Právě teď"))
                    .foregroundStyle(pickingEnd ? Palette.amber : Palette.muted)
            }
            .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if pickingEnd {
            DatePicker("Skončil", selection: Binding(get: { end }, set: { end = $0; endMoved = true }), displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel).labelsHidden()
                .environment(\.locale, Fmt.locale)
                .frame(maxWidth: .infinity)
        }
    }

    /// The watch already recorded this workout: pair with it, not twice.
    @ViewBuilder private var watchCard: some View {
        if let watch {
            SettingsGroup {
                Toggle(isOn: $pair) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Spárovat se záznamem z hodinek").foregroundStyle(Palette.ink)
                        Text(verbatim: watchText(watch)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                .tint(Palette.green)
                .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 50)
            }
        }
    }

    private func watchText(_ watch: WatchMatch) -> String {
        let style = Date.FormatStyle(date: .omitted, time: .shortened).locale(Fmt.locale)
        let f = ISO8601DateFormatter()
        guard let a = watch.start.flatMap({ f.date(from: $0) }), let b = watch.end.flatMap({ f.date(from: $0) }) else { return watch.name ?? "" }
        return [watch.name, a.formatted(style) + "–" + b.formatted(style)].compactMap { $0 }.joined(separator: " · ")
    }

    @ViewBuilder private var heartCard: some View {
        if let heart, heart.avgHr != nil {
            VStack(alignment: .leading, spacing: 10) {
                Label("Tep během tréninku", systemImage: "heart").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .symbolRenderingMode(.monochrome)
                HStack(alignment: .firstTextBaseline, spacing: 24) {
                    heartValue("Prům. tep", heart.avgHr)
                    heartValue("Max.", heart.maxHr)
                    heartValue("Kalorie", heart.kcal)
                }
                Text(windowText).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            // No watch on: how hard it felt stands in for the heart rate.
            SettingsGroup(title: "Náročnost") {
                HStack {
                    Slider(value: $rpe, in: 1...10, step: 1).tint(Palette.amberBar)
                    Text("\(Int(rpe))").font(Typo.number(22)).frame(width: 30)
                }
                .padding(.horizontal, 16).frame(minHeight: 50)
            }
        }
    }

    private func heartValue(_ title: String, _ value: Int?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value.map(String.init) ?? "–").font(Typo.number(24)).foregroundStyle(Palette.ink)
        }
    }

    private var windowText: String {
        let style = Date.FormatStyle(date: .omitted, time: .shortened).locale(Fmt.locale)
        return L10n.f("Tep z %@", startAt.formatted(style) + "–" + endAt.formatted(style))
    }

    private func loadHeart() async {
        if model.demo { heart = WindowHeartRate(avgHr: 118, maxHr: 156, kcal: 410); return }
        try? await Task.sleep(for: .milliseconds(250))
        if Task.isCancelled { return }
        let found = await WorkoutHeartRate.window(start: startAt, end: endAt, api: model.api, appleHealth: AppleHealth.shared.enabled)
        if Task.isCancelled { return }
        heart = found.heart
        if found.watch?.key != watch?.key { pair = true }
        watch = found.watch
    }

    private func save() async {
        if model.demo { dismiss(); return }
        saving = true
        defer { saving = false }
        let title = L10n.tr(sport == "ride" ? "Jízda" : sport == "run" ? "Běh" : "Posilovna")
        let start = startAt, date = AppModel.localDate(start)
        let measured = heart?.avgHr != nil ? heart : nil
        let effort = measured == nil ? Int(rpe) : nil
        let pairWith = pair ? watch?.key : nil
        do {
            let result = try await model.api.manualWorkout(name: title, date: date, sport: sport, minutes: minutes, completed: true, rpe: effort, notes: "",
                                                           start: start, heart: measured, pairWith: pairWith)
            // Paired: the watch put it in Apple or Google Health already.
            if pairWith != nil {
                await model.refreshTraining()
                dismiss()
                return
            }
            // Done: to the apps chosen in Zdroje dat (Aurin posílá) (the server sent its part already).
            let activity = ActivityToSync(key: result.activityKey ?? "manual:" + UUID().uuidString, sport: sport, name: title, date: date,
                                          start: start, minutes: minutes, notes: "", rpe: effort)
            await model.shareActivity(activity, sends: result.sends ?? [])
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
