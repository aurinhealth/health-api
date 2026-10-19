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
        if let fresh = try? await api.muscles() { muscleFatigue = fresh }
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
        .task { if model.muscleFatigue == nil { await model.loadMuscles() } }
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
                MuscleFigurePair(colors: data.figureColors, spacing: 2).frame(height: 92).frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: data.headline).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2)
                    Text(verbatim: data.headlineNote).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: data.headline).font(Typo.sentence(20)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
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

    // M1.
    private func mediumFigure(_ data: MuscleFatigue) -> some View {
        Card {
            WidgetHeader(title: MuscleFatigue.title, color: Palette.amberBar)
            HStack(spacing: 14) {
                MuscleFigurePair(colors: data.figureColors, spacing: 2).frame(height: 110)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: L10n.tr(data.readyTitle == nil ? "Dnes" : "Dnes připravené")).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: data.headline).font(Typo.sentence(21)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(data.tired.prefix(2)) { TiredLine(muscle: $0, today: data.date) }
                    }
                    .padding(.top, 4)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    // M with the rings.
    private func mediumRings(_ data: MuscleFatigue) -> some View {
        Card {
            WidgetHeader(title: L10n.tr("Únava svalů · odpočaté na %"), color: Palette.amberBar)
            MuscleRingsRow(data: data)
        }
    }

    // L: the figure, what is ready and the last workout, the rings, the button.
    private func large(_ data: MuscleFatigue) -> some View {
        Card {
            WidgetHeader(title: MuscleFatigue.title, color: Palette.amberBar)
            HStack(spacing: 14) {
                MuscleFigurePair(colors: data.figureColors, spacing: 2).frame(height: 132)
                VStack(alignment: .leading, spacing: 4) {
                    Text(verbatim: L10n.tr(data.readyTitle == nil ? "Dnes" : "Dnes připravené")).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: data.headline).font(Typo.sentence(22)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                    if let last = data.lastGymText {
                        Text(verbatim: last).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    }
                }
            }
            Rectangle().fill(Palette.hairline).frame(height: 1)
            MuscleRingsRow(data: data)
            if let title = data.readyTitle {
                Button { if linked { model.push(.gymBuilder) } } label: {
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

/// Svaly: Odpočinek (the figure, what is tired and until when, what to train
/// today) and Tento týden (how often each body part was trained this week).
struct MusclesView: View {
    @Environment(AppModel.self) private var model
    @State private var error: String?
    @State private var tab = 0
    @State private var explaining = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: MuscleFatigue.title) {
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: MuscleFatigue.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 24)
                Picker("Pohled", selection: $tab) {
                    Text("Odpočinek").tag(0)
                    Text("Tento týden").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.top, 14)
                if let data = model.muscles {
                    if tab == 0 { rest(data) } else { week(data) }
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
        .task { if !model.demo { await MuscleModelStore.shared.load(api: model.api) } }
        .refreshable { await load() }
        .sheet(isPresented: $explaining) { MuscleFatigueInfoSheet() }
    }

    private func load() async {
        guard !model.demo else { return }
        do { model.muscleFatigue = try await model.api.muscles(); error = nil } catch {
            if model.muscleFatigue == nil { self.error = error.localizedDescription }
        }
    }

    // MARK: Odpočinek

    @ViewBuilder private func rest(_ data: MuscleFatigue) -> some View {
        let muscles = data.muscles ?? []
        Card {
            if let figure = MuscleModelStore.shared.figure {
                MuscleFigureSpinner(figure: figure, data: data).frame(height: 410).frame(maxWidth: .infinity)
            } else {
                MuscleFigurePair(colors: data.figureColors, spacing: 8) { id in model.push(.muscle(id)) }
                    .frame(height: 300).frame(maxWidth: .infinity)
            }
            HStack(alignment: .top) {
                stat(L10n.f("%@ z %@", String(muscles.count - data.tired.count), String(muscles.count)), L10n.tr("odpočatých"), Palette.ink)
                if let names = readyOn(data, days: 1) { stat(L10n.tr("zítra"), names, Palette.amber) }
                if let names = readyOn(data, days: 2) { stat(L10n.tr("pozítří"), names, Palette.rust) }
            }
            .padding(.top, 4)
        }
        .padding(.top, 14)

        if let title = data.readyTitle {
            Card {
                HStack(spacing: 12) {
                    Image(systemName: "sparkles").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.onButton)
                        .frame(width: 38, height: 38).background(Palette.green, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: L10n.f("Dnes se hodí: %@", title.lowercased())).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        if let reason = reason(data) {
                            Text(verbatim: reason).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .padding(.top, 12)
        }

        if !data.tired.isEmpty {
            HStack {
                SectionLabel(text: "Unavené svaly")
                Spacer()
                SmallInfoButton(label: "Co znamenají procenta") { explaining = true }
            }
            .padding(.top, 14)
            Card {
                ForEach(Array(data.tired.enumerated()), id: \.element.id) { index, muscle in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    Button { model.push(.muscle(muscle.id)) } label: { tiredRow(muscle, today: data.date) }
                        .buttonStyle(.plain)
                }
            }
            .padding(.top, 10)
        }
        let rested = muscles.count - data.tired.count
        if rested > 0, !data.tired.isEmpty {
            Text(verbatim: L10n.f("Ostatní svaly (%@) jsou odpočaté.", String(rested))).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 12)
        } else if data.tired.isEmpty {
            Text("Všechny svaly jsou odpočaté").font(Typo.sentence(20)).foregroundStyle(Palette.ink).padding(.top, 18)
        }
        if let title = data.readyTitle {
            PrimaryButton(title: L10n.f("Trénink: %@", title.lowercased()), systemImage: "sparkles") { model.push(.gymBuilder) }
                .padding(.top, 18)
        }
    }

    private func stat(_ value: String, _ note: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(verbatim: value).font(Typo.sentence(20)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.7)
            Text(verbatim: note).font(Typo.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.center).lineLimit(2)
        }
        .frame(maxWidth: .infinity)
    }

    /// The body parts rested in so many days, "hýždě a lýtka".
    private func readyOn(_ data: MuscleFatigue, days: Int) -> String? {
        let names = (data.groups ?? []).filter { g in
            g.state != "rested" && g.readyDate.map { MuscleFatigue.days(from: data.date, to: $0) == days } == true
        }.map { L10n.tr($0.label).lowercased() }
        guard !names.isEmpty else { return nil }
        return names.count == 1 ? names[0] : L10n.f("%@ a %@", names.dropLast().joined(separator: ", "), names.last!)
    }

    private func reason(_ data: MuscleFatigue) -> String? {
        guard let r = data.recommend else { return nil }
        guard let days = r.daysSince else { return L10n.f("%@ jsou tento měsíc ještě bez tréninku.", r.label) }
        guard days >= 3 else { return nil }
        return L10n.f("%@ naposledy před %@ dny.", r.label, String(days))
    }

    private func tiredRow(_ muscle: MuscleFatigue.Muscle, today: String) -> some View {
        let percent = max(5, Int(((1 - (muscle.level ?? 0)) * 100).rounded()))
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(muscle.label).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 8)
                Text(verbatim: "\(percent) %").font(Typo.bodyStrong).foregroundStyle(muscle.textColor).monospacedDigit()
            }
            ProgressLine(fraction: Double(percent) / 100, color: muscle.color, height: 6)
            HStack {
                Text(verbatim: causes(muscle)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                Spacer(minLength: 8)
                Text(verbatim: muscle.readyText(today: today)).font(Typo.caption).foregroundStyle(muscle.textColor).lineLimit(1)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(muscle.label) + ", " + L10n.f("odpočaté na %@ %%", String(percent)) + ", " + muscle.readyText(today: today))
    }

    /// "Barbell back squat, Běh 14 km · včera".
    private func causes(_ muscle: MuscleFatigue.Muscle) -> String {
        let from = muscle.from ?? []
        guard let first = from.first else { return "" }
        return from.map { L10n.tr($0.title) }.joined(separator: ", ") + " · " + L10n.tr(first.day)
    }

    // MARK: Tento týden

    @ViewBuilder private func week(_ data: MuscleFatigue) -> some View {
        let groups = data.groups ?? []
        Text(verbatim: L10n.f("Na růst svalu stačí každou partii procvičit %@× týdně.", "2"))
            .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 16)
        Card {
            ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                weekRow(group)
            }
        }
        .padding(.top, 12)
        let missing = groups.filter { ($0.thisWeek ?? 0) < ($0.target ?? 2) }
        if !missing.isEmpty {
            Card {
                HStack(spacing: 12) {
                    Image(systemName: "exclamationmark").font(.system(size: 15, weight: .bold)).foregroundStyle(Palette.onButton)
                        .frame(width: 38, height: 38).background(Palette.amberBar, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    Text(verbatim: L10n.f("Do konce týdne ještě: %@.", missing.map { L10n.tr($0.label).lowercased() }.joined(separator: ", ")))
                        .font(Typo.small).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 12)
        }
    }

    private func weekRow(_ group: MuscleFatigue.Group) -> some View {
        let done = group.thisWeek ?? 0, target = group.target ?? 2
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: group.label).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: last(group)).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 8)
            HStack(spacing: 5) {
                ForEach(0..<max(target, done), id: \.self) { i in
                    Circle().fill(i < done ? Palette.green : Palette.ink.opacity(0.1)).frame(width: 12, height: 12)
                }
            }
            Text(verbatim: L10n.f("%@× z %@", String(done), String(target))).font(Typo.caption.weight(.semibold))
                .foregroundStyle(done >= target ? Palette.green : Palette.muted).monospacedDigit().frame(width: 52, alignment: .trailing)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func last(_ group: MuscleFatigue.Group) -> String {
        guard let days = group.daysSince else { return L10n.tr("4 týdny bez tréninku") }
        switch days {
        case 0: return L10n.tr("naposledy dnes")
        case 1: return L10n.tr("naposledy včera")
        default: return L10n.f("naposledy před %@ dny", String(days))
        }
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
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted)
            }
            .padding(.vertical, 10).padding(.leading, 14).padding(.trailing, 12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Palette.hairline, lineWidth: 1))
            .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
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
        .task { if !model.demo { await MuscleModelStore.shared.load(api: model.api) } }
    }

    private func load() async {
        if model.muscleFatigue == nil { await model.loadMuscles() }
        guard !model.demo else { detail = DemoData.muscleDetail(id); return }
        do { detail = try await model.api.muscleDetail(id: id) } catch { self.error = error.localizedDescription }
    }

    @ViewBuilder private var header: some View {
        if let figure = MuscleModelStore.shared.figure {
            // The 3D figure close on this muscle, turned to the side it is on.
            Muscle3DView(figure: figure, colors: [id: muscle?.figureColor ?? Palette.green], selected: id, focus: id, yaw: MuscleFigure3D.facing(id))
                .frame(height: 220).frame(maxWidth: .infinity)
                .background(Palette.card)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .accessibilityHidden(true)
                .padding(.top, 20)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: label ?? "").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let muscle {
                    Text(verbatim: muscle.stateText(today: today)).font(Typo.small).foregroundStyle(muscle.textColor)
                }
            }
            .padding(.top, 18)
        } else {
            flatHeader
        }
    }

    private var flatHeader: some View {
        HStack(spacing: 14) {
            MuscleFigurePair(colors: [id: muscle?.figureColor ?? Palette.green], selected: id, spacing: 2).frame(height: 104)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: label ?? "").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let muscle {
                    Text(verbatim: muscle.stateText(today: today)).font(Typo.small).foregroundStyle(muscle.textColor)
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
                Text(verbatim: (percent > 0 ? "+" : "") + L10n.f("%@ %% za %@", String(percent), "\(weeks) " + Fmt.plural(weeks, "týden", "týdny", "týdnů")))
                    .font(Typo.sentence(22)).foregroundStyle(percent > 0 ? Palette.green : percent < 0 ? Palette.amber : Palette.ink)
                Text(verbatim: L10n.f("Odhad maxima: %@, z tvých sérií.", L10n.tr(s.exercise))).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Chart(s.points) { p in
                    AreaMark(x: .value("Týden", p.week), y: .value("kg", p.kg))
                        .foregroundStyle(LinearGradient(colors: [Palette.green.opacity(0.25), Palette.green.opacity(0)], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Týden", p.week), y: .value("kg", p.kg))
                        .foregroundStyle(Palette.green).lineStyle(StrokeStyle(lineWidth: 2.5))
                    PointMark(x: .value("Týden", p.week), y: .value("kg", p.kg))
                        .foregroundStyle(Palette.green).symbolSize(p.id == s.points.last?.id ? 60 : 20)
                        .annotation(position: .top, alignment: .trailing) {
                            if p.id == s.points.last?.id {
                                Text(verbatim: Units.weightText(p.kg, digits: 0)).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.green)
                            }
                        }
                }
                .chartYScale(domain: (s.points.map(\.kg).min()! * 0.95)...(s.points.map(\.kg).max()! * 1.05))
                .chartYAxis(.hidden)
                .chartXAxis {
                    AxisMarks(values: [s.points[0].week, s.points[s.points.count - 1].week]) { value in
                        AxisValueLabel { Text(verbatim: short(value.as(String.self) ?? "")).font(Typo.tiny).foregroundStyle(Palette.faint) }
                    }
                }
                .frame(height: 130)
            } else if let s = d.strength, let p = s.points.last {
                Text(verbatim: Units.weightText(p.kg, digits: 0)).font(Typo.sentence(22)).foregroundStyle(Palette.ink)
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
                    .font(Typo.sentence(22)).foregroundStyle(Palette.ink)
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
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(date == today ? Palette.ink : .clear, lineWidth: 1.5))
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
        var parts = [L10n.tr(r.day), L10n.f(r.sets >= 5 ? "%@ sérií" : r.sets == 1 ? "%@ série" : "%@ série", String(r.sets))]
        if let kg = r.kg, let reps = r.reps { parts.append(Units.weightText(kg, digits: kg.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1) + " × " + String(Int(reps))) }
        return parts.joined(separator: " · ")
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
                Text(verbatim: L10n.f("odhad maxima %@", Units.weightText(b.e1rm, digits: 0)) + (b.day.map { " · " + L10n.tr($0) } ?? ""))
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
        "Procento říká, jak moc je sval už odpočatý. 100 % je plně připravený, 5 % je hned po tvrdém tréninku.",
        "Čím nižší číslo, tím déle se sval ještě zotavuje. Sval na 5 % bude odpočatý třeba za 4 dny, sval na 30 % už zítra.",
        "Velké svaly (stehna, hýždě, záda) se po těžkých cvicích zotavují až 3 dny, malé svaly paží a ramen kolem 2 dnů. Série do selhání prodlouží zotavení.",
        "Počítá se z tvých sérií v posilovně za posledních 7 dní a z běhu, kola a chůze, které zatěžují nohy.",
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
            .navigationTitle(L10n.tr("Únava svalů"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Hotovo") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}
