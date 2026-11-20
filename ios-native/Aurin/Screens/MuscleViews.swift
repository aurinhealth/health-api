import Charts
import SwiftUI

// Svaly: which muscles are tired and when they are rested again
// (GET /app/api/muscles, src/muscle-fatigue.js), on Aurin's own figure
// (MuscleFigure.swift). The widgets (S1, S2, M1, M with rings, L), the
// screen with Odpočinek and Tento týden, and one muscle
// (GET /app/api/muscles/detail, src/muscle-detail.js).

extension AppModel {
    /// The muscles for the screens: the sample in the demo.
    var muscles: MuscleFatigue? { demo ? DemoData.muscles : muscleFatigue }

    func loadMuscles() async {
        guard !demo else { return }
        let account = scope
        if let fresh = try? await api.muscles(), stillSignedIn(account) {
            muscleFatigue = fresh
            musclesAt = Date()
        }
    }

    /// Not loaded yet, older than five minutes, or a gym day was saved since:
    /// the widgets, the screen and the gym builder load them again.
    var musclesStale: Bool {
        guard !demo else { return false }
        guard muscleFatigue != nil, let at = musclesAt else { return true }
        return Date().timeIntervalSince(at) > 300
    }
}

// MARK: - Pieces

/// The figure zepředu and zezadu, tired muscles in colour.
struct MuscleFigurePair: View {
    let colors: [String: Color]
    var selected: String? = nil
    var spacing: CGFloat = 4
    var onTap: ((String) -> Void)? = nil

    var body: some View {
        HStack(spacing: spacing) {
            MuscleBody(colors: colors, selected: selected, onTap: onTap)
            MuscleBody(back: true, colors: colors, selected: selected, onTap: onTap)
        }
    }
}

/// One body part: how rested in % inside the ring, its name, and under it
/// when it is ready (nothing once it is).
struct MuscleRing: View {
    let group: MuscleFatigue.Group
    let today: String
    var size: CGFloat = 44

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                Circle().stroke(Palette.ink.opacity(0.08), lineWidth: 4.5)
                Circle()
                    .trim(from: 0, to: CGFloat(group.percent) / 100)
                    .stroke(group.color, style: StrokeStyle(lineWidth: 4.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(verbatim: String(group.percent)).font(.system(size: size * 0.25, weight: .semibold)).foregroundStyle(Palette.ink)
                    .monospacedDigit()
            }
            .frame(width: size, height: size)
            Text(verbatim: group.label).font(.caption2.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.75)
            Text(verbatim: group.readyText(today: today) ?? " ").font(.caption2).foregroundStyle(group.textColor).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(group.label + ", " + L10n.f("odpočaté na %@ %%", String(group.percent)) + (group.readyText(today: today).map { ", " + $0 } ?? ""))
    }
}

/// The six body parts in one row.
struct MuscleRingsRow: View {
    let data: MuscleFatigue
    var size: CGFloat = 44

    var body: some View {
        HStack(alignment: .top, spacing: 2) {
            ForEach(data.rings) { MuscleRing(group: $0, today: data.date, size: size) }
        }
    }
}

/// A tired muscle in a line: dot, name, when it is rested.
private struct TiredLine: View {
    let muscle: MuscleFatigue.Muscle
    let today: String

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(muscle.color).frame(width: 8, height: 8)
            Text(muscle.label).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(verbatim: muscle.readyText(today: today)).font(Typo.caption).foregroundStyle(muscle.textColor).lineLimit(1)
        }
    }
}

/// Trénink dokončen: the muscles after the workout just saved, on the figure
/// (the 3D one once loaded), the most tired with when they are rested; a tap opens Svaly.
struct WorkoutFatigueCard: View {
    @Environment(AppModel.self) private var model
    let data: MuscleFatigue

    var body: some View {
        RouteLink(route: .muscles) {
            Card {
                HStack {
                    Text(verbatim: MuscleFatigue.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                }
                Group {
                    if let figure = MuscleModelStore.shared.figure {
                        MuscleFigureFixedPair(figure: figure, colors: data.figureColors, labels: false).allowsHitTesting(false)
                    } else {
                        MuscleFigurePair(colors: data.figureColors, spacing: 4)
                    }
                }
                .frame(height: 230).frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(data.tired.prefix(4)) { TiredLine(muscle: $0, today: data.date) }
                }
                HStack(spacing: 14) {
                    key("unavené", Palette.rust)
                    key("zotavuje se", Palette.amberBar)
                }
            }
        }
        .task { if model.musclesStale { await model.loadMuscles() } }
    }

