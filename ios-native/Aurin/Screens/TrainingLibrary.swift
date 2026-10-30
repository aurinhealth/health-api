import SwiftUI

// MARK: - Knihovna

/// One library for all sports. Opened from the widget it shows the sports as
/// panels; a sport opens on its own screen: for ride, run and swim the workouts with
/// filters (where, the length with its ± tolerance and own presets, the type,
/// the difficulty), for the gym the AI builder and the exercises.
struct TrainingLibraryView: View {
    @Environment(AppModel.self) private var model
    let sport: LibrarySport?
    /// Workouts from friends not opened yet (the badge on Od přátel).
    @State private var unseen = 0

    init(sport: String? = nil) {
        self.sport = sport.flatMap { LibrarySport.find($0) }
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: sport?.label ?? "Knihovna tréninků") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · knihovna").padding(.top, 24)
                Text(sport?.label ?? "Knihovna tréninků").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                if let sport {
                    if sport.id == "gym" { GymLibrarySection() } else if sport.id == "tri" { BrickLibrarySection() } else { WorkoutLibrarySection(sport: sport.id) }
                } else {
                    HStack(spacing: 10) {
                        ForEach(LibrarySport.all) { LibrarySportPanel(sport: $0) }
                    }
                    .padding(.top, 20)
                    HStack(spacing: 10) {
                        LibraryTile(route: .myWorkouts, title: "Moje tréninky", symbol: "bookmark.fill", color: Palette.green)
                        LibraryTile(route: .friendWorkouts, title: "Od přátel", symbol: "person.2.fill", color: Palette.blue, badge: unseen)
                    }
                    .padding(.top, 10)
                }
            }
        }
        .onAppear {
            guard sport == nil, !model.demo else { return }
            Task { unseen = (try? await model.api.myWorkouts().unseen) ?? unseen }
        }
    }
}

/// Knihovna → Moje tréninky, Od přátel: a wide tile, with the count of new ones.
struct LibraryTile: View {
    let route: AppRoute
    let title: String
    let symbol: String
    let color: Color
    var badge = 0

    var body: some View {
        RouteLink(route: route) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Image(systemName: symbol)
                        .scaledFont(14, weight: .semibold, cap: .denseCap)
                        .foregroundStyle(Palette.onAccent)
                        .frame(width: 32, height: 32)
                        .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Spacer()
                    if badge > 0 {
                        Text("\(badge)").font(.caption.weight(.bold)).foregroundStyle(Palette.onAccent)
                            .padding(.horizontal, 7).frame(minWidth: 22, minHeight: 22)
                            .background(Palette.amberBar, in: Capsule())
                    }
                }
                .padding(.bottom, 4)
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 18)
            .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(badge > 0 ? L10n.f("%@, nové: %@", L10n.tr(title), String(badge)) : L10n.tr(title))
    }
}

/// The sports of the library, each with its icon and colour.
struct LibrarySport: Identifiable {
    let id: String
    let label: String
    let symbol: String
    let color: Color

    static let all = [
        LibrarySport(id: "ride", label: "Kolo", symbol: "bicycle", color: Palette.amberBar),
        LibrarySport(id: "run", label: "Běh", symbol: "figure.run", color: Palette.rust),
        LibrarySport(id: "swim", label: "Plavání", symbol: "figure.pool.swim", color: Palette.blue),
        // Bricks, two sports one right after the other (BrickLibrarySection).
        LibrarySport(id: "tri", label: "Tri", symbol: "figure.open.water.swim", color: Palette.green),
        LibrarySport(id: "gym", label: "Posilovna", symbol: "dumbbell.fill", color: Palette.indigo)
    ]
    /// The sports of one workout (Moje tréninky → +): not the bricks.
    static var single: [LibrarySport] { all.filter { $0.id != "tri" } }

    static func find(_ id: String) -> LibrarySport? { all.first { $0.id == id } }
}

/// A sport's panel in the library; a tap opens the sport.
struct LibrarySportPanel: View {
    let sport: LibrarySport

    var body: some View {
        RouteLink(route: .workoutLibrary(sport.id)) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: sport.symbol)
                    .scaledFont(15, weight: .semibold, cap: .denseCap)
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(sport.color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .padding(.bottom, 4)
                Text(sport.label).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 18)
            .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(L10n.tr(sport.label))
    }
}

