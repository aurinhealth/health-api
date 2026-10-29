import SwiftUI

/// The plates on each side of a bar for a weight, and back. Weights here are
/// in the chosen unit (kg, or lb with imperial units), as the loader shows them.
enum PlateLoad {
    static let kgSizes: [Double] = [25, 20, 15, 10, 5, 2.5, 1.25]
    static let lbSizes: [Double] = [45, 35, 25, 10, 5, 2.5]
    /// The plates there are in the chosen unit.
    static var sizes: [Double] { Units.imperial ? lbSizes : kgSizes }
    /// More would not fit on the sleeve.
    static let maxPerSide = 10

    /// Plates per side, heaviest first, for a total weight on a bar: the
    /// heaviest that fit, so a weight the plates can't make exactly loads
    /// what comes nearest below it.
    static func plates(for total: Double, bar: Double, sizes: [Double] = kgSizes) -> [Double] {
        guard total > bar else { return [] }
        var side = (total - bar) / 2
        var out: [Double] = []
        for plate in sizes where side >= plate - 0.001 {
            while side >= plate - 0.001, out.count < maxPerSide { out.append(plate); side -= plate }
        }
        return out
    }

    static func total(_ plates: [Double], bar: Double) -> Double {
        bar + 2 * plates.reduce(0, +)
    }

    /// A plate added: kept heaviest first, as they go on the bar.
    static func adding(_ plate: Double, to plates: [Double]) -> [Double] {
        guard plates.count < maxPerSide else { return plates }
        return (plates + [plate]).sorted(by: >)
    }

    /// "25 + 5" per side when the plates make the weight exactly (the chip under the sets).
    static func perSide(_ total: Double, bar: Double, sizes: [Double] = kgSizes) -> String? {
        let out = plates(for: total, bar: bar, sizes: sizes)
        guard !out.isEmpty, abs(self.total(out, bar: bar) - total) < 0.01 else { return nil }
        return out.map(text).joined(separator: " + ")
    }

    /// A weight already in the chosen unit, in the app's decimal mark: "2,5", "45".
    static func text(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(Fmt.locale))
    }

    /// A pound plate drawn as the kilo plate of its place (45 lb as 25 kg).
    static func look(_ plate: Double) -> Double {
        guard Units.imperial else { return plate }
        return [45: 25, 35: 20, 25: 15, 10: 10, 5: 5, 2.5: 2.5][plate] ?? 1.25
    }
}

/// What the plates go on: a bar of its own weight, or a plate-loaded machine
/// where only the plates count.
enum PlateBar: Hashable {
    case barbell, womens, ez, trap, smith, none, machine
    /// "Jiná váha…": a bar of the athlete's own, kept in kg.
    case custom(Double)

    static let menu: [PlateBar] = [.barbell, .womens, .ez, .trap, .smith, .none]
    /// Stations of plate-loaded machines: the plates on both sides are the weight.
    static let machines: Set<String> = ["pivot_leg_press", "pendulum_squat", "hack_squat", "t_bar_row", "plate_loaded_row", "belt_squat"]

    /// The bar's weight in the chosen unit (a 20 kg bar is 45 lb).
    var weight: Double {
        let lb = Units.imperial
        switch self {
        case .barbell: return lb ? 45 : 20
        case .womens: return lb ? 35 : 15
        case .ez: return lb ? 25 : 10
        case .trap: return lb ? 55 : 25
        case .smith: return lb ? 35 : 15
        case .none, .machine: return 0
        case .custom(let kg): return LiftWeight.shownValue(kg)
        }
    }

    var name: String {
        switch self {
        case .barbell: return L10n.tr("Olympijská osa")
        case .womens: return L10n.tr("Dámská osa")
        case .ez: return L10n.tr("EZ osa")
        case .trap: return L10n.tr("Trap bar")
        case .smith: return L10n.tr("Smith stroj")
        case .none: return L10n.tr("Bez tyče")
        case .machine: return L10n.tr("Stroj na kotouče")
        case .custom: return L10n.tr("Vlastní osa")
        }
    }

    /// "Osa 20 kg" on the pill under the plates.
    var label: String {
        switch self {
        case .none, .machine: return name
        default: return name + " " + PlateLoad.text(weight) + " " + Units.weightUnit
        }
    }

    /// The bar an exercise is done with, from its stations; nil when no plates go on it.
    static func usual(_ stations: [String]) -> PlateBar? {
        let have = Set(stations)
        if have.contains("trap_bar") { return .trap }
        if have.contains("ez_bar") { return .ez }
        if have.contains("smith_machine") { return .smith }
        if !have.isDisjoint(with: machines) { return .machine }
        if have.contains("barbells") {
            // The one bar the first loader kept for every exercise.
            switch UserDefaults.standard.object(forKey: "plateBarKg") as? Double {
            case 15: return .womens
            case 10: return .ez
            case 0: return PlateBar.none
            default: return .barbell
            }
        }
        return nil
    }