    private func key(_ title: String, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}

extension MuscleFatigue {
    /// "Horní část těla" or, with nothing whole ready, "Odpočinek".
    var headline: String { readyTitle ?? L10n.tr("Den na odpočinek") }
    /// Under the headline.
    var headlineNote: String { readyTitle == nil ? L10n.tr("Všechny partie se ještě zotavují") : L10n.tr("připravená") }
}

// MARK: - Widgets

/// Svaly as a widget: with the figure (S1, M1, L) or in short (S2, M with
/// the rings). Loads the muscles itself; a tap opens Svaly.
struct MusclesWidget: View {
    @Environment(AppModel.self) private var model
    /// True: the figure; false: words and rings.
    let figure: Bool
    let size: WidgetSize
    /// On the panel; while editing and in the gallery it is only a picture.
    var linked = true

    var body: some View {
        Group {
            if let data = model.muscles {
                content(data)
            } else {
                Card {
                    WidgetHeader(title: MuscleFatigue.title, color: Palette.amberBar)
                    Text("–").font(Typo.number(34)).foregroundStyle(Palette.faint)
                }
            }
        }
        .task { if model.musclesStale { await model.loadMuscles() } }
    }

    @ViewBuilder private func content(_ data: MuscleFatigue) -> some View {
        switch (figure, size) {
        case (true, .small): small(data, showFigure: true)
        case (false, .small): small(data, showFigure: false)
        case (true, .medium): mediumFigure(data)
        case (false, _): mediumRings(data)
        case (true, .large): large(data)
        }
    }

    // S1 and S2.
    private func small(_ data: MuscleFatigue, showFigure: Bool) -> some View {
        Card {
            WidgetHeader(title: MuscleFatigue.title, color: Palette.amberBar)
            if showFigure {
                MuscleFigurePair(colors: data.freshnessColors, spacing: 2).frame(height: 92).frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: data.headline).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                    Text(verbatim: data.headlineNote).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: data.headline).font(Typo.heading(22)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                    Text(verbatim: data.headlineNote).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                }
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(data.tired.prefix(2)) { TiredLine(muscle: $0, today: data.date) }
                }
                .padding(.top, 4)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // M1: the Training overview's Muscle freshness (concept a-hlavni).
    private func mediumFigure(_ data: MuscleFatigue) -> some View {
        MuscleFreshnessCard(data: data)
    }

    // M with the rings.
    private func mediumRings(_ data: MuscleFatigue) -> some View {
        Card {
            WidgetHeader(title: L10n.tr("Odpočinutí svalů (%)"), color: Palette.amberBar)
            MuscleRingsRow(data: data)
        }
    }