/// The gym part of the library: build a session with AI, the muscles, then the exercises.
struct GymLibrarySection: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RouteLink(route: .gymBuilder) {
                HStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .scaledFont(16, weight: .semibold, cap: .denseCap).foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Palette.green, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    Text("Sestavit trénink").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                }
                .padding(14)
                .cardSurface(cornerRadius: 18)
            }
            .padding(.top, 18)

            if let data = model.muscles {
                RouteLink(route: .muscles) {
                    HStack(spacing: 14) {
                        MuscleFigurePair(colors: data.figureColors, spacing: 2).frame(height: 84)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(verbatim: L10n.tr(data.readyTitle == nil ? "Dnes" : "Dnes připravené")).font(Typo.caption).foregroundStyle(Palette.muted)
                            Text(verbatim: data.headline).font(Typo.sentence(20)).foregroundStyle(Palette.ink).lineLimit(2).minimumScaleFactor(0.8)
                            if let most = data.tired.first {
                                Text(verbatim: L10n.f("%@: odpočaté %@", L10n.tr(most.label), most.readyText(today: data.date)))
                                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                    }
                    .padding(14)
                    .cardSurface(cornerRadius: 18)
                }
                .padding(.top, 12)
            }

            SectionLabel(text: "Cviky").padding(.top, 26)
            ExerciseCatalog()
        }
        .task { if model.musclesStale { await model.loadMuscles() } }
    }
}

// MARK: Tri

