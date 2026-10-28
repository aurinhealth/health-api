import SwiftUI

// MARK: - Splnění plánu

/// The percent of the plan in a ring of its colour (ComplianceScale); past
/// 100 % a thinner second lap shows the part over the plan.
struct ComplianceRing: View {
    let percent: Int
    var size: CGFloat = 74

    var body: some View {
        let color = ComplianceScale.color(percent)
        ZStack {
            Circle().stroke(Palette.track, lineWidth: 7)
            Circle().trim(from: 0, to: min(Double(percent), 100) / 100)
                .stroke(color, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
            if percent > 100 {
                Circle().trim(from: 0, to: min(Double(percent - 100), 100) / 100)
                    .stroke(color.opacity(0.7), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(9)
            }
            Text(verbatim: "\(percent)" + Fmt.percentSign)
                .font(Typo.number(size * (percent < 100 ? 0.3 : 0.25)))
                .foregroundStyle(Palette.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
                .padding(.horizontal, 10)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("%@ %% plánu", String(percent)))
    }
}

/// "Splnění plánu" under an activity's numbers: the ring, the word and what
/// the percent is made of; a tap opens the plan against what was done.
struct PlanComplianceCard: View {
    let compliance: PlanCompliance
    /// Run or ride, for "Úseky" or "Intervaly".
    var run = false
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 16) {
                    ComplianceRing(percent: compliance.percent)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Splnění plánu").font(.caption2.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                        Text(verbatim: compliance.word ?? ComplianceScale.word(compliance.percent))
                            .font(.system(size: 17, weight: .semibold)).foregroundStyle(ComplianceScale.color(compliance.percent))
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .padding(.bottom, 10)
                PlanComplianceRows(compliance: compliance, run: run)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// "Zátěž 73 TSS / 79 TSS 92 %", "Čas", "Vzdálenost", "Intervaly v pásmu 3 ze 4";
/// in the gym "Série 15 / 18 83 %" and "Objem".
struct PlanComplianceRows: View {
    let compliance: PlanCompliance
    var run = false

    var body: some View {
        VStack(spacing: 0) {
            ForEach(compliance.rows ?? []) { row in
                line(Self.label(row.kind), done: Self.value(row.kind, row.done), plan: Self.value(row.kind, row.plan), percent: row.percent)
            }
            if let steps = compliance.steps, steps.of > 0 {
                line(run ? "Úseky v pásmu" : "Intervaly v pásmu",
                     done: "\(steps.inBand) " + (L10n.isEnglish ? "of" : GymLiveActivity.preposition(steps.of)) + " \(steps.of)", plan: nil, percent: nil)
            }
            if let sets = compliance.sets {
                line("Série", done: Fmt.int(sets.done), plan: Fmt.int(sets.plan), percent: sets.plan > 0 ? Int((sets.done / sets.plan * 100).rounded()) : nil)
            }
            if let volume = compliance.volume, volume.plan > 0 {
                line("Objem", done: Self.weight(volume.done), plan: Self.weight(volume.plan), percent: nil)
            }
        }
    }

    private func line(_ label: String, done: String, plan: String?, percent: Int?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(L10n.tr(label)).font(Typo.body).foregroundStyle(Palette.muted)
            Spacer(minLength: 6)
            (Text(verbatim: done).foregroundStyle(Palette.ink) + Text(verbatim: plan.map { " / " + $0 } ?? "").foregroundStyle(Palette.faint))
                .font(Typo.body).lineLimit(1).minimumScaleFactor(0.8)
            Text(verbatim: percent.map { "\($0)" + Fmt.percentSign } ?? "")
                .font(.system(size: 13, weight: .medium)).foregroundStyle(percent.map(ComplianceScale.color) ?? .clear)
                .frame(width: 46, alignment: .trailing)
        }
        .padding(.vertical, 9)
        .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    static func label(_ kind: String) -> String {
        switch kind {
        case "tss": return "Zátěž"
        case "time": return "Čas"
        default: return "Vzdálenost"
        }
    }

    static func value(_ kind: String, _ v: Double?) -> String {
        guard let v else { return "–" }
        switch kind {
        case "tss": return Fmt.int(v) + " TSS"
        case "time": return Fmt.duration(Int(v.rounded()))
        default: return Units.distanceText(v)
        }
    }

    static func weight(_ kg: Double) -> String { Fmt.int(Units.weight(kg)) + " " + Units.weightUnit }
}

/// The card's tap: the percent with its word, the plan against what was done
/// step by step (dashed band planned, bar recorded, coloured by the band) and
/// every step's time and power or pace.
struct PlanComplianceSheet: View {
    let compliance: PlanCompliance
    let title: String
    var run = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: title).padding(.top, 8)
                Text("Splnění plánu").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 8)
                HStack(spacing: 16) {
                    ComplianceRing(percent: compliance.percent, size: 88)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(verbatim: compliance.word ?? ComplianceScale.word(compliance.percent))
                            .font(.system(size: 18, weight: .semibold)).foregroundStyle(ComplianceScale.color(compliance.percent))
                        if let basis = basisLine { Text(verbatim: basis).font(Typo.caption).foregroundStyle(Palette.muted) }
                    }
                }
                .padding(.top, 18)
                if let steps = compliance.steps, !steps.steps.isEmpty {
                    Card {
                        Text("Plán a skutečnost").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        ComplianceStepsChart(steps: steps).frame(height: 120)
                        legend
                    }
                    .padding(.top, 20)
                    Card {
                        VStack(spacing: 0) {
                            ForEach(Array(steps.steps.enumerated()), id: \.offset) { i, step in
                                stepRow(step).overlay(alignment: .top) { if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                            }
                        }
                    }
                    .padding(.top, 12)
                    if let target = compliance.target {
                        Text(verbatim: target).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
                    }
                } else {
                    Card { PlanComplianceRows(compliance: compliance, run: run) }.padding(.top, 20)
                }
            }
            .padding(24)
        }
        .background(Palette.background)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.background)
    }

    /// "Zátěž 73 z plánovaných 79 TSS".
    private var basisLine: String? {
        guard let row = compliance.rows?.first(where: { $0.percent != nil }), let done = row.done, let plan = row.plan else { return nil }
        let unit = PlanComplianceRows.value(row.kind, plan)
        switch row.kind {
        case "tss": return L10n.f("Zátěž %@ z plánovaných %@", Fmt.int(done), unit)
        case "time": return L10n.f("Čas %@ z plánovaných %@", PlanComplianceRows.value(row.kind, done), unit)
        default: return L10n.f("Vzdálenost %@ z plánovaných %@", PlanComplianceRows.value(row.kind, done), unit)
        }
    }

    private var legend: some View {
        HStack(spacing: 14) {
            HStack(spacing: 5) {
                RoundedRectangle(cornerRadius: 2).strokeBorder(Palette.muted, style: StrokeStyle(lineWidth: 1, dash: [3, 2])).frame(width: 12, height: 9)
                Text("Plán")
            }
            key(Palette.green, "V pásmu")
            key(Palette.amber, "Pod")
            key(Palette.rust, "Nad")
        }
        .font(Typo.caption).foregroundStyle(Palette.muted)
    }

    private func key(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) { RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10); Text(L10n.tr(text)) }
    }

    private func stepRow(_ step: PlanCompliance.Step) -> some View {
        HStack(spacing: 10) {
            Circle().fill(ComplianceStepsChart.color(step.status)).frame(width: 8, height: 8)
            Text(verbatim: step.label).font(Typo.body).foregroundStyle(Palette.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(verbatim: stepText(step)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    private func stepText(_ step: PlanCompliance.Step) -> String {
        if step.status == "missing" { return L10n.tr("chybí") }
        let text = step.text ?? ""
        switch step.status {
        case "under": return text + " · " + L10n.tr("pod pásmem")
        case "over": return text + " · " + L10n.tr("nad pásmem")
        default: return text
        }
    }
}

/// The steps side by side, as wide as their planned time: the planned band as
/// a dashed box, what was recorded as a bar in the band's colour.
struct ComplianceStepsChart: View {
    let steps: PlanCompliance.Steps

    static func color(_ status: String?) -> Color {
        switch status {
        case "under": return Palette.amber
        case "over": return Palette.rust
        case "missing": return Palette.faint
        default: return Palette.green
        }
    }

    var body: some View {
        GeometryReader { geo in
            let list = steps.steps
            let total = max(list.reduce(0) { $0 + max($1.plannedSeconds ?? $1.seconds ?? 0, 1) }, 1)
            let values = list.flatMap { [$0.lo, $0.hi, $0.value].compactMap { $0 } }
            let top = (values.max() ?? 1) * 1.08, bottom = (values.min() ?? 0) * 0.75
            let y = { (v: Double) -> CGFloat in geo.size.height * (1 - CGFloat((v - bottom) / max(top - bottom, 1))) }
            let xs = list.reduce(into: [CGFloat]()) { acc, s in
                acc.append((acc.last ?? 0) + geo.size.width * CGFloat(max(s.plannedSeconds ?? s.seconds ?? 0, 1) / total))
            }
            ZStack(alignment: .topLeading) {
                ForEach(Array(list.enumerated()), id: \.offset) { i, s in
                    let x0 = i == 0 ? 0 : xs[i - 1], w = xs[i] - x0
                    if let lo = s.lo, let hi = s.hi {
                        RoundedRectangle(cornerRadius: 2)
                            .strokeBorder(Palette.muted.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                            .frame(width: max(w - 2, 1), height: max(y(lo) - y(hi), 3))
                            .offset(x: x0 + 1, y: y(hi))
                    }
                    if let v = s.value {
                        RoundedRectangle(cornerRadius: 2).fill(Self.color(s.status).opacity(0.85))
                            .frame(width: max(w - 4, 1), height: max(geo.size.height - y(v), 1))
                            .offset(x: x0 + 2, y: y(v))
                    } else {
                        Text(verbatim: "–").font(.system(size: 10)).foregroundStyle(Palette.faint)
                            .frame(width: max(w, 1)).offset(x: x0, y: geo.size.height - 14)
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Loads a ride or run's compliance for its detail; nothing shows without a plan.
struct ActivityComplianceSection: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    @State private var compliance: PlanCompliance?
    @State private var open = false
    @State private var failed = false

    private var run: Bool { session.sport == "run" }

    var body: some View {
        Group {
            if failed && compliance == nil {
                RetryRow(message: "Splnění plánu se nepodařilo načíst.") { await load() }
            } else if let compliance {
                PlanComplianceCard(compliance: compliance, run: run) { open = true }
                    .sheet(isPresented: $open) { PlanComplianceSheet(compliance: compliance, title: session.title, run: run) }
            }
        }
        .task(id: session.id) {
            guard !model.demo, compliance == nil else { return }
            await load()
        }
    }

    private func load() async {
        guard let activity = session.activityId, let planned = session.plannedId else { return }
        do { compliance = try await model.api.planCompliance(activityId: activity, plannedId: planned); failed = false } catch { failed = true }
    }
}

/// A gym day logged in the app: the percent with sets and volume, then every
/// exercise's sets and its own percent.
struct GymComplianceSection: View {
    @Environment(AppModel.self) private var model
    let date: String
    /// Changes when a set is logged, so the percent follows.
    var reload = 0
    @State private var compliance: PlanCompliance?

    var body: some View {
        Group {
            if let compliance, compliance.sets.map({ $0.done > 0 }) == true {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 16) {
                            ComplianceRing(percent: compliance.percent)
                            VStack(alignment: .leading, spacing: 5) {
                                Text("Splnění plánu").font(.caption2.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
                                Text(verbatim: compliance.word ?? ComplianceScale.word(compliance.percent))
                                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(ComplianceScale.color(compliance.percent))
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.bottom, 10)
                        PlanComplianceRows(compliance: compliance)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface(cornerRadius: 22)
                    if let exercises = compliance.exercises, !exercises.isEmpty {
                        Card {
                            VStack(spacing: 0) {
                                ForEach(Array(exercises.enumerated()), id: \.element.id) { i, e in
                                    exerciseRow(e).overlay(alignment: .top) { if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) } }
                                }
                            }
                        }
                    }
                }
            }
        }
        .task(id: reload) {
            guard !model.demo else { return }
            // A set just changed is saved a moment later.
            if compliance != nil { try? await Task.sleep(for: .seconds(2)) }
            guard !Task.isCancelled else { return }
            compliance = try? await model.api.gymCompliance(date: date)
        }
    }

    private func exerciseRow(_ e: PlanCompliance.Exercise) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: e.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                Text(verbatim: Self.detail(e)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(verbatim: "\(e.percent)" + Fmt.percentSign).font(Typo.bodyStrong).foregroundStyle(ComplianceScale.color(e.percent))
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }

    /// "4 z 4 sérií · 80 kg × 8, 8, 7, 7", "0 ze 3 sérií · vynecháno".
    static func detail(_ e: PlanCompliance.Exercise) -> String {
        let count = L10n.isEnglish ? "\(e.doneSets) of \(e.plannedSets) " + (e.plannedSets == 1 ? "set" : "sets")
            : "\(e.doneSets) \(GymLiveActivity.preposition(e.plannedSets)) \(e.plannedSets) " + (e.plannedSets == 1 ? "série" : "sérií")
        guard !e.sets.isEmpty else { return count + " · " + L10n.tr("vynecháno") }
        let reps = e.sets.compactMap(\.reps).map { Fmt.int($0) }.joined(separator: ", ")
        let kgs = Set(e.sets.compactMap(\.kg))
        let load = kgs.isEmpty ? L10n.tr("vlastní váha") : kgs.count == 1 ? kgs.first.map { Fmt.int(Units.weight($0)) + " " + Units.weightUnit } : nil
        return count + " · " + (load.map { $0 + " × " } ?? "") + reps
    }
}
