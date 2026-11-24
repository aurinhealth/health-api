import PhotosUI
import SwiftUI
import UIKit

// MARK: - Training → tools

/// Training: an empty gym workout, then one library for ride, run and gym
/// workouts and the tools.
struct TrainingTools: View {
    let today: String
    /// Today's card has the gym plan and its Start workout: no second way in here.
    var gymPlanned = false
    var addWorkout: () -> Void = {}

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // The workout mode without a plan: exercises added one by one,
            // built, or the last workout again (TrainingModeView, Prázdný trénink).
            if !gymPlanned {
                NavigationLink(value: AppRoute.trainingMode(today)) {
                    Label("Prázdný trénink v posilovně", systemImage: "plus").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            LibraryWidget()
            LazyVGrid(columns: columns, spacing: 10) {
                tile(.weekPlan, "calendar.badge.plus", "Plán týdne", Palette.green)
                TrainingPlanTile()
                tile(.equipment, "dumbbell", "Vybavení", Palette.indigo)
                tile(.insights, "trophy.fill", "Rekordy", Palette.gold)
            }
            Button(action: addWorkout) {
                Label("Zapsat trénink ručně", systemImage: "square.and.pencil")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
    }

    private func tile(_ route: AppRoute, _ symbol: String, _ title: String, _ color: Color) -> some View {
        RouteLink(route: route) { ToolTile(symbol: symbol, title: title, color: color) }
    }
}

/// One tile of Training's tools grid: a coloured icon and the name.
struct ToolTile: View {
    let symbol: String
    let title: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .scaledFont(16, weight: .semibold, cap: .denseCap)
                .foregroundStyle(Palette.onAccent)
                .frame(width: 34, height: 34)
                .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.85)
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .cardSurface(cornerRadius: 20)
        .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
    }
}