    // L: the figure, what is ready and the last workout, the rings, the button.
    private func large(_ data: MuscleFatigue) -> some View {
        Card {
            WidgetHeader(title: MuscleFatigue.title, color: Palette.amberBar)
            HStack(spacing: 14) {
                MuscleFigurePair(colors: data.freshnessColors, spacing: 2).frame(height: 132)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: L10n.tr(data.readyTitle == nil ? "Dnes" : "Dnes připravené")).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: data.headline).font(Typo.heading(22)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                    if let last = data.lastGymText {
                        Text(verbatim: last).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    }
                }
            }
            Rectangle().fill(Palette.hairline).frame(height: 1)
            MuscleRingsRow(data: data)
            if let title = data.readyTitle {
                Button { if linked { model.push(.gymQuick) } } label: {
                    Label(L10n.f("Trénink: %@", title.lowercased()), systemImage: "sparkles")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
    }
}

// MARK: - Svaly

/// Svaly (concept trenink-koncept muscles()): the sentence of what is fresh
/// when, the figure with every muscle in its colour, the three states as
/// filters, the muscle load of the week and the eleven muscle groups with
/// today and the next two days.
struct MusclesView: View {
    @Environment(AppModel.self) private var model
    @State private var error: String?
    @State private var filter: Freshness?
    @State private var explaining = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: L10n.tr("Svaly"), coach: .muscles(date: model.selectedDate),
                     info: ChromeAction(systemImage: "info", label: "Jak se čerstvost odhaduje") { explaining = true }) {
            VStack(alignment: .leading, spacing: 0) {
                if let data = model.muscles {
                    content(data)
                } else if let error {
                    VStack(spacing: 16) {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center)
                        Button("Zkusit znovu") { Task { await load() } }.font(Typo.bodyStrong)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $explaining) { MuscleFatigueInfoSheet() }
    }

    private func load() async {
        guard !model.demo else { return }
        do { model.muscleFatigue = try await model.api.muscles(); model.musclesAt = Date(); error = nil } catch {
            if model.muscleFatigue == nil { self.error = error.localizedDescription }
        }
    }

    @ViewBuilder private func content(_ data: MuscleFatigue) -> some View {
        let headline = data.freshnessHeadline
        let groups = data.freshnessGroups
        Text("Čerstvost svalů, odhad").font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 22)
        Text(verbatim: headline.title).font(Typo.heading(40, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
            .fixedSize(horizontal: false, vertical: true).padding(.top, 6)
        if let note = headline.note {
            Text(verbatim: note).font(Typo.small).foregroundStyle(Palette.secondary).padding(.top, 6)
        }

        Card {
            MuscleFigurePair(colors: data.freshnessColors, spacing: 22) { id in model.push(.muscle(id)) }
                .frame(height: 300).frame(maxWidth: .infinity)
            HStack(spacing: 8) {
                ForEach(Freshness.allCases, id: \.self) { state in pill(state, count: data.freshnessCount(state)) }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 6)
        }
        .padding(.top, 20)

        if let load = model.training?.muscleLoad {
            Button { model.push(.load(LoadKind.muscle.rawValue)) } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Zátěž svalů za posledních 7 dní").font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                        Text(verbatim: load.text ?? LoadWords.level(load.level) ?? LoadKind.muscle.missing)
                            .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                .padding(.horizontal, 18).padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface()
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
        }

        SectionLabel(text: "Svalové partie").padding(.top, 22)
        VStack(spacing: 0) {
            HStack {
                Text("Další tři dny").font(Typo.caption).foregroundStyle(Palette.muted)
                Spacer()
                HStack(spacing: 3) {
                    ForEach(0..<3, id: \.self) { i in
                        Text(verbatim: Fmt.weekdayShort(ISODay.shift(data.date, i)))
                            .font(Typo.caption.weight(i == 0 ? .semibold : .regular))
                            .foregroundStyle(i == 0 ? Palette.ink : Palette.muted)
                            .frame(width: 34)
                    }
                }
            }
            .padding(.vertical, 10)
            ForEach(groups.filter { filter == nil || $0.state(on: data.date) == filter }) { group in
                Rectangle().fill(Palette.hairline).frame(height: 1)
                Button { model.push(.muscle(group.members[0])) } label: { FreshnessRow(group: group, today: data.date) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 4)
        .cardSurface()
        .padding(.top, 10)
        Text("Odhad z tvých zapsaných sérií, běhů a jízd a z toho, jak dávno byly. Slouží k plánování, není to měření svalu.")
            .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
    }

    /// "Fresh 6": shows only that state's groups; a second tap shows all.
    private func pill(_ state: Freshness, count: Int) -> some View {
        let on = filter == state
        return Button { withAnimation(.snappy(duration: 0.2)) { filter = on ? nil : state } } label: {
            HStack(spacing: 6) {
                Circle().fill(state.color).frame(width: 8, height: 8)
                Text(verbatim: state.title).font(Typo.small).foregroundStyle(Palette.ink)
                Text(verbatim: String(count)).font(Typo.small.weight(.semibold)).foregroundStyle(Palette.ink).monospacedDigit()
            }
            .padding(.horizontal, 11).frame(height: 32)
            .background(Palette.ink.opacity(on ? 0.1 : 0.05), in: Capsule())
            .overlay { if on { Capsule().stroke(Palette.ink.opacity(0.5), lineWidth: 1) } }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: - 3D figure

/// Svaly → Odpočinek with the 3D figure: drag sideways to turn it, tap a muscle to see how
/// rested it is, tap that bubble and the camera moves in before the muscle's detail opens.
struct MuscleFigureSpinner: View {
    @Environment(AppModel.self) private var model
    let figure: MuscleFigure3D
    let data: MuscleFatigue
    @State private var selected: String?
    @State private var point: CGPoint = .zero
    @State private var focus: String?

    var body: some View {
        GeometryReader { geo in
            Muscle3DView(figure: figure, colors: data.figureColors, selected: selected, focus: focus) { id, at in
                withAnimation(.snappy(duration: 0.25)) {
                    selected = id
                    point = at
                }
            }
            .overlay(alignment: .topLeading) {
                if focus == nil, let id = selected, let muscle = data.muscle(id) {
                    bubble(muscle)
                        .fixedSize()
                        .position(x: min(max(point.x, 115), geo.size.width - 115), y: max(32, point.y - 58))
                        .transition(.scale(scale: 0.85).combined(with: .opacity))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr("Postava se svaly"))
    }

    private func bubble(_ muscle: MuscleFatigue.Muscle) -> some View {
        Button { open(muscle.id) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: L10n.tr(muscle.label)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(verbatim: muscle.stateText(today: data.date)).font(Typo.caption).foregroundStyle(muscle.textColor)
                }
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.muted)
            }
            .padding(.vertical, 10).padding(.leading, 14).padding(.trailing, 12)
            .bubbleSurface(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    /// The camera moves in on the muscle, then its detail opens; back on Svaly the whole figure shows again.
    private func open(_ id: String) {
        withAnimation(.easeOut(duration: 0.15)) { focus = id }
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            model.push(.muscle(id))
            try? await Task.sleep(for: .milliseconds(700))
            focus = nil
            selected = nil
        }
    }
}

// MARK: - One muscle

/// One muscle: how rested, whether it is getting stronger (Síla), how often
/// it was trained in 4 weeks (Jak často), the last exercises and the best lift.
struct MuscleDetailView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var detail: MuscleDetailData?
    @State private var error: String?

    init(id: String, detail: MuscleDetailData? = nil) {
        self.id = id
        _detail = State(initialValue: detail)
    }

    private var muscle: MuscleFatigue.Muscle? { model.muscles?.muscle(id) }
    private var today: String { model.muscles?.date ?? AppModel.localDate(Date()) }
    /// The server names the muscle in the app's language; the sample day only in Czech.
    private var label: String? { (muscle?.label ?? detail?.label).map(L10n.tr) }
    /// Fresh, recovering or tired, as on Svaly.
    private var freshness: Freshness { Freshness.of(readyDate: muscle?.readyDate, rested: muscle?.state == "rested", on: today) }
    /// "Fresh now", "Recovering, fresh tomorrow".
    private var freshnessText: String {
        guard freshness != .fresh, let ready = muscle?.readyDate else { return L10n.tr("Čerstvé teď") }
        return freshness.title + ", " + L10n.f("Čerstvé %@", Fmt.relativeDay(ready, today: today)).lowercased(with: Fmt.locale)
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: label ?? MuscleFatigue.title) {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let detail {
                    strength(detail)
                    calendar(detail)
                    recent(detail)
                    best(detail)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 20)
                } else if !model.demo {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
                }
                SecondaryButton(title: L10n.f("Cviky: %@", (label ?? "").lowercased()), systemImage: "dumbbell") {
                    model.push(.exercises(MuscleFatigue.bodyId(id)))
                }
                .padding(.top, 18)
            }
        }
        .task { await load() }
        .task { await MuscleModelStore.shared.load(api: model.demo ? nil : model.api) }
    }

    private func load() async {
        if model.musclesStale { await model.loadMuscles() }
        guard !model.demo else { detail = DemoData.muscleDetail(id); return }
        do { detail = try await model.api.muscleDetail(id: id) } catch { self.error = error.localizedDescription }
    }

    @ViewBuilder private var header: some View {
        if let figure = MuscleModelStore.shared.figure {
            // The 3D figure close on this muscle, turned to the side it is on.
            Muscle3DView(figure: figure, colors: [id: freshness.color], selected: id, focus: id, yaw: MuscleFigure3D.facing(id))
                .frame(height: 220).frame(maxWidth: .infinity)
                .background(Palette.card)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .accessibilityHidden(true)
                .padding(.top, 20)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: label ?? "").font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if muscle != nil {
                    Text(verbatim: freshnessText).font(Typo.small).foregroundStyle(freshness.textColor)
                }
            }
            .padding(.top, 18)
        } else {
            flatHeader
        }
    }

    private var flatHeader: some View {
        HStack(spacing: 14) {
            MuscleFigurePair(colors: [id: freshness.color], selected: id, spacing: 2).frame(height: 104)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: label ?? "").font(Typo.heading(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if muscle != nil {
                    Text(verbatim: freshnessText).font(Typo.small).foregroundStyle(freshness.textColor)
                }
            }
        }
        .padding(.top, 20)
    }


    // MARK: Síla

    @ViewBuilder private func strength(_ d: MuscleDetailData) -> some View {
        Card {
            Text("Síla").font(Typo.caption).foregroundStyle(Palette.muted)
            if let s = d.strength, s.points.count >= 2, let change = s.change {
                let percent = Int((change * 100).rounded())
                let weeks = max(1, MuscleFatigue.days(from: s.points[0].week, to: s.points[s.points.count - 1].week) / 7)
                Text(verbatim: L10n.plural("%@ %% za %lld týdnů", (percent > 0 ? "+" : "") + String(percent), weeks))
                    .font(Typo.heading(22)).foregroundStyle(percent > 0 ? Palette.green : percent < 0 ? Palette.amber : Palette.ink)
                Text(verbatim: L10n.f("Odhad maxima: %@, z tvých sérií.", L10n.tr(s.exercise))).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                // The area starts at the scale's bottom, not at 0 kg, so it
                // stays inside the card (build 602: it ran down past the card).
                let lo = s.points.map(\.kg).min()! * 0.95, hi = s.points.map(\.kg).max()! * 1.05
                Chart(s.points) { p in
                    AreaMark(x: .value("Týden", p.week), yStart: .value("kg", lo), yEnd: .value("kg", p.kg))
                        .foregroundStyle(Palette.green.opacity(0.12))
                    LineMark(x: .value("Týden", p.week), y: .value("kg", p.kg))
                        .foregroundStyle(Palette.green).lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    if p.id == s.points.last?.id {
                        PointMark(x: .value("Týden", p.week), y: .value("kg", p.kg))
                            .foregroundStyle(Palette.green).symbolSize(50)
                    }
                }
                .chartYScale(domain: lo...hi)
                .chartYAxis {
                    AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 1)).foregroundStyle(Palette.hairline)
                        AxisValueLabel {
                            Text(verbatim: Units.weightText(value.as(Double.self) ?? 0, digits: 0)).font(Typo.tiny).foregroundStyle(Palette.muted)
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: [s.points[0].week, s.points[s.points.count - 1].week]) { value in
                        AxisValueLabel { Text(verbatim: short(value.as(String.self) ?? "")).font(Typo.tiny).foregroundStyle(Palette.faint) }
                    }
                }
                .chartPlotStyle { $0.clipped() }
                .frame(height: 130)
                .padding(.top, 6)
            } else if let s = d.strength, let p = s.points.last {
                Text(verbatim: Units.weightText(p.kg, digits: 0)).font(Typo.heading(22)).foregroundStyle(Palette.ink)
                Text(verbatim: L10n.f("Odhad maxima: %@. Trend uvidíš po dalším týdnu.", L10n.tr(s.exercise))).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Zatím bez vah").font(Typo.sentence(20)).foregroundStyle(Palette.ink)
                Text("Zapiš váhy a opakování a uvidíš, jak sílíš.").font(Typo.caption).foregroundStyle(Palette.muted)
            }
        }
        .padding(.top, 18)
    }