/// Knihovna → Tri: bricks, two sports one right after the other
/// (GET /app/api/workouts/bricks, src/brick-workouts.js).
struct BrickLibrarySection: View {
    @Environment(AppModel.self) private var model
    @State private var bricks: [LibraryBrick] = []
    @State private var indoor = true
    @State private var loading = true
    @State private var error: String?
    @State private var open: LibraryBrick?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("Kde", selection: $indoor) {
                Text("Trenažér").tag(true)
                Text("Venku").tag(false)
            }
            .pickerStyle(.segmented)
            .padding(.top, 18)
            SectionLabel(text: "Bricky").padding(.top, 22)
            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 10)
            } else if loading && bricks.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
            } else {
                Card(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(bricks.enumerated()), id: \.element.id) { index, brick in
                            if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 16) }
                            Button { open = brick } label: { row(brick) }.buttonStyle(.plain)
                        }
                    }
                }
                .padding(.top, 10)
                Label("Do Apple Watch jako jeden multisport trénink.", systemImage: "applewatch")
                    .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 12)
            }
        }
        .task(id: indoor) { await load() }
        .sheet(item: $open) { LibraryBrickSheet(brick: $0, indoor: indoor) }
    }

    private func row(_ brick: LibraryBrick) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: -8) {
                ForEach(Array(brick.legs.enumerated()), id: \.offset) { _, leg in
                    let s = LibrarySport.find(leg.sport)
                    Image(systemName: s?.symbol ?? "figure.mixed.cardio")
                        .scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.onAccent)
                        .frame(width: 30, height: 30)
                        .background(s?.color ?? Palette.green, in: Circle())
                        .overlay { Circle().stroke(Palette.card, lineWidth: 2.5) }
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: brick.name).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: brick.legs.map { L10n.tr(LibrarySport.find($0.sport)?.label ?? $0.sport) + " " + Fmt.duration($0.minutes) }.joined(separator: " + "))
                    .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
                legBar(brick).padding(.top, 4)
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .padding(14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// Each leg's share of the brick's time, in its sport's colour.
    private func legBar(_ brick: LibraryBrick) -> some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(Array(brick.legs.enumerated()), id: \.offset) { _, leg in
                    Capsule().fill(LibrarySport.find(leg.sport)?.color ?? Palette.green)
                        .frame(width: max(4, (geo.size.width - 2) * CGFloat(leg.minutes) / CGFloat(max(1, brick.minutes))))
                }
            }
        }
        .frame(width: 150, height: 5)
    }

    private func load() async {
        guard !model.demo else { loading = false; return }
        loading = true
        defer { loading = false }
        do {
            bricks = try await model.api.libraryBricks(indoor: indoor)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A brick: its legs with their steps, planned on a day as two workouts, the
/// second joined right after the first (planned-links.js).
struct LibraryBrickSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let brick: LibraryBrick
    let indoor: Bool
    @State private var date = Date()
    @State private var saving = false
    @State private var done = false
    @State private var error: String?

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: brick.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                Text(verbatim: Fmt.duration(brick.minutes)).font(Typo.small).foregroundStyle(Palette.muted)
                Text(verbatim: brick.note).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                ForEach(Array(brick.legs.enumerated()), id: \.offset) { index, leg in
                    if index > 0 {
                        Label("Hned potom", systemImage: "link").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.amber)
                    }
                    let s = LibrarySport.find(leg.sport)
                    Card {
                        HStack(spacing: 10) {
                            Image(systemName: s?.symbol ?? "figure.mixed.cardio").scaledFont(13, weight: .semibold, cap: .denseCap)
                                .foregroundStyle(Palette.onAccent).frame(width: 28, height: 28)
                                .background(s?.color ?? Palette.green, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                            Text(L10n.tr(s?.label ?? leg.sport)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            Spacer()
                            Text(verbatim: [Fmt.duration(leg.minutes), leg.meters.map { Fmt.int($0) + " m" }].compactMap { $0 }.joined(separator: " · "))
                                .font(Typo.small).foregroundStyle(Palette.muted)
                        }
                        if !leg.steps.isEmpty {
                            WorkoutProfile(blocks: leg.steps, sport: leg.sport).padding(.top, 8)
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(Array(leg.steps.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                            }
                            .padding(.top, 8)
                        }
                    }
                }
                Card {
                    DatePicker("Den", selection: $date, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                    if done {
                        Label("Naplánováno, najdeš ho v týdnu i v Intervals.icu.", systemImage: "checkmark.circle.fill")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    } else {
                        PrimaryButton(title: saving ? "Plánuji…" : "Naplánovat", systemImage: "calendar.badge.plus", busy: saving) { Task { await schedule() } }
                            .disabled(saving || model.demo)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                }
                Text("Spojený brick pošlete z dne v týdnu do Apple Watch jako jeden multisport trénink.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }

    /// Both legs on the day, the second joined right after the first.
    private func schedule() async {
        saving = true
        defer { saving = false }
        do {
            let day = AppModel.localDate(date)
            var previous: String?
            for leg in brick.legs {
                let event = try await model.api.scheduleWorkout(id: leg.workoutId, date: day, indoor: leg.sport == "swim" || indoor)
                if let event, let previous { try await model.api.linkPlanned(eventId: event, after: previous) }
                previous = event
            }
            done = true
            error = nil
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: Ride and run

struct WorkoutLibrarySection: View {
    @Environment(AppModel.self) private var model
    let sport: String
    @AppStorage("libraryIndoor") private var indoor = true
    @AppStorage("libraryPresetsRide") private var presetsRide = "60,90,120,180"
    @AppStorage("libraryPresetsRun") private var presetsRun = "30,45,60,90"
    @AppStorage("libraryPresetsSwim") private var presetsSwim = "30,45,60"
    @AppStorage("libraryToleranceRide") private var toleranceRide = 15
    @AppStorage("libraryToleranceRun") private var toleranceRun = 10
    @AppStorage("libraryToleranceSwim") private var toleranceSwim = 10
    @State private var minutes: Int? = nil
    @State private var slider: Double = 60
    /// While the finger is on the slider (the time above follows it).
    @State private var dragging = false
    /// The coach's length for today (the search's coachPick), shown on Doporučená.
    @State private var recommended: Int?
    @State private var system: String? = nil
    @State private var level: Level = .any
    @State private var workouts: [LibraryWorkout] = []
    @State private var loading = false
    @State private var error: String?
    @State private var open: LibraryWorkout?
    @State private var proposal: GeneratedWorkout?
    @State private var variant = 0
    @State private var proposing = false
    @State private var proposalError: String?
    /// Few workouts of the chosen type: the AI's own for these filters (Na míru od AI).
    @State private var composeWanted = false
    @State private var composed: LibraryWorkout?
    @State private var composing = false
    @State private var composeVariant = 0
    @State private var composeMore = false

    enum Level: String, CaseIterable, Identifiable {
        case any, easy, medium, hard
        var id: String { rawValue }
        var label: String { ["any": "Všechny", "easy": "Lehké", "medium": "Střední", "hard": "Těžké"][rawValue]! }
        /// The bands of the 1–10 difficulty (src/workout-model.js).
        var range: ClosedRange<Double>? {
            switch self {
            case .any: return nil
            case .easy: return 1...4
            case .medium: return 4...6.5
            case .hard: return 6.5...10
            }
        }
    }

    private var range: ClosedRange<Double> { sport == "swim" ? 15...90 : sport == "run" ? 20...150 : 30...300 }
    private var step: Double { sport == "ride" ? 15 : 5 }
    private var presets: [Int] {
        (sport == "swim" ? presetsSwim : sport == "run" ? presetsRun : presetsRide).split(separator: ",").compactMap { Int($0) }.sorted()
    }
    private var tolerance: Binding<Int> { sport == "swim" ? $toleranceSwim : sport == "run" ? $toleranceRun : $toleranceRide }
    /// A swim has no tempo or sweet spot (src/swimming-workouts.js).
    private var systems: [(String, String)] {
        sport == "swim" ? LibraryWorkout.systems.filter { ["recovery", "endurance", "threshold", "vo2max", "sprint"].contains($0.0) } : LibraryWorkout.systems
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("Kde", selection: $indoor) {
                Text(sport == "swim" ? "Bazén" : sport == "run" ? "Pás" : "Trenažér").tag(true)
                Text(sport == "swim" ? "Volná voda" : "Venku").tag(false)
            }
            .pickerStyle(.segmented)
            .padding(.top, 16)

            coachPick
            lengthFilter
            SectionLabel(text: "Typ").padding(.top, 20)
            ChipFlow(items: [""] + systems.map { $0.0 }, label: { $0.isEmpty ? "Doporučený" : LibraryWorkout.systemLabel($0) },
                     isOn: { ($0.isEmpty && system == nil) || $0 == system }, toggle: { system = $0.isEmpty ? nil : $0 })
                .padding(.top, 8)
            SectionLabel(text: "Obtížnost").padding(.top, 20)
            Picker("Obtížnost", selection: $level) {
                ForEach(Level.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 8)

            if composeShown { composedPick }

            if loading && workouts.isEmpty && !composeShown {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
            } else if workouts.isEmpty {
                Text(composeShown ? "V knihovně tomuto výběru nic neodpovídá." : "Těmto filtrům nic neodpovídá. Zkus delší toleranci délky nebo jinou obtížnost.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 20)
            } else {
                Text(L10n.plural(composeShown ? "Z knihovny · %lld tréninků" : "%lld tréninků", workouts.count))
                    .font(Typo.caption).foregroundStyle(Palette.faint).padding(.top, 20)
                VStack(spacing: 10) {
                    ForEach(workouts) { w in
                        Button { open = w } label: { LibraryWorkoutCard(workout: w) }.buttonStyle(PressableCardStyle())
                    }
                }
                .padding(.top, 8)
                .opacity(loading ? 0.5 : 1)
            }
        }
        .onAppear { slider = Double(presets.first ?? (sport == "ride" ? 90 : 45)) }
        .task(id: "\(minutes ?? 0)|\(tolerance.wrappedValue)|\(system ?? "")|\(indoor)|\(level.rawValue)") { await load() }
        .sheet(item: $open) { w in LibraryWorkoutSheet(workout: w, sport: sport, indoor: indoor) }
    }

    /// The coach's one workout for today, from the length chosen below.
    private var coachPick: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let workout = proposal?.workout {
                SectionLabel(text: "Návrh kouče")
                Button { open = workout } label: { LibraryWorkoutCard(workout: workout) }.buttonStyle(PressableCardStyle())
                if (proposal?.variantCount ?? 0) > 1 {
                    SecondaryButton(title: proposing ? "Hledám…" : "Jiný návrh") { Task { variant += 1; await propose() } }
                        .disabled(proposing)
                }
            } else {
                PrimaryButton(title: proposing ? "Hledám…" : "Navrhnout trénink na dnes", systemImage: "sparkles", busy: proposing) {
                    Task { variant = 0; await propose() }
                }
                .disabled(model.demo)
            }
            if let message = proposalError ?? (proposal?.workout == nil ? proposal?.message : nil) {
                Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 20)
        .onChange(of: "\(minutes ?? 0)|\(indoor)") { proposal = nil; proposalError = nil }
    }

    /// Shown while the AI writes and once it has; a failure or an empty answer hides it.
    private var composeShown: Bool { composeWanted && (composing || composed != nil) }

    /// Na míru od AI: the AI's own workout for the filters above the library's few.
    private var composedPick: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                AIMark()
                Text(verbatim: L10n.tr("Na míru od AI").uppercased(with: Fmt.locale))
                    .font(.caption.weight(.medium)).tracking(1.9).foregroundStyle(Palette.amber)
                    .accessibilityAddTraits(.isHeader)
            }
            if let composed, !composing {
                Button { open = composed } label: { LibraryWorkoutCard(workout: composed) }.buttonStyle(PressableCardStyle())
                if composeMore {
                    SecondaryButton(title: "Jiný návrh") { Task { await compose(variant: composeVariant + 1) } }
                }
            } else {
                CoachThinking(text: L10n.tr("Skládám trénink podle tvého výběru…"))
            }
        }
        .padding(.top, 24)
    }

    private func compose(variant: Int) async {
        composing = true
        defer { composing = false }
        do {
            let result = try await model.api.composeWorkout(sport: sport, minutes: minutes, tolerance: tolerance.wrappedValue, system: system,
                                                            indoor: indoor, difficulty: level.range, variant: variant)
            guard !Task.isCancelled else { return }
            if let workout = result.workout {
                composed = workout
                composeVariant = variant
                composeMore = result.more ?? false
            } else if variant == 0 {
                composed = nil
            } else {
                composeMore = false
            }
        } catch {
            // The AI is extra: on a failure the library stays as it is.
            if variant == 0 { composed = nil } else { composeMore = false }
        }
    }

    private func propose() async {
        proposing = true
        defer { proposing = false }
        do {
            proposal = try await model.api.generateWorkout(sport: sport, minutes: minutes, indoor: indoor, variant: variant)
            proposalError = nil
        } catch {
            proposalError = error.localizedDescription
        }
    }

    /// "Doporučená" or the own length: presets to tap, a slider, and how far
    /// from it a workout may be (± minutes). The time above follows the finger;
    /// "+" at the end of the presets saves the own length, holding a preset
    /// removes it.
    private var lengthFilter: some View {
        let shown = dragging || minutes != nil ? Int(slider) : recommended
        let own = minutes.flatMap { presets.contains($0) ? nil : $0 }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Délka")
                Spacer()
                if let shown {
                    Text(verbatim: Fmt.duration(shown)).font(Typo.number(26)).foregroundStyle(Palette.ink)
                        .contentTransition(.numericText()).animation(.snappy, value: shown)
                    Text(verbatim: "± \(tolerance.wrappedValue) min").font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
            FlowLayout(spacing: 8) {
                lengthChip(L10n.tr("Doporučená"), on: minutes == nil && !dragging) { minutes = nil; if let recommended { slider = Double(recommended) } }
                ForEach(presets, id: \.self) { value in
                    lengthChip(Fmt.duration(value), on: !dragging && minutes == value) { minutes = value; slider = Double(value) }
                        .contextMenu {
                            Button(role: .destructive) { removePreset(value) } label: { Label("Odebrat z předvoleb", systemImage: "trash") }
                        }
                }
                Button { if let own { addPreset(own) } } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "plus")
                        if let own { Text(verbatim: L10n.f("Uložit %@", Fmt.duration(own))) }
                    }
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(own == nil ? Palette.faint : Palette.amber)
                        .padding(.horizontal, 12).frame(minWidth: 32, minHeight: 32)
                        .background(own == nil ? Color.clear : Palette.amberSoft, in: Capsule())
                        .overlay { Capsule().stroke(own == nil ? Palette.ink.opacity(0.25) : Palette.amberBar, style: StrokeStyle(lineWidth: 1, dash: [3, 3])) }
                }
                .buttonStyle(.plain)
                .disabled(own == nil || presets.count >= 8)
                .accessibilityLabel(own.map { L10n.f("Uložit %@", Fmt.duration($0)) } ?? L10n.tr("Uložit délku jako předvolbu"))
            }
            Slider(value: $slider, in: range, step: step, onEditingChanged: { editing in
                dragging = editing
                if !editing { minutes = Int(slider) }
            })
            .tint(Palette.amberBar)
            Menu {
                ForEach([5, 10, 15, 20, 30, 45], id: \.self) { t in
                    Button("± \(t) min") { tolerance.wrappedValue = t }
                }
            } label: {
                Label("± \(tolerance.wrappedValue) min", systemImage: "arrow.left.and.right")
                    .font(.footnote.weight(.medium)).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(Palette.card, in: Capsule())
            }
        }
        .padding(.top, 20)
    }

    private func lengthChip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title)
                .font(.footnote.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? Palette.button : Palette.card, in: Capsule())
                .overlay { Capsule().stroke(Palette.ink.opacity(on ? 0 : 0.12), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func addPreset(_ value: Int) {
        let next = Array(Set(presets + [value])).sorted().prefix(8).map(String.init).joined(separator: ",")
        if sport == "swim" { presetsSwim = next } else if sport == "run" { presetsRun = next } else { presetsRide = next }
    }

    private func removePreset(_ value: Int) {
        let next = presets.filter { $0 != value }.map(String.init).joined(separator: ",")
        if sport == "swim" { presetsSwim = next } else if sport == "run" { presetsRun = next } else { presetsRide = next }
    }

    private func load() async {
        guard !model.demo else { error = "V ukázce se knihovna nenačítá."; return }
        // The slider and the chips change quickly: wait until they settle.
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        loading = true
        defer { loading = false }
        do {
            let result = try await model.api.searchWorkouts(sport: sport, minutes: minutes, tolerance: tolerance.wrappedValue,
                                                            system: system, indoor: indoor, difficulty: level.range)
            workouts = result.workouts
            if let length = result.coachPick?.durationMinutes {
                recommended = Int(length)
                if minutes == nil && !dragging { slider = min(max(Double(length), range.lowerBound), range.upperBound) }
            }
            error = nil
            composed = nil
            composeWanted = result.compose == true
            if composeWanted {
                loading = false
                await compose(variant: 0)
            }
        } catch is CancellationError {
        } catch let failure as URLError where failure.code == .cancelled {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct LibraryWorkoutCard: View {
    let workout: LibraryWorkout

    var body: some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                Text(workout.name).font(.body.weight(.semibold)).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                if let d = workout.duration_minutes { Text(Fmt.duration(Int(d))).font(Typo.number(19)).foregroundStyle(Palette.ink) }
                if workout.ai != nil { AIMark() }
            }
            HStack(spacing: 8) {
                if let s = workout.primary_system { Pill(text: LibraryWorkout.systemLabel(s), foreground: Palette.amber, background: Palette.amberSoft) }
                if let level = workout.difficultyLabel { Text(level).font(Typo.caption).foregroundStyle(Palette.muted) }
                if let load = workout.target_load { Text(Fmt.int(load) + " TSS").font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            if let blocks = workout.steps, !blocks.isEmpty { StepsProfile(blocks: blocks).frame(height: 36) }
            if let line = workout.description?.nilIfBlank ?? workout.guide?.how?.dropFirst().first {
                Text(line).font(Typo.caption).foregroundStyle(Palette.secondary).lineLimit(2).multilineTextAlignment(.leading)
            }
            if let reason = workout.ai?.reason {
                Text(reason).font(Typo.caption).foregroundStyle(Palette.green).lineLimit(3).multilineTextAlignment(.leading)
                if let warning = workout.ai?.warning {
                    Label(warning, systemImage: "exclamationmark.triangle").font(Typo.caption).foregroundStyle(Palette.amber)
                        .lineLimit(3).multilineTextAlignment(.leading)
                }
            } else if let why = workout.reasons?.first {
                Label(Fmt.capitalized(why), systemImage: "checkmark").font(Typo.caption).foregroundStyle(Palette.green).lineLimit(1)
            }
        }
    }
}

/// The small ✦ in the corner of what the AI chose or wrote.
struct AIMark: View {
    var body: some View {
        Image(systemName: "sparkle")
            .scaledFont(11, weight: .semibold)
            .foregroundStyle(Palette.amber)
            .accessibilityLabel(Text("Navrženo AI"))
    }
}

struct LibraryWorkoutSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let workout: LibraryWorkout
    let sport: String
    let indoor: Bool
    @State private var date = Date()
    @State private var saving = false
    @State private var done = false
    @State private var error: String?
    @State private var keeping = false
    @State private var kept = false

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text(workout.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                HStack(spacing: 18) {
                    if let d = workout.duration_minutes { meta("Délka", Fmt.duration(Int(d))) }
                    if let m = workout.distance_meters, m > 0 { meta("Vzdálenost", Fmt.int(m) + " m") }
                    if let l = workout.target_load { meta("Zátěž", Fmt.int(l) + " TSS") }
                    if let level = workout.difficultyLabel { meta("Obtížnost", level) }
                }
                if let s = workout.primary_system {
                    Pill(text: workout.guide?.title ?? LibraryWorkout.systemLabel(s), foreground: Palette.amber, background: Palette.amberSoft)
                }
                if let reason = workout.ai?.reason {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        AIMark()
                        Text(reason).font(Typo.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let warning = workout.ai?.warning {
                    Label(warning, systemImage: "exclamationmark.triangle").font(Typo.small).foregroundStyle(Palette.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let d = workout.description?.nilIfBlank {
                    Text(d).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                if let blocks = workout.steps, !blocks.isEmpty {
                    Card { WorkoutProfile(blocks: blocks, sport: sport) }
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                    }
                }
                list("Proč se dnes hodí", workout.reasons?.map(Fmt.capitalized), "checkmark.circle", Palette.green)
                list(sport == "swim" ? "Jak ho plavat" : sport == "run" ? "Jak ho běžet" : "Jak ho jet", workout.guide?.how, sport == "swim" ? "figure.pool.swim" : "figure." + (sport == "run" ? "run" : "outdoor.cycle"), Palette.amber)
                list("Jídlo a pití", workout.guide?.fueling, "fork.knife", Palette.brown)
                list("Kde", workout.guide?.environment, "map", Palette.indigo)
                if let source = workout.source_name { Text(L10n.f("Zdroj: %@", source)).font(Typo.caption).foregroundStyle(Palette.faint) }

                Card {
                    DatePicker("Den", selection: $date, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                    if done {
                        Label("Naplánováno, najdeš ho v týdnu i v Intervals.icu.", systemImage: "checkmark.circle.fill")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    } else {
                        PrimaryButton(title: saving ? "Plánuji…" : "Naplánovat", systemImage: "calendar.badge.plus", busy: saving) { Task { await schedule() } }
                            .disabled(saving || model.demo)
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                }
                if !workout.id.hasPrefix("own-") {
                    if kept {
                        Label("Uloženo v Mých trénincích", systemImage: "checkmark.circle.fill")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.green)
                            .frame(maxWidth: .infinity).frame(height: 46)
                    } else {
                        SecondaryButton(title: keeping ? "Ukládám…" : "Uložit do Mých tréninků", systemImage: "bookmark") { Task { await keep() } }
                            .disabled(keeping || model.demo)
                    }
                }
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }

    /// The workout among the athlete's own, to change its sections or share it.
    private func keep() async {
        keeping = true
        defer { keeping = false }
        do {
            _ = try await model.api.saveLibraryWorkout(id: workout.id)
            kept = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    @ViewBuilder
    private func list(_ title: String, _ lines: [String]?, _ symbol: String, _ color: Color) -> some View {
        if let lines, !lines.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Label(L10n.tr(title), systemImage: symbol).font(Typo.bodyStrong).foregroundStyle(color)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Circle().fill(color.opacity(0.6)).frame(width: 5, height: 5).offset(y: -2)
                        Text(line).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 6)
        }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
    }

    private func schedule() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.scheduleWorkout(id: workout.id, date: AppModel.localDate(date), indoor: indoor)
            done = true
            error = nil
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Exercises

/// "Knihovna cviků" on its own screen (deep link loadwise://open/exercises).
struct ExerciseLibraryView: View {
    /// Opened on one muscle (Svaly → Cviky: …), a BodyFigure id.
    var muscle: String? = nil

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Cviky") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · knihovna cviků").padding(.top, 24)
                Text("Cviky").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                ExerciseCatalog(muscle: muscle)
            }
        }
    }
}

/// Search, the muscle chips, "Jen s mým vybavením" and the list of exercises.
struct ExerciseCatalog: View {
    @Environment(AppModel.self) private var model
    init(muscle: String? = nil) { _muscle = State(initialValue: muscle) }

    @State private var exercises: [GymCatalogExercise] = []
    @State private var equipment: GymEquipment?
    @State private var query = ""
    @State private var muscle: String?
    /// Only exercises whose main muscle is rested (Svaly).
    @State private var rested = false
    @State private var mine = true
    @State private var loading = true
    @State private var error: String?
    @State private var open: GymCatalogExercise?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField("Hledat cvik nebo stroj", text: $query).autocorrectionDisabled()
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint) }
                        .accessibilityLabel("Smazat hledání")
                }
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.top, 12)

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    chip("Vše", muscle == nil && !rested) { muscle = nil; rested = false }
                    if model.muscles.map({ !$0.tired.isEmpty }) == true {
                        chip("Odpočaté", rested, dot: Palette.green) { rested.toggle() }
                    }
                    ForEach(BodyFigure.muscles.indices, id: \.self) { i in
                        let m = BodyFigure.muscles[i]
                        chip(m.label, muscle == m.id) { muscle = muscle == m.id ? nil : m.id }
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            .padding(.top, 12)

            PillToggle(title: "Jen s mým vybavením", subtitle: EquipmentView.summary(equipment), isOn: $mine)
                .padding(.top, 12)

            if loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
            } else {
                Text(L10n.plural("%lld cviků", filtered.count))
                    .font(Typo.caption).foregroundStyle(Palette.faint).padding(.top, 16)
                LazyVStack(spacing: 0) {
                    ForEach(filtered) { ex in
                        Button { open = ex } label: { row(ex) }.buttonStyle(.plain)
                        Rectangle().fill(Palette.hairline).frame(height: 1)
                    }
                }
                .padding(.top, 4)
            }
        }
        .task {
            if model.musclesStale { await model.loadMuscles() }
            await load()
        }
        .sheet(item: $open) { ex in ExerciseSheet(exercise: ex) }
    }

    private var filtered: [GymCatalogExercise] {
        let words = Self.fold(query).split(separator: " ")
        return exercises.filter { ex in
            let text = Self.fold([ex.name, ex.muscle ?? "", ex.station ?? "", ex.note ?? ""].joined(separator: " "))
            guard words.allSatisfy({ text.contains($0) }) else { return false }
            if let muscle, !Self.works(ex, muscle) { return false }
            if mine, !EquipmentView.fits(ex, equipment) { return false }
            if rested, tired(ex) != nil { return false }
            return true
        }
    }

    /// Whether the exercise works the muscle: by the server's map, else (an
    /// older server) by the catalog's muscle name (src/gym-catalog.js MUSCLES_CS).
    static func works(_ ex: GymCatalogExercise, _ muscle: String) -> Bool {
        if let map = ex.muscles, !map.isEmpty { return (map[muscle] ?? 0) >= 0.5 }
        let names: [String: [String]] = [
            "chest": ["hrudnik"], "upper_back": ["zada"], "lats": ["zada"], "lower_back": ["spodni zada"], "traps": ["trapezy"],
            "front_delts": ["ramena"], "side_delts": ["bocni ramena"], "rear_delts": ["zadni ramena"], "biceps": ["biceps"],
            "triceps": ["triceps"], "forearms": ["predlokti"], "abs": ["stred tela"], "obliques": ["stred tela"],
            "hips": ["hyzde", "vnejsi stehna", "vnitrni stehna"], "quads": ["predni stehna"], "hamstrings": ["zadni stehna"], "calves": ["lytka"]
        ]
        return (names[muscle] ?? []).contains(fold(ex.muscle ?? ""))
    }

    private func row(_ ex: GymCatalogExercise) -> some View {
        HStack(spacing: 12) {
            BodyMap(load: ex.muscles ?? [:], height: 54, compact: true).frame(width: 64).allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 2) {
                Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                Text([ex.muscle, ex.station].compactMap { $0?.nilIfBlank }.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                if let m = tired(ex), let data = model.muscles {
                    Text(verbatim: L10n.f("%@ unavené, odpočaté %@", m.label, m.readyText(today: data.date)))
                        .font(Typo.caption).foregroundStyle(Palette.rust).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    /// The tired muscle behind the exercise's main muscle, nil when it is rested.
    private func tired(_ ex: GymCatalogExercise) -> MuscleFatigue.Muscle? {
        guard let data = model.muscles, let main = (ex.muscles ?? [:]).max(by: { $0.value < $1.value }), main.value >= 0.5 else { return nil }
        return data.tired(body: main.key)
    }

    private func chip(_ title: String, _ on: Bool, dot: Color? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let dot { Circle().fill(dot).frame(width: 7, height: 7) }
                Text(verbatim: L10n.tr(title))
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(on ? Palette.onButton : Palette.ink)
            .padding(.horizontal, 12).frame(height: 32)
            .background(on ? Palette.button : Palette.card, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func load() async {
        guard exercises.isEmpty else { return }
        defer { loading = false }
        guard !model.demo else { error = "V ukázce se knihovna nenačítá."; return }
        do {
            async let list = model.api.gymExercises()
            async let eq = model.api.gymEquipment()
            exercises = try await list
            equipment = try? await eq
        } catch {
            self.error = error.localizedDescription
        }
    }

    static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "cs_CZ"))
    }

    /// A catalog name as a sentence: "Cable Single Arm Rear Delt Row" from the
    /// exercise database reads "Cable single arm rear delt row", like "Face
    /// pull". Names already written so, letters (EZ, DB, V) and digits stay.
    static func shownName(_ name: String) -> String {
        let words = name.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        let titled = words.dropFirst().filter { $0.first?.isLetter == true }
        guard titled.count >= 2, titled.allSatisfy({ $0.first?.isUppercase == true }) else { return name }
        // "Single-Arm" as a part of a word too: "Single-arm cable fly".
        let lower: (String) -> String = { part in
            part.count > 1 && part.dropFirst().allSatisfy({ !$0.isUppercase && !$0.isNumber }) ? part.lowercased() : part
        }
        return words.enumerated().map { index, word in
            word.split(separator: "-", omittingEmptySubsequences: false).enumerated().map { at, part in
                index == 0 && at == 0 ? String(part) : lower(String(part))
            }.joined(separator: "-")
        }.joined(separator: " ")
    }
}

/// One exercise: the muscles on the figure, then its technique.
struct ExerciseSheet: View {
    let exercise: GymCatalogExercise
    @State private var technique = false

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 14) {
                Text(exercise.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Text([exercise.muscle, exercise.station].compactMap { $0?.nilIfBlank }.joined(separator: " · "))
                    .font(Typo.small).foregroundStyle(Palette.muted)
                BodyMap(load: exercise.muscles ?? [:], height: 280, legend: true)
                if let note = exercise.note?.nilIfBlank {
                    Text(note).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 18) {
                    if let sets = exercise.sets?.string { meta("Série", sets) }
                    if let reps = exercise.reps?.string { meta("Opakování", reps) }
                }
                SecondaryButton(title: "Jak na to", systemImage: "figure.strengthtraining.traditional") { technique = true }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .glassSheetBackground()
        .sheet(isPresented: $technique) { TechniqueSheet(exercise: exercise.name) }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
    }
}
