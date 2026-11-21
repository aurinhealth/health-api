import SwiftUI

// MARK: - Knihovna

/// One library for all sports (concept a-knihovna/004). Opened from Training
/// it shows the coach's workout for today, the sports as rows with their
/// week, and the athlete's own workouts; a sport opens on its own page: for
/// ride, run and swim the workouts with filters, for the gym the builder and
/// the exercises, for tri the bricks.
struct TrainingLibraryView: View {
    @Environment(AppModel.self) private var model
    let sport: LibrarySport?
    /// The pinned Suggest a workout of ride, run and swim (WorkoutLibrarySection).
    @State private var suggest = 0
    @State private var suggesting = false
    @State private var suggested = false

    init(sport: String? = nil) {
        self.sport = sport.flatMap { LibrarySport.find($0) }
    }

    var body: some View {
        // One title, "LIBRARY", in the middle of the bar (602 point 130).
        DetailScreen(glow: Palette.Glow.training, title: "Knihovna", pinTitle: true) {
            if let sport {
                VStack(alignment: .leading, spacing: 0) {
                    if sport.id == "gym" {
                        GymLibrarySection(suggest: $suggest)
                    } else if sport.id == "tri" {
                        LibrarySportHeader(sport: sport, subtitle: L10n.tr("Dva sporty hned po sobě")).padding(.top, 14)
                        BrickLibrarySection()
                    } else {
                        WorkoutLibrarySection(sport: sport.id, suggest: $suggest, suggesting: $suggesting, suggested: $suggested)
                    }
                }
            } else {
                LibraryHome()
            }
        }
        .overlay(alignment: .bottom) {
            if let sport, ["ride", "run", "swim", "gym"].contains(sport.id), !model.demo {
                SuggestWorkoutButton(title: suggested ? "Jiná možnost" : "Navrhnout trénink", busy: suggesting) { suggest += 1 }
            }
        }
    }
}

/// A sport page's top: the sport's disc and its name in serif (602 point 135).
struct LibrarySportHeader: View {
    let sport: LibrarySport
    var subtitle: String? = nil

