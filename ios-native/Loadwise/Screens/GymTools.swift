import PhotosUI
import SwiftUI
import UIKit

// MARK: - Training → tools

/// Training: the gym (the workout mode and the equipment), then one library
/// for ride, run and gym workouts.
struct TrainingTools: View {
    let today: String
    var addWorkout: () -> Void = {}

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Posilovna")
            // Today's plan in the workout mode, or an empty workout there; the
            // last workout's exercises with the next loads (GymLive.swift).
            NavigationLink(value: AppRoute.trainingMode(today)) {
                Label("Začít trénink", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            NavigationLink(value: AppRoute.liveGym(today, true)) {
                Label("Zopakovat minulou", systemImage: "arrow.counterclockwise").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            LibraryWidget()
            LazyVGrid(columns: columns, spacing: 10) {
                tile(.weekPlan, "calendar.badge.plus", "Plán týdne", Palette.green)
                tile(.insights, "trophy.fill", "Rekordy", Palette.gold)
                tile(.equipment, "dumbbell", "Vybavení", Palette.indigo)
            }
            Button(action: addWorkout) {
                Label("Zapsat trénink ručně", systemImage: "square.and.pencil")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
    }

    private func tile(_ route: AppRoute, _ symbol: String, _ title: String, _ color: Color) -> some View {
        RouteLink(route: route) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.onAccent)
                    .frame(width: 34, height: 34)
                    .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.85)
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        }
    }
}

/// Training → "Knihovna tréninků": one wide widget; a tap opens the library
/// with the choice of sports.
struct LibraryWidget: View {
    static let sports: [(id: String, symbol: String, color: Color)] = [
        ("ride", "bicycle", Palette.amberBar), ("run", "figure.run", Palette.rust), ("gym", "dumbbell.fill", Palette.indigo)
    ]

    var body: some View {
        RouteLink(route: .library) {
            HStack(spacing: 14) {
                HStack(spacing: -8) {
                    ForEach(Self.sports.indices, id: \.self) { i in
                        Image(systemName: Self.sports[i].symbol)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Palette.onAccent)
                            .frame(width: 34, height: 34)
                            .background(Self.sports[i].color, in: Circle())
                            .overlay(Circle().stroke(Palette.card, lineWidth: 2.5))
                    }
                }
                Text("Knihovna tréninků").font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.85)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Knihovna tréninků")
        .accessibilityAddTraits(.isButton)
    }
}

/// A row of choices as capsules that wrap ("Hrudník", "Biceps"…).
struct ChipFlow<Item: Hashable>: View {
    let items: [Item]
    let label: (Item) -> String
    let isOn: (Item) -> Bool
    let toggle: (Item) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Button { toggle(item) } label: {
                    Text(label(item))
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(isOn(item) ? Palette.onButton : Palette.ink)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(isOn(item) ? Palette.button : Palette.card, in: Capsule())
                        .overlay(Capsule().stroke(Palette.ink.opacity(isOn(item) ? 0 : 0.12), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isOn(item) ? .isSelected : [])
            }
        }
    }
}

/// Lays its children out in rows, wrapping to the next row when one is full.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += row + spacing; row = 0 }
            x += size.width + spacing
            row = max(row, size.height)
        }
        return CGSize(width: width, height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
    }
}

/// A solid black capsule button with an optional spinner.
struct PrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(Palette.onButton) } else if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
            .frame(maxWidth: .infinity).frame(height: 50)
            .background(Palette.button, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(L10n.tr(title), systemImage: systemImage ?? "")
                .labelStyle(TitleAndOptionalIcon(hasIcon: systemImage != nil))
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity).frame(height: 46)
                .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct TitleAndOptionalIcon: LabelStyle {
    let hasIcon: Bool
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            if hasIcon { configuration.icon }
            configuration.title
        }
    }
}

// MARK: - AI gym builder

/// "Sestavit trénink": the length and either the whole body, upper or lower body,
/// or the muscles chosen on the figure; then the proposal with the muscles it
/// works, changes in words ("bez dřepů, víc ramen") and saving to the plan.
struct GymBuilderView: View {
    @Environment(AppModel.self) private var model
    let date: String
    /// A saved or received workout to plan (Moje tréninky, a friend's link)
    /// instead of one the AI puts together.
    var template: TemplatePlanRequest? = nil
    @State private var day: Date = Date()
    @State private var minutes = 60
    @State private var focus = "auto"
    @State private var muscles: Set<String> = []
    @State private var proposal: GymProposal?
    @State private var wish = ""
    @State private var answer: String?
    @State private var busy: String?
    @State private var error: String?
    @State private var saved = false
    @State private var equipment: GymEquipment?
    @State private var catalog: [GymCatalogExercise] = []
    @State private var replacing: String?
    @State private var adding = false
    @State private var technique: String?

