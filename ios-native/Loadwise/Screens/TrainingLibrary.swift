import SwiftUI

// MARK: - Knihovna

/// One library for all sports. Opened from the widget it shows the sports as
/// panels; a sport opens on its own screen: for ride and run the workouts with
/// filters (where, the length with its ± tolerance and own presets, the type,
/// the difficulty), for the gym the AI builder and the exercises.
struct TrainingLibraryView: View {
    let sport: LibrarySport?

    init(sport: String? = nil) {
        self.sport = sport.flatMap { LibrarySport.find($0) }
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Trénink · knihovna").padding(.top, 24)
                Text(sport?.label ?? "Knihovna tréninků").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

                if let sport {
                    if sport.id == "gym" { GymLibrarySection() } else { WorkoutLibrarySection(sport: sport.id) }
                } else {
                    HStack(spacing: 10) {
                        ForEach(LibrarySport.all) { LibrarySportPanel(sport: $0) }
                    }
                    .padding(.top, 20)
                }
            }
        }
    }
}

/// The sports of the library, each with its icon and colour.
struct LibrarySport: Identifiable {
    let id: String
    let label: String
    let subtitle: String
    let symbol: String
    let color: Color

    static let all = [
        LibrarySport(id: "ride", label: "Kolo", subtitle: "jízdy a intervaly", symbol: "bicycle", color: Palette.amberBar),
        LibrarySport(id: "run", label: "Běh", subtitle: "tempo a výběhy", symbol: "figure.run", color: Palette.rust),
        LibrarySport(id: "gym", label: "Posilovna", subtitle: "cviky a AI", symbol: "dumbbell.fill", color: Palette.indigo)
    ]

    static func find(_ id: String) -> LibrarySport? { all.first { $0.id == id } }
}

/// A sport's panel in the library; a tap opens the sport.
struct LibrarySportPanel: View {
    let sport: LibrarySport

    var body: some View {
        RouteLink(route: .workoutLibrary(sport.id)) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: sport.symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(sport.color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .padding(.bottom, 4)
                Text(sport.label).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                Text(sport.subtitle).font(.caption2).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(sport.label + ", " + sport.subtitle)
    }
}

/// The gym part of the library: build a session with AI, then the exercises.
struct GymLibrarySection: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RouteLink(route: .gymBuilder) {
                HStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Palette.green, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sestavit trénink s AI").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        Text("podle únavy, partií a tvého vybavení").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .padding(14)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(.top, 18)

            SectionLabel(text: "Cviky").padding(.top, 26)
            ExerciseCatalog()
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
    @AppStorage("libraryToleranceRide") private var toleranceRide = 15
    @AppStorage("libraryToleranceRun") private var toleranceRun = 10
    @State private var minutes: Int? = nil
    @State private var slider: Double = 60
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

    private var range: ClosedRange<Double> { sport == "run" ? 20...150 : 30...300 }
    private var step: Double { sport == "run" ? 5 : 15 }
    private var presets: [Int] {
        (sport == "run" ? presetsRun : presetsRide).split(separator: ",").compactMap { Int($0) }.sorted()
    }
    private var tolerance: Binding<Int> { sport == "run" ? $toleranceRun : $toleranceRide }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("Kde", selection: $indoor) {
                Text(sport == "run" ? "Pás" : "Trenažér").tag(true)
                Text("Venku").tag(false)
            }
            .pickerStyle(.segmented)
            .padding(.top, 16)

            coachPick
            lengthFilter
            SectionLabel(text: "Typ").padding(.top, 20)
            ChipFlow(items: [""] + LibraryWorkout.systems.map { $0.0 }, label: { $0.isEmpty ? "Doporučený" : LibraryWorkout.systemLabel($0) },
                     isOn: { ($0.isEmpty && system == nil) || $0 == system }, toggle: { system = $0.isEmpty ? nil : $0 })
                .padding(.top, 8)
            SectionLabel(text: "Obtížnost").padding(.top, 20)
            Picker("Obtížnost", selection: $level) {
                ForEach(Level.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 8)

            if loading && workouts.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
            } else if workouts.isEmpty {
                Text("Těmto filtrům nic neodpovídá. Zkus delší toleranci délky nebo jinou obtížnost.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 20)
            } else {
                Text("\(workouts.count) " + Fmt.plural(workouts.count, "trénink", "tréninky", "tréninků"))
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
        .onAppear { slider = Double(presets.first ?? (sport == "run" ? 45 : 90)) }
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
    /// from it a workout may be (± minutes).
    private var lengthFilter: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Délka")
                Spacer()
                Text(minutes.map { Fmt.duration($0) + " ± \(tolerance.wrappedValue) min" } ?? "doporučená pro dnešek")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            ChipFlow(items: [0] + presets, label: { $0 == 0 ? "Doporučená" : Fmt.duration($0) },
                     isOn: { ($0 == 0 && minutes == nil) || $0 == minutes },
                     toggle: { value in
                         if value == 0 { minutes = nil } else { minutes = value; slider = Double(value) }
                     })
            Slider(value: $slider, in: range, step: step, onEditingChanged: { editing in
                if !editing { minutes = Int(slider) }
            })
            .tint(Palette.amberBar)
            HStack(spacing: 8) {
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
                Spacer()
                if let minutes {
                    if presets.contains(minutes) {
                        Button { removePreset(minutes) } label: {
                            Label("Odebrat z předvoleb", systemImage: "minus").font(.footnote.weight(.medium))
                        }
                    } else {
                        Button { addPreset(minutes) } label: {
                            Label("Uložit \(Fmt.duration(minutes))", systemImage: "plus").font(.footnote.weight(.medium))
                        }
                    }
                }
            }
            .foregroundStyle(Palette.ink)
        }
        .padding(.top, 20)
    }

