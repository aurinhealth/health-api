import Charts
import SwiftUI

// MARK: - The week's sessions

/// Training → Tento týden: every session of the week, tap for its detail.
struct WeekSessionsList: View {
    @Environment(AppModel.self) private var model
    let sessions: [WeekSession]
    let today: String
    @State private var changing: WeekSession?
    @State private var cancelling: WeekSession?
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(sessions.enumerated()), id: \.element.id) { index, session in
                HStack(spacing: 0) {
                    NavigationLink(value: Self.destination(session)) {
                        SessionRow(session: session, today: today)
                    }
                    .buttonStyle(.plain)
                    .disabled(Self.destination(session) == nil)
                    let changeable = GymPlanActions.changeable(session)
                    let candidates = pairCandidates(session)
                    if (changeable || !candidates.isEmpty || session.plannedId != nil) && !model.demo {
                        Menu {
                            if changeable {
                                Button { changing = session } label: { Label("Změnit trénink", systemImage: "calendar") }
                            }
                            // When the automatic pairing missed it: the activity that fulfilled this plan.
                            if !candidates.isEmpty {
                                Menu {
                                    ForEach(candidates) { activity in
                                        Button(activity.title + (activity.time.map { " · " + $0 } ?? "")) {
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
                            // A missed session leaves the list in one step.
                            if changeable && session.status == "missed" {
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
                if index < sessions.count - 1 { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 8) }
        }
        .sheet(item: $changing) { s in
            GymPlanActionsSheet(date: s.date, title: s.title, eventId: s.eventId)
        }
        .confirmationDialog("Zrušit trénink?", isPresented: Binding(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } }),
                            titleVisibility: .visible, presenting: cancelling) { s in
            Button("Zrušit trénink", role: .destructive) { Task { await cancel(s) } }
        } message: { s in
            Text(verbatim: s.title + " · " + Fmt.weekdayShort(s.date) + " " + Fmt.dayMonth(s.date))
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
            await model.refreshTraining()
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func cancel(_ s: WeekSession) async {
        do {
            try await GymPlanActions.cancel(model, date: s.date, eventId: s.eventId)
            error = nil
            await model.refreshTraining()
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Where a session opens (also Today → Plán dne).
    static func destination(_ s: WeekSession) -> AppRoute? {
        if s.kind == "gym" || (s.sport == "strength" && s.status != "done") { return .gym(s.date) }
        if s.kind == "activity" { return s.activityId != nil ? .activity(s) : nil }
        if s.kind == "planned", s.eventId != nil { return .planned(s) }
        return nil
    }
}

struct SessionRow: View {
    let session: WeekSession
    let today: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: SportIcon.symbol(session.sport))
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(session.status == "done" ? Palette.onButton : Palette.ink)
                .frame(width: 36, height: 36)
                .background(session.status == "done" ? Palette.amberBar : Palette.track, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title).font(.subheadline.weight(.medium)).foregroundStyle(session.status == "missed" ? Palette.muted : Palette.ink).lineLimit(1)
                Text(subtitle).font(Typo.caption).foregroundStyle(session.status == "missed" ? Palette.rust : Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let tss = session.tss, tss > 0 {
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
        if let t = session.time { parts.append(t) }
        if let m = session.minutes { parts.append(Fmt.duration(m)) }
        if session.status == "missed" { parts.append(L10n.tr("nesplněno")) }
        if session.status == "done" { parts.append(L10n.tr("hotovo")) }
        return parts.joined(separator: " · ")
    }
}

enum SportIcon {
    static func symbol(_ sport: String) -> String {
        switch sport {
        case "ride": return "figure.outdoor.cycle"
        case "run": return "figure.run"
        case "strength": return "dumbbell.fill"
        case "swim": return "figure.pool.swim"
        case "walk": return "figure.walk"
        default: return "figure.mixed.cardio"
        }
    }
}

// MARK: - Activity detail

struct ActivityDetailView: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    @State private var detail: ActivityDetail?
    @State private var error: String?
    @State private var feedback = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: Fmt.weekdayShort(session.date) + " " + Fmt.dayMonth(session.date) + (session.time.map { " · " + $0 } ?? "")).padding(.top, 24)
                Text(detail?.activity.name ?? session.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let detail {
                    ActivityDetailContent(detail: detail)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 50)
                    Text("Detail se načítá z Intervals.icu.").font(Typo.caption).foregroundStyle(Palette.faint).frame(maxWidth: .infinity)
                }
                Button { feedback = true } label: {
                    Label("Jak to šlo?", systemImage: "text.bubble")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
                .padding(.top, 28)
            }
        }
        .sheet(isPresented: $feedback) { FeedbackSheet(session: session) }
        .task {
            guard detail == nil, let id = session.activityId, !model.demo else {
                if model.demo { error = "V ukázce se detail nenačítá." }
                return
            }
            do { detail = try await model.api.activityDetail(id: id) } catch { self.error = error.localizedDescription }
        }
    }
}

struct ActivityDetailContent: View {
    let detail: ActivityDetail
    /// The minute the finger is on, shared by the power and heart-rate charts.
    @State private var cursor: Double?

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
                if let c = a.calories { stat("Energie", Fmt.int(c) + " kcal") }
            }
            .padding(.top, 22)

            let watts = samples("watts"), hr = samples("heartrate")
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
            Text(LocalizedStringKey(title)).font(Typo.caption).foregroundStyle(Palette.muted)
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
    private func samples(_ type: String) -> [StreamChart.Sample] {
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
                Text(LocalizedStringKey(title)).font(Typo.bodyStrong).foregroundStyle(color)
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

    /// Today's or a past session can be rated: it may be done without being paired yet.
    private var ratable: Bool { session.date <= AppModel.localDate(Date()) && !model.demo }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: Fmt.capitalized(Fmt.relativeDay(session.date, today: AppModel.localDate(Date()))) + (session.time.map { " · " + $0 } ?? "")).padding(.top, 24)
                Text(session.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                HStack(spacing: 18) {
                    if let m = session.minutes { meta("Délka", Fmt.duration(m)) }
                    if let t = session.tss { meta("Zátěž", Fmt.int(t) + " TSS") }
                    if let f = plan?.workout.intensity_factor { meta("IF", Fmt.decimal(f, digits: 2)) }
                }
                .padding(.top, 16)
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
                }

                if ratable {
                    Button { rating = true } label: {
                        Label("Ohodnotit", systemImage: "text.bubble")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Palette.button, in: Capsule())
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
        .sheet(isPresented: $rating) { FeedbackSheet(session: session, workoutId: plan?.source == "library" ? plan?.workout.id?.string : nil) }
        .confirmationDialog("Smazat „\(session.title)“ z plánu?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Zmizí i z kalendáře v Intervals.icu.")
        }
        .task {
            guard let id = session.eventId, !model.demo, plan == nil else { return }
            plan = try? await model.api.plannedWorkout(eventId: id)
        }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
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

    private func delete() async {
        guard let id = session.eventId else { return }
        await run { try await model.api.deletePlanned(eventId: id) }
    }

    private func environment(indoor: Bool) async {
        guard let id = session.eventId else { return }
        await run { try await model.api.setPlannedEnvironment(eventId: id, indoor: indoor) }
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
                        Text("\(Int(rpe)) / 10").font(Typo.number(24))
                    }
                    Slider(value: $rpe, in: 1...10, step: 1).tint(Palette.amberBar).disabled(saved)
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

    static func intervalsText(_ intervals: WorkoutFeedbackResult.Intervals?) -> String? {
        switch intervals?.status {
        case "ok": return L10n.tr("RPE je uložené i v Intervals.icu.")
        case "error": return L10n.f("RPE je uložené, zápis do Intervals.icu selhal: %@", intervals?.message ?? "")
        default: return nil
        }
    }
}

/// A session typed in by hand: done today or before, or planned ahead.
struct ManualWorkoutSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var sport = "ride"
    @State private var minutes = "60"
    @State private var date = Date()
    @State private var rpe = 6.0
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?

    private var completed: Bool { AppModel.localDate(date) <= AppModel.localDate(Date()) }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Zapsat trénink") {
                Picker("Sport", selection: $sport) {
                    Text("Kolo").tag("ride")
                    Text("Běh").tag("run")
                    Text("Posilovna").tag("gym")
                }
                .pickerStyle(.segmented)
                SettingsGroup(footer: completed ? "Zapíše se jako odcvičený a pošle do Intervals.icu." : "Budoucí den: zapíše se jako plán do Intervals.icu.") {
                    SettingsField(title: "Název", text: $name, keyboard: .default, placeholder: L10n.tr(sport == "ride" ? "Jízda" : sport == "run" ? "Běh" : "Posilovna"))
                    SettingsDivider()
                    SettingsField(title: "Délka", text: $minutes, unit: "min", keyboard: .numberPad)
                    SettingsDivider()
                    DatePicker("Den", selection: $date, displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16).frame(minHeight: 50)
                }
                if completed {
                    SettingsGroup(title: "Náročnost") {
                        HStack {
                            Slider(value: $rpe, in: 1...10, step: 1).tint(Palette.amberBar)
                            Text("\(Int(rpe))").font(Typo.number(22)).frame(width: 30)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 50)
                    }
                }
                TextField("Poznámka", text: $notes, axis: .vertical)
                    .lineLimit(2...5).padding(12)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                Button { Task { await save() } } label: {
                    Text(saving ? "Ukládám…" : "Uložit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .disabled(saving || Int(minutes) == nil)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } }
            }
        }
        .tint(Palette.ink)
    }

    private func save() async {
        guard let m = Int(minutes), m > 0 else { return }
        if model.demo { dismiss(); return }
        saving = true
        defer { saving = false }
        let title = name.trimmingCharacters(in: .whitespaces).isEmpty ? L10n.tr(sport == "ride" ? "Jízda" : sport == "run" ? "Běh" : "Posilovna") : name
        do {
            try await model.api.manualWorkout(name: title, date: AppModel.localDate(date), sport: sport, minutes: m, completed: completed, rpe: completed ? Int(rpe) : nil, notes: notes)
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
