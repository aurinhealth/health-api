import PhotosUI
import SwiftUI
import UIKit

// MARK: - Training → tools

/// Training: the AI gym builder, the workout mode, the exercise library, the
/// equipment and the ride and run libraries.
struct TrainingTools: View {
    let today: String
    var addWorkout: () -> Void = {}

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Posilovna")
            LazyVGrid(columns: columns, spacing: 10) {
                tile(.gymBuilder, "sparkles", "Sestavit s AI", "podle únavy a partií", Palette.green)
                tile(.trainingMode(today), "play.fill", "Režim tréninku", "cvik po cviku s pauzou", Palette.amberBar)
                tile(.exerciseLibrary, "books.vertical", "Knihovna cviků", "filtry a technika", Palette.brown)
                tile(.equipment, "dumbbell", "Vybavení", "posilovna nebo doma", Palette.indigo)
            }
            SectionLabel(text: "Kolo a běh").padding(.top, 10)
            LazyVGrid(columns: columns, spacing: 10) {
                tile(.workoutLibrary("ride"), "bicycle", "Tréninky na kolo", "knihovna s filtry", Palette.amber)
                tile(.workoutLibrary("run"), "figure.run", "Tréninky na běh", "knihovna s filtry", Palette.rust)
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

    private func tile(_ route: AppRoute, _ symbol: String, _ title: String, _ subtitle: String, _ color: Color) -> some View {
        RouteLink(route: route) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(title).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.85)
                Text(subtitle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.85)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 10, y: 6)
        }
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
            Label(title, systemImage: systemImage ?? "")
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

/// "Sestavit s AI": the length and either the whole body, upper or lower body,
/// or the muscles chosen on the figure; then the proposal with the muscles it
/// works, changes in words ("bez dřepů, víc ramen") and saving to the plan.
struct GymBuilderView: View {
    @Environment(AppModel.self) private var model
    let date: String
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