    private func addPreset(_ value: Int) {
        let next = Array(Set(presets + [value])).sorted().prefix(8).map(String.init).joined(separator: ",")
        if sport == "run" { presetsRun = next } else { presetsRide = next }
    }

    private func removePreset(_ value: Int) {
        let next = presets.filter { $0 != value }.map(String.init).joined(separator: ",")
        if sport == "run" { presetsRun = next } else { presetsRide = next }
    }

    private func load() async {
        guard !model.demo else { error = "V ukázce se knihovna nenačítá."; return }
        // The slider and the chips change quickly: wait until they settle.
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        loading = true
        defer { loading = false }
        do {
            workouts = try await model.api.searchWorkouts(sport: sport, minutes: minutes, tolerance: tolerance.wrappedValue,
                                                          system: system, indoor: indoor, difficulty: level.range)
            error = nil
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
            if let why = workout.reasons?.first {
                Label(Fmt.capitalized(why), systemImage: "checkmark").font(Typo.caption).foregroundStyle(Palette.green).lineLimit(1)
            }
        }
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text(workout.name).font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                HStack(spacing: 18) {
                    if let d = workout.duration_minutes { meta("Délka", Fmt.duration(Int(d))) }
                    if let l = workout.target_load { meta("Zátěž", Fmt.int(l) + " TSS") }
                    if let level = workout.difficultyLabel { meta("Obtížnost", level) }
                }
                if let s = workout.primary_system {
                    Pill(text: workout.guide?.title ?? LibraryWorkout.systemLabel(s), foreground: Palette.amber, background: Palette.amberSoft)
                }
                if let d = workout.description?.nilIfBlank {
                    Text(d).font(Typo.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                if let blocks = workout.steps, !blocks.isEmpty {
                    StepsProfile(blocks: blocks).frame(height: 54)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                    }
                }
                list("Proč se dnes hodí", workout.reasons?.map(Fmt.capitalized), "checkmark.circle", Palette.green)
                list(sport == "run" ? "Jak ho běžet" : "Jak ho jet", workout.guide?.how, "figure." + (sport == "run" ? "run" : "outdoor.cycle"), Palette.amber)
                list("Jídlo a pití", workout.guide?.fueling, "fork.knife", Palette.brown)
                list("Kde", workout.guide?.environment, "map", Palette.indigo)
                if let source = workout.source_name { Text("Zdroj: " + source).font(Typo.caption).foregroundStyle(Palette.faint) }

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
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
    }

    @ViewBuilder
    private func list(_ title: String, _ lines: [String]?, _ symbol: String, _ color: Color) -> some View {
        if let lines, !lines.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Label(title, systemImage: symbol).font(Typo.bodyStrong).foregroundStyle(color)
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
            await model.refreshTraining()
            await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Exercises

/// "Knihovna cviků" on its own screen (deep link loadwise://open/exercises).
struct ExerciseLibraryView: View {
    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · knihovna cviků").padding(.top, 24)
                Text("Cviky").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                ExerciseCatalog()
            }
        }
    }
}

/// Search, the muscle chips, "Jen s mým vybavením" and the list of exercises.
struct ExerciseCatalog: View {
    @Environment(AppModel.self) private var model
    @State private var exercises: [GymCatalogExercise] = []
    @State private var equipment: GymEquipment?
    @State private var query = ""
    @State private var muscle: String?
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

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    chip("Vše", muscle == nil) { muscle = nil }
                    ForEach(BodyFigure.muscles.indices, id: \.self) { i in
                        let m = BodyFigure.muscles[i]
                        chip(m.label, muscle == m.id) { muscle = muscle == m.id ? nil : m.id }
                    }
                }
                .padding(.vertical, 2)
            }
            .padding(.top, 12)

            PillToggle(title: "Jen s mým vybavením", subtitle: EquipmentView.summary(equipment), isOn: $mine)
                .padding(.top, 12)

            if loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
            } else {
                Text("\(filtered.count) " + Fmt.plural(filtered.count, "cvik", "cviky", "cviků"))
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
        .task { await load() }
        .sheet(item: $open) { ex in ExerciseSheet(exercise: ex) }
    }

    private var filtered: [GymCatalogExercise] {
        let words = Self.fold(query).split(separator: " ")
        return exercises.filter { ex in
            let text = Self.fold([ex.name, ex.muscle ?? "", ex.station ?? "", ex.note ?? ""].joined(separator: " "))
            guard words.allSatisfy({ text.contains($0) }) else { return false }
            if let muscle, !Self.works(ex, muscle) { return false }
            if mine, !EquipmentView.fits(ex, equipment) { return false }
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
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private func chip(_ title: String, _ on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.footnote.weight(.medium))
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
}

/// One exercise: the muscles on the figure, then its technique.
struct ExerciseSheet: View {
    let exercise: GymCatalogExercise
    @State private var technique = false

    var body: some View {
        ScrollView {
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
        .presentationBackground(Palette.background)
        .sheet(isPresented: $technique) { TechniqueSheet(exercise: exercise.name) }
    }

    private func meta(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.caption).foregroundStyle(Palette.muted)
            Text(value).font(Typo.number(22)).foregroundStyle(Palette.ink)
        }
    }
}