    var body: some View {
        HStack(spacing: 14) {
            LibrarySportDisc(sport: sport.id, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.tr(sport.label)).font(Typo.heading(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                if let subtitle { Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The library's home (concept a-knihovna/004, "Library home FINAL"): the
/// coach's card for today, one row to another option, the sports as rows with
/// this week's dots (Edit hides one), then Yours.
struct LibraryHome: View {
    @Environment(AppModel.self) private var model
    /// The sports hidden with Edit, by id ("swim,tri"); plans and history keep them.
    @AppStorage("libraryHiddenSports") private var hiddenSports = ""
    @State private var editing = false
    @State private var mine: Int?
    @State private var friends: Int?
    @State private var unseen = 0

    private var hidden: Set<String> { Set(hiddenSports.split(separator: ",").map(String.init)) }
    private var today: String { model.training?.date ?? AppModel.localDate(Date()) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let training = model.training, let session = LibraryCoachCard.session(training) {
                LibraryCoachCard(session: session, route: LibraryCoachCard.route(session, week: training.sessions ?? []))
                    .padding(.top, 14)
            }
            RouteLink(route: .coachPick(false)) {
                HStack {
                    Text("Jiná možnost na dnes").font(Typo.body).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                .cardSurface(cornerRadius: 18)
            }
            .padding(.top, 10)

            HStack {
                SectionLabel(text: "Sporty")
                Spacer()
                Button { withAnimation(.snappy) { editing.toggle() } } label: {
                    Text(verbatim: L10n.tr(editing ? "Hotovo" : "Upravit"))
                        .font(Typo.body.weight(editing ? .semibold : .regular)).foregroundStyle(Palette.ink)
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 22)
            VStack(spacing: 10) {
                ForEach(LibrarySport.all.filter { editing || !hidden.contains($0.id) }) { sport in
                    let off = hidden.contains(sport.id)
                    if editing {
                        Button { toggle(sport.id) } label: {
                            LibrarySportRow(sport: sport, week: week(sport.id), today: today, badge: off ? .add : .remove)
                        }
                        .buttonStyle(.plain)
                        .opacity(off ? 0.5 : 1)
                        .accessibilityHint(Text(verbatim: L10n.tr(off ? "Ukázat v Knihovně" : "Skrýt v Knihovně")))
                    } else {
                        RouteLink(route: .workoutLibrary(sport.id)) {
                            LibrarySportRow(sport: sport, week: week(sport.id), today: today)
                        }
                    }
                }
            }
            .padding(.top, 4)
            if editing {
                Text("Skrytý sport zmizí jen z této obrazovky. Plány a historie ho dál mají.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
            }

            SectionLabel(text: "Tvoje").padding(.top, 26)
            HStack(spacing: 10) {
                LibraryYoursTile(route: .myWorkouts, title: "Moje tréninky", count: mine)
                LibraryYoursTile(route: .friendWorkouts, title: "Od přátel", count: friends, unseen: unseen)
            }
            .padding(.top, 10)
        }
        .task {
            let monday = AppModel.monday(of: today)
            await model.loadCalendar(from: monday, to: ISODay.shift(monday, 6))
        }
        .task {
            guard !model.demo, let r = try? await model.api.myWorkouts() else { return }
            mine = r.workouts.filter { !$0.fromFriend }.count
            friends = r.workouts.filter(\.fromFriend).count
            unseen = r.unseen
        }
    }

    /// This week's mark of the sport, Monday first.
    private func week(_ sport: String) -> [LibraryDayMark] {
        let monday = AppModel.monday(of: today)
        return (0..<7).map { LibraryDayMark.of(model.calendar[ISODay.shift(monday, $0)], sport: sport) }
    }

    private func toggle(_ id: String) {
        var set = hidden
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
        hiddenSports = LibrarySport.all.map(\.id).filter(set.contains).joined(separator: ",")
    }
}

/// A day of a sport's week on the library's home: done, planned or nothing.
enum LibraryDayMark: Equatable {
    case none, done, planned

    /// A done session wins over a planned one; a missed one is nothing.
    static func of(_ day: CalendarDay?, sport: String) -> LibraryDayMark {
        let list = (day?.activities ?? []).filter { LibrarySport.matches(sport, $0.sport) }
        if list.contains(where: { $0.status == "done" }) { return .done }
        if list.contains(where: { $0.status == "planned" }) { return .planned }
        return .none
    }
}

/// The coach's workout for today on the library's home (D-KNIH-3 as the
/// critic kept it): the coach's card with its header, the workout's name and,
/// as on Training's card, Time, the sport's numbers and Strain est.; the
/// coach's one sentence why under it. A tap opens the workout.
struct LibraryCoachCard: View {
    let session: TrainingSnapshot.Session
    let route: AppRoute?

    var body: some View {
        if let route {
            RouteLink(route: route) { card }
        } else {
            card
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TwoLights(size: 18)
                Text("Kouč na dnes").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            }
            HStack(alignment: .center, spacing: 10) {
                Text(verbatim: session.title).font(Typo.heading(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                if isGym, let muscles = session.muscles, !muscles.isEmpty {
                    MuscleFigurePair(colors: Dictionary(muscles.map { ($0, Palette.rust) }, uniquingKeysWith: { a, _ in a }), spacing: 2)
                        .frame(height: 58)
                        .accessibilityHidden(true)
                }
                if route != nil {
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
            }
            WorkoutNumberRow(cells: Self.numbers(session))
            if let advice = session.advice?.nilIfBlank {
                Rectangle().fill(Palette.hairline).frame(height: 1)
                Text(verbatim: advice).font(Typo.body).foregroundStyle(Palette.secondary)
                    .lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        .accessibilityElement(children: .combine)
    }

    private var isGym: Bool { session.sport == "strength" || session.sport == "gym" }

    /// Time, the gym's exercises and sets, and the strain as an estimate.
    static func numbers(_ session: TrainingSnapshot.Session) -> [WorkoutNumberRow.Cell] {
        var cells: [WorkoutNumberRow.Cell] = []
        if let m = session.minutes { cells.append(.init(label: L10n.tr("Čas"), value: String(m), unit: "min")) }
        if let lines = session.lines, !lines.isEmpty {
            cells.append(.init(label: L10n.tr("Cviky"), value: String(lines.count)))
            cells.append(.init(label: L10n.tr("Série"), value: String(lines.reduce(0) { $0 + $1.sets })))
        }
        if let strain = session.strain, strain > 0 {
            cells.append(.init(label: L10n.tr("Námaha"), value: Fmt.decimal(strain, digits: 1), unit: L10n.tr("odh.")))
        }
        return cells
    }

    /// Today's first workout still to do; nothing on a day without one.
    static func session(_ training: TrainingSnapshot) -> TrainingSnapshot.Session? {
        (training.todaySessions ?? []).first { $0.date == training.date }
            ?? training.next.flatMap { $0.date == training.date ? $0 : nil }
    }

    /// The same detail Training's card opens: the week's entry, else the gym day.
    static func route(_ s: TrainingSnapshot.Session, week: [WeekSession]) -> AppRoute? {
        let match = week.first { w in
            if let id = s.eventId { return w.eventId == id }
            return s.sport == "strength" && w.kind == "gym" && w.date == s.date
        }
        if let match { return WeekSessionsList.destination(match) }
        return s.sport == "strength" ? .gym(s.date) : nil
    }
}

/// A sport on the library's home (602 point 128): full width, the sport's
/// tinted disc with its figure, the name, this week's dots and an arrow.
struct LibrarySportRow: View {
    enum Badge { case add, remove }

    let sport: LibrarySport
    let week: [LibraryDayMark]
    let today: String
    var badge: Badge? = nil

    var body: some View {
        HStack(spacing: 14) {
            if let badge {
                Image(systemName: badge == .add ? "plus.circle.fill" : "minus.circle.fill")
                    .scaledFont(20, weight: .regular, cap: .denseCap)
                    .foregroundStyle(badge == .add ? Palette.green : Palette.rust)
                    .accessibilityHidden(true)
            }
            LibrarySportDisc(sport: sport.id, size: 44)
            Text(L10n.tr(sport.label)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            LibraryWeekDots(week: week, today: today, color: sport.color)
            if badge == nil {
                Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 68)
        .cardSurface(cornerRadius: 20)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: Self.spoken(sport, week)))
    }

    /// "Ride, this week 1 done, 1 planned" (D-KNIH-16: the dots' meaning for VoiceOver).
    static func spoken(_ sport: LibrarySport, _ week: [LibraryDayMark]) -> String {
        let done = week.filter { $0 == .done }.count
        let planned = week.filter { $0 == .planned }.count
        let name = L10n.tr(sport.label)
        guard done + planned > 0 else { return L10n.f("%@, tento týden nic", name) }
        return L10n.f("%@, tento týden hotovo %@, naplánováno %@", name, String(done), String(planned))
    }
}

/// This week as seven dots under the weekday letters: full = done, a ring =
/// planned, grey = nothing. Today's letter is bold. Dots are 10 pt (D-KNIH-16).
struct LibraryWeekDots: View {
    let week: [LibraryDayMark]
    let today: String
    let color: Color

    var body: some View {
        let monday = AppModel.monday(of: today)
        let letters = Self.letters
        HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { i in
                let isToday = ISODay.shift(monday, i) == today
                VStack(spacing: 4) {
                    Text(verbatim: letters[i]).font(.system(size: 10, weight: isToday ? .bold : .medium))
                        .foregroundStyle(isToday ? Palette.ink : Palette.muted)
                    dot(i < week.count ? week[i] : .none)
                }
                .frame(width: 12)
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private func dot(_ mark: LibraryDayMark) -> some View {
        switch mark {
        case .done: Circle().fill(color).frame(width: 10, height: 10)
        case .planned: Circle().strokeBorder(color, lineWidth: 1.5).frame(width: 10, height: 10)
        case .none: Circle().fill(Palette.faint.opacity(0.35)).frame(width: 10, height: 10)
        }
    }

    /// "M T W T F S S" in the app's language, Monday first.
    static var letters: [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Fmt.locale
        let s = calendar.veryShortStandaloneWeekdaySymbols
        return Array(s[1...]) + [s[0]]
    }
}

/// A sport's disc in the library: the app's SportDisc, and for tri one disc
/// in three parts, swim, run and ride, each in its sport's colour (602 point 131).
struct LibrarySportDisc: View {
    let sport: String
    var size: CGFloat = 44

    var body: some View {
        if sport == "tri" { TriDisc(size: size) } else { SportDisc(sport: sport == "gym" ? "strength" : sport, size: size) }
    }
}

struct TriDisc: View {
    var size: CGFloat = 44
    @Environment(\.colorScheme) private var scheme

    /// The parts by the middle of their third: swim on top, run right, ride left.
    private static let parts: [(String, Double)] = [("swim", -90), ("run", 30), ("ride", 150)]

    var body: some View {
        let dark = scheme == .dark
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                let sport = Self.parts[i].0
                let middle = Self.parts[i].1
                let color = Palette.Sport.color(sport)
                Sector(start: .degrees(middle - 60), end: .degrees(middle + 60)).fill(color.opacity(dark ? 0.24 : 0.15))
                Image(systemName: SportDisc.symbol(sport))
                    .font(.system(size: size * 0.23, weight: .semibold))
                    .foregroundStyle(color)
                    .offset(x: CGFloat(cos(middle * .pi / 180)) * size * 0.25, y: CGFloat(sin(middle * .pi / 180)) * size * 0.25)
            }
            ForEach([-30.0, 90, 210], id: \.self) { angle in
                Rectangle().fill(Palette.card).frame(width: size / 2, height: 1.5)
                    .offset(x: size / 4)
                    .rotationEffect(.degrees(angle))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private struct Sector: Shape {
        let start: Angle
        let end: Angle

        func path(in rect: CGRect) -> Path {
            let center = CGPoint(x: rect.midX, y: rect.midY)
            var path = Path()
            path.move(to: center)
            path.addArc(center: center, radius: rect.width / 2, startAngle: start, endAngle: end, clockwise: false)
            path.closeSubpath()
            return path
        }
    }
}

/// Yours on the library's home: My workouts and From friends, the count in
/// serif, a dot while a friend's workout is new.
struct LibraryYoursTile: View {
    let route: AppRoute
    let title: String
    var count: Int?
    var unseen = 0

    var body: some View {
        RouteLink(route: route) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: 4) {
                    Text(verbatim: count.map { String($0) } ?? " ").font(Typo.number(30)).foregroundStyle(Palette.ink)
                    if unseen > 0 { Circle().fill(Palette.amberBar).frame(width: 8, height: 8).padding(.top, 6) }
                }
                Text(L10n.tr(title)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(cornerRadius: 20)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(unseen > 0 ? L10n.f("%@, nové: %@", L10n.tr(title), String(unseen)) : L10n.tr(title))
    }
}

/// The sports of the library, each with its icon and colour.
struct LibrarySport: Identifiable {
    let id: String
    let label: String
    let symbol: String
    let color: Color

    static let all = [
        LibrarySport(id: "ride", label: "Kolo", symbol: "bicycle", color: Palette.Sport.ride),
        LibrarySport(id: "run", label: "Běh", symbol: "figure.run", color: Palette.Sport.run),
        LibrarySport(id: "swim", label: "Plavání", symbol: "figure.pool.swim", color: Palette.Sport.swim),
        LibrarySport(id: "gym", label: "Posilovna", symbol: "figure.strengthtraining.traditional", color: Palette.Sport.gym),
        // Bricks, two sports one right after the other (BrickLibrarySection):
        // after the four sports, kept in the app's order Ride, Run, Swim, Gym.
        LibrarySport(id: "tri", label: "Tri", symbol: "figure.open.water.swim", color: Palette.Sport.other)
    ]
    /// The sports of one workout (Moje tréninky → +): not the bricks.
    static var single: [LibrarySport] { all.filter { $0.id != "tri" } }

    static func find(_ id: String) -> LibrarySport? { all.first { $0.id == id } }

    /// A calendar session's sport ("strength", "ride"…) belongs to the library's
    /// sport ("gym", "ride"…); tri has no sessions of its own.
    static func matches(_ library: String, _ session: String) -> Bool {
        switch library {
        case "gym": return session == "strength" || session == "gym"
        case "tri": return false
        default: return session == library
        }
    }
}

/// The gym page of the library (concept a-knihovna/011 with D-KNIH-4, 602
/// points 153 to 155): the same card as Ride (where, day, the one length
/// control), the FOCUS card with nine tiles, then the exercises; Suggest a
/// workout pinned below puts the session together with these choices.
struct GymLibrarySection: View {
    @Environment(AppModel.self) private var model
    @Binding var suggest: Int
    @State private var day = AppModel.localDate(Date())
    @State private var minutes: Int? = nil
    @AppStorage("libraryPresetsGym") private var presets = "30,45,60,90"
    @State private var focus: GymFocus?
    @State private var equipment: GymEquipment?
    @State private var catalog: [GymCatalogExercise] = []
    @State private var building = false
    @State private var picking = false

    /// The coach's focus for today until one is tapped.
    private var shown: GymFocus { focus ?? GymFocus.coach(model.muscles) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let gym = LibrarySport.find("gym") {
                LibrarySportHeader(sport: gym, subtitle: subtitle).padding(.top, 14)
            }
            SectionLabel(text: "Kde, kdy a jak dlouho").padding(.top, 24)
            Card {
                placeRow
                Rectangle().fill(Palette.hairline).frame(height: 1)
                LibraryDayRow(day: $day)
                Rectangle().fill(Palette.hairline).frame(height: 1)
                LengthControl(minutes: $minutes, recommended: GymLength.usual ?? 60, range: 20...120, step: 5, presets: $presets, fallback: 60)
            }
            .padding(.top, 10)

            SectionLabel(text: "Zaměření").padding(.top, 24)
            GymFocusCard(focus: shown, coach: GymFocus.coach(model.muscles), data: model.muscles, pick: { focus = $0 }, pickMuscles: { picking = true })
                .padding(.top, 10)

            SectionLabel(text: "Cviky").padding(.top, 28)
            ExerciseCatalog()
        }
        .task {
            if model.musclesStale { await model.loadMuscles() }
            guard !model.demo else { return }
            async let eq = try? model.api.gymEquipment()
            async let list = try? model.api.gymExercises()
            equipment = await eq
            catalog = await list ?? []
        }
        .onChange(of: suggest) { building = true }
        .navigationDestination(isPresented: $building) {
            GymBuilderView(date: day, quick: true, presetFocus: shown.builderFocus, presetMuscles: shown.muscles(model.muscles), presetMinutes: minutes)
        }
        .navigationDestination(isPresented: $picking) {
            GymBuilderView(date: day, presetFocus: "muscles", presetMinutes: minutes)
        }
    }

    /// "312 exercises, 148 with your equipment".
    private var subtitle: String? {
        guard !catalog.isEmpty else { return nil }
        let fit = catalog.filter { $0.fits ?? EquipmentView.fits($0, equipment) }.count
        return L10n.f("%@, %@ s tvým vybavením", L10n.plural("%lld cviků", catalog.count), String(fit))
    }

    /// Where: the saved places in a menu (the starred first), the active one ticked.
    private var placeRow: some View {
        let places = (equipment?.places ?? []).sorted { ($0.favorite == true ? 0 : 1) < ($1.favorite == true ? 0 : 1) }
        let active = places.first { $0.id == equipment?.activePlace }
        return HStack(spacing: 12) {
            Text("Kde").font(Typo.body).foregroundStyle(Palette.secondary)
            Spacer(minLength: 8)
            Menu {
                ForEach(places) { place in
                    Button { Task { await choose(place.id) } } label: {
                        if place.id == active?.id { Label(place.name, systemImage: "checkmark") } else { Text(verbatim: place.name) }
                    }
                }
                Divider()
                Button { model.push(.equipment) } label: { Text(verbatim: L10n.tr("Upravit místa")) }
            } label: {
                HStack(spacing: 6) {
                    Text(verbatim: active?.name ?? EquipmentView.summary(equipment)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                    Image(systemName: "chevron.down").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
                }
                .frame(minHeight: 44)
            }
            .disabled(model.demo)
        }
    }

    private func choose(_ id: String) async {
        guard let places = equipment?.places, var saved = try? await model.api.saveGymPlaces(places, active: id) else { return }
        saved.stations = equipment?.stations
        saved.sections = equipment?.sections
        equipment = saved
    }
}

/// The gym's focus tiles (Petr's FOCUS, 2026-11-14): 3 × 3 tiles, each a set
/// of the figure's muscles the builder works.
enum GymFocus: String, CaseIterable, Identifiable {
    case full, upper, legs, push, pull, core, sport, arms, rested
    var id: String { rawValue }

    var title: String {
        L10n.tr(["full": "Celé tělo", "upper": "Horní", "legs": "Nohy", "push": "Tlaky", "pull": "Tahy", "core": "Střed těla",
                 "sport": "Můj sport", "arms": "Paže", "rested": "Odpočaté"][rawValue]!)
    }

    /// The figure's muscles of the tile (BodyFigure ids, at most five choices).
    var ids: [String] {
        switch self {
        case .full, .rested: return []
        case .upper: return ["chest", "upper_back", "lats", "front_delts", "side_delts", "rear_delts", "biceps", "triceps"]
        case .legs: return ["quads", "hamstrings", "hips", "calves"]
        case .push: return ["chest", "front_delts", "side_delts", "rear_delts", "triceps"]
        case .pull: return ["upper_back", "lats", "rear_delts", "biceps"]
        case .core: return ["abs", "obliques", "lower_back"]
        // Strength for an endurance sport: legs, hips and the trunk.
        case .sport: return ["quads", "hamstrings", "hips", "calves", "abs"]
        case .arms: return ["biceps", "triceps", "forearms"]
        }
    }

    /// The builder's focus: its own words for the whole body, upper and legs, else muscles.
    var builderFocus: String {
        switch self {
        case .full: return "auto"
        case .upper: return "upper"
        case .legs: return "lower"
        case .rested: return "rested"
        default: return "muscles"
        }
    }

    func muscles(_ data: MuscleFatigue?) -> [String] { builderFocus == "muscles" ? ids : [] }

    /// What the coach would pick today (the muscles' ready part), else the whole body.
    static func coach(_ data: MuscleFatigue?) -> GymFocus {
        switch data?.focus {
        case "upper": return .upper
        case "lower": return .legs
        default: return .full
        }
    }

    enum Mark { case none, almost, tired }

    /// Rested = no mark, almost ready = amber ring, still tired = coral dot.
    func mark(_ data: MuscleFatigue?) -> Mark {
        guard let data else { return .none }
        let list = (self == .full ? BodyFigure.muscles.map(\.id) : ids).compactMap { data.tired(body: $0) }
        if list.contains(where: { $0.state == "fatigued" }) { return self == .full ? .none : .tired }
        return list.isEmpty ? .none : .almost
    }
}

/// FOCUS (D-KNIH-4): the caption with the figure (a tap opens Muscles), the
/// focus with its muscles and one reason line, the nine tiles, "Pick muscles"
/// and the legend.
struct GymFocusCard: View {
    let focus: GymFocus
    let coach: GymFocus
    let data: MuscleFatigue?
    let pick: (GymFocus) -> Void
    let pickMuscles: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            RouteLink(route: .muscles) {
                HStack(spacing: 12) {
                    if let data { MuscleFigurePair(colors: data.freshnessColors, spacing: 2).frame(height: 70) }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(verbatim: focus.title).font(Typo.heading(22)).foregroundStyle(Palette.ink)
                        if let reason { Text(verbatim: reason).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                .contentShape(Rectangle())
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(GymFocus.allCases) { tile($0) }
            }
            Rectangle().fill(Palette.hairline).frame(height: 1)
            Button(action: pickMuscles) {
                HStack {
                    Text("Vybrat svaly").font(Typo.body).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: "chevron.right").scaledFont(12, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.faint)
                }
                .frame(minHeight: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            HStack(spacing: 14) {
                HStack(spacing: 5) { Circle().strokeBorder(Palette.Freshness.recovering, lineWidth: 1.5).frame(width: 9, height: 9); Text("skoro připravené") }
                HStack(spacing: 5) { Circle().fill(Palette.Freshness.tired).frame(width: 7, height: 7); Text("ještě unavené") }
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
    }

    /// "All rested. Last trained 5 days ago." or the most tired muscle of the focus.
    private var reason: String? {
        guard let data else { return nil }
        let tired = (focus.ids.isEmpty ? [] : focus.ids).compactMap { data.tired(body: $0) }.first
        if let tired { return L10n.f("Ještě unavené: %@, odpočaté %@", L10n.tr(tired.label).lowercased(with: Fmt.locale), tired.readyText(today: data.date)) }
        return [L10n.tr("Vše odpočaté."), data.lastGymText].compactMap { $0 }.joined(separator: " ")
    }

    private func tile(_ f: GymFocus) -> some View {
        let on = f == focus
        let mark = f.mark(data)
        return Button { pick(f) } label: {
            HStack(spacing: 5) {
                if f == coach { TwoLights(size: 12) }
                Text(verbatim: f.title).lineLimit(1).minimumScaleFactor(0.75)
                switch mark {
                case .tired: Circle().fill(Palette.Freshness.tired).frame(width: 7, height: 7)
                case .almost: Circle().strokeBorder(Palette.Freshness.recovering, lineWidth: 1.5).frame(width: 9, height: 9)
                case .none: EmptyView()
                }
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(on ? Palette.onButton : Palette.ink)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(on ? Palette.button : Palette.ink.opacity(0.05), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: Tri

/// Knihovna → Tri: bricks, two sports one right after the other
/// (GET /app/api/workouts/bricks, src/brick-workouts.js). The same page as
/// Ride (concept a-knihovna/010, 602 points 151, 152): where, two menus,
/// then cards with the time, the strain estimate and each leg in zone colours.
struct BrickLibrarySection: View {
    @Environment(AppModel.self) private var model
    @State private var bricks: [LibraryBrick] = []
    @State private var indoor = true
    @State private var loading = true
    @State private var error: String?
    @State private var open: LibraryBrick?
    /// "ride+run" and the like, nil = all.
    @State private var pair: String?
    @State private var length: Length = .any

    enum Length: String, CaseIterable, Identifiable {
        case any, short, middle, long
        var id: String { rawValue }
        var label: String { L10n.tr(["any": "Všechny", "short": "Do 1 h", "middle": "1 až 2 h", "long": "Přes 2 h"][rawValue]!) }
        func fits(_ minutes: Int) -> Bool {
            switch self {
            case .any: return true
            case .short: return minutes <= 60
            case .middle: return minutes > 60 && minutes <= 120
            case .long: return minutes > 120
            }
        }
    }

    private var pairs: [String] {
        var seen: [String] = []
        for b in bricks { let p = Self.pair(b); if !seen.contains(p) { seen.append(p) } }
        return seen
    }
    private var shown: [LibraryBrick] { bricks.filter { (pair == nil || Self.pair($0) == pair) && length.fits($0.minutes) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("Kde", selection: $indoor) {
                Text("Trenažér").tag(true)
                Text("Venku").tag(false)
            }
            .pickerStyle(.segmented)
            .padding(.top, 20)
            HStack(spacing: 10) {
                LibraryFilterMenu(title: "Sporty", value: pair.map(Self.pairLabel) ?? L10n.tr("Všechny")) {
                    Button { pair = nil } label: { Text(verbatim: L10n.tr("Všechny")) }
                    ForEach(pairs, id: \.self) { p in Button { pair = p } label: { Text(verbatim: Self.pairLabel(p)) } }
                }
                LibraryFilterMenu(title: "Délka", value: length.label) {
                    ForEach(Length.allCases) { l in Button { length = l } label: { Text(verbatim: l.label) } }
                }
            }
            .padding(.top, 12)
            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
            } else if loading && bricks.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
            } else {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(text: "Z knihovny")
                    Spacer()
                    Text(L10n.plural("%lld bricků", shown.count)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                .padding(.top, 24)
                VStack(spacing: 10) {
                    ForEach(shown) { brick in
                        Button { open = brick } label: { LibraryBrickCard(brick: brick) }.buttonStyle(PressableCardStyle())
                    }
                }
                .padding(.top, 10)
                Text("Do Apple Watch jako jeden multisport trénink.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).padding(.top, 12)
            }
        }
        .task(id: indoor) { await load() }
        .sheet(item: $open) { LibraryBrickSheet(brick: $0, indoor: indoor) }
    }

    /// The brick's sports in order, "ride+run".
    static func pair(_ brick: LibraryBrick) -> String { brick.legs.map(\.sport).joined(separator: "+") }

    /// "Ride + Run".
    static func pairLabel(_ pair: String) -> String {
        pair.split(separator: "+").map { L10n.tr(LibrarySport.find(String($0))?.label ?? String($0)) }.joined(separator: " + ")
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

/// A brick as a card: the name and "Ride 1 h, then run 20 min", the time in
/// serif with the strain estimate, each leg's steps in zone colours, its
/// share of the time wide. Numbers and units never break apart.
struct LibraryBrickCard: View {
    let brick: LibraryBrick

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: brick.name).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    Text(verbatim: Self.legsLine(brick)).font(Typo.caption).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(verbatim: LengthControl.short(brick.minutes)).font(Typo.number(22)).foregroundStyle(Palette.ink)
                    let strain = Self.strain(brick)
                    if strain > 0 {
                        Text(verbatim: Fmt.decimal(strain, digits: 1) + "\u{00A0}" + L10n.tr("odh.")).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
            }
            GeometryReader { geo in
                HStack(spacing: 6) {
                    ForEach(Array(brick.legs.enumerated()), id: \.offset) { _, leg in
                        LibraryStepsBar(blocks: leg.steps, sport: leg.sport)
                            .frame(width: max(12, (geo.size.width - CGFloat(brick.legs.count - 1) * 6) * CGFloat(leg.minutes) / CGFloat(max(1, brick.minutes))))
                    }
                }
            }
            .frame(height: 22)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 20)
        .accessibilityElement(children: .combine)
    }

    /// "Ride 1 h, then run 20 min" (D-KNIH-13: a number and its unit stay together).
    static func legsLine(_ brick: LibraryBrick) -> String {
        brick.legs.enumerated().map { i, leg in
            let name = L10n.tr(LibrarySport.find(leg.sport)?.label ?? leg.sport)
            let part = (i == 0 ? name : name.lowercased(with: Fmt.locale)) + "\u{00A0}" + LengthControl.short(leg.minutes)
            return i == 0 ? part : L10n.f("pak %@", part)
        }
        .joined(separator: ", ")
    }

    /// The brick's strain as the app counts it from its planned load: each
    /// step's hours × (intensity)² × 100, on the 0–21 scale.
    static func strain(_ brick: LibraryBrick) -> Double {
        let load = brick.legs.reduce(0.0) { total, leg in
            total + WorkoutProfile.segments(leg.steps).reduce(0.0) { sum, s in
                sum + (s.end - s.start) / 60 * pow(s.percent / 100, 2) * 100
            }
        }
        return StrainDetailContent.strain(tss: load)
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
                    Text(verbatim: brick.name).font(Typo.heading(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
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
                            Text(verbatim: [Fmt.duration(leg.minutes), leg.meters.map { Fmt.int($0) + " m" }].compactMap { $0 }.joined(separator: ", "))
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
    /// The pinned Suggest a workout below the page (TrainingLibraryView): a
    /// tap counts up, the section answers with its state.
    @Binding var suggest: Int
    @Binding var suggesting: Bool
    @Binding var suggested: Bool
    @AppStorage("libraryIndoor") private var indoor = true
    @AppStorage("libraryPresetsRide") private var presetsRide = "60,90,120,180"
    @AppStorage("libraryPresetsRun") private var presetsRun = "30,45,60,90"
    @AppStorage("libraryPresetsSwim") private var presetsSwim = "30,45,60"
    // The ± window around the length is no longer on screen (decision 6, 602
    // point 138): what an athlete set before still applies, quietly.
    @AppStorage("libraryToleranceRide") private var toleranceRide = 15
    @AppStorage("libraryToleranceRun") private var toleranceRun = 10
    @AppStorage("libraryToleranceSwim") private var toleranceSwim = 10
    @State private var minutes: Int? = nil
    /// The coach's length for today (the search's coachPick), shown on Doporučená.
    @State private var recommended: Int?
    @State private var system: String? = nil
    @State private var level: Level = .any
    /// The day a workout is planned on (Day row), today unless chosen.
    @State private var day = AppModel.localDate(Date())
    @State private var workouts: [LibraryWorkout] = []
    /// The sport's whole catalogue (the search's catalogSize) and the athlete's FTP.
    @State private var catalog: Int?
    @State private var ftp: Double?
    @State private var loading = false
    @State private var error: String?
    @State private var open: LibraryWorkout?
    @State private var proposal: GeneratedWorkout?
    @State private var variant = 0
    @State private var proposing = false
    @State private var proposalError: String?
    /// The athlete opened the proposal, asked for another or changed the length:
    /// the coach's own workout no longer replaces it.
    @State private var touched = false
    /// Each proposal's own wait for the coach: an older one stops when a new one starts.
    @State private var proposeRun = 0
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
    private var tolerance: Int { sport == "swim" ? toleranceSwim : sport == "run" ? toleranceRun : toleranceRide }
    /// A swim has no tempo or sweet spot (src/swimming-workouts.js).
    private var systems: [(String, String)] {
        sport == "swim" ? LibraryWorkout.systems.filter { ["recovery", "endurance", "threshold", "vo2max", "sprint"].contains($0.0) } : LibraryWorkout.systems
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let library = LibrarySport.find(sport) {
                LibrarySportHeader(sport: library, subtitle: subtitle).padding(.top, 14)
            }
            // The same card as the gym's (Petr decision 6, 602 point 136): where
            // as a one-tap segment, the day, then the one length control.
            SectionLabel(text: "Kde, kdy a jak dlouho").padding(.top, 24)
            Card {
                HStack(spacing: 12) {
                    Text("Kde").font(Typo.body).foregroundStyle(Palette.secondary)
                    Spacer(minLength: 8)
                    Picker("Kde", selection: $indoor) {
                        Text(sport == "swim" ? "Bazén" : sport == "run" ? "Pás" : "Trenažér").tag(true)
                        Text(sport == "swim" ? "Volná voda" : "Venku").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 220)
                }
                Rectangle().fill(Palette.hairline).frame(height: 1)
                LibraryDayRow(day: $day)
                Rectangle().fill(Palette.hairline).frame(height: 1)
                LengthControl(minutes: $minutes, recommended: recommended, range: range, step: step,
                              presets: sport == "swim" ? $presetsSwim : sport == "run" ? $presetsRun : $presetsRide,
                              fallback: sport == "ride" ? 90 : 45)
            }
            .padding(.top, 10)

            // Type and difficulty as two menus in one row (602 point 141).
            HStack(spacing: 10) {
                LibraryFilterMenu(title: "Typ", value: system.map { LibraryWorkout.systemLabel($0) } ?? L10n.tr("Doporučený")) {
                    Button { system = nil } label: { Text(verbatim: L10n.tr("Doporučený")) }
                    ForEach(systems.map { $0.0 }, id: \.self) { id in
                        Button { system = id } label: { Text(verbatim: LibraryWorkout.systemLabel(id)) }
                    }
                }
                LibraryFilterMenu(title: "Obtížnost", value: L10n.tr(level.label)) {
                    ForEach(Level.allCases) { l in
                        Button { level = l } label: { Text(verbatim: L10n.tr(l.label)) }
                    }
                }
            }
            .padding(.top, 12)

            madeForYou

            if loading && workouts.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            } else if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
            } else if workouts.isEmpty {
                Text("V knihovně tomuto výběru nic neodpovídá.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 20)
            } else {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(text: "Z knihovny")
                    Spacer()
                    Text(L10n.plural("%lld tréninků", workouts.count)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                .padding(.top, 24)
                VStack(spacing: 10) {
                    ForEach(workouts) { w in
                        Button { open = w } label: { LibraryWorkoutCard(workout: w, sport: sport) }.buttonStyle(PressableCardStyle())
                    }
                }
                .padding(.top, 10)
                .opacity(loading ? 0.5 : 1)
            }
        }
        .task(id: "\(minutes ?? 0)|\(system ?? "")|\(indoor)|\(level.rawValue)") { await load() }
        .task { await loadFtp() }
        .onChange(of: suggest) {
            Task {
                if proposal?.workout == nil { variant = 0; touched = false } else { touched = true; variant += 1 }
                await propose()
            }
        }
        .onChange(of: proposing) { _, busy in suggesting = busy }
        .onChange(of: proposal?.workout?.id) { _, id in suggested = id != nil && (proposal?.variantCount ?? 0) > 1 }
        .onChange(of: "\(minutes ?? 0)|\(indoor)") { proposal = nil; proposalError = nil; touched = true }
        .sheet(item: $open) { w in LibraryWorkoutSheet(workout: w, sport: sport, indoor: indoor, start: LibraryDayRow.local(day)) }
    }

    /// "214 workouts, sized to your FTP 262 W" (602 points 135 and 147): the
    /// sport's whole catalogue, not the list below.
    private var subtitle: String? {
        guard let catalog, catalog > 0 else { return nil }
        let count = L10n.plural("%lld tréninků", catalog)
        if sport == "ride", let ftp, ftp > 0 { return L10n.f("%@, na míru tvému FTP %@", count, Fmt.int(ftp) + "\u{00A0}W") }
        return count
    }

    /// MADE FOR YOU (602 point 146): the coach's proposal from Suggest a
    /// workout and the AI's own workout when the library has few of a type.
    @ViewBuilder private var madeForYou: some View {
        let workout = proposal?.workout
        if workout != nil || proposing || composeShown || proposalError != nil || (proposal?.workout == nil && proposal?.message != nil) {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Pro tebe")
                if let workout {
                    Button { open = workout; touched = true } label: { LibraryWorkoutCard(workout: workout, sport: sport) }.buttonStyle(PressableCardStyle())
                    if proposal?.aiPending == true && !touched {
                        CoachThinking(text: L10n.tr("Kouč píše…"))
                    }
                } else if proposing {
                    CoachThinking(text: L10n.tr("Hledám…"))
                }
                if let message = proposalError ?? (proposal?.workout == nil ? proposal?.message : nil) {
                    Text(message).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
                if composeShown {
                    if let composed, !composing {
                        Button { open = composed } label: { LibraryWorkoutCard(workout: composed, sport: sport) }.buttonStyle(PressableCardStyle())
                        Text("Napsal ho kouč pro tyto filtry, v knihovně jich je málo.")
                            .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                        if composeMore {
                            Button { Task { await compose(variant: composeVariant + 1) } } label: {
                                Text(verbatim: L10n.tr("Jiná možnost")).font(Typo.bodyStrong).foregroundStyle(Palette.ink).frame(minHeight: 44)
                            }
                            .buttonStyle(.plain)
                        }
                    } else {
                        CoachThinking(text: L10n.tr("Skládám trénink podle tvého výběru…"))
                    }
                }
            }
            .padding(.top, 24)
        }
    }

    /// Shown while the AI writes and once it has; a failure or an empty answer hides it.
    private var composeShown: Bool { composeWanted && (composing || composed != nil) }

    private func loadFtp() async {
        guard sport == "ride", !model.demo else { return }
        ftp = (try? await model.api.myWorkouts())?.athlete.ftp
    }

    private func compose(variant: Int) async {
        composing = true
        defer { composing = false }
        do {
            let result = try await model.api.composeWorkout(sport: sport, minutes: minutes, tolerance: tolerance, system: system,
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
        proposeRun += 1
        let run = proposeRun
        proposing = true
        do {
            proposal = try await model.api.generateWorkout(sport: sport, minutes: minutes, indoor: indoor, variant: variant, background: variant == 0)
            proposalError = nil
        } catch {
            proposalError = error.localizedDescription
        }
        proposing = false
        // The coach writes its own workout after the answer (within ~25 s):
        // asked again at most four times, and it takes the card's place only
        // while the card is untouched (not opened, no other suggestion, same length).
        for _ in 0..<4 where variant == 0 && proposal?.aiPending == true && !touched && run == proposeRun {
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled, !touched, run == proposeRun else { break }
            guard let fresh = try? await model.api.generateWorkout(sport: sport, minutes: minutes, indoor: indoor, variant: 0, background: true),
                  !touched, run == proposeRun else { continue }
            withAnimation(.snappy) { proposal = fresh }
        }
        if run == proposeRun, proposal?.aiPending == true { proposal?.aiPending = nil }
    }

    private func load() async {
        guard !model.demo else { error = "V ukázce se knihovna nenačítá."; return }
        // The slider and the chips change quickly: wait until they settle.
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        loading = true
        defer { loading = false }
        do {
            let result = try await model.api.searchWorkouts(sport: sport, minutes: minutes, tolerance: tolerance,
                                                            system: system, indoor: indoor, difficulty: level.range)
            workouts = result.workouts
            catalog = result.catalogSize ?? catalog
            if let length = result.coachPick?.durationMinutes {
                recommended = Int(length)
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

/// A library workout (concept a-knihovna/007): the name, the length in serif
/// with the strain estimate under it, one grey line, and the steps in the
/// zone colours (602 points 142 to 145).
struct LibraryWorkoutCard: View {
    let workout: LibraryWorkout
    var sport = "ride"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(verbatim: Self.shownName(workout.name)).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                            .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        if workout.ai != nil { AIMark() }
                    }
                    if let line = subtitle {
                        Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2).multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    if let d = workout.duration_minutes { Text(verbatim: LengthControl.short(Int(d))).font(Typo.number(22)).foregroundStyle(Palette.ink) }
                    if let load = workout.target_load, load > 0 {
                        Text(verbatim: Fmt.decimal(StrainDetailContent.strain(tss: load), digits: 1) + "\u{00A0}" + L10n.tr("odh."))
                            .font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                }
            }
            if let blocks = workout.steps, !blocks.isEmpty { LibraryStepsBar(blocks: blocks, sport: sport).frame(height: 22) }
            if let reason = workout.ai?.reason {
                Text(reason).font(Typo.caption).foregroundStyle(Palette.secondary).lineLimit(3).multilineTextAlignment(.leading)
                if let warning = workout.ai?.warning {
                    Text(warning).font(Typo.caption).foregroundStyle(Palette.amber).lineLimit(3).multilineTextAlignment(.leading)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 20)
        .accessibilityElement(children: .combine)
    }

    /// "Threshold, hard, 3 × 10 min at 229 to 262 W": the type, then the server's line.
    private var subtitle: String? {
        let type = workout.primary_system.map { LibraryWorkout.systemLabel($0) }
        let parts = [type, workout.difficultyLabel, workout.description?.nilIfBlank].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    /// The length is on the right, so not again in the name ("Endurance, 60 min"; 602 point 144).
    static func shownName(_ name: String) -> String {
        guard let r = name.range(of: #",\s*\d+\s*min$"#, options: .regularExpression) else { return name }
        return String(name[..<r.lowerBound])
    }
}

/// A workout's steps as bars in the zone colours (set B), their height by
/// the effort, their width by the time (602 point 143).
struct LibraryStepsBar: View {
    let blocks: [PlannedWorkout.Block]
    var sport = "ride"

    var body: some View {
        let segments = WorkoutProfile.segments(blocks)
        let total = max(segments.last?.end ?? 1, 1)
        GeometryReader { geo in
            HStack(alignment: .bottom, spacing: 1) {
                ForEach(segments) { s in
                    let percent = WorkoutProfile.shown(s.percent, sport: sport)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(s.step.rest == true ? Palette.Zone.color(0) : Palette.Zone.color(Self.zone(percent)))
                        .frame(width: max(1, (geo.size.width - CGFloat(segments.count)) * CGFloat((s.end - s.start) / total)),
                               height: geo.size.height * CGFloat(min(max(percent / 130, 0.3), 1)))
                }
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .accessibilityHidden(true)
    }

    /// Coggan's zones on % of threshold, Z1 to Z7 as 0 to 6.
    static func zone(_ percent: Double) -> Int {
        switch percent {
        case ..<56: return 0
        case ..<76: return 1
        case ..<91: return 2
        case ..<106: return 3
        case ..<121: return 4
        case ..<151: return 5
        default: return 6
        }
    }
}

/// The library's Day row: today and the next six days in a menu.
struct LibraryDayRow: View {
    @Binding var day: String

    var body: some View {
        let today = AppModel.localDate(Date())
        HStack(spacing: 12) {
            Text("Den").font(Typo.body).foregroundStyle(Palette.secondary)
            Spacer(minLength: 8)
            Menu {
                ForEach(0..<7, id: \.self) { i in
                    let date = ISODay.shift(today, i)
                    Button { day = date } label: { Text(verbatim: Self.label(date, today: today)) }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(verbatim: Self.label(day, today: today)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    Image(systemName: "chevron.down").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
                }
                .frame(minHeight: 44)
            }
        }
    }

    /// The day's local midnight, for the date picker of the workout's sheet.
    static func local(_ iso: String) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func label(_ date: String, today: String) -> String {
        Fmt.capitalized(Fmt.relativeDay(date, today: today))
    }
}

/// A filter as a menu in a card, its name grey and its value dark ("Type Threshold ⌄").
struct LibraryFilterMenu<Items: View>: View {
    let title: String
    let value: String
    @ViewBuilder var items: Items

    var body: some View {
        Menu { items } label: {
            HStack(spacing: 6) {
                Text(L10n.tr(title)).font(Typo.small).foregroundStyle(Palette.muted)
                Text(verbatim: value).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 48)
            .cardSurface(cornerRadius: 16)
        }
        .accessibilityLabel(Text(verbatim: L10n.tr(title) + ", " + value))
    }
}

/// The pinned Suggest a workout (glossary D-KNIH-8): an ink pill with the
/// coach's two lights, the page fading out under it.
struct SuggestWorkoutButton: View {
    var title = "Navrhnout trénink"
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                TwoLights(size: 18, mode: busy ? .thinking : .idle)
                Text(verbatim: L10n.tr(title)).font(Typo.bodyStrong)
            }
            .foregroundStyle(Palette.onButton)
            .frame(maxWidth: .infinity).frame(height: 52)
            .background(Palette.button, in: Capsule())
            .shadow(color: .black.opacity(0.22), radius: 10, y: 6)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 12)
        .background(LinearGradient(colors: [Palette.background.opacity(0), Palette.background], startPoint: .top, endPoint: .init(x: 0.5, y: 0.45)))
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
    /// The day chosen in the library's Day row.
    var start: Date? = nil
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
                    Text(verbatim: LibraryWorkoutCard.shownName(workout.name)).font(Typo.heading(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                HStack(spacing: 18) {
                    if let d = workout.duration_minutes { meta("Délka", Fmt.duration(Int(d))) }
                    if let m = workout.distance_meters, m > 0 { meta("Vzdálenost", Fmt.int(m) + " m") }
                    if let l = workout.target_load, l > 0 { meta(L10n.tr("Námaha"), Fmt.decimal(StrainDetailContent.strain(tss: l), digits: 1) + "\u{00A0}" + L10n.tr("odh.")) }
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
        .onAppear { if let start { date = max(start, Calendar.current.startOfDay(for: Date())) } }
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

/// "Knihovna cviků" on its own screen (deep link aurin://open/exercises).
struct ExerciseLibraryView: View {
    /// Opened on one muscle (Svaly → Cviky: …), a BodyFigure id.
    var muscle: String? = nil

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: "Cviky") {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Knihovna cviků").padding(.top, 24)
                Text("Cviky").font(Typo.heading(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                ExerciseCatalog(muscle: muscle)
            }
        }
    }
}

/// Search, the muscle chips, "Jen s mým vybavením" and the list of exercises.
struct ExerciseCatalog: View {
    @Environment(AppModel.self) private var model
    init(muscle: String? = nil) { _muscle = State(initialValue: muscle.map(BodyFigure.choice)) }

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

            // Muscles and Equipment as two menus, never a sideways row (602 point 156).
            HStack(spacing: 10) {
                LibraryFilterMenu(title: "Filtr svalů", value: rested ? L10n.tr("Odpočaté") : muscle.map(BodyFigure.label) ?? L10n.tr("Všechny")) {
                    Button { muscle = nil; rested = false } label: { Text(verbatim: L10n.tr("Všechny")) }
                    if model.muscles.map({ !$0.tired.isEmpty }) == true {
                        Button { muscle = nil; rested = true } label: { Text(verbatim: L10n.tr("Odpočaté")) }
                    }
                    ForEach(BodyFigure.choices, id: \.self) { id in
                        Button { muscle = id; rested = false } label: { Text(verbatim: BodyFigure.label(id)) }
                    }
                }
                LibraryFilterMenu(title: "Vybavení", value: L10n.tr(mine ? "Moje" : "Všechno")) {
                    Button { mine = true } label: { Text(verbatim: L10n.tr("Moje")) }
                    Button { mine = false } label: { Text(verbatim: L10n.tr("Všechno")) }
                }
            }
            .padding(.top, 12)

            // The rested muscles shown: a workout of them, the proposal straight away.
            if rested, model.muscles?.restedFocus.isEmpty == false {
                PrimaryButton(title: L10n.tr("Sestavit z odpočatých"), systemImage: "sparkles") { model.push(.gymRested) }
                    .padding(.top, 12)
            } else if rested, model.muscles != nil {
                // No big muscle rested: say why there is no workout of them (Petr 2026-11-09).
                Text("Velké svaly se ještě zotavují. Zkus krátký trénink středu těla nebo volno.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
                // Something to do anyway: 30 minutes of the smaller muscles rested today.
                if model.muscles?.shortFocus.isEmpty == false {
                    PrimaryButton(title: L10n.tr("Sestavit krátký trénink"), systemImage: "sparkles") { model.push(.gymShort) }
                        .padding(.top, 8)
                }
            }

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
            if rested, !Self.ready(ex, model.muscles) { return false }
            return true
        }
    }

    /// Whether the exercise works the muscle: by the server's map, else (an
    /// older server) by the catalog's muscle name (src/gym-catalog.js MUSCLES_CS).
    static func works(_ ex: GymCatalogExercise, _ muscle: String) -> Bool {
        if muscle == "shoulders" { return BodyFigure.shoulders.contains { works(ex, $0) } }
        if let map = ex.muscles, !map.isEmpty { return (map[muscle] ?? 0) >= 0.5 }
        let names: [String: [String]] = [
            "chest": ["hrudnik"], "upper_back": ["zada"], "lats": ["zada"], "lower_back": ["spodni zada"], "traps": ["trapezy"],
            "front_delts": ["ramena"], "side_delts": ["bocni ramena"], "rear_delts": ["zadni ramena"], "biceps": ["biceps"],
            "triceps": ["triceps"], "forearms": ["predlokti"], "abs": ["stred tela"], "obliques": ["stred tela"],
            "hips": ["hyzde", "vnejsi stehna", "vnitrni stehna"], "quads": ["predni stehna"], "hamstrings": ["zadni stehna"], "calves": ["lytka"]
        ]
        return (names[muscle] ?? []).contains(fold(ex.muscle ?? ""))
    }

    /// The name and what it is done with (602 points 157, 158): no figures, no
    /// tired line, the equipment only when the name doesn't already say it.
    private func row(_ ex: GymCatalogExercise) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                if let line = Self.equipmentLine(ex) {
                    Text(verbatim: line).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    /// "Quads, leg press" without repeating the name ("Pivot leg press": only "Quads").
    static func equipmentLine(_ ex: GymCatalogExercise) -> String? {
        let name = fold(ex.name)
        let station = ex.station?.nilIfBlank.flatMap { name.contains(fold($0)) ? nil : $0 }
        let parts = [ex.muscle?.nilIfBlank, station].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }


    /// Odpočaté keeps the exercise: its main muscle is rested today, as the
    /// rings and Sestavit z odpočatých count it (MuscleFatigue.ready).
    static func ready(_ ex: GymCatalogExercise, _ data: MuscleFatigue?) -> Bool {
        guard let data, let main = (ex.muscles ?? [:]).max(by: { $0.value < $1.value }), main.value >= 0.5 else { return true }
        return data.ready(body: main.key)
    }

    /// The exercise's main muscle when it is not rested yet (its mark in the list).
    static func tired(_ ex: GymCatalogExercise, _ data: MuscleFatigue?) -> MuscleFatigue.Muscle? {
        guard let data, let main = (ex.muscles ?? [:]).max(by: { $0.value < $1.value }), main.value >= 0.5 else { return nil }
        return data.tired(body: main.key)
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

    /// A catalog name as a sentence (WatchShared/GymSheet.swift).
    static func shownName(_ name: String) -> String { ExerciseName.shown(name) }
}

/// One exercise: the muscles on the figure, then its technique.
struct ExerciseSheet: View {
    let exercise: GymCatalogExercise
    @Environment(\.dismiss) private var dismiss
    @State private var technique = false

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text(exercise.name).font(Typo.heading(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Zavřít") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                Text([exercise.muscle, exercise.station].compactMap { $0?.nilIfBlank }.joined(separator: ", "))
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

/// The one length control of the redesign (Petr decision 6, 2026-11-16) for
/// every sport (602 points 137 to 139): the length big in serif with the
/// coach's length for today beside it, a slider in steps, then the
/// "Recommended" chip, own presets and "+ Save". No ± window on screen. The
/// time follows the finger; holding a preset removes it.
struct LengthControl: View {
    /// nil is the coach's length for today.
    @Binding var minutes: Int?
    var recommended: Int?
    let range: ClosedRange<Double>
    let step: Double
    /// The own presets, "60,90,120" (kept per sport on the phone).
    @Binding var presets: String
    /// The slider's start before the coach's length is known.
    var fallback: Int = 60
    @State private var slider: Double = 60
    @State private var dragging = false

    private var values: [Int] { presets.split(separator: ",").compactMap { Int($0) }.sorted() }

    var body: some View {
        let shown = dragging || minutes != nil ? Int(slider) : recommended
        let own = minutes.flatMap { values.contains($0) ? nil : $0 }
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: Self.short(shown ?? Int(slider))).font(Typo.number(30)).foregroundStyle(Palette.ink)
                    .contentTransition(.numericText()).animation(.snappy, value: shown)
                Spacer(minLength: 8)
                if let recommended {
                    Text(verbatim: L10n.f("Kouč dnes doporučuje %@", Self.short(recommended)))
                        .font(Typo.caption).foregroundStyle(Palette.muted).multilineTextAlignment(.trailing)
                }
            }
            Slider(value: $slider, in: range, step: step, onEditingChanged: { editing in
                dragging = editing
                if !editing { minutes = Int(slider) }
            })
            .tint(Palette.ink)
            .accessibilityLabel(Text(verbatim: L10n.tr("Délka")))
            .accessibilityValue(Self.short(Int(slider)))
            FlowLayout(spacing: 8) {
                if recommended != nil {
                    chip(L10n.tr("Doporučená"), on: minutes == nil && !dragging) { minutes = nil; if let recommended { slider = clamp(recommended) } }
                }
                ForEach(values, id: \.self) { value in
                    chip(Self.short(value), on: !dragging && minutes == value) { minutes = value; slider = Double(value) }
                        .contextMenu {
                            Button(role: .destructive) { remove(value) } label: { Label("Odebrat z předvoleb", systemImage: "trash") }
                        }
                }
                Button { if let own { add(own) } } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "plus")
                        Text(verbatim: own.map { L10n.f("Uložit %@", Self.short($0)) } ?? L10n.tr("Uložit"))
                    }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(own == nil ? Palette.muted : Palette.ink)
                    .padding(.horizontal, 12).frame(minHeight: 32)
                    .overlay { Capsule().stroke(Palette.ink.opacity(own == nil ? 0.25 : 0.6), style: StrokeStyle(lineWidth: 1, dash: [3, 3])) }
                }
                .buttonStyle(.plain)
                .disabled(own == nil || values.count >= 8)
                .accessibilityLabel(own.map { L10n.f("Uložit %@", Self.short($0)) } ?? L10n.tr("Uložit délku jako předvolbu"))
            }
        }
        .onAppear { slider = clamp(minutes ?? recommended ?? values.first ?? fallback) }
        .onChange(of: recommended) { _, length in
            if minutes == nil && !dragging, let length { slider = clamp(length) }
        }
        .onChange(of: minutes) { _, value in
            if !dragging, let value { slider = clamp(value) }
        }
    }

    /// "45 min", "1 h", "1 h 30" (602 point 139), never broken inside.
    /// The app's one length format (Fmt.duration, "1 h 05"), with no-break spaces so it never wraps.
    static func short(_ minutes: Int) -> String { Fmt.duration(minutes).replacingOccurrences(of: " ", with: "\u{00A0}") }

    private func clamp(_ value: Int) -> Double { min(max(Double(value), range.lowerBound), range.upperBound) }

    private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
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

    private func add(_ value: Int) {
        presets = Array(Set(values + [value])).sorted().prefix(8).map(String.init).joined(separator: ",")
    }

    private func remove(_ value: Int) {
        presets = values.filter { $0 != value }.map(String.init).joined(separator: ",")
    }
}