    private var isoDay: String { AppModel.localDate(day) }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Sestavit trénink") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: template == nil ? "Posilovna · sestavit trénink" : "Posilovna · naplánovat trénink").padding(.top, 24)
                Text(proposal?.planName ?? template?.template.name ?? L10n.tr("Jaký trénink chceš?"))
                    .font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                if let proposal { result(proposal) } else if let template { templateForm(template) } else { form }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
        }
        .task {
            if let d = Self.isoFormatter.date(from: date), d >= Calendar.current.startOfDay(for: Date()) { day = d }
            if let minutes = template?.template.minutes { self.minutes = minutes }
            if !model.demo, equipment == nil { equipment = try? await model.api.gymEquipment() }
            if !model.demo, catalog.isEmpty { catalog = (try? await model.api.gymExercises()) ?? [] }
        }
        .sheet(item: Binding(get: { replacing.map { Named(name: $0) } }, set: { replacing = $0?.name })) { item in
            AlternativesSheet(date: isoDay, exercise: item.name, inPlan: proposal?.exercises.map(\.name) ?? [], footnote: nil,
                              choose: { _ in }, chooseAlternative: { alt in replace(item.name, with: alt) })
        }
        .sheet(isPresented: $adding) {
            ExercisePicker(catalog: catalog.filter { $0.fits ?? EquipmentView.fits($0, equipment) },
                           used: Set(proposal?.exercises.map(\.name) ?? [])) { ex in add(ex) }
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            TechniqueSheet(exercise: item.name)
        }
    }

    // MARK: Form

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Kdy a jak dlouho").padding(.top, 26)
            Card {
                DatePicker("Den", selection: $day, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
                Picker("Délka", selection: $minutes) {
                    ForEach([30, 45, 60, 75, 90, 120], id: \.self) { Text("\($0)").tag($0) }
                }
                .pickerStyle(.segmented)
                Text("minut").font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .padding(.top, 10)

            SectionLabel(text: "Na co se zaměřit").padding(.top, 26)
            Picker("Zaměření", selection: $focus) {
                Text("Celé tělo").tag("auto")
                Text("Horní").tag("upper")
                Text("Nohy").tag("lower")
                Text("Partie").tag("muscles")
            }
            .pickerStyle(.segmented)
            .padding(.top, 10)
            .onChange(of: focus) { _, value in if value != "muscles" { muscles = [] } }

            if focus == "muscles" {
                Card {
                    Text(L10n.f("Vybráno %@ z 5", String(muscles.count)))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    BodyMap(selected: muscles, onTap: toggle, height: 280)
                    ChipFlow(items: BodyFigure.muscles.map { $0.id }, label: BodyFigure.label, isOn: { muscles.contains($0) }, toggle: toggle)
                }
                .padding(.top, 12)
            }

            RouteLink(route: .equipment) {
                HStack(spacing: 12) {
                    Image(systemName: "dumbbell").foregroundStyle(Palette.indigo)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Vybavení").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(EquipmentView.summary(equipment)).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .padding(14)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(.top, 16)

            PrimaryButton(title: busy == "preview" ? "Sestavuji…" : "Navrhnout trénink", systemImage: "sparkles", busy: busy == "preview") {
                Task { await preview() }
            }
            .disabled(busy != nil || model.demo || (focus == "muscles" && muscles.isEmpty))
            .padding(.top, 22)
            if model.demo { Text("V ukázce se trénink nesestavuje.").font(Typo.caption).foregroundStyle(Palette.faint).padding(.top, 8) }
        }
    }

    /// A saved workout: the day (the sender's when a friend sent it), its
    /// exercises, then the proposal with the athlete's own weights.
    private func templateForm(_ t: TemplatePlanRequest) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let from = t.fromName {
                Text(L10n.f("Trénink ti posílá %@", from)).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 6)
            }
            SectionLabel(text: "Kdy").padding(.top, 26)
            Card {
                DatePicker("Den", selection: $day, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
            }
            .padding(.top, 10)
            SectionLabel(text: "Cviky").padding(.top, 26)
            VStack(spacing: 0) {
                ForEach(Array(t.template.exercises.enumerated()), id: \.offset) { _, e in
                    HStack {
                        Text(e.name).font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        Text("\(e.sets) × \(e.reps)").font(Typo.small).foregroundStyle(Palette.secondary)
                    }
                    .padding(.vertical, 12)
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                }
            }
            Text("Cviky, série a opakování zůstanou, váhy se spočítají podle tvých tréninků a dnešní připravenosti.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
            PrimaryButton(title: busy == "preview" ? "Připravuji…" : "Naplánovat", systemImage: "calendar.badge.plus", busy: busy == "preview") {
                Task { await planTemplate(t) }
            }
            .disabled(busy != nil || model.demo)
            .padding(.top, 22)
            if model.demo { Text("V ukázce se trénink neplánuje.").font(Typo.caption).foregroundStyle(Palette.faint).padding(.top, 8) }
        }
    }

    private func toggle(_ id: String) {
        if muscles.contains(id) { muscles.remove(id) } else if muscles.count < 5 { muscles.insert(id) }
    }

    // MARK: Proposal

    private func result(_ p: GymProposal) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(Fmt.capitalized(Fmt.relativeDay(isoDay, today: AppModel.localDate(Date()))) + " · \(minutes) min")
                .font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 6)
            Card {
                WidgetHeader(title: "Co procvičíš", color: Palette.amberBar)
                BodyMap(load: p.load, height: 240)
            }
            .padding(.top, 18)

            SectionLabel(text: "Cviky").padding(.top, 26)
            exerciseList(p)
            if !saved {
                Button { adding = true } label: {
                    Label("Přidat cvik", systemImage: "plus.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                        .frame(maxWidth: .infinity, alignment: .leading).frame(height: 44)
                }
                .disabled(catalog.isEmpty || busy != nil)
                .padding(.top, 4)
            }
            if let rationale = p.rationale {
                Text(rationale).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
            }

            if saved {
                Label("Uloženo do plánu i do Intervals.icu.", systemImage: "checkmark.circle.fill")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.green).padding(.top, 22)
                NavigationLink(value: AppRoute.trainingMode(isoDay)) {
                    Text("Začít trénink").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 12)
            } else {
                SectionLabel(text: "Upravit vlastními slovy").padding(.top, 26)
                HStack(spacing: 10) {
                    TextField("Třeba „bez dřepů, víc ramen“", text: $wish, axis: .vertical)
                        .lineLimit(1...3)
                        .font(.body)
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Button { Task { await adjust() } } label: {
                        Group { if busy == "adjust" { ProgressView() } else { Image(systemName: "arrow.up") } }
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.onButton)
                            .frame(width: 44, height: 44)
                            .background(Palette.button, in: Circle())
                    }
                    .disabled(wish.trimmingCharacters(in: .whitespaces).isEmpty || busy != nil)
                    .accessibilityLabel("Upravit trénink")
                }
                .padding(.top, 10)
                if let answer { Text(answer).font(Typo.small).foregroundStyle(Palette.green).fixedSize(horizontal: false, vertical: true).padding(.top, 8) }

                PrimaryButton(title: busy == "confirm" ? "Ukládám…" : "Uložit do plánu", systemImage: "checkmark", busy: busy == "confirm") {
                    Task { await confirm() }
                }
                .disabled(busy != nil || p.draftId == nil)
                .padding(.top, 22)
                if template == nil {
                    HStack(spacing: 10) {
                        SecondaryButton(title: "Jiný návrh", systemImage: "arrow.clockwise") { Task { await preview() } }
                        SecondaryButton(title: "Změnit zadání", systemImage: "slider.horizontal.3") { proposal = nil; answer = nil }
                    }
                    .disabled(busy != nil)
                    .padding(.top, 10)
                } else {
                    SecondaryButton(title: "Změnit den", systemImage: "calendar") { proposal = nil; answer = nil }
                        .disabled(busy != nil)
                        .padding(.top, 10)
                }
            }
            // The workout without weights: kept to plan again, or sent to a friend.
            let kept = WorkoutTemplate.from(p, minutes: minutes)
            if template == nil || template?.fromName != nil {
                SaveWorkoutButton(template: kept).padding(.top, 10)
            }
            ShareWorkoutButton(template: kept, date: isoDay, groups: WorkoutSharing.groups(p.muscles, template: kept))
                .padding(.top, 10)
        }
    }

    /// The exercises in order; a superset together under its mark.
    private func exerciseList(_ p: GymProposal) -> some View {
        let list = p.exercises
        let groups = p.supersets
        return VStack(spacing: 0) {
            ForEach(ExerciseOrder.runs(groups), id: \.lowerBound) { (run: Range<Int>) in
                if let letter = ExerciseOrder.letter(groups[run.lowerBound]) {
                    SupersetGroup(letter: letter) {
                        ForEach(Array(run), id: \.self) { (index: Int) in exerciseRow(p, index, list[index]) }
                    }
                } else {
                    ForEach(Array(run), id: \.self) { (index: Int) in exerciseRow(p, index, list[index]) }
                }
            }
        }
    }

    private func exerciseRow(_ p: GymProposal, _ index: Int, _ ex: (name: String, sets: Int, reps: String, kg: String)) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("\(index + 1)").font(Typo.number(20)).foregroundStyle(Palette.faint).frame(width: 22, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    Text(muscleLine(p.muscles[ex.name])).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    if p.failing.contains(ex.name) { GymTag.failure.padding(.top, 4) }
                }
                Spacer(minLength: 8)
                Text("\(ex.sets) × " + ex.reps + (ex.kg.isEmpty ? "" : " · " + (LiftWeight.shown(ex.kg) ?? ex.kg) + " " + Units.weightUnit))
                    .font(Typo.small).foregroundStyle(Palette.secondary).lineLimit(1)
                ExerciseInfoButton(name: ex.name) { technique = ex.name }
                if !saved {
                    Menu {
                        Button { move(index, by: -1) } label: { Label("Posunout výš", systemImage: "arrow.up") }
                            .disabled(!p.canMove(index, by: -1))
                        Button { move(index, by: 1) } label: { Label("Posunout níž", systemImage: "arrow.down") }
                            .disabled(!p.canMove(index, by: 1))
                        Button { replacing = ex.name } label: { Label("Nahradit jiným", systemImage: "arrow.triangle.swap") }
                        Button(role: .destructive) { remove(ex.name) } label: { Label("Odebrat", systemImage: "trash") }
                            .disabled(p.exercises.count < 2)
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 32, height: 32).background(Palette.track, in: Circle())
                    }
                    .accessibilityLabel(L10n.f("Upravit %@", ex.name))
                }
            }
            .padding(.vertical, 12)
            Rectangle().fill(Palette.hairline).frame(height: 1)
        }
    }

    // MARK: Editing the proposal by hand

    private func move(_ index: Int, by step: Int) {
        guard var p = proposal else { return }
        p.moveExercise(index, by: step)
        proposal = p
    }

    private func remove(_ name: String) {
        guard var p = proposal else { return }
        p.rows.removeAll { $0.count > 1 && $0[1].string == name }
        p.muscles[name] = nil
        proposal = p
    }

    /// The same sets with the other exercise and its estimated load.
    private func replace(_ name: String, with alt: GymAlternative) {
        guard var p = proposal else { return }
        let kg = alt.kg.map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1).replacingOccurrences(of: ",", with: ".") } ?? ""
        for i in p.rows.indices where p.rows[i].count > 3 && p.rows[i][1].string == name {
            p.rows[i][1] = .string(alt.name)
            p.rows[i][3] = .string((p.rows[i][0].string ?? "").uppercased() == "WARMUP" ? "" : kg)
        }
        p.muscles[name] = nil
        if let map = catalog.first(where: { $0.name == alt.name })?.muscles { p.muscles[alt.name] = map }
        proposal = p
    }

    /// Its usual sets where it belongs among the others (the big lifts first,
    /// the core last); the load is estimated when the plan is saved or in the
    /// training.
    private func add(_ ex: GymCatalogExercise) {
        guard var p = proposal, !p.exercises.contains(where: { $0.name == ex.name }) else { return }
        let sets = max(1, min(PlanEditorSheet.count(ex.sets) ?? 3, 6))
        let rows: [[JSONValue]] = (1...sets).map { n in
            ["WORK", ex.name, String(n), "", ex.reps?.string ?? "10", "", "", "", "FALSE", "", "", "FALSE", ""].map { JSONValue.string($0) }
        }
        if let map = ex.muscles { p.muscles[ex.name] = map }
        p.insert(rows, name: ex.name, catalog: catalog)
        proposal = p
    }

    private func muscleLine(_ map: [String: Double]?) -> String {
        (map ?? [:]).filter { $0.value >= 0.5 }.sorted { $0.value > $1.value }.map { BodyFigure.label($0.key) }.joined(separator: " · ")
    }

    // MARK: Server

    private func run(_ kind: String, _ work: () async throws -> Void) async {
        busy = kind
        defer { busy = nil }
        do {
            try await work()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func preview() async {
        await run("preview") {
            var next = try await model.api.previewGym(date: isoDay, minutes: minutes,
                                                      focus: focus == "upper" || focus == "lower" ? focus : nil,
                                                      muscles: focus == "muscles" ? BodyFigure.muscles.map { $0.id }.filter(muscles.contains) : [])
            next.groupSupersets()
            proposal = next
            answer = nil
            wish = ""
        }
    }

    private func planTemplate(_ t: TemplatePlanRequest) async {
        await run("preview") {
            var next = try await model.api.planTemplate(t, date: isoDay)
            next.groupSupersets()
            proposal = next
            answer = nil
            wish = ""
        }
    }

    private func adjust() async {
        guard let p = proposal else { return }
        await run("adjust") {
            let r = try await model.api.adjustGym(rows: p.rows, request: wish, minutes: minutes)
            var next = p
            next.rows = r.rows
            // The generator's reasons were for its exercises; the AI's answer says what changed.
            next.rationale = nil
            if !r.muscles.isEmpty { next.muscles = r.muscles }
            next.groupSupersets()
            proposal = next
            answer = r.answer
            wish = ""
        }
    }

    private func confirm() async {
        guard let p = proposal, let id = p.draftId else { return }
        await run("confirm") {
            try await model.api.confirmGym(draftId: id, rows: p.rows)
            saved = true
            await model.refreshTraining()
            await model.refresh()
        }
    }

    static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

// MARK: - Equipment

/// Where the athlete trains: the saved gyms and home gyms, each with its own
/// stations (a gym starts with all of them until the athlete unticks what it
/// lacks, or AI picks them from photos or the gym's web page), or the body
/// weight only. The plan follows the chosen place. With dumbbells, the weights
/// there are, so the plan asks for one of them.
struct EquipmentView: View {
    @Environment(AppModel.self) private var model
    @State private var data: GymEquipment?
    @State private var places: [GymPlace] = []
    @State private var active = "bodyweight"
    // The active place as edited, written back into `places` on a switch and on saving.
    @State private var kind = "bodyweight"
    @State private var selected: Set<String> = []
    @State private var weights: Set<Double> = []
    @State private var gymName = ""
    @State private var gymUrl = ""
    @State private var customWeight = ""
    @State private var photos: [PhotosPickerItem] = []
    @State private var busy: String?
    @State private var note: String?
    @State private var error: String?
    @State private var saved = false
    @State private var confirmDelete = false

    /// The first setup asks only roughly; the stations are set here later.
    static let setupKinds: [(String, String, String)] = [
        ("gym", "Posilovna", "Stroje, kladky a volné váhy"),
        ("dumbbells", "Domácí posilovna", "Jednoručky, lavice a podložka"),
        ("bodyweight", "Vlastní váha", "Bez vybavení")
    ]

    static let homeDefault: Set<String> = ["dumbbells", "adjustable_bench", "floor_mats"]
    static let maxPlaces = 10
    /// The usual dumbbells, kg per hand.
    static let weightOptions: [Double] = [1, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22, 22.5, 24, 25, 26, 27.5, 28, 30, 32, 32.5, 34, 35, 36, 38, 40, 42, 44, 45, 46, 48, 50]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Kde cvičíš?") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · vybavení").padding(.top, 24)
                Text("Kde cvičíš?").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                VStack(spacing: 10) {
                    ForEach(places) { place in
                        ChoiceCard(title: place.id == active ? (gymName.nilIfBlank ?? place.name) : place.name,
                                   subtitle: placeLine(place),
                                   systemImage: place.kind == "home" ? "house" : "dumbbell",
                                   selected: active == place.id) { switchTo(place.id) }
                    }
                    ChoiceCard(title: "Vlastní váha", subtitle: L10n.tr("Bez vybavení"), systemImage: "figure.cooldown",
                               selected: active == "bodyweight") { switchTo("bodyweight") }
                }
                .padding(.top, 18)

                HStack(spacing: 10) {
                    SecondaryButton(title: "Posilovna", systemImage: "plus") { add("gym") }
                    SecondaryButton(title: "Domácí", systemImage: "plus") { add("home") }
                }
                .disabled(places.count >= Self.maxPlaces || busy != nil || data == nil)
                .padding(.top, 12)

                if kind != "bodyweight" {
                    SettingsGroup(title: "Název") {
                        SettingsField(title: kind == "home" ? "Místo" : "Posilovna", text: $gymName, keyboard: .default,
                                      placeholder: L10n.tr(kind == "home" ? "třeba Doma nebo Chata" : "třeba Fitko u nádraží"))
                    }
                    .padding(.top, 22)
                    if kind == "custom" { detection }
                    if selected.contains("dumbbells") { dumbbells }
                    stations
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label("Smazat toto místo", systemImage: "trash").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                            .frame(maxWidth: .infinity).frame(height: 44)
                    }
                    .padding(.top, 18)
                    .confirmationDialog(L10n.f("Smazat %@?", gymName.nilIfBlank ?? L10n.tr("místo")), isPresented: $confirmDelete, titleVisibility: .visible) {
                        Button("Smazat", role: .destructive) { deleteActive() }
                    }
                }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
                if saved { Label("Uloženo", systemImage: "checkmark.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green).padding(.top, 14) }
                PrimaryButton(title: busy == "save" ? "Ukládám…" : "Uložit vybavení", busy: busy == "save") { Task { await save() } }
                    .disabled(busy != nil || model.demo || data == nil || (kind != "bodyweight" && selected.isEmpty))
                    .padding(.top, 22)
            }
        }
        .task { await load() }
        .onChange(of: photos) { _, items in if !items.isEmpty { Task { await detect(items) } } }
    }

    /// "14 věcí · web" under a place; the one being edited counts live.
    private func placeLine(_ place: GymPlace) -> String {
        let count = place.id == active ? selected.count : place.stations.count
        let kindText = L10n.tr(place.kind == "home" ? "Domácí posilovna" : "Posilovna")
        return kindText + " · " + L10n.f("%@ %@", String(count), Fmt.plural(count, "věc", "věci", "věcí"))
    }

    private var detection: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Poznat z fotky nebo webu").padding(.top, 26)
            Card {
                PhotosPicker(selection: $photos, maxSelectionCount: 8, matching: .images) {
                    Label(L10n.tr(busy == "photo" ? "Čtu fotky…" : "Vybrat fotky posilovny"), systemImage: "photo.on.rectangle.angled")
                        .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                }
                .disabled(busy != nil || model.demo)
                HStack(spacing: 8) {
                    TextField("https://posilovna.cz", text: $gymUrl)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(.horizontal, 12).frame(height: 42)
                        .background(Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Button { Task { await detectWeb() } } label: {
                        Group { if busy == "web" { ProgressView() } else { Text("Načíst") } }
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 14).frame(height: 42)
                            .background(Palette.button, in: Capsule())
                    }
                    .disabled(busy != nil || model.demo || !gymUrl.hasPrefix("http"))
                }
                if let note { Text(note).font(Typo.caption).foregroundStyle(Palette.green).fixedSize(horizontal: false, vertical: true) }
            }
            .padding(.top, 10)
        }
    }

    /// The dumbbells there are: tap the weights, or add an odd one.
    private var dumbbells: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Jednoručky")
                Spacer()
                Text(weights.isEmpty ? L10n.tr("plán navrhne jakoukoli váhu") : L10n.f("%@ %@", String(weights.count), Fmt.plural(weights.count, "váha", "váhy", "vah")))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 8) {
                if Units.imperial {
                    preset(L10n.f("%@ po %@", "5–50 lb", "5")) { weights = Set(stride(from: 5.0, through: 50, by: 5).map(Self.kgFromPounds)) }
                    preset(L10n.f("%@ po %@", "10–100 lb", "10")) { weights = Set(stride(from: 10.0, through: 100, by: 10).map(Self.kgFromPounds)) }
                } else {
                    preset("2–40 po 2") { weights = Set(stride(from: 2.0, through: 40, by: 2)) }
                    preset("2,5–25 po 2,5") { weights = Set(stride(from: 2.5, through: 25, by: 2.5)) }
                }
                preset(L10n.isEnglish ? "Clear" : "Zrušit") { weights = [] }
            }
            ChipFlow(items: Array(Set(Self.shownOptions).union(weights)).sorted(), label: { Self.kg($0) },
                     isOn: { weights.contains($0) },
                     toggle: { w in if weights.contains(w) { weights.remove(w) } else { weights.insert(w) }; saved = false })
            HStack(spacing: 8) {
                TextField(L10n.f("Jiná váha, %@", Units.weightUnit), text: $customWeight)
                    .keyboardType(.decimalPad)
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Button("Přidat") {
                    if let shown = Double(customWeight.replacingOccurrences(of: ",", with: ".")), shown > 0, Units.kg(shown) <= 100 {
                        let kg = Units.kg(shown)
                        weights.insert(Units.imperial ? (kg * 100).rounded() / 100 : (kg * 4).rounded() / 4)
                        customWeight = ""
                        saved = false
                    }
                }
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .disabled(customWeight.isEmpty)
            }
        }
        .padding(.top, 26)
    }

    private func preset(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button { action(); saved = false } label: {
            Text(title).font(.footnote.weight(.medium)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var stations: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: L10n.tr(kind == "home" ? "Co máš doma" : "Co tam je"))
                Spacer()
                Button(L10n.tr(selected.count == (data?.stations?.count ?? 0) ? "Odebrat vše" : "Vybrat vše")) {
                    selected = selected.count == (data?.stations?.count ?? 0) ? [] : Set((data?.stations ?? []).map(\.id))
                    saved = false
                }
                .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
            }
            .padding(.top, 26)
            ForEach(groups, id: \.self) { group in
                SettingsGroup(title: group) {
                    let items = (data?.stations ?? []).filter { $0.group == group }
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, station in
                        if index > 0 { SettingsDivider() }
                        Button { toggle(station.id) } label: {
                            HStack {
                                Text(station.label).font(.body).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                                Spacer(minLength: 8)
                                Image(systemName: selected.contains(station.id) ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 22)).foregroundStyle(selected.contains(station.id) ? Palette.green : Palette.faint)
                            }
                            .padding(.horizontal, 16).frame(minHeight: 48).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected.contains(station.id) ? .isSelected : [])
                    }
                }
                .padding(.top, 14)
            }
        }
    }

    private var groups: [String] {
        var out: [String] = []
        for s in data?.stations ?? [] where !out.contains(s.group) { out.append(s.group) }
        return out
    }

    /// Puts what is being edited back into its place.
    private func commit() {
        guard let i = places.firstIndex(where: { $0.id == active }) else { return }
        places[i].stations = selected.sorted()
        places[i].name = gymName.trimmingCharacters(in: .whitespaces).nilIfBlank ?? places[i].name
        places[i].url = kind == "custom" ? gymUrl.trimmingCharacters(in: .whitespaces) : ""
        places[i].dumbbellWeights = selected.contains("dumbbells") ? weights.sorted() : []
    }

    /// Shows the active place's stations, name and weights for editing.
    private func edit() {
        if let p = places.first(where: { $0.id == active }) {
            kind = p.kind == "home" ? "home" : "custom"
            selected = Set(p.stations)
            weights = Set(p.dumbbellWeights)
            gymName = p.name
            gymUrl = p.url
        } else {
            kind = "bodyweight"; selected = []; weights = []; gymName = ""; gymUrl = ""
        }
        note = nil
    }

    private func switchTo(_ id: String) {
        guard id != active else { return }
        commit()
        active = id
        edit()
        saved = false
    }

    /// A new gym starts with everything a gym usually has, a home gym with
    /// dumbbells, a bench and a mat.
    private func add(_ placeKind: String) {
        commit()
        let all = Set((data?.stations ?? []).map(\.id))
        var n = places.count + 1
        while places.contains(where: { $0.id == "place-\(n)" }) { n += 1 }
        let base = L10n.tr(placeKind == "home" ? "Domácí posilovna" : "Posilovna")
        let same = places.filter { $0.kind == placeKind }.count
        places.append(GymPlace(id: "place-\(n)", kind: placeKind, name: same == 0 ? base : base + " \(same + 1)",
                               stations: placeKind == "home" ? Self.homeDefault.intersection(all.isEmpty ? Self.homeDefault : all).sorted() : all.sorted(),
                               url: "", dumbbellWeights: []))
        active = "place-\(n)"
        edit()
        saved = false
    }

    private func deleteActive() {
        places.removeAll { $0.id == active }
        active = places.first?.id ?? "bodyweight"
        edit()
        saved = false
    }

    private func toggle(_ id: String) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
        saved = false
    }

    private func load() async {
        guard data == nil, !model.demo else { return }
        do {
            let d = try await model.api.gymEquipment()
            data = d
            places = d.places ?? []
            active = d.activePlace ?? "bodyweight"
            edit()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        busy = "save"
        defer { busy = nil }
        commit()
        do {
            let r = try await model.api.saveGymPlaces(places, active: active)
            data?.equipment = r.equipment
            data?.selected = r.selected
            data?.dumbbellWeights = r.dumbbellWeights
            data?.gymName = r.gymName
            if let stored = r.places { places = stored; active = r.activePlace ?? "bodyweight"; edit() }
            saved = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func detect(_ items: [PhotosPickerItem]) async {
        busy = "photo"
        defer { busy = nil; photos = [] }
        var jpegs: [Data] = []
        for item in items {
            if let raw = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: raw), let jpeg = image.jpegForUpload(side: 1400) {
                jpegs.append(jpeg)
            }
        }
        guard !jpegs.isEmpty else { error = "Fotky se nepodařilo načíst."; return }
        await apply { try await model.api.detectGymEquipment(photos: jpegs, url: "") }
    }

    private func detectWeb() async {
        busy = "web"
        defer { busy = nil }
        await apply { try await model.api.detectGymEquipment(photos: [], url: gymUrl.trimmingCharacters(in: .whitespaces)) }
    }

    /// What AI saw replaces the list: the stations it found, the floor and
    /// the dumbbells kept when they were ticked.
    private func apply(_ work: () async throws -> GymDetectResult) async {
        do {
            let r = try await work()
            if r.found == true, let found = r.stations {
                selected = Set(found).union(selected.intersection(["floor_mats"]))
                if gymName.isEmpty, let name = r.gymName?.nilIfBlank { gymName = name }
                note = L10n.f("Našel jsem %@ %@. Zkontroluj seznam a ulož.", String(found.count), Fmt.plural(found.count, "stroj", "stroje", "strojů")) + (r.note?.nilIfBlank.map { " " + $0 } ?? "")
                error = nil
                saved = false
            } else {
                error = r.message ?? "Vybavení se nepodařilo poznat."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    static func kg(_ value: Double) -> String {
        if Units.imperial {
            let lb = (Units.weight(value) * 10).rounded() / 10
            return Units.weightText(value, digits: lb.rounded() == lb ? 0 : 1)
        }
        return Fmt.decimal(value, digits: value.rounded() == value ? 0 : (value * 2).rounded() == value * 2 ? 1 : 2) + " kg"
    }

    /// The usual dumbbells in pounds, kept in kg.
    static let poundOptions: [Double] = [3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]

    /// The dumbbell choices in the chosen unit's usual steps, as kg.
    static var shownOptions: [Double] { Units.imperial ? poundOptions.map(kgFromPounds) : weightOptions }

    /// 5 lb → 2.27 kg (two decimals, so the same pounds always give the same kg).
    static func kgFromPounds(_ pounds: Double) -> Double {
        (pounds / 2.2046226218 * 100).rounded() / 100
    }

    /// "Posilovna · 14 strojů" for the builder and the library.
    static func summary(_ e: GymEquipment?) -> String {
        guard let e else { return L10n.tr("posilovna") }
        let count = " · " + L10n.f("%@ %@", String(e.selected.count), Fmt.plural(e.selected.count, "věc", "věci", "věcí"))
        switch e.equipment {
        case "custom": return (e.gymName.nilIfBlank ?? L10n.tr("Posilovna")) + count
        case "home": return L10n.tr("Domácí posilovna") + count
        case "dumbbells": return L10n.tr("doma s jednoručkami")
        case "bodyweight": return L10n.tr("jen vlastní váha")
        default: return L10n.tr("posilovna")
        }
    }

    /// Whether the exercise can be done with this equipment (its stations, as
    /// src/strength-generator.js fitsEquipment decides).
    static func fits(_ ex: GymCatalogExercise, _ e: GymEquipment?) -> Bool {
        let needs = Set(ex.stations ?? [])
        guard let e else { return true }
        switch e.equipment {
        case "custom", "home": return needs.isSubset(of: Set(e.selected).union(["floor_mats"]))
        case "dumbbells": return needs.isSubset(of: homeDefault)
        case "bodyweight": return needs.isSubset(of: ["floor_mats"])
        default: return true
        }
    }
}

/// A big selectable card with a radio mark.
struct ChoiceCard: View {
    let title: String
    var subtitle: String? = nil
    var systemImage: String? = nil
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 18)).foregroundStyle(selected ? Palette.green : Palette.muted).frame(width: 26)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    if let subtitle { Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 8)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22)).foregroundStyle(selected ? Palette.green : Palette.faint)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(selected ? Palette.green : .clear, lineWidth: 1.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// The intensity of the steps over time, as bars.
struct StepsProfile: View {
    let blocks: [PlannedWorkout.Block]

    var body: some View {
        let steps = blocks.flatMap { b in Array(repeating: b.steps ?? [], count: max(1, min(b.repeats ?? 1, 20))).flatMap { $0 } }
        let total = max(steps.map { $0.durationSeconds ?? 60 }.reduce(0, +), 1)
        GeometryReader { geo in
            HStack(alignment: .bottom, spacing: 1) {
                ForEach(Array(steps.enumerated()), id: \.offset) { _, s in
                    let level = ((s.percentHigh ?? s.percentLow ?? 60) / 130)
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(level > 0.8 ? Palette.rust : level > 0.65 ? Palette.amberBar : Palette.sand)
                        .frame(width: max(1, (geo.size.width - CGFloat(steps.count)) * CGFloat((s.durationSeconds ?? 60) / total)),
                               height: geo.size.height * CGFloat(min(max(level, 0.15), 1)))
                }
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Lifted weight

/// Lifted weight between the gym sheet (kg as text, "62,5" or "62.5") and
/// what is shown and typed in (kg, or lb with imperial units).
enum LiftWeight {
    /// The sheet's kg text in the chosen unit: unchanged in kg, "137.8" in lb.
    static func shown(_ kgText: String?) -> String? {
        guard let kgText else { return nil }
        guard Units.imperial, let kg = number(kgText) else { return kgText }
        return text(shownValue(kg))
    }

    /// kg → the chosen unit, to one decimal (dumbbells, steppers).
    static func shownValue(_ kg: Double) -> Double {
        Units.imperial ? (Units.weight(kg) * 10).rounded() / 10 : kg
    }

    /// What was typed (in the chosen unit) as kg text for the sheet, with a
    /// decimal period as the sets were always recorded.
    static func kgText(_ typed: String) -> String {
        let t = typed.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard Units.imperial, let pounds = Double(t) else { return t }
        // Pounds shown to 0.1 lb come back as whole quarter kilos (60 kg →
        // 132.3 lb → 60 kg), anything else to two decimals.
        let exact = Units.kg(pounds)
        let quarter = (exact * 4).rounded() / 4
        let kg = abs(exact - quarter) < 0.03 ? quarter : (exact * 100).rounded() / 100
        return kg.rounded() == kg ? String(Int(kg)) : String(kg)
    }

    static func number(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }

    private static func text(_ value: Double) -> String {
        let s = value.rounded() == value ? String(Int(value)) : String(value)
        return L10n.isEnglish ? s : s.replacingOccurrences(of: ".", with: ",")
    }
}
