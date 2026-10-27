import SwiftUI

/// The plates on each side of a barbell for a weight, and back.
enum PlateLoad {
    static let sizes: [Double] = [25, 20, 15, 10, 5, 2.5, 1.25]
    static let bars: [Double] = [20, 15, 10, 0]
    /// More would not fit on the sleeve.
    static let maxPerSide = 10

    /// Plates per side, heaviest first, for a total weight on a bar: the
    /// heaviest that fit, so a weight the plates can't make exactly loads
    /// what comes nearest below it.
    static func plates(for total: Double, bar: Double) -> [Double] {
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
}

/// The set whose weight is loaded on the bar.
struct PlateTarget: Identifiable {
    let id: Int
    let exercise: String
    let title: String
    let kg: Double?
}

/// Tapping the weight of a barbell set: the bar loaded with its weight, a tap
/// on a plate below puts a pair on, a tap on a plate on the bar takes it off.
struct PlateLoaderSheet: View {
    let title: String
    let startKg: Double?
    let done: (Double) -> Void
    @Environment(\.dismiss) private var dismiss
    @AppStorage("plateBarKg") private var bar = 20.0
    @State private var plates: [Double] = []
    @State private var typing = false
    @State private var typed = ""
    @FocusState private var focused: Bool

    private var total: Double { PlateLoad.total(plates, bar: bar) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Klávesnice") {
                    typed = GymCoach.shown(total)
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
                ForEach(PlateLoad.sizes, id: \.self) { plate in
                    disc(plate)
                    if plate != PlateLoad.sizes.last { Spacer(minLength: 4) }
                }
            }
            .padding(.top, 10)
            barMenu.padding(.top, 18)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .presentationDetents([.height(600)])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.background)
        .onAppear { plates = PlateLoad.plates(for: startKg ?? bar, bar: bar) }
        .onChange(of: typed) { _, value in
            if typing, let kg = LiftWeight.number(value) { plates = PlateLoad.plates(for: kg, bar: bar) }
        }
        .onChange(of: bar) { old, new in
            // A lighter or heavier bar keeps the weight where the plates can.
            plates = PlateLoad.plates(for: PlateLoad.total(plates, bar: old), bar: new)
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
                Text(GymCoach.shown(total)).font(Typo.number(64)).foregroundStyle(Palette.ink)
                    .contentTransition(.numericText())
            }
            Text(verbatim: Units.weightUnit).font(.title3.weight(.medium)).foregroundStyle(Palette.muted)
        }
        .animation(.snappy, value: total)
    }

    /// "25 + 5 na stranu + tyč 20 kg".
    private var summary: String {
        let side = plates.map { GymCoach.shown($0) }.joined(separator: " + ")
        let barText = GymCoach.shown(bar)
        if plates.isEmpty { return bar > 0 ? L10n.f("Prázdná tyč %@ kg", barText) : L10n.tr("Bez kotoučů") }
        return bar > 0 ? L10n.f("%@ na stranu + tyč %@ kg", side, barText) : L10n.f("%@ na stranu", side)
    }

    // MARK: The bar

    private var barView: some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Self.metal)
                .frame(height: 24).padding(.leading, 106).padding(.trailing, 20)
            HStack(spacing: 2) {
                if bar > 0 {
                    Text(verbatim: GymCoach.shown(bar))
                        .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                        .frame(width: 96, height: 24)
                        .background(UnevenRoundedRectangle(cornerRadii: .init(bottomTrailing: 6, topTrailing: 6), style: .continuous).fill(Self.fill(1.25)))
                        .overlay(UnevenRoundedRectangle(cornerRadii: .init(bottomTrailing: 6, topTrailing: 6), style: .continuous).stroke(Self.line(1.25), lineWidth: 1.5))
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
                    .accessibilityLabel(L10n.f("Sundat kotouč %@ kg", GymCoach.shown(plate)))
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
        }
        .frame(height: 200)
        .clipped()
    }

    private func plateShape(_ plate: Double) -> some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        return Text(verbatim: GymCoach.shown(plate))
            .font(.system(size: plate >= 10 ? 13 : 12, weight: .semibold)).foregroundStyle(.white)
            .lineLimit(1).minimumScaleFactor(0.6)
            .frame(width: Self.width(plate), height: Self.height(plate))
            .background(shape.fill(Self.fill(plate)))
            .overlay(shape.inset(by: 2).stroke(Color.white.opacity(0.22), lineWidth: 1.5))
            .overlay(shape.stroke(Self.line(plate), lineWidth: 1.5))
            .contentShape(shape)
    }

    // MARK: Adding plates

    private func disc(_ plate: Double) -> some View {
        let count = plates.filter { $0 == plate }.count
        return Button {
            withAnimation(.snappy) { plates = PlateLoad.adding(plate, to: plates) }
        } label: {
            Text(verbatim: GymCoach.shown(plate))
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 42, height: 42)
                .background(Circle().fill(Self.fill(plate)))
                .overlay(Circle().inset(by: 2).stroke(Color.white.opacity(0.22), lineWidth: 1.5))
                .overlay(Circle().stroke(Self.line(plate), lineWidth: 1.5))
                .overlay(alignment: .topTrailing) {
                    if count > 0 {
                        Text(verbatim: "×\(count)").font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 4).frame(minWidth: 19, minHeight: 19)
                            .background(Capsule().fill(Palette.button))
                            .offset(x: 6, y: -6)
                    }
                }
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .light), trigger: count)
        .accessibilityLabel(L10n.f("Přidat kotouč %@ kg", GymCoach.shown(plate)))
        .accessibilityValue(count > 0 ? L10n.f("%@ na stranu", String(count)) : "")
    }

    private var barMenu: some View {
        Menu {
            Picker("Tyč", selection: $bar) {
                ForEach(PlateLoad.bars, id: \.self) { value in
                    Text(value > 0 ? L10n.f("Tyč %@ kg", GymCoach.shown(value)) : L10n.tr("Bez tyče")).tag(value)
                }
            }
        } label: {
            HStack(spacing: 5) {
                Text(bar > 0 ? L10n.f("Tyč %@ kg", GymCoach.shown(bar)) : L10n.tr("Bez tyče"))
                Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).foregroundStyle(Palette.muted)
            }
            .font(Typo.small.weight(.medium)).foregroundStyle(Palette.secondary)
            .padding(.horizontal, 12).frame(height: 32)
            .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
        }
    }

    private func finish() {
        if typing, let kg = LiftWeight.number(LiftWeight.kgText(typed)) {
            done(kg)
        } else {
            done(total)
        }
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