/// Training → "Knihovna tréninků": one wide widget with a tile like the tools
/// below it (a symbol, so it needs no change when a sport is added); a tap
/// opens the library with the choice of sports.
struct LibraryWidget: View {
    var body: some View {
        RouteLink(route: .library) {
            HStack(spacing: 14) {
                Image(systemName: "figure.run.square.stack.fill")
                    .scaledFont(16, weight: .semibold, cap: .denseCap)
                    .foregroundStyle(Palette.onAccent)
                    .frame(width: 34, height: 34)
                    .background(Palette.blue, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text("Knihovna tréninků").font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.85)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
            .cardSurface(cornerRadius: 22)
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
    /// A coloured dot before the name (a tired muscle), nil for none.
    var mark: (Item) -> Color? = { _ in nil }

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Button { toggle(item) } label: {
                    HStack(spacing: 6) {
                        if let color = mark(item) { Circle().fill(color).frame(width: 7, height: 7) }
                        Text(label(item))
                    }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(isOn(item) ? Palette.onButton : Palette.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(isOn(item) ? Palette.button : Palette.card, in: Capsule())
                    .overlay { Capsule().stroke(Palette.ink.opacity(isOn(item) ? 0 : 0.12), lineWidth: 1) }
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
                .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
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
    /// From Svaly: the proposal straight away, its length the usual one
    /// (capped by the day's free time); day, length and focus change on it.
    var quick = false
    /// From the Odpočaté chip (Cviky): the focus is the rested muscles.
    var rested = false
    /// "Sestavit krátký trénink" (Cviky, no big muscle rested): 30 minutes of
    /// the smaller muscles rested today (MuscleFatigue.shortFocus).
    var short = false
    /// From the Library's gym page: its focus tile ("auto", "upper", "lower",
    /// "rested" or "muscles" with these muscles) and its length (nil = usual).
    var presetFocus: String? = nil
    var presetMuscles: [String] = []
    var presetMinutes: Int? = nil
    @State private var day: Date = Date()
    @State private var minutes = 60
    @State private var focus = "auto"
    /// The focus came from the rested muscles, not from a tap (Svaly).
    @State private var focusPreset = false
    @State private var muscles: Set<String> = []
    @State private var proposal: GymProposal?
    /// The exercises "Jiný návrh" has shown since the setup last changed: the next proposal picks others.
    @State private var shown: [String] = []
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
    /// Edit exercises (the live workout's sheet): order, remove, add, supersets.
    @State private var reordering = false
    /// The coach's reasons shown whole (two lines folded).
    @State private var reasonsOpen = false
    /// The exercise just swiped away, for Undo.
    @State private var lastRemoved: RemovedExercise?
    /// Typing the own words: the pinned Save to plan steps aside for the keyboard.
    @FocusState private var wishFocused: Bool
    /// "Kde budeš cvičit?" before the first workout of an account without places.
    @State private var askPlace = false
    /// The length was picked on the proposal, so the server no longer chooses it.
    @State private var lengthPicked = false
    /// The own gym lengths of the length control ("+ Save").
    @AppStorage("libraryPresetsGym") private var gymPresets = "30,45,60,90"
    /// "Změnit zadání" on the quick path: the full form from then on.
    @State private var showForm = false
    /// The kept proposal was looked for once (GymKeptProposal).
    @State private var keptChecked = false
    /// When the proposal shown again was made: "Zatím neuloženo, z 9:42".
    @State private var keptAt: Date?
    /// "Vybrat jiný cvik" from Nahradit: any exercise of the catalog in its place.
    @State private var replacingAny: String?

    private var isoDay: String { AppModel.localDate(day) }

    /// The first day that can be picked: today, the sample day in the demo.
    private var earliest: Date {
        let sample = model.demo ? model.today.flatMap { Self.isoFormatter.date(from: $0.date) } : nil
        return Calendar.current.startOfDay(for: sample ?? Date())
    }

    /// No place saved yet: the plan would be body weight only without asking.
    private var needsPlace: Bool {
        !model.demo && template == nil && equipment != nil && (equipment?.places ?? []).isEmpty
    }

    /// Velké fitko, Malé fitko, Doma and Vlastní váha, as Vybavení offers them.
    private var starterPlaces: EquipmentView.Draft {
        EquipmentView.seeded([], active: "bodyweight", all: (equipment?.stations ?? []).map(\.id), firstTime: true)
    }

    var body: some View {
        // A ZStack, not a Group: a Group would hand the tasks below to each page again.
        ZStack {
            // Saved: the page is the day's gym detail (Start workout, Reorder, parts).
            if saved { GymSessionView(date: isoDay) } else { builder }
        }
        .task {
            // The sample day keeps its own date; the real one opens on the day picked.
            if model.demo { day = earliest } else if let d = Self.isoFormatter.date(from: date), d >= earliest { day = d }
            if let minutes = template?.template.minutes { self.minutes = minutes }
            if let presetFocus, !focusPreset, proposal == nil {
                focusPreset = true
                focus = presetFocus
                muscles = Set(presetMuscles)
                if let presetMinutes { minutes = presetMinutes; lengthPicked = true }
            }
            // Read again on every return, so a list changed in Vybavení shows here (after its save).
            if !model.demo {
                await EquipmentView.pendingSave?.value
                if let fresh = try? await model.api.gymEquipment() { equipment = fresh }
            }
            if template == nil, model.musclesStale { await model.loadMuscles() }
            // What is rested today picks the focus, until the athlete picks one.
            if rested, template == nil, proposal == nil, !focusPreset, !restedIds.isEmpty {
                focusPreset = true
                focus = "rested"
                if short, !lengthPicked { minutes = 30; lengthPicked = true }
            }
            if template == nil, proposal == nil, focus == "auto", !focusPreset, let preset = model.muscles?.focus {
                focusPreset = true
                focus = preset
            }
            // The proposal left without saving (an accidental back arrow) comes back with its edits.
            if template == nil, proposal == nil, !keptChecked, !model.demo {
                keptChecked = true
                restoreKept()
            }
            // From Svaly the choice is already made: build it straight away.
            if quick, proposal == nil, !showForm, busy == nil {
                if model.demo { showForm = true } else if needsPlace { askPlace = true } else { await preview() }
                // It failed: the full form, with the error under it, takes over.
                if proposal == nil, !askPlace { showForm = true }
            }
            if !model.demo, catalog.isEmpty { catalog = (try? await model.api.gymExercises()) ?? [] }
        }
        .task { await MuscleModelStore.shared.load(api: model.demo ? nil : model.api) }
        .onChange(of: proposal) { _, p in keep(p) }
        .sheet(item: Binding(get: { replacing.map { Named(name: $0) } }, set: { replacing = $0?.name })) { item in
            AlternativesSheet(date: isoDay, exercise: item.name, inPlan: proposal?.exercises.map(\.name) ?? [], footnote: nil,
                              choose: { _ in }, chooseAlternative: { alt in replace(item.name, with: alt) },
                              chooseOther: {
                                  // After this sheet is gone: one sheet at a time.
                                  Task { try? await Task.sleep(for: .milliseconds(450)); replacingAny = item.name }
                              })
        }
        // "Vybrat jiný cvik": any exercise of the catalog takes the sets of the one replaced.
        .sheet(item: Binding(get: { replacingAny.map { Named(name: $0) } }, set: { replacingAny = $0?.name })) { item in
            ExercisePicker(catalog: catalog.filter { $0.fits ?? EquipmentView.fits($0, equipment) },
                           used: Set(proposal?.exercises.map(\.name) ?? []), title: "Vybrat jiný cvik") { ex in
                Task {
                    let kg = model.demo ? nil : await model.api.gymEstimate(exercise: ex.name)
                    replace(item.name, with: GymAlternative(name: ex.name, muscle: nil, sets: nil, reps: nil, note: nil, station: nil, kg: kg))
                }
            }
        }
        .sheet(isPresented: $adding) {
            ExercisePicker(catalog: catalog.filter { $0.fits ?? EquipmentView.fits($0, equipment) },
                           used: Set(proposal?.exercises.map(\.name) ?? [])) { ex in add(ex) }
        }
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { item in
            // After this sheet is gone: one sheet at a time.
            TechniqueSheet(exercise: item.name, replace: saved ? nil : { Task { try? await Task.sleep(for: .milliseconds(450)); replacing = item.name } })
        }
        .confirmationDialog("Kde budeš cvičit?", isPresented: $askPlace, titleVisibility: .visible) {
            ForEach(starterPlaces.places) { place in
                Button(place.name) { Task { await choosePlace(place.id) } }
            }
            Button("Zrušit", role: .cancel) { showForm = true }
        } message: {
            Text("Trénink složím jen z vybavení, které tam je. Místa a stroje upravíš ve Vybavení.")
        }
    }

    /// The setup form, then the proposal in the planned gym detail's look
    /// (concept 017): the same hero, exercise cards and What you'll work.
    private var builder: some View {
        DetailScreen(glow: proposal == nil ? Palette.Glow.training : Palette.Glow.gym,
                     title: proposal == nil ? L10n.tr("Sestavit trénink") : L10n.tr("Sestavit trénink").uppercased(with: Fmt.locale),
                     pinTitle: proposal != nil, showsCoach: proposal != nil) {
            VStack(alignment: .leading, spacing: 0) {
                if let proposal {
                    result(proposal)
                } else {
                    SectionLabel(text: template == nil ? "Sestavit trénink do posilovny" : "Naplánovat trénink do posilovny").padding(.top, 24)
                    Text(template?.template.name ?? L10n.tr("Jaký trénink chceš?"))
                        .font(Typo.heading(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                    if let template { templateForm(template) }
                    else if quick && !showForm && error == nil { CoachThinking(text: L10n.tr("Kouč sestavuje trénink…")).padding(.top, 18) }
                    else { form }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
        }
        // Save to plan pinned at the bottom, as Start workout on the detail.
        .overlay(alignment: .bottom) {
            if let proposal, !wishFocused { savePill(proposal) }
        }
        .sheet(isPresented: $reordering) {
            if let proposal {
                EditExercisesSheet(day: proposal.day, catalog: catalog) { edited in
                    var next = proposal
                    next.take(edited, catalog: catalog)
                    self.proposal = next
                }
            }
        }
    }

    // MARK: Form

    /// The length control's choice: nil is "Recommended", the usual length.
    private var pickedLength: Binding<Int?> {
        Binding(get: { lengthPicked ? minutes : nil },
                set: { value in
                    if let value { minutes = value; lengthPicked = true } else { minutes = GymLength.usual ?? 60; lengthPicked = false }
                })
    }

    /// Svaly on top: what is ready today and what is still tired; a tap opens Svaly.
    private func musclesCard(_ data: MuscleFatigue) -> some View {
        RouteLink(route: .muscles) {
            HStack(spacing: 14) {
                MuscleFigurePair(colors: data.figureColors, spacing: 2).frame(height: 96)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: L10n.tr(data.readyTitle == nil ? "Dnes" : "Dnes připravené")).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: data.headline).font(Typo.heading(22)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                    if let most = data.tired.first {
                        // Under "ready", the tired muscle reads as tired: "Ještě unavené: hýždě, odpočaté za 2 dny".
                        Text(verbatim: L10n.f("Ještě unavené: %@, odpočaté %@", L10n.tr(most.label).lowercased(with: Fmt.locale), most.readyText(today: data.date)))
                            .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .cardSurface(cornerRadius: 18)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The form has no Odpočaté: those muscles picked on the figure instead.
            Color.clear.frame(height: 0).onAppear {
                if focus == "rested" { let ids = restedIds; focus = "muscles"; muscles = Set(ids) }
            }
            if let data = model.muscles { musclesCard(data).padding(.top, 20) }
            SectionLabel(text: "Kdy a jak dlouho").padding(.top, 26)
            Card {
                DatePicker("Den", selection: $day, in: earliest..., displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
                // The one length control of every sport, without the tolerance (Petr decision 6).
                // Until a length is picked, "Recommended" shows the length the form sends.
                LengthControl(minutes: pickedLength, recommended: lengthPicked ? (GymLength.usual ?? 60) : minutes, range: 20...120, step: 5,
                              presets: $gymPresets, fallback: 60)
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
                    Text(L10n.f("Vybráno %@ z 5", String(BodyFigure.choiceCount(muscles))))
                        .font(Typo.caption).foregroundStyle(Palette.muted)
                    if let figure = MuscleModelStore.shared.figure {
                        // Fixed front and back of the 3D figure; a tap picks the muscle.
                        MuscleFigureFixedPair(figure: figure, colors: MuscleFigureFixedPair.colors(Dictionary(uniqueKeysWithValues: muscles.map { ($0, Palette.green) }))) {
                            toggle(BodyFigure.choice(MuscleFatigue.bodyId($0)))
                        }
                        .frame(height: 320)
                    } else {
                        BodyMap(selected: muscles, onTap: { toggle(BodyFigure.choice($0)) }, height: 280)
                    }
                    ChipFlow(items: BodyFigure.choices, label: BodyFigure.label, isOn: { !muscles.isDisjoint(with: BodyFigure.ids($0)) }, toggle: toggle,
                             mark: { BodyFigure.ids($0).compactMap { model.muscles?.tired(body: $0)?.color }.first })
                    if !muscles.isDisjoint(with: BodyFigure.shoulders) {
                        // The shoulder's parts, all on: only who knows them picks fewer.
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Ramena: celá, nebo jen některé části").font(Typo.caption).foregroundStyle(Palette.muted)
                            ChipFlow(items: BodyFigure.shoulders, label: BodyFigure.partLabel, isOn: { muscles.contains($0) },
                                     toggle: { muscles.formSymmetricDifference([$0]) })
                        }
                        .padding(12)
                        .background(Palette.ink.opacity(0.04), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    if model.muscles.map({ !$0.tired.isEmpty }) == true {
                        HStack(spacing: 6) {
                            Circle().fill(Palette.rust).frame(width: 7, height: 7)
                            Text("ještě unavené").font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                    }
                }
                .padding(.top, 12)
            }

            RouteLink(route: .equipment) {
                HStack(spacing: 12) {
                    Image(systemName: "dumbbell").foregroundStyle(Palette.indigo)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Vybavení").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text(needsPlace ? L10n.tr("vyber, kde cvičíš") : Fmt.capitalized(EquipmentView.summary(equipment))).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                }
                .padding(14)
                .cardSurface(cornerRadius: 18)
            }
            .padding(.top, 16)

            PrimaryButton(title: busy == "preview" ? "Sestavuji…" : "Navrhnout trénink", systemImage: "sparkles", busy: busy == "preview") {
                if needsPlace { askPlace = true } else { Task { await preview() } }
            }
            .disabled(busy != nil || model.demo || (focus == "muscles" && muscles.isEmpty))
            .padding(.top, 22)
            if busy == "preview" { CoachThinking(text: L10n.tr("Kouč sestavuje trénink…")).padding(.top, 12) }
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
                DatePicker("Den", selection: $day, in: earliest..., displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
            }
            .padding(.top, 10)
            SectionLabel(text: "Cviky").padding(.top, 26)
            VStack(spacing: 0) {
                ForEach(Array(t.template.exercises.enumerated()), id: \.offset) { _, e in
                    HStack {
                        Text(e.name).font(.body).foregroundStyle(Palette.ink)
                        Spacer()
                        Text("\(e.sets) × " + Fmt.range(e.reps)).font(Typo.small).foregroundStyle(Palette.secondary)
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
            if busy == "preview" { CoachThinking(text: L10n.tr("Kouč sestavuje trénink…")).padding(.top, 12) }
            if model.demo { Text("V ukázce se trénink neplánuje.").font(Typo.caption).foregroundStyle(Palette.faint).padding(.top, 8) }
        }
    }

    /// A choice on or off: Ramena turns all three parts of the shoulder.
    private func toggle(_ choice: String) {
        let ids = BodyFigure.ids(choice)
        if !muscles.isDisjoint(with: ids) { muscles.subtract(ids) } else if BodyFigure.choiceCount(muscles) < 5 { muscles.formUnion(ids) }
    }

    // MARK: Proposal

    /// Day, length, focus on the proposal: a new choice builds it again.
    private var setupChips: some View {
        let today = AppModel.localDate(earliest)
        let days = (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: earliest) }
        return HStack(spacing: 8) {
            Menu {
                ForEach(days, id: \.self) { d in
                    let iso = AppModel.localDate(d)
                    Button { day = d; Task { await preview() } } label: {
                        if iso == isoDay { Label(Fmt.capitalized(Fmt.relativeDay(iso, today: today)), systemImage: "checkmark") }
                        else { Text(Fmt.capitalized(Fmt.relativeDay(iso, today: today))) }
                    }
                }
            } label: { SetupChip(text: Fmt.capitalized(Fmt.relativeDay(isoDay, today: today))) }
            Menu {
                ForEach(GymLength.choices, id: \.self) { m in
                    Button { minutes = m; lengthPicked = true; Task { await preview() } } label: {
                        if m == minutes { Label("\(m) min", systemImage: "checkmark") } else { Text("\(m) min") }
                    }
                }
            } label: { SetupChip(text: "\(minutes) min") }
            Menu {
                ForEach(["auto", "upper", "lower"] + (restedIds.isEmpty ? [] : ["rested"]), id: \.self) { f in
                    Button { focus = f; muscles = []; Task { await preview() } } label: {
                        if f == focus { Label(GymLength.focusTitle(f), systemImage: "checkmark") } else { Text(GymLength.focusTitle(f)) }
                    }
                }
                // Single muscles are picked on the figure, in the full form.
                Button { focus = "muscles"; showForm = true; proposal = nil; answer = nil } label: { Text(GymLength.focusTitle("muscles")) }
            } label: { SetupChip(text: GymLength.focusTitle(focus)) }
        }
        .disabled(busy != nil)
    }

    private func result(_ p: GymProposal) -> some View {
        let day = p.day
        return VStack(alignment: .leading, spacing: 0) {
            WorkoutHero(sport: "strength", title: p.planName, line: heroLine(p))
                .padding(.top, 8)
            if template == nil { setupChips.padding(.top, 14) }
            if let rationale = p.rationale { reasons(rationale).padding(.top, 10) }
            if template == nil {
                Button { Task { await preview(another: true) } } label: {
                    Text("Jiný návrh").font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 14).frame(height: 34)
                        .background(Palette.track, in: Capsule())
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
                .padding(.top, 4)
            }
            if busy == "preview" { CoachThinking(text: L10n.tr("Kouč sestavuje trénink…")).padding(.top, 12) }

            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Cviky")
                Spacer()
                Button(LocalizedStringKey("Upravit pořadí")) { reordering = true }
                    .font(.footnote.weight(.medium)).foregroundStyle(Palette.muted)
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .disabled(busy != nil)
            }
            .padding(.top, 18)
            GymExerciseCards(day: day) { card(p, day, $0) }
                .padding(.top, 4)
            if let lastRemoved, lastRemoved.after == p { undoRow(lastRemoved).padding(.top, 12) }
            Button { adding = true } label: {
                Text(verbatim: "+ " + L10n.tr("Přidat cvik")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity, minHeight: 48).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(catalog.isEmpty || busy != nil)
            .padding(.top, 6)

            SectionLabel(text: "Upravit vlastními slovy").padding(.top, 22)
            HStack(spacing: 10) {
                TextField("Třeba „bez dřepů, víc ramen“", text: $wish, axis: .vertical)
                    .lineLimit(1...3)
                    .font(.body)
                    .focused($wishFocused)
                    .padding(.horizontal, 14).padding(.vertical, 11)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .opacity(busy == "adjust" ? 0.45 : 1)
                Button { wishFocused = false; Task { await adjust() } } label: {
                    Image(systemName: "arrow.up")
                        .scaledFont(16, weight: .semibold, cap: .denseCap)
                        .foregroundStyle(Palette.onButton)
                        .frame(width: 44, height: 44)
                        .background(Palette.button, in: Circle())
                }
                .disabled(wish.trimmingCharacters(in: .whitespaces).isEmpty || busy != nil)
                .opacity(busy == "adjust" ? 0.35 : 1)
                .accessibilityLabel("Upravit trénink")
            }
            .padding(.top, 10)
            // What the coach is doing until his answer comes; the buttons wait dimmed.
            if busy == "adjust" { CoachThinking(text: L10n.tr("Kouč upravuje trénink…")).padding(.top, 12) }
            if let answer, busy != "adjust" { Text(answer).font(Typo.small).foregroundStyle(Palette.green).fixedSize(horizontal: false, vertical: true).padding(.top, 8) }

            if !p.muscles.isEmpty { GymWorkedCard(load: p.load).padding(.top, 22) }

            // The workout without weights: kept to plan again, or sent to a friend.
            let kept = WorkoutTemplate.from(p, minutes: minutes)
            if template == nil || template?.fromName != nil {
                SaveWorkoutButton(template: kept).padding(.top, 24)
            }
            ShareWorkoutButton(template: kept, date: isoDay, groups: WorkoutSharing.groups(p.muscles, template: kept))
                .padding(.top, 10)
            if template != nil {
                Button { proposal = nil; answer = nil } label: {
                    Text("Změnit den").font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
                .padding(.top, 6)
            }
            // Room for the pinned Save to plan (52 pt and its fade).
            Color.clear.frame(height: 84)
        }
    }

    /// "Not saved yet, 7 exercises, 21 sets"; a friend's workout: its day and length.
    private func heroLine(_ p: GymProposal) -> String {
        if template != nil {
            return Fmt.capitalized(Fmt.relativeDay(isoDay, today: AppModel.localDate(Date()))) + ", " + Fmt.duration(minutes)
        }
        let state = keptAt.map { L10n.f("Zatím neuloženo, z %@", $0.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Fmt.locale))) }
            ?? L10n.tr("Zatím neuloženo")
        let list = p.exercises
        return [state, L10n.plural("%lld cviků", list.count), L10n.plural("%lld sérií", list.reduce(0) { $0 + $1.sets })].joined(separator: ", ")
    }

    /// The coach's reasons for this proposal: two lines, a tap shows them whole.
    private func reasons(_ text: String) -> some View {
        Button { withAnimation(.snappy) { reasonsOpen.toggle() } } label: {
            HStack(alignment: .center, spacing: 10) {
                Text(verbatim: text).font(Typo.body).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.leading)
                    .lineLimit(reasonsOpen ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Image(systemName: reasonsOpen ? "chevron.up" : "chevron.down").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
    }

    /// The detail's exercise card, the plan only (nothing to tick before it is saved):
    /// Swap and Technique on it, a swipe left takes it out (Undo under the list).
    private func card(_ p: GymProposal, _ day: GymDay, _ exercise: GymExercise) -> some View {
        let removable = p.exercises.count > 1 && busy == nil
        return ExerciseCard(exercise: exercise,
                            failure: Set(exercise.sets.map(\.row).filter { day.isToFailure(row: $0) }),
                            started: false,
                            onSet: { _, _, _, _ in }, onUndo: { _ in },
                            onTechnique: { technique = exercise.name },
                            onAlternatives: { replacing = exercise.name })
            .modifier(SwipeToDelete(enabled: removable, exercise: true) { remove(exercise.name) })
            .accessibilityAction(named: L10n.tr("Odebrat tento cvik")) { if removable { remove(exercise.name) } }
    }

    /// "Removed: Pendulum squat" with Undo, as in the live workout; gone after a few seconds.
    private func undoRow(_ removed: RemovedExercise) -> some View {
        HStack(spacing: 8) {
            Text(verbatim: L10n.f("Odebráno: %@", ExerciseCatalog.shownName(removed.name)))
                .font(Typo.small).foregroundStyle(Palette.muted).lineLimit(2)
            Spacer(minLength: 8)
            Button {
                withAnimation(.snappy) { proposal = removed.before; lastRemoved = nil }
            } label: {
                Text(verbatim: L10n.tr("Vrátit")).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 14).frame(minHeight: 36)
                    .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .tapTarget(width: 44, height: 44)
            .accessibilityLabel(L10n.f("Vrátit %@ do tréninku", ExerciseCatalog.shownName(removed.name)))
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 4)
        .cardSurface(cornerRadius: 22)
        .transition(.opacity)
        .task(id: removed.id) {
            try? await Task.sleep(for: .seconds(TrainingModeView.undoRemoveSeconds))
            if lastRemoved?.id == removed.id { withAnimation(.snappy) { lastRemoved = nil } }
        }
    }

    /// Save to plan, pinned as an ink pill over a fade, as Start workout on the detail.
    private func savePill(_ p: GymProposal) -> some View {
        Button { Task { await confirm() } } label: {
            Text(verbatim: L10n.tr(busy == "confirm" ? "Ukládám…" : "Uložit do plánu")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                .frame(maxWidth: .infinity).frame(height: 52)
                .background(Palette.button, in: Capsule())
                .shadow(color: .black.opacity(0.22), radius: 10, y: 6)
        }
        .buttonStyle(.plain)
        .disabled(busy != nil || p.draftId == nil)
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 12)
        .background(LinearGradient(colors: [Palette.background.opacity(0), Palette.background], startPoint: .top, endPoint: .init(x: 0.5, y: 0.45)))
    }

    // MARK: Editing the proposal by hand

    private func remove(_ name: String) {
        guard var p = proposal, p.exercises.count > 1 else { return }
        let before = p
        // As the live workout does: its superset partner is no longer one (deleteExercise).
        var sheet = p.day
        guard let at = sheet.exercises.firstIndex(where: { $0.name == name }) else { return }
        sheet.deleteExercise(at: at)
        p.take(sheet, catalog: catalog)
        withAnimation(.snappy) {
            proposal = p
            lastRemoved = RemovedExercise(name: name, before: before, after: p)
        }
    }

    /// The same sets with the other exercise and its estimated load.
    private func replace(_ name: String, with alt: GymAlternative) {
        guard var p = proposal else { return }
        let kg = alt.kg.map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1).replacingOccurrences(of: ",", with: ".") } ?? ""
        let isWarmup = { (row: [JSONValue]) in (row.first?.string ?? "").uppercased() == "WARMUP" }
        let warmups = Set(p.rows.filter { $0.count > 3 && $0[1].string == name && isWarmup($0) }.map { $0[2].string ?? "" }).count
        for i in p.rows.indices where p.rows[i].count > 3 && p.rows[i][1].string == name {
            p.rows[i][1] = .string(alt.name)
            p.rows[i][3] = .string(isWarmup(p.rows[i]) ? GymDay.warmupKg(work: kg, number: p.rows[i][2].string, of: warmups) : kg)
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
        let sets = max(1, min(EditExercisesSheet.count(ex.sets) ?? 3, 6))
        let rows: [[JSONValue]] = (1...sets).map { n in
            ["WORK", ex.name, String(n), "", ex.reps?.string ?? "10", "", "", "", "FALSE", "", "", "FALSE", ""].map { JSONValue.string($0) }
        }
        if let map = ex.muscles { p.muscles[ex.name] = map }
        p.insert(rows, name: ex.name, catalog: catalog)
        proposal = p
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

    // MARK: The proposal kept on the phone

    /// Shows the kept proposal again with its setup, when it is still for a day to come.
    private func restoreKept() {
        guard let kept = GymKeptProposal.load() else { return }
        let today = AppModel.localDate(Date())
        if kept.day < today { GymKeptProposal.clear(); return }
        guard kept.fits(today: today, focus: quick ? focus : nil), let d = Self.isoFormatter.date(from: kept.day) else { return }
        day = d
        minutes = kept.minutes
        focus = kept.focus
        focusPreset = true
        muscles = Set(kept.muscles)
        shown = kept.shown
        lengthPicked = kept.lengthPicked
        keptAt = kept.at
        proposal = kept.proposal
    }

    /// Every new or edited proposal replaces the kept one; the one shown again stays as it was.
    private func keep(_ p: GymProposal?) {
        guard template == nil, !saved, !model.demo, let p, GymKeptProposal.load()?.proposal != p else { return }
        keptAt = nil
        GymKeptProposal(proposal: p, day: isoDay, minutes: minutes, focus: focus, muscles: muscles.sorted(), shown: shown,
                        lengthPicked: lengthPicked, at: Date()).save()
    }

    /// The rested muscles the Odpočaté focus asks for (MuscleFatigue.restedFocus,
    /// or shortFocus for the short session).
    private var restedIds: [String] { (short ? model.muscles?.shortFocus : model.muscles?.restedFocus) ?? [] }

    /// another: "Jiný návrh", the same setup with other exercises than shown so far.
    private func preview(another: Bool = false) async {
        await run("preview") {
            let auto = quick && !showForm && !lengthPicked
            let current: [String] = another ? (proposal?.exercises ?? []).map { $0.name } : []
            let avoid: [String] = another ? shown + current.filter { !shown.contains($0) } : []
            var next = try await model.api.previewGym(date: isoDay, minutes: minutes,
                                                      focus: focus == "upper" || focus == "lower" ? focus : nil,
                                                      muscles: focus == "muscles" ? BodyFigure.muscles.map { $0.id }.filter(muscles.contains)
                                                          : focus == "rested" ? restedIds : [],
                                                      autoLength: auto, usualMinutes: auto ? GymLength.usual : nil,
                                                      avoidExercises: avoid)
            next.groupSupersets()
            if auto, let settled = next.minutes { minutes = settled }
            shown = avoid
            proposal = next
            answer = nil
            wish = ""
        }
    }

    /// The ready-made places are saved with the chosen one active, then the workout is put together.
    private func choosePlace(_ id: String) async {
        let draft = EquipmentView.seeded([], active: id, all: (equipment?.stations ?? []).map(\.id), firstTime: true)
        await run("preview") {
            var saved = try await model.api.saveGymPlaces(draft.places, active: draft.active)
            saved.stations = equipment?.stations
            saved.sections = equipment?.sections
            equipment = saved
            UserDefaults.standard.set(true, forKey: EquipmentView.seededKey)
            UserDefaults.standard.set(true, forKey: EquipmentView.presetsKey)
        }
        if !needsPlace { await preview() }
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
            if template == nil { GymLength.remember(minutes); GymKeptProposal.clear() }
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
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

/// Where the athlete trains: the saved places (a big gym, a small one, home,
/// the body weight; all of them renamed, starred or deleted as the athlete
/// likes), each with its own stations. The plan follows the chosen one. A
/// place opens to its stations by body part (GymPlaceView).
struct EquipmentView: View {
    @Environment(AppModel.self) private var model
    @State private var data: GymEquipment?
    @State private var places: [GymPlace] = []
    @State private var active = "bodyweight"
    @State private var catalog: [GymCatalogExercise] = []
    /// What the server has, so only a change is saved.
    @State private var stored: Draft?
    @State private var open: String?
    @State private var adding = false
    @State private var error: String?

    struct Draft: Equatable {
        var places: [GymPlace]
        var active: String
    }

    static let homeDefault: Set<String> = ["dumbbells", "adjustable_bench", "floor_mats"]
    static let maxPlaces = 10
    /// The usual dumbbells, kg per hand.
    static let weightOptions: [Double] = [1, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22, 22.5, 24, 25, 26, 27.5, 28, 30, 32, 32.5, 34, 35, 36, 38, 40, 42, 44, 45, 46, 48, 50]
    static let smallGym: [String] = ["dumbbells", "adjustable_bench", "barbells", "squat_rack", "cables", "lat_pulldown_low_row",
                                     "pivot_leg_press", "pullup_bar", "weight_plates", "kettlebells", "resistance_bands", "floor_mats", "treadmill"]
    static let homeGym: [String] = ["dumbbells", "adjustable_bench", "resistance_bands", "floor_mats"]
    /// Set once the places of the new picker were added on this phone.
    static let seededKey = "gymPlacesSeeded"
    /// Set once Velké fitko, Malé fitko and Doma were offered to an account that had places already.
    static let presetsKey = "gymPresetsSeeded"
    /// Set once the plates were ticked in the gyms saved before they were on by default.
    static let platesKey = "gymPlatesSeeded"
    /// The save started when the screen was left before its autosave; the builder reads the list after it.
    @MainActor static var pendingSave: Task<Void, Never>?

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Kde cvičíš?", showsCoach: false) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Vybavení posilovny").padding(.top, 24)
                Text("Kde cvičíš?").font(Typo.heading(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                VStack(spacing: 10) {
                    ForEach(sorted) { place in placeRow(place) }
                }
                .padding(.top, 18)

                SecondaryButton(title: "Přidat posilovnu", systemImage: "plus") { adding = true }
                    .disabled(places.count >= Self.maxPlaces || (data == nil && !model.demo))
                    .padding(.top, 12)

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
        }
        .task { await load() }
        .task(id: Draft(places: places, active: active)) { await autosave() }
        .onDisappear { flush() }
        .navigationDestination(isPresented: Binding(get: { open != nil }, set: { if !$0 { open = nil } })) {
            if let id = open {
                GymPlaceView(place: binding(id), stations: data?.stations ?? [], sections: data?.pickerSections ?? [],
                             catalog: $catalog, onDelete: { delete(id) })
            }
        }
        .sheet(isPresented: $adding) {
            AddGymSheet(catalog: data?.stations ?? []) { name, stations, url in create(name: name, stations: stations, url: url) }
        }
    }

    /// Starred first, otherwise as they were added.
    private var sorted: [GymPlace] {
        places.filter { $0.favorite == true } + places.filter { $0.favorite != true }
    }

    private func placeRow(_ place: GymPlace) -> some View {
        let on = place.id == active
        return HStack(spacing: 12) {
            Button {
                active = place.id
                open = place.id
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: Self.icon(place))
                        .scaledFont(16, cap: .denseCap).foregroundStyle(on ? Palette.green : Palette.muted)
                        .frame(width: 36, height: 36)
                        .background(Palette.track, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(place.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                        Text(Self.countLine(place)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { toggleFavorite(place.id) } label: {
                Image(systemName: place.favorite == true ? "star.fill" : "star")
                    .scaledFont(18, cap: .denseCap).foregroundStyle(place.favorite == true ? Palette.amber : Palette.faint)
                    .frame(width: 40, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.tr("Oblíbené"))
            .accessibilityAddTraits(place.favorite == true ? .isSelected : [])
        }
        .padding(.leading, 14).padding(.trailing, 6).padding(.vertical, 10)
        .cardSurface(cornerRadius: 18)
        .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? Palette.green : .clear, lineWidth: 1.5) }
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    static func icon(_ place: GymPlace) -> String {
        if place.bodyweightOnly { return "figure.cooldown" }
        return place.kind == "home" ? "house" : "dumbbell"
    }

    /// "45 věcí", or "Bez vybavení" for the floor only.
    static func countLine(_ place: GymPlace) -> String {
        if place.bodyweightOnly { return L10n.tr("Bez vybavení") }
        let n = place.stations.count
        return L10n.plural("%lld věcí", n)
    }

    private func binding(_ id: String) -> Binding<GymPlace> {
        Binding(get: { places.first(where: { $0.id == id }) ?? GymPlace(id: id, kind: "gym", name: "", stations: [], url: "", dumbbellWeights: []) },
                set: { value in if let i = places.firstIndex(where: { $0.id == id }) { places[i] = value } })
    }

    private func toggleFavorite(_ id: String) {
        guard let i = places.firstIndex(where: { $0.id == id }) else { return }
        places[i].favorite = places[i].favorite == true ? nil : true
    }

    private func nextId() -> String {
        var n = places.count + 1
        while places.contains(where: { $0.id == "place-\(n)" }) { n += 1 }
        return "place-\(n)"
    }

    /// A new gym: what AI found, or an empty list to tick.
    private func create(name: String?, stations: [String], url: String) {
        guard places.count < Self.maxPlaces else { return }
        let id = nextId()
        let same = places.filter { $0.kind == "gym" }.count
        let base = L10n.tr("Posilovna")
        places.append(GymPlace(id: id, kind: "gym", name: name?.nilIfBlank ?? (same == 0 ? base : base + " \(same + 1)"),
                               stations: Self.withPlates(stations), url: url, dumbbellWeights: []))
        active = id
        open = id
    }

    /// Plates are in every gym unless the athlete unticks them.
    static func withPlates(_ stations: [String]) -> [String] {
        stations.contains("weight_plates") ? stations : stations + ["weight_plates"]
    }

    private func delete(_ id: String) {
        open = nil
        places.removeAll { $0.id == id }
        if active == id { active = sorted.first?.id ?? "bodyweight" }
    }

    /// The places of the picker: a big gym, a small one, home and the body
    /// weight for a new account; an account with places keeps them and gets
    /// the body weight once, when it has no such place, and once the three
    /// ready-made ones it has no place of that name for (deleted, they stay away).
    static func seeded(_ saved: [GymPlace], active: String, all: [String], firstTime: Bool, presetsFirstTime: Bool = false) -> Draft {
        func place(_ id: String, _ kind: String, _ name: String, _ stations: [String]) -> GymPlace {
            GymPlace(id: id, kind: kind, name: L10n.tr(name), stations: stations, url: "", dumbbellWeights: [])
        }
        let known = Set(all)
        let keep: ([String]) -> [String] = { known.isEmpty ? $0 : $0.filter(known.contains) }
        let presets = [place("place-1", "gym", "Velké fitko", all.isEmpty ? smallGym : all),
                       place("place-2", "gym", "Malé fitko", keep(smallGym)),
                       place("place-3", "home", "Doma", keep(homeGym))]
        let body = place("place-4", "home", "Vlastní váha", ["floor_mats"])
        if saved.isEmpty {
            return Draft(places: presets + [body], active: active == "bodyweight" ? "place-4" : active)
        }
        var list = saved
        var active = active
        func append(_ item: GymPlace) -> String? {
            guard list.count < maxPlaces else { return nil }
            var n = list.count + 1
            while list.contains(where: { $0.id == "place-\(n)" }) { n += 1 }
            var item = item
            item.id = "place-\(n)"
            list.append(item)
            return item.id
        }
        if presetsFirstTime {
            for preset in presets where !list.contains(where: { $0.name == preset.name }) { _ = append(preset) }
        }
        if firstTime, !list.contains(where: \.bodyweightOnly), let id = append(body), active == "bodyweight" { active = id }
        return Draft(places: list, active: active)
    }

    private func load() async {
        guard data == nil else { return }
        await Self.pendingSave?.value
        let firstTime = !UserDefaults.standard.bool(forKey: Self.seededKey)
        let presetsFirstTime = !UserDefaults.standard.bool(forKey: Self.presetsKey)
        if model.demo {
            let d = Self.seeded([], active: "place-1", all: [], firstTime: true)
            places = d.places; active = d.active
            return
        }
        do {
            async let equipment = model.api.gymEquipment()
            async let exercises = model.api.gymExercises()
            let d = try await equipment
            data = d
            let saved = d.places ?? [], savedActive = d.activePlace ?? "bodyweight"
            stored = Draft(places: saved, active: savedActive)
            let next = Self.seeded(saved, active: savedActive, all: (d.stations ?? []).map(\.id), firstTime: firstTime, presetsFirstTime: presetsFirstTime)
            places = next.places
            active = next.active
            if !UserDefaults.standard.bool(forKey: Self.platesKey) {
                for i in places.indices where places[i].kind == "gym" && !places[i].bodyweightOnly {
                    places[i].stations = Self.withPlates(places[i].stations)
                }
                UserDefaults.standard.set(true, forKey: Self.platesKey)
            }
            UserDefaults.standard.set(true, forKey: Self.seededKey)
            UserDefaults.standard.set(true, forKey: Self.presetsKey)
            catalog = (try? await exercises) ?? []
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Leaving the screen before the autosave ran (or while it ran): the change is saved anyway.
    private func flush() {
        guard let stored, !model.demo, data != nil else { return }
        let draft = Draft(places: places, active: active)
        guard draft != stored else { return }
        let api = model.api
        Self.pendingSave = Task { _ = try? await api.saveGymPlaces(draft.places, active: draft.active) }
    }

    /// Changes are saved a moment after the last one.
    private func autosave() async {
        guard let stored, !model.demo, data != nil else { return }
        let draft = Draft(places: places, active: active)
        guard draft != stored else { return }
        try? await Task.sleep(for: .milliseconds(700))
        guard !Task.isCancelled else { return }
        do {
            let r = try await model.api.saveGymPlaces(draft.places, active: draft.active)
            data?.equipment = r.equipment
            data?.selected = r.selected
            data?.dumbbellWeights = r.dumbbellWeights
            data?.gymName = r.gymName
            self.stored = draft
            error = nil
        } catch is CancellationError {
        } catch let failure as URLError where failure.code == .cancelled {
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

    /// "Posilovna, 14 strojů" for the builder and the library.
    static func summary(_ e: GymEquipment?) -> String {
        guard let e else { return L10n.tr("posilovna") }
        let count = ", " + L10n.plural("%lld věcí", e.selected.count)
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
                    Image(systemName: systemImage).scaledFont(18, cap: .denseCap).foregroundStyle(selected ? Palette.green : Palette.muted).frame(width: 26)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    if let subtitle { Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 8)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .scaledFont(22).foregroundStyle(selected ? Palette.green : Palette.faint)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            .cardSurface(cornerRadius: 18)
            .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(selected ? Palette.green : .clear, lineWidth: 1.5) }
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
/// machineLb: an exercise in pounds while the app is in kilos (LiftUnits):
/// the pounds typed in show back as typed, the plan's kilos to the nearest
/// 5 lb, a weight stack's usual step.
enum LiftWeight {
    /// The sheet's kg text in the chosen unit: "62.5" kg (62,5 in Czech), "137.8" in lb.
    static func shown(_ kgText: String?, machineLb: Bool = false) -> String? {
        guard let kgText else { return nil }
        // The sheet keeps "62,5" or "62.5": shown with the app language's decimal mark.
        guard let kg = number(kgText) else { return kgText }
        return text(machineLb ? machinePounds(kg) : shownValue(kg))
    }

    /// kg in the pounds of a machine: 31.75 typed as 70 lb is 70 again, the
    /// plan's 35 kg (77.2 lb) is 75.
    static func machinePounds(_ kg: Double) -> Double {
        let pounds = Units.pounds(kg)
        let half = (pounds * 2).rounded() / 2
        return abs(pounds - half) < 0.05 ? half : (pounds / 5).rounded() * 5
    }

    /// "kg", or "lb" for the whole app or this machine.
    static func unit(machineLb: Bool = false) -> String { machineLb ? "lb" : Units.weightUnit }

    /// kg → the chosen unit, to one decimal (dumbbells, steppers).
    static func shownValue(_ kg: Double) -> Double {
        Units.imperial ? (Units.weight(kg) * 10).rounded() / 10 : kg
    }

    /// What was typed (in the chosen unit) as kg text for the sheet, with a
    /// decimal period as the sets were always recorded.
    static func kgText(_ typed: String, machineLb: Bool = false) -> String {
        let t = typed.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if machineLb, let pounds = Double(t) {
            // To two decimals, so the pounds come back as typed (70 lb → 31.75 kg).
            return GymDay.kgText(Units.kgFromPounds(pounds))
        }
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

    /// In the phone region's decimal mark, never grouped ("1250", typed back in a field).
    private static func text(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(Fmt.locale))
    }
}

/// Pounds for one exercise while the app is in kilos: a machine in pounds in
/// a gym in kilos, chosen in Training mode's set table and kept on the phone
/// (the watch gets it with the day's plan). The sheet keeps kilos.
enum LiftUnits {
    static let key = "liftUnitsPounds"

    /// The exercises in pounds.
    static var all: Set<String> {
        guard !Units.imperial else { return [] }
        return Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    }

    static func pounds(_ exercise: String) -> Bool { all.contains(exercise) }

    static func set(_ exercise: String, pounds: Bool) {
        var names = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        if pounds { names.insert(exercise) } else { names.remove(exercise) }
        UserDefaults.standard.set(names.sorted(), forKey: key)
    }
}

/// A chip on the proposal that opens its menu: "Today ⌄", "60 min ⌄".
private struct SetupChip: View {
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Text(verbatim: text).lineLimit(1)
            Image(systemName: "chevron.down").scaledFont(10, weight: .bold)
        }
        .font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink)
        .padding(.horizontal, 14).frame(height: 34)
        .background(Palette.track, in: Capsule())
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}

/// The last proposal not saved to the plan yet, with its edits and its setup,
/// kept on the phone: an accidental back arrow loses nothing, and opening
/// Sestavit trénink again shows it. Gone once saved or when its day is over.
struct GymKeptProposal: Codable, Equatable {
    var proposal: GymProposal
    var day: String
    var minutes: Int
    var focus: String
    var muscles: [String]
    var shown: [String]
    var lengthPicked: Bool
    var at: Date

    static let key = "gym.lastProposal"

    static func load(_ defaults: UserDefaults = .standard) -> GymKeptProposal? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(GymKeptProposal.self, from: $0) }
    }

    func save(_ defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.key) }
    }

    static func clear(_ defaults: UserDefaults = .standard) { defaults.removeObject(forKey: key) }

    /// Still for a day to come; from Svaly or Odpočaté (a focus asked for) only with that focus.
    func fits(today: String, focus asked: String?) -> Bool {
        day >= today && (asked == nil || asked == focus)
    }
}

/// The gym lengths the athlete saved last, kept on the phone: the usual one
/// starts the quick workout from Svaly (the server caps it by the day's free time).
enum GymLength {
    static let choices = [30, 45, 60, 75, 90, 120]
    private static let key = "gym.recentMinutes"

    /// The most frequent of the last five saved lengths (a tie goes to the latest), nil before the first.
    static var usual: Int? {
        let recent = UserDefaults.standard.array(forKey: key) as? [Int] ?? []
        guard !recent.isEmpty else { return nil }
        let counts = Dictionary(recent.map { ($0, 1) }, uniquingKeysWith: +)
        return recent.reversed().max { counts[$0, default: 0] < counts[$1, default: 0] }
    }

    static func remember(_ minutes: Int) {
        let recent = (UserDefaults.standard.array(forKey: key) as? [Int] ?? []) + [minutes]
        UserDefaults.standard.set(Array(recent.suffix(5)), forKey: key)
    }

    static func focusTitle(_ focus: String) -> String {
        switch focus {
        case "upper": return L10n.tr("Horní část těla")
        case "lower": return L10n.tr("Nohy")
        case "muscles": return L10n.tr("Partie")
        case "rested": return L10n.tr("Odpočaté")
        default: return L10n.tr("Celé tělo")
        }
    }
}

extension GymBuilderView {
    /// Tests: the screen with this proposal, nothing built.
    init(date: String, preview: GymProposal) {
        self.init(date: date)
        _proposal = State(initialValue: preview)
    }
}

/// An exercise taken out of the proposal and the proposal before, for Undo:
/// offered while nothing else changed since (`after`).
private struct RemovedExercise {
    let id = UUID()
    let name: String
    let before: GymProposal
    let after: GymProposal
}