    // MARK: Kept for each exercise

    private static let key = "plateBars"

    static func saved(_ exercise: String) -> PlateBar? {
        (UserDefaults.standard.dictionary(forKey: key) as? [String: String])?[exercise].flatMap(PlateBar.init(id:))
    }

    static func save(_ bar: PlateBar, for exercise: String) {
        var all = UserDefaults.standard.dictionary(forKey: key) as? [String: String] ?? [:]
        all[exercise] = bar.id
        UserDefaults.standard.set(all, forKey: key)
    }

    var id: String {
        switch self {
        case .barbell: return "barbell"
        case .womens: return "womens"
        case .ez: return "ez"
        case .trap: return "trap"
        case .smith: return "smith"
        case .none: return "none"
        case .machine: return "machine"
        case .custom(let kg): return "custom:" + GymCoach.kgText(kg)
        }
    }

    init?(id: String) {
        switch id {
        case "barbell": self = .barbell
        case "womens": self = .womens
        case "ez": self = .ez
        case "trap": self = .trap
        case "smith": self = .smith
        case "none": self = .none
        case "machine": self = .machine
        default:
            guard id.hasPrefix("custom:"), let kg = Double(id.dropFirst(7)), kg >= 0 else { return nil }
            self = .custom(kg)
        }
    }
}

/// The set whose weight is loaded on the bar.
struct PlateTarget: Identifiable {
    let id: Int
    let exercise: String
    let title: String
    let kg: Double?
    /// The bar the exercise is done with, unless the athlete chose another.
    let usual: PlateBar
}

/// Tapping the weight of a set done with plates (a bar or a plate-loaded
/// machine): the bar loaded with its weight, a tap on a plate below puts a
/// pair on, a tap on a plate on the bar takes it off. Weights here are in the
/// chosen unit; what comes back is kg.
struct PlateLoaderSheet: View {
    let title: String
    let exercise: String
    let startKg: Double?
    let usual: PlateBar
    let done: (Double) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var bar: PlateBar
    @State private var plates: [Double] = []
    @State private var typing = false
    @State private var typed = ""
    @State private var askingBar = false
    @State private var barTyped = ""
    @FocusState private var focused: Bool

    init(title: String, exercise: String, startKg: Double?, usual: PlateBar, done: @escaping (Double) -> Void) {
        self.title = title
        self.exercise = exercise
        self.startKg = startKg
        self.usual = usual
        self.done = done
        _bar = State(initialValue: PlateBar.saved(exercise) ?? usual)
    }

