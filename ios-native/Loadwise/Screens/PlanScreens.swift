import SwiftUI

// The training plan's screens: what a plan looks like before it starts,
// starting it, the running plan (opened straight from Training), one week of
// it with its sessions, changing this week, and the result at the end.

// MARK: - Before the start

/// A ride or run plan before it starts: the weeks as bars of time, the totals
/// and the weeks; "Začít plán" chooses the day and the days.
struct PlanPreviewView: View {
    @Environment(AppModel.self) private var model
    let template: TrainingPlans.Template
    /// The plan running now, replaced when this one starts.
    var replacing: TrainingPlans.Active? = nil
    /// Started: closes the list.
    var done: () -> Void = {}
    @State var preview: PlanPreview? = nil
    @State private var starting = false

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: template.name) {
            PlanPreviewContent(template: template, preview: preview, replacing: replacing) { starting = true }
                .disabled(model.demo && preview == nil)
        }
        .task {
            guard preview == nil, !model.demo else { return }
            preview = try? await model.api.trainingPlanPreview(templateId: template.id)
        }
        .sheet(isPresented: $starting) {
            StartPlanSheet(template: template, initial: preview) { done() }
        }
    }
}

/// The plan before the start, without the scroll view (so tests render it whole).
struct PlanPreviewContent: View {
    let template: TrainingPlans.Template
    let preview: PlanPreview?
    var replacing: TrainingPlans.Active? = nil
    let start: () -> Void
    @State private var allWeeks = false

