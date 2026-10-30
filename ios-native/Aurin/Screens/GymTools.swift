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
                Image(systemName: "books.vertical.fill")
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
    @State private var day: Date = Date()
    @State private var minutes = 60
    @State private var focus = "auto"
    /// The focus came from the rested muscles, not from a tap (Svaly).
    @State private var focusPreset = false
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
    /// "Kde budeš cvičit?" before the first workout of an account without places.
    @State private var askPlace = false

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
            // The sample day keeps its own date; the real one opens on the day picked.
            if model.demo { day = earliest } else if let d = Self.isoFormatter.date(from: date), d >= earliest { day = d }
            if let minutes = template?.template.minutes { self.minutes = minutes }
            // Read again on every return, so a list changed in Vybavení shows here (after its save).
            if !model.demo {
                await EquipmentView.pendingSave?.value
                if let fresh = try? await model.api.gymEquipment() { equipment = fresh }
            }
            if !model.demo, catalog.isEmpty { catalog = (try? await model.api.gymExercises()) ?? [] }
            if template == nil, model.musclesStale { await model.loadMuscles() }
            // What is rested today picks the focus, until the athlete picks one.
            if template == nil, proposal == nil, focus == "auto", !focusPreset, let preset = model.muscles?.focus {
                focusPreset = true
                focus = preset
            }
        }
        .task { await MuscleModelStore.shared.load(api: model.demo ? nil : model.api) }
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
        .confirmationDialog("Kde budeš cvičit?", isPresented: $askPlace, titleVisibility: .visible) {
            ForEach(starterPlaces.places) { place in
                Button(place.name) { Task { await choosePlace(place.id) } }
            }
            Button("Zrušit", role: .cancel) {}
        } message: {
            Text("Trénink složím jen z vybavení, které tam je. Místa a stroje upravíš ve Vybavení.")
        }
    }

    // MARK: Form

    /// Svaly on top: what is ready today and what is still tired; a tap opens Svaly.
    private func musclesCard(_ data: MuscleFatigue) -> some View {
        RouteLink(route: .muscles) {
            HStack(spacing: 14) {
                MuscleFigurePair(colors: data.figureColors, spacing: 2).frame(height: 96)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: L10n.tr(data.readyTitle == nil ? "Dnes" : "Dnes připravené")).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: data.headline).font(Typo.sentence(21)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
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
            if let data = model.muscles { musclesCard(data).padding(.top, 20) }
            SectionLabel(text: "Kdy a jak dlouho").padding(.top, 26)
            Card {
                DatePicker("Den", selection: $day, in: earliest..., displayedComponents: .date)
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
                    if let figure = MuscleModelStore.shared.figure {
                        // Fixed front and back of the 3D figure; a tap picks the muscle.
                        MuscleFigureFixedPair(figure: figure, colors: MuscleFigureFixedPair.colors(Dictionary(uniqueKeysWithValues: muscles.map { ($0, Palette.green) }))) {
                            toggle(MuscleFatigue.bodyId($0))
                        }
                        .frame(height: 320)
                    } else {
                        BodyMap(selected: muscles, onTap: toggle, height: 280)
                    }
                    ChipFlow(items: BodyFigure.muscles.map { $0.id }, label: BodyFigure.label, isOn: { muscles.contains($0) }, toggle: toggle,
                             mark: { model.muscles?.tired(body: $0)?.color })
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
                    Label("Začít trénink", systemImage: "play.fill").font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
                        .frame(maxWidth: .infinity).frame(height: 54).background(Palette.green, in: Capsule())
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
                        .opacity(busy == "adjust" ? 0.45 : 1)
                    Button { Task { await adjust() } } label: {
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
                // What the coach is doing until his answer comes; the buttons below wait dimmed.
                if busy == "adjust" { CoachThinking(text: L10n.tr("Kouč upravuje trénink…")).padding(.top, 12) }
                if let answer, busy != "adjust" { Text(answer).font(Typo.small).foregroundStyle(Palette.green).fixedSize(horizontal: false, vertical: true).padding(.top, 8) }

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
                    // "Jiný návrh": the coach builds another one.
                    if busy == "preview" { CoachThinking(text: L10n.tr("Kouč sestavuje trénink…")).padding(.top, 12) }
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
                Text(setsLine(ex.sets, ex.reps, ex.kg))
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
                        Image(systemName: "ellipsis").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                            .frame(width: 32, height: 32).background(Palette.track, in: Circle())
                    }
                    .accessibilityLabel(L10n.f("Upravit %@", ex.name))
                }
            }
            .padding(.vertical, 12)
            Rectangle().fill(Palette.hairline).frame(height: 1)
        }
    }

    /// "3 × 8–10 · 60 kg" in steps: Xcode 26.6 times out on it as one expression.
    private func setsLine(_ sets: Int, _ reps: String, _ kg: String) -> String {
        let line: String = "\(sets) × " + Fmt.range(reps)
        if kg.isEmpty { return line }
        let weight: String = LiftWeight.shown(kg) ?? kg
        return line + " · " + weight + " " + Units.weightUnit
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
        DetailScreen(glow: Palette.Glow.training, title: "Kde cvičíš?") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · vybavení").padding(.top, 24)
                Text("Kde cvičíš?").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

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

    /// "Posilovna · 14 strojů" for the builder and the library.
    static func summary(_ e: GymEquipment?) -> String {
        guard let e else { return L10n.tr("posilovna") }
        let count = " · " + L10n.plural("%lld věcí", e.selected.count)
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
enum LiftWeight {
    /// The sheet's kg text in the chosen unit: "62.5" kg (62,5 in Czech), "137.8" in lb.
    static func shown(_ kgText: String?) -> String? {
        guard let kgText else { return nil }
        // The sheet keeps "62,5" or "62.5": shown with the app language's decimal mark.
        guard let kg = number(kgText) else { return kgText }
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

    /// In the phone region's decimal mark, never grouped ("1250", typed back in a field).
    private static func text(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(Fmt.locale))
    }
}
