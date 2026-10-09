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
            LazyVGrid(columns: columns, spacing: 10) {
                tile(.trainingMode(today), "play.fill", "Režim tréninku", "cvik po cviku s pauzou", Palette.amberBar)
                tile(.equipment, "dumbbell", "Vybavení", "posilovna, doma, vlastní váha", Palette.indigo)
            }
            LibraryWidget().padding(.top, 10)
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

/// Training → "Knihovna tréninků": the ride, run and gym library one tap away.
struct LibraryWidget: View {
    var body: some View {
        Card {
            RouteLink(route: .workoutLibrary("ride")) {
                WidgetHeader(title: "Knihovna tréninků", color: Palette.amberBar, trailing: "délka · obtížnost · venku")
            }
            HStack(spacing: 10) {
                entry("ride", "bicycle", "Kolo", "jízdy a intervaly", Palette.amberBar)
                entry("run", "figure.run", "Běh", "tempo a výběhy", Palette.rust)
                entry("gym", "dumbbell.fill", "Posilovna", "cviky a AI", Palette.indigo)
            }
        }
    }

    private func entry(_ sport: String, _ symbol: String, _ title: String, _ subtitle: String, _ color: Color) -> some View {
        RouteLink(route: .workoutLibrary(sport)) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                Text(subtitle).font(.caption2).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.track, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .accessibilityLabel(title + ", knihovna")
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

// MARK: - Equipment

/// Where the athlete trains: a gym (the usual stations, all of them until the
/// athlete unticks what theirs lacks, or AI picks them from photos or the
/// gym's web page), a home gym (the few things there are), or the body weight
/// only. With dumbbells, the weights there are, so the plan asks for one of them.
struct EquipmentView: View {
    @Environment(AppModel.self) private var model
    @State private var data: GymEquipment?
    @State private var kind = "custom"
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

    static let kinds: [(String, String, String)] = [
        ("custom", "Posilovna", "Stroje, kladky a volné váhy, odškrtneš, co tam chybí"),
        ("home", "Domácí posilovna", "Jen to, co máš doma: jednoručky, lavice, hrazda…"),
        ("bodyweight", "Vlastní váha", "Bez vybavení")
    ]

    /// The first setup asks only roughly; the stations are set here later.
    static let setupKinds: [(String, String, String)] = [
        ("gym", "Posilovna", "Stroje, kladky a volné váhy"),
        ("dumbbells", "Domácí posilovna", "Jednoručky, lavice a podložka"),
        ("bodyweight", "Vlastní váha", "Bez vybavení")
    ]

    static let homeDefault: Set<String> = ["dumbbells", "adjustable_bench", "floor_mats"]
    /// The usual dumbbells, kg per hand.
    static let weightOptions: [Double] = [1, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22, 22.5, 24, 25, 26, 27.5, 28, 30, 32, 32.5, 34, 35, 36, 38, 40, 42, 44, 45, 46, 48, 50]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · vybavení").padding(.top, 24)
                Text("Kde cvičíš?").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                Text("Tréninky sestavím jen z toho, co máš k dispozici.").font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 6)

                VStack(spacing: 10) {
                    ForEach(Self.kinds.indices, id: \.self) { i in
                        let k = Self.kinds[i]
                        ChoiceCard(title: k.1, subtitle: k.2, selected: kind == k.0) { choose(k.0) }
                    }
                }
                .padding(.top, 18)

                if kind == "custom" { detection }
                if kind != "bodyweight" {
                    if kind == "custom" {
                        SettingsGroup(title: "Název") {
                            SettingsField(title: "Posilovna", text: $gymName, keyboard: .default, placeholder: "třeba Fitko u nádraží")
                        }
                        .padding(.top, 22)
                    }
                    if selected.contains("dumbbells") { dumbbells }
                    stations
                }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
                if saved { Label("Uloženo", systemImage: "checkmark.circle.fill").font(Typo.bodyStrong).foregroundStyle(Palette.green).padding(.top, 14) }
                PrimaryButton(title: busy == "save" ? "Ukládám…" : "Uložit vybavení", busy: busy == "save") { Task { await save() } }
                    .disabled(busy != nil || model.demo || (kind != "bodyweight" && selected.isEmpty))
                    .padding(.top, 22)
            }
        }
        .task { await load() }
        .onChange(of: photos) { _, items in if !items.isEmpty { Task { await detect(items) } } }
    }

    private var detection: some View {
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
        }
    }

    /// The dumbbells there are: tap the weights, or add an odd one.
    private var dumbbells: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Jednoručky")
                Spacer()
                Text(weights.isEmpty ? "plán navrhne jakoukoli váhu" : "\(weights.count) " + Fmt.plural(weights.count, "váha", "váhy", "vah"))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            Text("Vyber váhy, které máš (kg na ruku). Plán pak navrhne jen je, nejbližší lehčí, když přesná chybí.")
                .font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                preset("2–40 po 2") { weights = Set(stride(from: 2.0, through: 40, by: 2)) }
                preset("2,5–25 po 2,5") { weights = Set(stride(from: 2.5, through: 25, by: 2.5)) }
                preset("Zrušit") { weights = [] }
            }
            ChipFlow(items: Array(Set(Self.weightOptions).union(weights)).sorted(), label: { Self.kg($0) },
                     isOn: { weights.contains($0) },
                     toggle: { w in if weights.contains(w) { weights.remove(w) } else { weights.insert(w) }; saved = false })
            HStack(spacing: 8) {
                TextField("Jiná váha, kg", text: $customWeight)
                    .keyboardType(.decimalPad)
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Button("Přidat") {
                    if let kg = Double(customWeight.replacingOccurrences(of: ",", with: ".")), kg > 0, kg <= 100 {
                        weights.insert((kg * 4).rounded() / 4)
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
                SectionLabel(text: kind == "home" ? "Co máš doma" : "Co tam je")
                Spacer()
                Button(selected.count == (data?.stations?.count ?? 0) ? "Odebrat vše" : "Vybrat vše") {
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

    /// A gym starts with everything a gym usually has, a home gym with
    /// dumbbells, a bench and a mat.
    private func choose(_ next: String) {
        guard next != kind else { return }
        kind = next
        saved = false
        let all = Set((data?.stations ?? []).map(\.id))
        if next == "custom", selected.isEmpty || selected.isSubset(of: Self.homeDefault) { selected = all }
        if next == "home", selected.isEmpty || selected == all { selected = Self.homeDefault.intersection(all.isEmpty ? Self.homeDefault : all) }
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
            let all = Set((d.stations ?? []).map(\.id))
            switch d.equipment {
            case "gym": kind = "custom"; selected = all
            case "dumbbells": kind = "home"; selected = Self.homeDefault
            default: kind = d.equipment; selected = Set(d.selected)
            }
            if kind == "custom", selected.isEmpty { selected = all }
            weights = Set(d.dumbbellWeights ?? [])
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
            let stations = kind == "bodyweight" ? [] : Array(selected)
            let r = try await model.api.saveGymEquipment(equipment: kind, stations: stations, gymName: kind == "custom" ? gymName : "",
                                                         gymUrl: kind == "custom" ? gymUrl : "",
                                                         dumbbellWeights: selected.contains("dumbbells") ? weights.sorted() : [])
            data?.equipment = r.equipment
            data?.selected = r.selected
            data?.dumbbellWeights = r.dumbbellWeights
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
                note = "Našel jsem \(found.count) " + Fmt.plural(found.count, "stroj", "stroje", "strojů") + ". Zkontroluj seznam a ulož." + (r.note?.nilIfBlank.map { " " + $0 } ?? "")
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
        Fmt.decimal(value, digits: value.rounded() == value ? 0 : (value * 2).rounded() == value * 2 ? 1 : 2) + " kg"
    }

    /// "Posilovna · 14 strojů" for the builder and the library.
    static func summary(_ e: GymEquipment?) -> String {
        guard let e else { return "posilovna" }
        let count = " · \(e.selected.count) " + Fmt.plural(e.selected.count, "věc", "věci", "věcí")
        switch e.equipment {
        case "custom": return (e.gymName.nilIfBlank ?? "Posilovna") + count
        case "home": return "Domácí posilovna" + count
        case "dumbbells": return "doma s jednoručkami"
        case "bodyweight": return "jen vlastní váha"
        default: return "posilovna"
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