    private var isoDay: String { AppModel.localDate(day) }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · sestavit s AI").padding(.top, 24)
                Text(proposal == nil ? "Jaký trénink chceš?" : proposal!.planName)
                    .font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                if let proposal { result(proposal) } else { form }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
        }
        .task {
            if let d = Self.isoFormatter.date(from: date) { day = d }
            if !model.demo, equipment == nil { equipment = try? await model.api.gymEquipment() }
        }
    }

    // MARK: Form

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Sestavím ho podle únavy, svalů od posledního tréninku, cyklistické zátěže a tvého vybavení.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 8)

            SectionLabel(text: "Kdy a jak dlouho").padding(.top, 26)
            Card {
                DatePicker("Den", selection: $day, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)
                    .environment(\.locale, Fmt.locale)
                Picker("Délka", selection: $minutes) {
                    ForEach([30, 45, 60, 75, 90], id: \.self) { Text("\($0) min").tag($0) }
                }
                .pickerStyle(.segmented)
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
                    Text(muscles.isEmpty ? "Klepni na partie, které chceš procvičit (1 až 5)." : "Vybráno \(muscles.count) z 5")
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
            VStack(spacing: 0) {
                ForEach(Array(p.exercises.enumerated()), id: \.offset) { index, ex in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(index + 1)").font(Typo.number(20)).foregroundStyle(Palette.faint).frame(width: 22, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                            Text(muscleLine(p.muscles[ex.name])).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Text("\(ex.sets) × " + ex.reps + (ex.kg.isEmpty ? "" : " · " + ex.kg + " kg"))
                            .font(Typo.small).foregroundStyle(Palette.secondary).lineLimit(1)
                    }
                    .padding(.vertical, 12)
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                }
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
                HStack(spacing: 10) {
                    SecondaryButton(title: "Jiný návrh", systemImage: "arrow.clockwise") { Task { await preview() } }
                    SecondaryButton(title: "Změnit zadání", systemImage: "slider.horizontal.3") { proposal = nil; answer = nil }
                }
                .disabled(busy != nil)
                .padding(.top, 10)
            }
        }
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
            proposal = try await model.api.previewGym(date: isoDay, minutes: minutes,
                                                      focus: focus == "upper" || focus == "lower" ? focus : nil,
                                                      muscles: focus == "muscles" ? BodyFigure.muscles.map { $0.id }.filter(muscles.contains) : [])
            answer = nil
            wish = ""
        }
    }

    private func adjust() async {
        guard let p = proposal else { return }
        await run("adjust") {
            let r = try await model.api.adjustGym(rows: p.rows, request: wish)
            var next = p
            next.rows = r.rows
            if !r.muscles.isEmpty { next.muscles = r.muscles }
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

// MARK: - Exercise library

struct ExerciseLibraryView: View {
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
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · knihovna cviků").padding(.top, 24)
                Text("Cviky").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)

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
                .padding(.top, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip("Vše", muscle == nil) { muscle = nil }
                        ForEach(BodyFigure.muscles.indices, id: \.self) { i in
                            let m = BodyFigure.muscles[i]
                            chip(m.label, muscle == m.id) { muscle = muscle == m.id ? nil : m.id }
                        }
                    }
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
                    VStack(spacing: 0) {
                        ForEach(filtered) { ex in
                            Button { open = ex } label: { row(ex) }.buttonStyle(.plain)
                            Rectangle().fill(Palette.hairline).frame(height: 1)
                        }
                    }
                    .padding(.top, 4)
                }
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
            if let muscle, (ex.muscles?[muscle] ?? 0) < 0.5 { return false }
            if mine, !EquipmentView.fits(ex, equipment) { return false }
            return true
        }
    }

    private func row(_ ex: GymCatalogExercise) -> some View {
        HStack(spacing: 12) {
            BodyMap(load: ex.muscles ?? [:], height: 54).frame(width: 64).allowsHitTesting(false)
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
        }
        .buttonStyle(.plain)
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
                BodyMap(load: exercise.muscles ?? [:], height: 260)
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

// MARK: - Equipment

/// Where the athlete trains: a usual gym, their own gym (the stations it has,
/// which AI can pick from photos or the gym's web page), home with dumbbells,
/// or the body weight only.
struct EquipmentView: View {
    @Environment(AppModel.self) private var model
    @State private var data: GymEquipment?
    @State private var kind = "gym"
    @State private var selected: Set<String> = []
    @State private var gymName = ""
    @State private var gymUrl = ""
    @State private var photos: [PhotosPickerItem] = []
    @State private var busy: String?
    @State private var note: String?
    @State private var error: String?
    @State private var saved = false

    static let kinds: [(String, String, String)] = [
        ("gym", "Běžná posilovna", "Stroje, kladky i volné váhy"),
        ("custom", "Moje posilovna", "Jen stroje, které tam opravdu jsou"),
        ("dumbbells", "Doma s jednoručkami", "Jednoručky, lavice a podložka"),
        ("bodyweight", "Vlastní váha", "Bez vybavení")
    ]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · vybavení").padding(.top, 24)
                Text("Kde cvičíš?").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                Text("Tréninky sestavím jen z toho, co máš k dispozici.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 6)

                VStack(spacing: 10) {
                    ForEach(Self.kinds.indices, id: \.self) { i in
                        let k = Self.kinds[i]
                        ChoiceCard(title: k.1, subtitle: k.2, selected: kind == k.0) { kind = k.0 }
                    }
                }
                .padding(.top, 18)

                if kind == "custom" { custom }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
                if saved { Label("Uloženo", systemImage: "checkmark.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green).padding(.top, 14) }
                PrimaryButton(title: busy == "save" ? "Ukládám…" : "Uložit vybavení", busy: busy == "save") { Task { await save() } }
                    .disabled(busy != nil || model.demo || (kind == "custom" && selected.isEmpty))
                    .padding(.top, 22)
            }
        }
        .task { await load() }
        .onChange(of: photos) { _, items in if !items.isEmpty { Task { await detect(items) } } }
    }

    private var custom: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "Poznat z fotky nebo webu").padding(.top, 26)
            Card {
                Text("Vyfoť posilovnu (až 4 fotky) nebo vlož odkaz na její web. AI vybere stroje, které tam jsou, a ty je pak jen zkontroluješ.")
                    .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                PhotosPicker(selection: $photos, maxSelectionCount: 4, matching: .images) {
                    Label(busy == "photo" ? "Čtu fotky…" : "Vybrat fotky posilovny", systemImage: "photo.on.rectangle.angled")
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

            SettingsGroup(title: "Název") {
                SettingsField(title: "Posilovna", text: $gymName, keyboard: .default, placeholder: "třeba Fitko u nádraží")
            }
            .padding(.top, 22)

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
                .padding(.top, 22)
            }
        }
    }

    private var groups: [String] {
        var out: [String] = []
        for s in data?.stations ?? [] where !out.contains(s.group) { out.append(s.group) }
        return out
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
            kind = d.equipment
            selected = Set(d.selected)
            gymName = d.gymName
            gymUrl = d.gymUrl
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        busy = "save"
        defer { busy = nil }
        do {
            let r = try await model.api.saveGymEquipment(equipment: kind, stations: kind == "custom" ? Array(selected) : [], gymName: gymName, gymUrl: gymUrl)
            data?.equipment = r.equipment
            data?.selected = r.selected
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

    private func apply(_ work: () async throws -> GymDetectResult) async {
        do {
            let r = try await work()
            if r.found == true, let stations = r.stations {
                selected.formUnion(stations)
                if gymName.isEmpty, let name = r.gymName?.nilIfBlank { gymName = name }
                note = "Našel jsem \(stations.count) " + Fmt.plural(stations.count, "stroj", "stroje", "strojů") + ". Zkontroluj seznam a ulož." + (r.note?.nilIfBlank.map { " " + $0 } ?? "")
                error = nil
            } else {
                error = r.message ?? "Vybavení se nepodařilo poznat."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// "Moje posilovna · 14 strojů" for the builder and the library.
    static func summary(_ e: GymEquipment?) -> String {
        guard let e else { return "běžná posilovna" }
        switch e.equipment {
        case "custom": return (e.gymName.nilIfBlank ?? "Moje posilovna") + " · \(e.selected.count) " + Fmt.plural(e.selected.count, "stroj", "stroje", "strojů")
        case "dumbbells": return "doma s jednoručkami"
        case "bodyweight": return "jen vlastní váha"
        default: return "běžná posilovna"
        }
    }

    /// Whether the exercise can be done with this equipment (its stations, as
    /// src/strength-generator.js fitsEquipment decides).
    static func fits(_ ex: GymCatalogExercise, _ e: GymEquipment?) -> Bool {
        let needs = Set(ex.stations ?? [])
        guard let e else { return true }
        switch e.equipment {
        case "custom": return needs.isSubset(of: Set(e.selected).union(["floor_mats"]))
        case "dumbbells": return needs.isSubset(of: ["dumbbells", "adjustable_bench", "floor_mats"])
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

// MARK: - Ride and run library

struct WorkoutLibraryView: View {
    @Environment(AppModel.self) private var model
    let sport: String
    @State private var minutes: Int? = nil
    @State private var system: String? = nil
    @State private var indoor = true
    @State private var workouts: [LibraryWorkout] = []
    @State private var loading = false
    @State private var error: String?
    @State private var open: LibraryWorkout?

    private var lengths: [Int] { sport == "run" ? [30, 45, 60, 75, 90] : [45, 60, 90, 120, 180] }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: sport == "run" ? "Běh · knihovna" : "Kolo · knihovna").padding(.top, 24)
                Text(sport == "run" ? "Běžecké tréninky" : "Tréninky na kolo").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                Text("Seřazené podle toho, co ti dnes sedí: připravenost, únava a předchozí tréninky.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 6)

                Picker("Kde", selection: $indoor) {
                    Text(sport == "run" ? "Pás" : "Trenažér").tag(true)
                    Text("Venku").tag(false)
                }
                .pickerStyle(.segmented)
                .padding(.top, 18)

                SectionLabel(text: "Délka").padding(.top, 18)
                ChipFlow(items: [0] + lengths, label: { $0 == 0 ? "Doporučená" : Fmt.duration($0) }, isOn: { ($0 == 0 && minutes == nil) || $0 == minutes },
                         toggle: { minutes = $0 == 0 ? nil : $0 })
                    .padding(.top, 8)
                SectionLabel(text: "Typ").padding(.top, 18)
                ChipFlow(items: [""] + LibraryWorkout.systems.map { $0.0 }, label: { $0.isEmpty ? "Doporučený" : LibraryWorkout.systemLabel($0) },
                         isOn: { ($0.isEmpty && system == nil) || $0 == system }, toggle: { system = $0.isEmpty ? nil : $0 })
                    .padding(.top, 8)

                if loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if let error {
                    Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 16)
                } else if workouts.isEmpty {
                    Text("Těmto filtrům nic neodpovídá.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 20)
                } else {
                    VStack(spacing: 10) {
                        ForEach(workouts) { w in
                            Button { open = w } label: { card(w) }.buttonStyle(PressableCardStyle())
                        }
                    }
                    .padding(.top, 20)
                }
            }
        }
        .task(id: "\(minutes ?? 0)|\(system ?? "")|\(indoor)") { await load() }
        .sheet(item: $open) { w in LibraryWorkoutSheet(workout: w, sport: sport, indoor: indoor) }
    }

    private func card(_ w: LibraryWorkout) -> some View {
        Card {
            HStack(alignment: .firstTextBaseline) {
                Text(w.name).font(.body.weight(.semibold)).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                if let d = w.duration_minutes { Text(Fmt.duration(Int(d))).font(Typo.number(19)).foregroundStyle(Palette.ink) }
            }
            HStack(spacing: 8) {
                if let s = w.primary_system { Pill(text: LibraryWorkout.systemLabel(s), foreground: Palette.amber, background: Palette.amberSoft) }
                if let load = w.target_load { Text(Fmt.int(load) + " TSS").font(Typo.caption).foregroundStyle(Palette.muted) }
                if let f = w.intensity_factor { Text("IF " + Fmt.decimal(f, digits: 2)).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            if let blocks = w.steps, !blocks.isEmpty { StepsProfile(blocks: blocks).frame(height: 36) }
        }
    }

    private func load() async {
        guard !model.demo else { error = "V ukázce se knihovna nenačítá."; return }
        loading = true
        defer { loading = false }
        do {
            workouts = try await model.api.searchWorkouts(sport: sport, minutes: minutes, system: system, indoor: indoor)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
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
                    if let s = workout.primary_system { meta("Typ", LibraryWorkout.systemLabel(s)) }
                }
                if let blocks = workout.steps, !blocks.isEmpty {
                    StepsProfile(blocks: blocks).frame(height: 54)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in StepBlockRow(block: block) }
                    }
                }
                if let d = workout.description?.nilIfBlank {
                    Text(d).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
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