    private var total: Double { PlateLoad.total(plates, bar: bar.weight) }
    private var sizes: [Double] { PlateLoad.sizes }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Klávesnice") {
                    typed = PlateLoad.text(total)
                    typing = true
                    focused = true
                }
                .font(.subheadline).foregroundStyle(Palette.muted)
                .opacity(typing ? 0 : 1)
                Spacer()
                Text(title).font(Typo.small).foregroundStyle(Palette.muted).lineLimit(1)
                Spacer()
                Button("Hotovo") { finish() }.font(.subheadline.weight(.semibold)).foregroundStyle(Palette.green)
            }
            .padding(.top, 22)
            weight.padding(.top, 10)
            Text(summary).font(Typo.small).foregroundStyle(Palette.muted).padding(.top, 4)
            barView.padding(.top, 14).padding(.horizontal, -24)
            Text("Přidat kotouče").font(Typo.small.weight(.semibold)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 14)
            HStack(spacing: 0) {
                ForEach(sizes, id: \.self) { plate in
                    disc(plate)
                    if plate != sizes.last { Spacer(minLength: 4) }
                }
            }
            .padding(.top, 10)
            barMenu.padding(.top, 18)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .presentationDetents([.height(600)])
        .presentationDragIndicator(.visible)
        .glassSheetBackground()
        .onAppear {
            plates = PlateLoad.plates(for: startKg.map(LiftWeight.shownValue) ?? bar.weight, bar: bar.weight, sizes: sizes)
        }
        .onChange(of: typed) { _, value in
            if typing, let shown = LiftWeight.number(value) { plates = PlateLoad.plates(for: shown, bar: bar.weight, sizes: sizes) }
        }
        .onChange(of: bar) { old, new in
            // A lighter or heavier bar keeps the weight where the plates can.
            plates = PlateLoad.plates(for: PlateLoad.total(plates, bar: old.weight), bar: new.weight, sizes: sizes)
            PlateBar.save(new, for: exercise)
        }
        .alert("Váha tyče", isPresented: $askingBar) {
            TextField(Units.weightUnit, text: $barTyped).keyboardType(.decimalPad)
            Button("Zrušit", role: .cancel) {}
            Button("Uložit") {
                if let kg = LiftWeight.number(LiftWeight.kgText(barTyped)), kg >= 0 { bar = .custom(kg) }
            }
        }
    }

    @ViewBuilder private var weight: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            if typing {
                TextField("–", text: $typed)
                    .keyboardType(.decimalPad)
                    .focused($focused)
                    .multilineTextAlignment(.center)
                    .font(Typo.number(64)).foregroundStyle(Palette.ink)
                    .fixedSize()
            } else {
                Text(PlateLoad.text(total)).font(Typo.number(64)).foregroundStyle(Palette.ink)
                    .contentTransition(.numericText())
            }
            Text(verbatim: Units.weightUnit).font(.title3.weight(.medium)).foregroundStyle(Palette.muted)
        }
        .animation(.snappy, value: total)
    }

    /// "25 + 5 na stranu + tyč 20 kg", "25 + 25 na stranu · stroj se nepočítá".
    private var summary: String {
        let side = plates.map(PlateLoad.text).joined(separator: " + ")
        let barText = PlateLoad.text(bar.weight)
        if plates.isEmpty { return bar.weight > 0 ? L10n.f("Prázdná tyč %@ %@", barText, Units.weightUnit) : L10n.tr("Bez kotoučů") }
        if bar == .machine { return L10n.f("%@ na stranu · stroj se nepočítá", side) }
        return bar.weight > 0 ? L10n.f("%@ na stranu + tyč %@ %@", side, barText, Units.weightUnit) : L10n.f("%@ na stranu", side)
    }

    // MARK: The bar

    private var barView: some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Self.metal)
                .frame(height: 24).padding(.leading, 106).padding(.trailing, 20)
            HStack(spacing: 2) {
                if bar == .machine {
                    Text("Stroj")
                        .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                        .frame(width: 96, height: 120)
                        .background { UnevenRoundedRectangle(cornerRadii: .init(bottomTrailing: 10, topTrailing: 10), style: .continuous).fill(Self.fill(1.25)) }
                        .overlay { UnevenRoundedRectangle(cornerRadii: .init(bottomTrailing: 10, topTrailing: 10), style: .continuous).stroke(Self.line(1.25), lineWidth: 1.5) }
                } else if bar.weight > 0 {
                    Text(verbatim: barMark)
                        .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                        .frame(width: 96, height: 24)
                        .background { UnevenRoundedRectangle(cornerRadii: .init(bottomTrailing: 6, topTrailing: 6), style: .continuous).fill(Self.fill(1.25)) }
                        .overlay { UnevenRoundedRectangle(cornerRadii: .init(bottomTrailing: 6, topTrailing: 6), style: .continuous).stroke(Self.line(1.25), lineWidth: 1.5) }
                } else {
                    Rectangle().fill(Self.metal).frame(width: 96, height: 14)
                }
                RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Self.metal).frame(width: 14, height: 44)
                ForEach(Array(plates.enumerated()), id: \.offset) { offset, plate in
                    Button {
                        withAnimation(.snappy) { _ = plates.remove(at: offset) }
                    } label: {
                        plateShape(plate)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.f("Sundat kotouč %@ %@", PlateLoad.text(plate), Units.weightUnit))
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
        }
        .frame(height: 200)
        .clipped()
    }

    /// "20" on a bar, "EZ 10" on an EZ bar.
    private var barMark: String {
        let value = PlateLoad.text(bar.weight)
        switch bar {
        case .ez: return "EZ " + value
        case .trap: return "Trap " + value
        default: return value
        }
    }

    private func plateShape(_ plate: Double) -> some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        let look = PlateLoad.look(plate)
        return Text(verbatim: PlateLoad.text(plate))
            .font(.system(size: plate >= 10 ? 13 : 12, weight: .semibold)).foregroundStyle(.white)
            .lineLimit(1).minimumScaleFactor(0.6)
            .frame(width: Self.width(look), height: Self.height(look))
            .background(shape.fill(Self.fill(look)))
            .overlay(shape.inset(by: 2).stroke(Color.white.opacity(0.22), lineWidth: 1.5))
            .overlay(shape.stroke(Self.line(look), lineWidth: 1.5))
            .contentShape(shape)
    }

    // MARK: Adding plates

    private func disc(_ plate: Double) -> some View {
        let count = plates.filter { $0 == plate }.count
        let look = PlateLoad.look(plate)
        return Button {
            withAnimation(.snappy) { plates = PlateLoad.adding(plate, to: plates) }
        } label: {
            Text(verbatim: PlateLoad.text(plate))
                .scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 42, height: 42)
                .background { Circle().fill(Self.fill(look)) }
                .overlay { Circle().inset(by: 2).stroke(Color.white.opacity(0.22), lineWidth: 1.5) }
                .overlay { Circle().stroke(Self.line(look), lineWidth: 1.5) }
                .overlay(alignment: .topTrailing) {
                    if count > 0 {
                        Text(verbatim: "×\(count)").scaledFont(10.5, weight: .semibold).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 4).frame(minWidth: 19, minHeight: 19)
                            .background { Capsule().fill(Palette.button) }
                            .offset(x: 6, y: -6)
                    }
                }
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .light), trigger: count)
        .accessibilityLabel(L10n.f("Přidat kotouč %@ %@", PlateLoad.text(plate), Units.weightUnit))
        .accessibilityValue(count > 0 ? L10n.f("%@ na stranu", String(count)) : "")
    }

    /// The bars there are, the machine for a plate-loaded one, and a bar of one's own.
    private var choices: [PlateBar] {
        var list = PlateBar.menu
        if usual == .machine || bar == .machine { list.append(.machine) }
        if case .custom = bar { list.append(bar) }
        return list
    }

    private var barMenu: some View {
        Menu {
            Picker("Tyč", selection: $bar) {
                ForEach(choices, id: \.self) { choice in
                    switch choice {
                    case .none, .machine: Text(choice.name).tag(choice)
                    default: Text(choice.name + " · " + PlateLoad.text(choice.weight) + " " + Units.weightUnit).tag(choice)
                    }
                }
            }
            Button("Jiná váha…") {
                barTyped = bar.weight > 0 ? PlateLoad.text(bar.weight) : ""
                askingBar = true
            }
        } label: {
            HStack(spacing: 5) {
                Text(bar.label)
                Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(Palette.muted)
            }
            .font(Typo.small.weight(.medium)).foregroundStyle(Palette.secondary)
            .padding(.horizontal, 12).frame(height: 32)
            .overlay { Capsule().stroke(Palette.hairline, lineWidth: 1) }
        }
    }

    private func finish() {
        let shown = typing ? typed : PlateLoad.text(total)
        // Back in kg: 225 lb is 102.06 kg, shown again as 225 lb.
        if let kg = LiftWeight.number(LiftWeight.kgText(shown.replacingOccurrences(of: ",", with: "."))) { done(kg) }
        dismiss()
    }

    // MARK: Colours and sizes

    static let metal = Color(light: 0xBDB7AC, dark: 0x5E615F)

    static func fill(_ plate: Double) -> Color {
        switch plate {
        case 25: Color(light: 0xC98A7C, dark: 0xC98A7C)
        case 20: Color(light: 0x7E8DB5, dark: 0x7E8DB5)
        case 15: Color(light: 0xB39A5E, dark: 0xB39A5E)
        case 10: Color(light: 0x8AA58C, dark: 0x8AA58C)
        case 5: Color(light: 0xAEB2B9, dark: 0xAEB2B9)
        case 2.5: Color(light: 0x85817B, dark: 0x85817B)
        default: Color(light: 0xA8A39B, dark: 0xA8A39B)
        }
    }

    /// The outline: darker than the plate in light mode, lit in dark mode.
    static func line(_ plate: Double) -> Color {
        switch plate {
        case 25: Color(light: 0xA86A5C, dark: 0xE2AFA3)
        case 20: Color(light: 0x5F6F98, dark: 0xAAB7DA)
        case 15: Color(light: 0x937A40, dark: 0xD8C08A)
        case 10: Color(light: 0x6A866D, dark: 0xB5CDB6)
        case 5: Color(light: 0x8E939B, dark: 0xD2D5DA)
        case 2.5: Color(light: 0x66625C, dark: 0xAFAAA2)
        default: Color(light: 0x88837B, dark: 0xCBC6BE)
        }
    }

    static func height(_ plate: Double) -> CGFloat {
        let heights: [Double: CGFloat] = [25: 184, 20: 172, 15: 156, 10: 140, 5: 124, 2.5: 106]
        return heights[plate] ?? 92
    }

    static func width(_ plate: Double) -> CGFloat {
        let widths: [Double: CGFloat] = [25: 36, 20: 36, 15: 34, 10: 34, 5: 32, 2.5: 30]
        return widths[plate] ?? 28
    }
}