    var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                Text(template.name).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 18)
                Text(template.goal).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).padding(.top, 4)
                Card {
                    PlanWeeksChart(bars: PlanWeeksChart.bars(weeks: template.weeks, preview: preview))
                    PlanLegend(weeks: template.weeks)
                }
                .padding(.top, 18)
                HStack(alignment: .top) {
                    stat(String(template.weeksCount), Fmt.plural(template.weeksCount, "týden", "týdny", "týdnů"))
                    Spacer()
                    stat(preview.map { String($0.totals.sessions) } ?? "–", L10n.tr("tréninků"))
                    Spacer()
                    stat(preview.map { "~" + planDuration($0.totals.minutes / max(1, template.weeksCount)) } ?? "–", L10n.tr("týdně"))
                    if tests > 0 {
                        Spacer()
                        stat(String(tests), template.sport == "ride" ? Fmt.plural(tests, "test FTP", "testy FTP", "testů FTP") : Fmt.plural(tests, "test", "testy", "testů"))
                    }
                }
                .padding(.top, 20).padding(.horizontal, 4)
                Card {
                    let weeks = allWeeks ? template.weeks : Array(template.weeks.prefix(4))
                    VStack(spacing: 0) {
                        ForEach(Array(weeks.enumerated()), id: \.element.id) { index, w in
                            if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            let p = preview?.weeks.first { $0.week == w.week }
                            PlanWeekRow(week: w.week, phase: w.phase, phaseLabel: w.phaseLabel, keys: w.keys, sessions: p?.sessions, minutes: p?.minutes)
                        }
                        if !allWeeks && template.weeks.count > 4 {
                            Rectangle().fill(Palette.hairline).frame(height: 1)
                            Button { withAnimation(.snappy) { allWeeks = true } } label: {
                                Text(L10n.f("+ další %@", "\(template.weeks.count - 4) " + Fmt.plural(template.weeks.count - 4, "týden", "týdny", "týdnů")))
                                    .font(Typo.caption).foregroundStyle(Palette.muted)
                                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.top, 16)
                PrimaryButton(title: L10n.tr(replacing == nil ? "Začít plán" : "Začít tento plán"), systemImage: "flag", action: start)
                    .padding(.top, 18)
            }
    }

    private var tests: Int { template.weeks.filter { $0.phase == "test" }.count }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(Typo.number(26)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}

/// Starting a plan: the day it starts (any day; a race plan ends on race day),
/// the days of the sport, and the weeks with their sessions and time.
struct StartPlanSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let template: TrainingPlans.Template
    var initial: PlanPreview? = nil
    var started: () -> Void = {}
    @State private var start = ""
    @State private var picked = Date()
    @State private var pickingDate = false
    @State private var days: [Int] = []
    @State private var raceDate = Date()
    @State private var raceKm: Double = 0
    /// A running race's goal time in seconds; nil follows the estimate.
    @State private var target: Int?
    @State private var pickingGoal = false
    @State private var preview: PlanPreview?
    @State private var busy = false
    @State private var error: String?

    private var today: String { AppModel.localDate(Date()) }
    /// Today, the next three days and next Monday.
    private var choices: [String] {
        // 2026-10-12 is a Monday: a day a multiple of 7 days from it is one too.
        let monday = ISODay.date("2026-10-12")
        let next = (1...7).map { ISODay.shift(today, $0) }.first { d in
            guard let a = monday, let b = ISODay.date(d) else { return false }
            return Int((b.timeIntervalSince(a) / 86400).rounded()) % 7 == 0
        } ?? ISODay.shift(today, 7)
        return Array(Set((0...3).map { ISODay.shift(today, $0) } + [next])).sorted()
    }
    private var key: String { [start, days.map(String.init).joined(separator: ","), AppModel.localDate(raceDate), String(raceKm), String(target ?? 0)].joined(separator: "|") }

    var body: some View {
        NavigationStack {
            SettingsPage(title: L10n.f("Začít %@", template.name)) {
                if let race = template.race {
                    SettingsGroup(title: L10n.tr("Závod"), footer: raceNote) {
                        DatePicker("Datum závodu", selection: $raceDate, in: Date()..., displayedComponents: .date)
                            .environment(\.locale, Fmt.locale)
                            .padding(.horizontal, 16).frame(minHeight: 50)
                        if let options = race.options, options.count > 1 {
                            SettingsDivider()
                            Picker(L10n.tr(race.kind == "climb" ? "Délka stoupání" : "Vzdálenost"), selection: $raceKm) {
                                ForEach(options, id: \.self) { Text(raceDistance($0)).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            .padding(16)
                        }
                        if template.sport == "run" {
                            SettingsDivider()
                            Button { pickingGoal = true } label: {
                                HStack {
                                    Text("Cílový čas").font(.body).foregroundStyle(Palette.ink)
                                    Spacer()
                                    Text(verbatim: (target ?? preview?.race?.estimate).map(raceTime) ?? "–")
                                        .font(.body).foregroundStyle(target == nil ? Palette.muted : Palette.ink)
                                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                                }
                                .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "Začátek")
                        HStack(spacing: 6) {
                            ForEach(choices, id: \.self) { d in dayChip(d) }
                            Button { pickingDate = true } label: {
                                Image(systemName: "calendar").font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(choices.contains(start) ? Palette.ink : Palette.onButton)
                                    .frame(maxWidth: .infinity, minHeight: 54)
                                    .background(choices.contains(start) ? Palette.card : Palette.button, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(L10n.tr("Jiný den"))
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: template.sport == "run" ? "Dny běhu" : "Dny na kole")
                    HStack(spacing: 6) {
                        ForEach(0..<7, id: \.self) { i in
                            let on = days.contains(i)
                            Button { toggle(i) } label: {
                                Text(weekdays[i]).font(.footnote.weight(.semibold))
                                    .foregroundStyle(on ? Palette.onAccent : Palette.muted)
                                    .frame(maxWidth: .infinity, minHeight: 38)
                                    .background(on ? Palette.amberBar : Palette.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                }
                if let preview {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(text: "Přehled")
                        Card {
                            VStack(spacing: 0) {
                                ForEach(Array(preview.weeks.enumerated()), id: \.element.id) { index, w in
                                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                                    PlanWeekRow(week: w.week, phase: w.phase, phaseLabel: w.phaseLabel, keys: w.keys, sessions: w.sessions, minutes: w.minutes)
                                }
                            }
                        }
                        Card {
                            HStack(alignment: .top) {
                                total(String(preview.totals.sessions), L10n.tr("tréninků"))
                                Spacer()
                                total(planDuration(preview.totals.minutes), L10n.tr("celkem"))
                                Spacer()
                                total("~" + Fmt.int(Double(preview.totals.tss)), "TSS")
                            }
                        }
                        Text(L10n.f("Konec %@", Fmt.dayMonth(preview.endDate))).font(Typo.sentence(17)).foregroundStyle(Palette.muted).padding(.top, 4)
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: buttonTitle, systemImage: "flag", busy: busy) { Task { await begin() } }
                    .disabled(busy || model.demo || days.isEmpty)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
            }
            .sheet(isPresented: $pickingGoal) {
                GoalTimeSheet(km: raceKm > 0 ? raceKm : template.race?.km ?? 10, estimate: preview?.race?.estimate, weeks: preview?.weeks.count ?? template.weeksCount, initial: target) { target = $0 }
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: $pickingDate) {
                VStack(spacing: 16) {
                    DatePicker("Začátek", selection: $picked, in: Date()...(Calendar.current.date(byAdding: .day, value: 120, to: Date()) ?? Date()), displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .environment(\.locale, Fmt.locale)
                    PrimaryButton(title: L10n.tr("Hotovo")) { start = AppModel.localDate(picked); pickingDate = false }
                }
                .padding(20)
                .presentationDetents([.medium, .large])
            }
        }
        .onAppear {
            if start.isEmpty { start = initial?.firstDay ?? initial?.startDate ?? today }
            if start < today { start = today }
            if days.isEmpty { days = initial?.days ?? [] }
            if preview == nil { preview = initial }
            raceKm = template.race?.km ?? 0
            raceDate = Calendar.current.date(byAdding: .day, value: template.weeksCount * 7, to: Date()) ?? Date()
        }
        .task(id: key) {
            guard !model.demo, !start.isEmpty else { return }
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            do {
                let fresh = try await model.api.trainingPlanPreview(templateId: template.id, startDate: template.race == nil ? start : nil, days: days.isEmpty ? nil : days, raceDate: template.race == nil ? nil : AppModel.localDate(raceDate),
                                                                     raceKm: template.race == nil ? nil : raceKm, targetSeconds: target)
                preview = fresh
                if days.isEmpty { days = fresh.days }
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private var weekdays: [String] { L10n.isEnglish ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] }

    /// Under the race: a running race's estimate and goal pace, a cycling race's power and time.
    private var raceNote: String? {
        guard let race = preview?.race else { return nil }
        if template.sport == "run" {
            guard let estimate = race.estimate else { return L10n.tr("Odhad času se ukáže, až bude známé tvoje prahové tempo.") }
            let pace = Units.paceText(Double(target ?? estimate) / max(race.km, 1))
            return L10n.f("Teď zhruba %@. Cílové tempo %@, plán ho během týdnů zpřesní.", raceTime(estimate), pace)
        }
        guard let low = race.low, let high = race.high, let minutes = race.minutes else { return nil }
        var text = L10n.f("Na závod %@ W, odhad času %@.", "\(low)–\(high)", "~" + planDuration(minutes))
        if race.kind == "climb" { text += " " + L10n.tr("Odhad platí pro stoupání se sklonem 6 %.") }
        if race.estimated == true { text += " " + L10n.tr("Bez FTP počítám s 2,5 W/kg.") }
        return text
    }

    private var buttonTitle: String {
        if template.race != nil { return L10n.tr("Začít plán") }
        return start == today ? L10n.tr("Začít dnes") : L10n.f("Začít %@", Fmt.onWeekday(start) + " " + Fmt.dayMonth(start))
    }

    private func dayChip(_ d: String) -> some View {
        let on = d == start
        return Button { start = d } label: {
            VStack(spacing: 2) {
                Text(d == today ? L10n.tr("dnes") : Fmt.weekdayShort(d)).font(.caption.weight(.medium)).opacity(0.75)
                Text(String(Int(d.suffix(2)) ?? 0)).font(Typo.number(20))
            }
            .foregroundStyle(on ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func toggle(_ i: Int) {
        if days.contains(i) { if days.count > 1 { days.removeAll { $0 == i } } } else { days = (days + [i]).sorted() }
    }

    private func total(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(Typo.number(24)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }

    private func begin() async {
        busy = true
        defer { busy = false }
        var body: JSONObject = ["action": .string("start"), "templateId": .string(template.id), "days": .array(days.map { .number(Double($0)) })]
        if template.race != nil {
            body["raceDate"] = .string(AppModel.localDate(raceDate))
            body["raceKm"] = .number(raceKm)
            if let target { body["targetSeconds"] = .number(Double(target)) }
        } else {
            body["startDate"] = .string(start)
        }
        do {
            _ = try await model.api.trainingPlanAction(body)
            await model.refreshTraining()
            dismiss()
            started()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A running race's goal time on wheels: the estimate now, the goal pace and
/// how bold the goal is for the weeks the plan has.
struct GoalTimeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let km: Double
    let estimate: Int?
    let weeks: Int
    let initial: Int?
    let save: (Int?) -> Void
    @State private var hours = 0
    @State private var minutes = 0
    @State private var seconds = 0

    private var goal: Int { hours * 3600 + minutes * 60 + seconds }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 0) {
                    wheel($hours, 0..<10, "h")
                    wheel($minutes, 0..<60, "min")
                    wheel($seconds, 0..<60, "s")
                }
                .frame(height: 170)
                VStack(spacing: 0) {
                    row(L10n.tr("Teď zhruba"), estimate.map(raceTime) ?? "–")
                    SettingsDivider()
                    row(L10n.tr("Cílové tempo"), Units.paceText(Double(goal) / max(km, 1)))
                }
                .cardSurface(cornerRadius: 22)
                if let verdict = GoalTimeSheet.verdict(goal: goal, estimate: estimate, weeks: weeks) {
                    Text(verbatim: verdict.0).font(Typo.small).foregroundStyle(verdict.1).fixedSize(horizontal: false, vertical: true)
                }
                if estimate != nil {
                    Button { save(nil); dismiss() } label: {
                        Text("Podle odhadu").font(Typo.bodyStrong).foregroundStyle(Palette.amber)
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .padding(20)
            .navigationTitle(L10n.tr("Cílový čas"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { save(goal >= 600 ? goal : nil); dismiss() }.disabled(goal < 600)
                }
            }
        }
        .onAppear {
            let value = initial ?? estimate ?? Int(km * 360)
            hours = value / 3600
            minutes = value % 3600 / 60
            seconds = value % 60
        }
    }

    /// The goal against the estimate, as the server judges it (race-estimate.js goalVerdict).
    static func verdict(goal: Int, estimate: Int?, weeks: Int) -> (String, Color)? {
        guard let estimate, estimate > 0, goal >= 600 else { return nil }
        let faster = Double(estimate - goal) / Double(estimate), months = max(1, Double(weeks) / 4.3)
        let span = "\(weeks) " + Fmt.plural(weeks, "týden", "týdny", "týdnů"), gap = raceTime(abs(estimate - goal))
        if faster <= 0 { return (L10n.tr("Pomalejší než tvůj odhad: zvládneš ho s rezervou."), Palette.green) }
        if faster <= 0.01 * months { return (L10n.f("O %@ rychleji než teď: reálný cíl na %@.", gap, span), Palette.green) }
        if faster <= 0.02 * months { return (L10n.f("O %@ rychleji než teď: odvážný, ale reálný cíl na %@.", gap, span), Palette.amber) }
        return (L10n.f("O %@ rychleji než teď: na %@ hodně odvážné, zkus pomalejší cíl.", gap, span), Palette.rust)
    }

    private func wheel(_ value: Binding<Int>, _ range: Range<Int>, _ unit: String) -> some View {
        Picker(unit, selection: value) {
            ForEach(range, id: \.self) { n in Text(verbatim: unit == "h" ? "\(n) h" : String(format: "%02d", n) + " " + unit).tag(n) }
        }
        .pickerStyle(.wheel)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(verbatim: title).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            Text(verbatim: value).font(.body).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 16).frame(minHeight: 50)
    }
}

// MARK: - The running plan

/// The running ride or run plan, opened straight from Training: the weeks
/// (past ones coloured by how much was done), this week's sessions to change,
/// the time for this week and all the weeks.
struct ActivePlanView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var plans: TrainingPlans
    @State var preview: PlanPreview? = nil
    @State var week: PlanWeekDetail? = nil
    @State private var menu = false
    @State private var confirmStop = false
    @State private var choosing = false
    @State private var rescheduling = false
    @State private var editingDays = false
    @State private var editingGoal = false
    @State private var error: String?

    private var active: TrainingPlans.Active? { plans.active }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.training)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    BackSlot { dismiss() }
                    if let active {
                        ActivePlanContent(active: active, preview: preview, week: week, error: error, editDays: { editingDays = true },
                                          editGoal: active.template.sport == "run" && active.race != nil ? { editingGoal = true } : nil) { await reload() }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 100)
            }
            .refreshable { await reload() }
        }
        .floatingBack(title: active?.name, trailing: ChromeAction(systemImage: "ellipsis", label: L10n.tr("Plán")) { menu = true }) { dismiss() }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            guard !model.demo else { return }
            await reload()
        }
        .confirmationDialog(active?.name ?? "", isPresented: $menu, titleVisibility: .hidden) {
            if active?.template.race == nil { Button("Změnit začátek") { rescheduling = true } }
            Button("Jiný plán") { choosing = true }
            Button("Ukončit plán", role: .destructive) { confirmStop = true }
        }
        .confirmationDialog("Ukončit plán?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Ukončit plán", role: .destructive) { Task { await stop() } }
        }
        .sheet(isPresented: $choosing, onDismiss: { Task { await reload() } }) { TrainingPlansSheet(plans: plans) }
        .sheet(isPresented: $rescheduling, onDismiss: { Task { await reload() } }) { ReschedulePlanSheet() }
        .sheet(isPresented: $editingDays, onDismiss: { Task { await reload() } }) {
            if let week { WeekDaysSheet(week: week, usual: preview?.days.count ?? week.sessions.count) }
        }
        .sheet(isPresented: $editingGoal) {
            if let active, let race = active.race {
                GoalTimeSheet(km: race.km, estimate: race.estimate, weeks: max(1, active.weeksCount - max(0, active.week - 1)), initial: race.target) { value in
                    Task { await saveGoal(value) }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func saveGoal(_ seconds: Int?) async {
        do {
            _ = try await model.api.trainingPlanAction(["action": .string("target"), "targetSeconds": seconds.map { JSONValue.number(Double($0)) } ?? JSONValue.null])
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func reload() async {
        guard !model.demo else { return }
        do {
            let fresh = try await model.api.trainingPlans()
            plans = fresh
            let current = fresh.active.map { $0.started && $0.paused != true ? $0.week : 0 } ?? 0
            async let p = try? model.api.trainingPlanPreview()
            async let w = try? model.api.trainingPlanWeek(max(1, current))
            let loadedWeek = await w
            preview = await p
            week = current > 0 ? loadedWeek : nil
            error = nil
            if fresh.active == nil { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func stop() async {
        do {
            _ = try await model.api.trainingPlanAction(["action": .string("stop"), "sport": .string(active?.template.sport ?? "ride")])
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The running plan without the scroll view (so tests render it whole).
struct ActivePlanContent: View {
    let active: TrainingPlans.Active
    let preview: PlanPreview?
    let week: PlanWeekDetail?
    var error: String? = nil
    var editDays: () -> Void = {}
    /// A running race plan: change the goal time.
    var editGoal: (() -> Void)? = nil
    var reload: () async -> Void = {}
    @State private var allWeeks = false

    var body: some View {
        let phase = active.template.weeks.first { $0.week == active.week }?.phaseLabel ?? ""
        VStack(alignment: .leading, spacing: 0) {
        SectionLabel(text: active.paused == true ? L10n.tr("pozastaveno")
                     : active.started ? L10n.f("Týden %@ z %@", String(active.week), String(active.weeksCount)) + " · " + phase
                     : L10n.f("Začíná %@", Fmt.dayMonth(active.firstDay ?? active.startDate)))
            .padding(.top, 24)
        Text(active.name).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
        Card {
            PlanWeeksChart(bars: PlanWeeksChart.bars(weeks: active.template.weeks, preview: preview, active: active), current: active.started ? active.week : 0)
        }
        .padding(.top, 16)
        if let race = active.race {
            if active.template.sport == "run" { runGoal(race).padding(.top, 12) } else { rideRace(race).padding(.top, 12) }
        }

        if active.started, active.paused != true, let week {
            SectionLabel(text: L10n.tr("Tento týden") + " · " + Fmt.dayMonth(week.monday) + "–" + Fmt.dayMonth(ISODay.shift(week.monday, 6))).padding(.top, 26)
            Button(action: editDays) {
                HStack(spacing: 12) {
                    Image(systemName: "clock").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.amber)
                        .frame(width: 30, height: 30).background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    Text("Čas tento týden").font(.body).foregroundStyle(Palette.ink)
                    Spacer()
                    Text("\(week.weekDays ?? week.sessions.count) " + Fmt.plural(week.weekDays ?? week.sessions.count, "den", "dny", "dní")).font(.body).foregroundStyle(Palette.muted)
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .padding(.horizontal, 16).frame(minHeight: 52)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 10)
            PlanSessionList(detail: week, sport: active.template.sport, changed: reload)
                .padding(.top, 10)
        }

        SectionLabel(text: "Týdny").padding(.top, 26)
        Card {
            let weeks = allWeeks ? active.template.weeks : Array(active.template.weeks.prefix(max(4, active.week + 1)))
            VStack(spacing: 0) {
                ForEach(Array(weeks.enumerated()), id: \.element.id) { index, w in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    let p = preview?.weeks.first { $0.week == w.week }
                    NavigationLink { PlanWeekView(week: w, sport: active.template.sport) } label: {
                        PlanWeekRow(week: w.week, phase: w.phase, phaseLabel: w.phaseLabel, keys: w.keys, sessions: p?.sessions, minutes: p?.minutes,
                                    done: active.done(w.week), current: active.started && w.week == active.week, chevron: true)
                    }
                    .buttonStyle(.plain)
                }
                if weeks.count < active.template.weeks.count {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    let rest = active.template.weeks.count - weeks.count
                    Button { withAnimation(.snappy) { allWeeks = true } } label: {
                        Text(L10n.f("+ další %@", "\(rest) " + Fmt.plural(rest, "týden", "týdny", "týdnů")))
                            .font(Typo.caption).foregroundStyle(Palette.muted)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 10)
        if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
        }
    }

    /// A running race: the goal, the estimate now and how far it moved since the start.
    private func runGoal(_ race: PlanRace) -> some View {
        Card {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Cíl").font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: race.target.map(raceTime) ?? "–").font(Typo.number(26)).foregroundStyle(Palette.ink)
                    if let pace = race.goalPace { Text(verbatim: Units.paceText(Double(pace))).font(Typo.caption).foregroundStyle(Palette.muted) }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Teď zhruba").font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: race.estimate.map(raceTime) ?? "–").font(Typo.number(26)).foregroundStyle(Palette.ink)
                    if let now = race.estimate, let start = race.estimateStart, now != start {
                        Text(verbatim: L10n.f(now < start ? "o %@ rychleji než na startu" : "o %@ pomaleji než na startu", raceTime(abs(start - now))))
                            .font(Typo.caption).foregroundStyle(now < start ? Palette.green : Palette.muted)
                    }
                }
            }
            // From the estimate at the start towards the goal.
            if let goal = race.target, let now = race.estimate, let start = race.estimateStart, start > goal {
                let part = min(1, max(0, Double(start - now) / Double(start - goal)))
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Palette.track)
                        Capsule().fill(Palette.amberBar).frame(width: max(6, geo.size.width * part))
                    }
                }
                .frame(height: 8)
                HStack {
                    Text("start").font(Typo.caption).foregroundStyle(Palette.faint)
                    Spacer()
                    Text(verbatim: L10n.tr("cíl") + (active.raceDate.map { " " + Fmt.dayMonth($0) } ?? "")).font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
            if let editGoal {
                Button(action: editGoal) {
                    Text(verbatim: L10n.tr(race.target == nil ? "Zadat cílový čas" : "Změnit cílový čas")).font(Typo.bodyStrong).foregroundStyle(Palette.amber)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// A cycling race: its power and time on its course.
    @ViewBuilder private func rideRace(_ race: PlanRace) -> some View {
        if let low = race.low, let high = race.high, let minutes = race.minutes {
            Card {
                WidgetHeader(title: L10n.tr("Závod"), color: Palette.green, trailing: active.raceDate.map { Fmt.dayMonth($0) })
                Text(verbatim: active.template.name + " " + raceDistance(race.km)).font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                HStack(alignment: .top, spacing: 24) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "\(low)–\(high) W").font(Typo.number(24)).foregroundStyle(Palette.ink)
                        Text(verbatim: race.kind == "granfondo" ? "65–75 % FTP" : race.kind == "mtb" ? "70–80 % FTP" : "\(race.share ?? 100) % FTP").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "~" + planDuration(minutes)).font(Typo.number(24)).foregroundStyle(Palette.ink)
                        Text("odhad času").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
                Text(verbatim: L10n.tr(race.kind == "climb" ? "Odhad pro stoupání se sklonem 6 % bez větru." : race.kind == "mtb" ? "Odhad pro terén bez velkých kopců, kopce ho prodlouží." : "Odhad na rovině bez větru, kopce ho prodlouží."))
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

}

/// "Změnit začátek": the plan starts again from another day.
struct ReschedulePlanSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var day = Date()
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Změnit začátek").font(.headline).foregroundStyle(Palette.ink)
            DatePicker("Začátek", selection: $day, in: Date()...(Calendar.current.date(byAdding: .day, value: 120, to: Date()) ?? Date()), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .environment(\.locale, Fmt.locale)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            PrimaryButton(title: L10n.f("Začít znovu %@", Fmt.dayMonth(AppModel.localDate(day))), busy: busy) {
                Task {
                    busy = true
                    defer { busy = false }
                    do {
                        _ = try await model.api.trainingPlanAction(["action": .string("reschedule"), "startDate": .string(AppModel.localDate(day))])
                        await model.refreshTraining()
                        dismiss()
                    } catch { self.error = error.localizedDescription }
                }
            }
            .disabled(busy || model.demo)
        }
        .padding(20)
        .presentationDetents([.large])
    }
}

// MARK: - A week of the plan

/// GET /app/api/plans/week?week=N.
struct PlanWeekDetail: Decodable, Equatable {
    struct Session: Decodable, Equatable, Identifiable {
        var id: String { date + (workoutId ?? "") }
        let date: String
        let label: String?
        let kind: String
        let minutes: Double?
        let workoutId: String?
        let workout: PlannedWorkout.Workout?
        var done: Bool? = nil
        /// Today or later and not done yet: it can be moved, shortened or skipped.
        var editable: Bool? = nil
        var edited: Bool? = nil

        var name: String { workout?.name ?? label ?? "" }
        var length: Int { Int((workout?.duration_minutes ?? minutes ?? 0).rounded()) }
        var isKey: Bool { ["quality", "test", "race"].contains(kind) }
    }
    let week: Int
    let weeksCount: Int
    let monday: String
    let phaseLabel: String?
    let sessions: [Session]
    var weekDays: Int? = nil
}

extension APIClient {
    func trainingPlanWeek(_ week: Int) async throws -> PlanWeekDetail {
        try await get("/app/api/plans/week?week=\(week)")
    }
}

/// A week of the plan: how many sessions and how long, and the sessions.
struct PlanWeekView: View {
    @Environment(AppModel.self) private var model
    let week: TrainingPlans.Week
    let sport: String
    @State var detail: PlanWeekDetail? = nil
    @State private var error: String?

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: week.phaseLabel) {
            PlanWeekContent(week: week, sport: sport, detail: detail, error: error) { await load() }
        }
        .task {
            guard detail == nil, !model.demo else { return }
            await load()
        }
    }

    private func load() async {
        do { detail = try await model.api.trainingPlanWeek(week.week); error = nil } catch { self.error = error.localizedDescription }
    }
}

/// A week of the plan without the scroll view (so tests render it whole).
struct PlanWeekContent: View {
    let week: TrainingPlans.Week
    let sport: String
    let detail: PlanWeekDetail?
    var error: String? = nil
    var reload: () async -> Void = {}

    var body: some View {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: L10n.f("Týden %@", String(week.week)) + (detail.map { " · " + Fmt.dayMonth($0.monday) + "–" + Fmt.dayMonth(ISODay.shift($0.monday, 6)) } ?? "")).padding(.top, 24)
                Text(week.phaseLabel).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                if let detail {
                    HStack(spacing: 26) {
                        stat(String(detail.sessions.count), Fmt.plural(detail.sessions.count, "trénink", "tréninky", "tréninků"))
                        stat(planDuration(detail.sessions.reduce(0) { $0 + $1.length }), L10n.tr("čas"))
                        let tss = detail.sessions.compactMap { $0.workout?.target_load }.reduce(0, +)
                        if tss > 0 { stat(Fmt.int(tss), "TSS") }
                    }
                    .padding(.top, 16).padding(.horizontal, 4)
                    if detail.sessions.isEmpty {
                        Text("V tomto týdnu nejsou žádné tréninky.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 18)
                    } else {
                        PlanSessionList(detail: detail, sport: sport, changed: reload).padding(.top, 16)
                    }
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 18)
                } else {
                    ProgressView().padding(.top, 30).frame(maxWidth: .infinity)
                }
            }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(Typo.number(26)).foregroundStyle(Palette.ink)
            Text(label).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }
}

/// The sessions of a week, each with its profile: done ones ticked, today's
/// marked, and the ones ahead with "Přesunout, Zkrátit, Vynechat".
struct PlanSessionList: View {
    @Environment(AppModel.self) private var model
    let detail: PlanWeekDetail
    let sport: String
    var changed: () async -> Void = {}
    @State private var moving: PlanWeekDetail.Session?
    @State private var shortening: PlanWeekDetail.Session?
    @State private var skipping: PlanWeekDetail.Session?
    @State private var error: String?

    private var today: String { AppModel.localDate(Date()) }

    var body: some View {
        Card {
            VStack(spacing: 0) {
                ForEach(Array(detail.sessions.enumerated()), id: \.element.id) { index, s in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    NavigationLink { PlanSessionView(session: s, sport: sport) } label: { row(s) }
                        .buttonStyle(.plain)
                        .disabled(s.workout == nil)
                        .contextMenu { if s.editable == true { actions(s) } }
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .sheet(item: $moving) { s in
            MoveSessionSheet(session: s, detail: detail) { to in await edit(["date": .string(s.date), "op": .string("move"), "to": .string(to)]) }
                .presentationDetents([.height(330)])
        }
        .sheet(item: $shortening) { s in
            ShortenSessionSheet(session: s) { minutes in await edit(["date": .string(s.date), "op": .string("minutes"), "minutes": .number(Double(minutes))]) }
                .presentationDetents([.height(300)])
        }
        .confirmationDialog(L10n.f("Vynechat %@?", skipping?.name ?? ""), isPresented: Binding(get: { skipping != nil }, set: { if !$0 { skipping = nil } }), titleVisibility: .visible) {
            Button("Vynechat", role: .destructive) {
                if let s = skipping { Task { await edit(["date": .string(s.date), "op": .string("skip")]) } }
            }
        }
    }

    @ViewBuilder private func actions(_ s: PlanWeekDetail.Session) -> some View {
        Button { moving = s } label: { Label("Přesunout", systemImage: "calendar") }
        Button { shortening = s } label: { Label("Zkrátit", systemImage: "clock") }
        Button(role: .destructive) { skipping = s } label: { Label("Vynechat", systemImage: "xmark") }
        if s.edited == true {
            Button { Task { await edit(["date": .string(s.date), "op": .string("reset")]) } } label: { Label("Vrátit podle plánu", systemImage: "arrow.uturn.backward") }
        }
    }

    private func row(_ s: PlanWeekDetail.Session) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Text(subtitle(s)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Spacer()
                badge(s)
                trailing(s)
            }
            profile(s)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private func subtitle(_ s: PlanWeekDetail.Session) -> String {
        var text: String = Fmt.weekdayShort(s.date) + " " + Fmt.dayMonth(s.date)
        text += " · " + planDuration(s.length)
        if let load = s.workout?.target_load { text += " · " + Fmt.int(load) + " TSS" }
        return text
    }

    @ViewBuilder private func badge(_ s: PlanWeekDetail.Session) -> some View {
        if s.done == true {
            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.green)
                .frame(width: 24, height: 24).background(Palette.greenSoft, in: Circle())
                .accessibilityLabel(L10n.tr("hotovo"))
        } else if s.date == today {
            Text("dnes").font(.caption2.weight(.semibold)).foregroundStyle(Palette.amber)
                .padding(.horizontal, 8).padding(.vertical, 3).background(Palette.amberSoft, in: Capsule())
        }
    }

    @ViewBuilder private func trailing(_ s: PlanWeekDetail.Session) -> some View {
        if s.editable == true {
            Menu { actions(s) } label: {
                Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.muted)
                    .frame(width: 32, height: 32).contentShape(Rectangle())
            }
            .accessibilityLabel(L10n.tr("Upravit trénink"))
        } else {
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
        }
    }

    @ViewBuilder private func profile(_ s: PlanWeekDetail.Session) -> some View {
        if let blocks = s.workout?.steps, !WorkoutProfile.segments(blocks).isEmpty {
            WorkoutProfile(blocks: blocks, sport: sport, compact: true).opacity(s.done == true ? 0.5 : 1)
        }
    }

    private func edit(_ change: JSONObject) async {
        var body = change
        body["action"] = .string("edit")
        do {
            _ = try await model.api.trainingPlanAction(body)
            error = nil
            moving = nil; shortening = nil; skipping = nil
            await model.refreshTraining()
            await changed()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Moving a session to another day of the week; the other day's session takes its place.
struct MoveSessionSheet: View {
    let session: PlanWeekDetail.Session
    let detail: PlanWeekDetail
    let move: (String) async -> Void
    @State private var day: String?
    @State private var busy = false

    private var days: [String] {
        let today = AppModel.localDate(Date())
        return (0..<7).map { ISODay.shift(detail.monday, $0) }.filter { $0 >= today && $0 != session.date }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.f("Přesunout %@", session.name)).font(.headline).foregroundStyle(Palette.ink)
            HStack(spacing: 6) {
                ForEach(days, id: \.self) { d in
                    Button { day = d } label: {
                        VStack(spacing: 2) {
                            Text(Fmt.weekdayShort(d)).font(.caption.weight(.medium))
                            Text(String(Int(d.suffix(2)) ?? 0)).font(Typo.number(20))
                        }
                        .foregroundStyle(day == d ? Palette.onButton : Palette.ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(day == d ? Palette.button : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            if let day, let other = detail.sessions.first(where: { $0.date == day }) {
                Text(L10n.f("%@ se přesune %@.", other.name, Fmt.onWeekday(session.date)))
                    .font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if days.isEmpty {
                Text("Do konce týdne už není den, kam ho přesunout.").font(Typo.small).foregroundStyle(Palette.muted)
            }
            PrimaryButton(title: day.map { L10n.f("Přesunout %@", Fmt.onWeekday($0)) } ?? L10n.tr("Vyber den"), busy: busy) {
                guard let day else { return }
                Task { busy = true; await move(day); busy = false }
            }
            .disabled(day == nil || busy)
        }
        .padding(20)
    }
}

/// Shortening a session: a few lengths under its own.
struct ShortenSessionSheet: View {
    let session: PlanWeekDetail.Session
    let shorten: (Int) async -> Void
    @State private var minutes: Int?
    @State private var busy = false

    private var options: [Int] {
        let own = session.length
        let list = [30, 45, 60, 75, 90, 120].filter { $0 < own }
        return Array(list.suffix(4))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.f("Zkrátit %@", session.name)).font(.headline).foregroundStyle(Palette.ink)
            HStack(spacing: 8) {
                ForEach(options, id: \.self) { m in
                    Button { minutes = m } label: {
                        Text(planDuration(m)).font(Typo.bodyStrong)
                            .foregroundStyle(minutes == m ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity, minHeight: 46)
                            .background(minutes == m ? Palette.button : Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            if session.isKey {
                Text("Hlavní část zůstane, zkrátí se rozjetí a vyjetí.").font(Typo.small).foregroundStyle(Palette.secondary)
            }
            PrimaryButton(title: minutes.map { L10n.f("Zkrátit na %@", planDuration($0)) } ?? L10n.tr("Vyber délku"), busy: busy) {
                guard let minutes else { return }
                Task { busy = true; await shorten(minutes); busy = false }
            }
            .disabled(minutes == nil || busy)
        }
        .padding(20)
        .onAppear { minutes = options.last }
    }
}

/// "Čas tento týden": fewer days of the plan this week; the easy sessions go
/// first, the key ones stay.
struct WeekDaysSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let week: PlanWeekDetail
    let usual: Int
    @State private var days = 0
    @State private var busy = false
    @State private var error: String?

    /// The sessions this week would keep with `days` days (as the server drops them).
    private var dropped: Set<String> {
        let all = week.sessions
        let rank: (PlanWeekDetail.Session) -> Int = { ["recovery": 0, "easy": 1, "long": 2][$0.kind] ?? 9 }
        let extra = max(0, all.count - days)
        let order = all.filter { rank($0) < 9 }.sorted { rank($0) != rank($1) ? rank($0) < rank($1) : $0.date > $1.date }
        return Set(order.prefix(extra).map(\.id))
    }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Čas tento týden") {
                Picker("Dny", selection: $days) {
                    ForEach(max(1, keyCount)...max(usual, week.sessions.count, keyCount, 1), id: \.self) { n in
                        Text("\(n) " + Fmt.plural(n, "den", "dny", "dní")).tag(n)
                    }
                }
                .pickerStyle(.segmented)
                Card {
                    VStack(spacing: 0) {
                        ForEach(Array(week.sessions.enumerated()), id: \.element.id) { index, s in
                            if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            let out = dropped.contains(s.id)
                            HStack(spacing: 12) {
                                Image(systemName: out ? "minus.circle" : "checkmark.circle.fill")
                                    .font(.system(size: 20)).foregroundStyle(out ? Palette.faint : s.done == true ? Palette.green : Palette.amberBar)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.name).font(.body).foregroundStyle(out ? Palette.faint : Palette.ink).strikethrough(out)
                                    Text(Fmt.weekdayShort(s.date) + " · " + (s.done == true ? L10n.tr("hotovo") : out ? L10n.tr("vypadne") : planDuration(s.length)))
                                        .font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                            }
                            .padding(.vertical, 10)
                        }
                    }
                }
                Text("Klíčové tréninky zůstanou.").font(Typo.small).foregroundStyle(Palette.secondary)
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: L10n.tr("Upravit týden"), busy: busy) { Task { await save(days >= usual ? nil : days) } }
                    .disabled(busy || model.demo)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
            }
        }
        .onAppear { days = week.weekDays ?? week.sessions.count }
    }

    private var keyCount: Int { week.sessions.filter(\.isKey).count }

    private func save(_ value: Int?) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.api.trainingPlanAction(["action": .string("weekDays"), "days": value.map { .number(Double($0)) } ?? .null])
            await model.refreshTraining()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - The end

/// A finished plan: FTP before and after, fitness, the sessions and time done
/// and each week done in %; what next.
struct PlanResultView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let result: PlanResult
    var plans: TrainingPlans? = nil

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            PageScroll {
                VStack(alignment: .leading, spacing: 0) {
                    BackSlot { dismiss() }
                    PlanResultContent(result: result, plans: plans) { await close() }
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 100)
            }
        }
        .floatingBack(title: result.name) { dismiss() }
        .toolbar(.hidden, for: .navigationBar)
    }

    /// The result seen: it leaves Training.
    private func close() async {
        _ = try? await model.api.trainingPlanAction(["action": .string("close"), "id": .number(Double(result.id))])
        await model.refreshTraining()
        dismiss()
    }
}

/// A finished plan without the scroll view (so tests render it whole).
struct PlanResultContent: View {
    @Environment(AppModel.self) private var model
    let result: PlanResult
    var plans: TrainingPlans? = nil
    var close: () async -> Void = {}

    var body: some View {
                VStack(alignment: .leading, spacing: 0) {
                    SectionLabel(text: result.name + " · " + Fmt.dayMonth(result.startDate) + "–" + Fmt.dayMonth(result.endDate)).padding(.top, 24)
                    Text("Plán splněn").font(Typo.sentence(34, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                    if let start = result.ftpStart, let end = result.ftpEnd {
                        Card {
                            VStack(spacing: 4) {
                                Text("FTP").font(Typo.caption).foregroundStyle(Palette.muted)
                                HStack(alignment: .firstTextBaseline, spacing: 12) {
                                    Text(Fmt.int(start)).font(Typo.number(30)).foregroundStyle(Palette.muted)
                                    Image(systemName: "arrow.right").font(.system(size: 14)).foregroundStyle(Palette.faint)
                                    Text(Fmt.int(end) + " W").font(Typo.number(52)).foregroundStyle(Palette.ink)
                                }
                                let gain = end - start
                                Text((gain >= 0 ? "+" : "−") + Fmt.int(abs(gain)) + " W · " + (gain >= 0 ? "+" : "−") + Fmt.int(abs(gain) / max(start, 1) * 100) + " %")
                                    .font(Typo.bodyStrong).foregroundStyle(gain >= 0 ? Palette.green : Palette.rust)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .padding(.top, 16)
                    }
                    // A gym plan: the estimated max of its main lifts at the start and the end.
                    if let lifts = result.lifts, !lifts.isEmpty {
                        Card {
                            VStack(spacing: 0) {
                                ForEach(Array(lifts.enumerated()), id: \.element.id) { index, lift in
                                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                                    let gain = lift.after - lift.before
                                    compare(Fmt.capitalized(lift.exercise), Units.weightText(lift.before, digits: lift.before.rounded() == lift.before ? 0 : 1),
                                            Units.weightText(lift.after, digits: lift.after.rounded() == lift.after ? 0 : 1),
                                            (gain >= 0 ? "+" : "−") + Fmt.int(abs(gain) / max(lift.before, 1) * 100) + " %", gain >= 0 ? Palette.green : Palette.rust)
                                }
                                Text("Odhad maxima z nejlepší série do 12 opakování.").font(Typo.caption).foregroundStyle(Palette.muted)
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 4)
                            }
                        }
                        .padding(.top, 16)
                    }
                    Card {
                        VStack(spacing: 0) {
                            if let a = result.ctlStart, let b = result.ctlEnd {
                                compare("Kondice", Fmt.int(a), Fmt.int(b), (b >= a ? "+" : "−") + Fmt.int(abs(b - a)), b >= a ? Palette.green : Palette.rust)
                                Rectangle().fill(Palette.hairline).frame(height: 1)
                            }
                            let planned = result.sessionsPlanned ?? 0
                            let pct = planned > 0 ? min(100, result.sessionsDone * 100 / planned) : nil
                            compare("Tréninky", nil, planned > 0 ? L10n.f("%@ z %@", String(result.sessionsDone), String(planned)) : String(result.sessionsDone), pct.map { "\($0) %" }, pct.map(PlanColors.done) ?? Palette.muted)
                            if result.sport != "gym" {
                                Rectangle().fill(Palette.hairline).frame(height: 1)
                                compare("Čas", nil, planDuration(result.minutesDone), result.minutesPlanned.map { L10n.f("z %@", planDuration($0)) }, Palette.muted)
                            }
                        }
                    }
                    .padding(.top, 12)
                    Card {
                        PlanWeeksChart(bars: PlanWeeksChart.bars(weeks: result.weeks, completion: result.completion), current: result.weeks.count + 1)
                    }
                    .padding(.top, 12)
                    if let plans, !result.next.isEmpty {
                        SectionLabel(text: "Co dál").padding(.top, 26)
                        SettingsGroup {
                            ForEach(Array(result.next.enumerated()), id: \.element.id) { index, next in
                                if index > 0 { SettingsDivider() }
                                if let template = plans.templates.first(where: { $0.id == next.id }) {
                                    NavigationLink {
                                        if template.sport == "gym" { PlanDetailView(template: template, active: nil) } else { PlanPreviewView(template: template, done: { Task { await close() } }) }
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(next.name).font(.body).foregroundStyle(Palette.ink)
                                                Text(next.goal).font(Typo.caption).foregroundStyle(Palette.muted)
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                                        }
                                        .padding(.horizontal, 16).padding(.vertical, 10).contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(.top, 10)
                    }
                    SecondaryButton(title: "Hotovo") { Task { await close() } }
                        .disabled(model.demo)
                        .padding(.top, 22)
                }
    }

    private func compare(_ title: String, _ before: String?, _ after: String, _ change: String?, _ color: Color) -> some View {
        HStack(spacing: 10) {
            Text(LocalizedStringKey(title)).font(.body).foregroundStyle(Palette.ink)
            Spacer()
            if let before {
                Text(before).font(Typo.small).foregroundStyle(Palette.muted)
                Image(systemName: "arrow.right").font(.system(size: 11)).foregroundStyle(Palette.faint)
            }
            Text(after).font(Typo.number(20)).foregroundStyle(Palette.ink)
            if let change {
                Text(change).font(.footnote.weight(.semibold)).foregroundStyle(color).frame(minWidth: 56, alignment: .trailing)
            }
        }
        .padding(.vertical, 12)
    }

}