    private func short(_ date: String) -> String {
        let parts = date.split(separator: "-")
        guard parts.count == 3, let d = Int(parts[2]), let m = Int(parts[1]) else { return date }
        return L10n.isEnglish ? "\(m)/\(d)" : "\(d). \(m)."
    }

    // MARK: Jak často

    @ViewBuilder private func calendar(_ d: MuscleDetailData) -> some View {
        if let c = d.calendar {
            Card {
                Text("Jak často").font(Typo.caption).foregroundStyle(Palette.muted)
                Text(verbatim: L10n.f("Průměrně %@× týdně", Fmt.decimal(c.perWeek, digits: 1)))
                    .font(Typo.heading(22)).foregroundStyle(Palette.ink)
                Text(verbatim: note(c)).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        Color.clear.frame(width: 44, height: 1)
                        ForEach(Array(weekdays.enumerated()), id: \.offset) { _, w in
                            Text(verbatim: w).font(Typo.tiny).foregroundStyle(Palette.faint).frame(maxWidth: .infinity)
                        }
                    }
                    ForEach(0..<4, id: \.self) { week in
                        let monday = AppModel.shift(c.from, by: 7 * week) ?? c.from
                        HStack(spacing: 6) {
                            Text(verbatim: short(monday)).font(Typo.tiny).foregroundStyle(Palette.muted).frame(width: 44, alignment: .leading)
                            ForEach(0..<7, id: \.self) { day in
                                cell(AppModel.shift(monday, by: day) ?? monday, trained: Set(c.days))
                            }
                        }
                    }
                }
                .padding(.top, 6)
            }
            .padding(.top, 12)
        }
    }

    private var weekdays: [String] { L10n.isEnglish ? ["M", "T", "W", "T", "F", "S", "S"] : ["P", "Ú", "S", "Č", "P", "S", "N"] }

    private func cell(_ date: String, trained: Set<String>) -> some View {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(trained.contains(date) ? Palette.green : date > today ? Color.clear : Palette.ink.opacity(0.07))
            .overlay { RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(date == today ? Palette.ink : .clear, lineWidth: 1.5) }
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: .infinity)
    }

    private func note(_ c: MuscleDetailData.Calendar) -> String {
        let target = L10n.f("Na růst svalu stačí %@× týdně.", String(c.target))
        if c.perWeek >= Double(c.target) { return target + " " + L10n.tr("To držíš.") }
        return target + " " + L10n.f("Tento týden zatím %@×.", String(c.thisWeek))
    }

    // MARK: Naposledy, Nejlepší výkon

    @ViewBuilder private func recent(_ d: MuscleDetailData) -> some View {
        let list = d.recent ?? []
        if !list.isEmpty {
            SectionLabel(text: "Naposledy").padding(.top, 22)
            Card {
                ForEach(Array(list.enumerated()), id: \.element.id) { index, r in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: L10n.tr(r.exercise)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(verbatim: recentLine(r)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 10)
        }
    }

    private func recentLine(_ r: MuscleDetailData.Recent) -> String {
        var parts = [L10n.tr(r.day), L10n.plural("%lld sérií", r.sets)]
        if let kg = r.kg, let reps = r.reps { parts.append(Units.weightText(kg, digits: kg.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1) + " × " + String(Int(reps))) }
        return parts.joined(separator: ", ")
    }

    @ViewBuilder private func best(_ d: MuscleDetailData) -> some View {
        if let b = d.best {
            SectionLabel(text: "Nejlepší výkon").padding(.top, 22)
            Card {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: L10n.tr(b.exercise)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Text(verbatim: Units.weightText(b.kg, digits: b.kg.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1) + " × " + String(Int(b.reps)))
                        .font(Typo.sentence(18)).foregroundStyle(Palette.ink)
                }
                Text(verbatim: L10n.f("odhad maxima %@", Units.weightText(b.e1rm, digits: 0)) + (b.day.map { ", " + L10n.tr($0) } ?? ""))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .padding(.top, 10)
        }
    }
}

/// "i" of Unavené svaly: what the percentages and the days mean.
struct MuscleFatigueInfoSheet: View {
    @Environment(\.dismiss) private var dismiss

    private let lines = [
        "Každá zapsaná série, běh a jízda přidá práci svalům, které zapojí. Čerstvost se odhaduje z toho, kolik práce sval dostal a jak dávno.",
        "Velké svaly (stehna, hýždě, záda) se po těžkých cvicích zotavují až 3 dny, malé svaly paží a ramen kolem 2 dnů. Série do selhání prodlouží zotavení.",
        "Zelená je čerstvý sval, oranžová čerstvý zítra, červená později. Je to vodítko pro plánování, ne měření svalu.",
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(lines, id: \.self) { line in
                        Text(L10n.tr(line)).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(20)
            }
            .background(Palette.background)
            .navigationTitle(L10n.tr("Jak se čerstvost odhaduje"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Hotovo") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

private extension View {
    /// The bubble floats over the figure and takes a tap, so it is glass like
    /// the bars' buttons on iOS 26; before it a frosted card with a shadow.
    @ViewBuilder func bubbleSurface(_ shape: RoundedRectangle) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, *) {
            chromeGlass(in: shape)
        } else {
            frostedBubble(shape)
        }
        #else
        frostedBubble(shape)
        #endif
    }

    func frostedBubble(_ shape: RoundedRectangle) -> some View {
        background(.regularMaterial, in: shape)
            .overlay { shape.stroke(Palette.hairline, lineWidth: 1) }
            .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
    }
}
