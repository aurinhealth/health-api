import SwiftUI

/// How much: a field to type the amount with a menu of units above a wheel of
/// whole number, fraction and unit. Units are grams/ml, the food's serving and
/// the whole package; a serving stored as "1 g" does not count (FoodProduct.usableServing).
struct PortionWheel: View {
    let product: FoodProduct
    /// The amount in the food's unit (grams, ml, or portions for a per-portion food).
    @Binding var amount: Double
    /// Set to the unit the wheel shows, so the add button names the amount the same way.
    var kind: Binding<Kind>? = nil

    @State private var unit = 0
    @State private var typed = ""
    @State private var ready = false
    @FocusState private var typing: Bool

    static let fractions: [(label: String, value: Double)] = [
        ("¼", 0.25), ("⅓", 1.0 / 3), ("½", 0.5), ("⅔", 2.0 / 3), ("¾", 0.75), ("1", 1), ("1¼", 1.25), ("1⅓", 4.0 / 3), ("1½", 1.5),
        ("1¾", 1.75), ("2", 2), ("2½", 2.5), ("3", 3), ("3½", 3.5), ("4", 4), ("5", 5), ("6", 6), ("8", 8), ("10", 10)
    ]
    /// The wheel's middle column.
    static let parts: [(label: String, value: Double)] = [("–", 0), ("¼", 0.25), ("⅓", 1.0 / 3), ("½", 0.5), ("⅔", 2.0 / 3), ("¾", 0.75)]
    static let maxGrams = 2000.0

    enum Kind { case base, serving, package }

    struct Unit {
        let name: String
        var kind: Kind = .base
        let size: Double
        /// The highest whole number on the wheel.
        let most: Int
    }

    /// Grams (or ml), one serving, the package; "porce" alone for a per-portion food.
    private var units: [Unit] {
        if product.perPortion { return [Unit(name: L10n.tr("porce"), kind: .serving, size: 1, most: 20)] }
        func counted(_ name: String, _ size: Double, _ kind: Kind) -> Unit {
            Unit(name: name + " (" + Self.plain(size) + " " + product.unit + ")", kind: kind, size: size, most: min(100, max(10, Int(Self.maxGrams / size))))
        }
        var list = [Unit(name: product.unit, size: 1, most: Int(Self.maxGrams))]
        let serving = product.usableServing
        if let serving { list.append(counted(product.servingName, serving, .serving)) }
        if let q = FoodProduct.size(product.quantity, unit: product.unit), q != serving { list.append(counted(L10n.tr("balení"), q, .package)) }
        return list
    }

    private var current: Unit { units[min(unit, units.count - 1)] }
    /// The amount counted in the chosen unit.
    private var value: Double { amount / current.size }
    private var whole: Int { min(current.most, Int((value + 0.001).rounded(.down))) }
    private var rest: Double { max(0, value - Double(whole)) }
    private var part: Int {
        Self.parts.indices.min { abs(Self.parts[$0].value - rest) < abs(Self.parts[$1].value - rest) } ?? 0
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 0) {
                TextField("0", text: field)
                    .keyboardType(units.count == 1 || unit > 0 ? .decimalPad : .numberPad)
                    .multilineTextAlignment(.trailing)
                    .font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                    .focused($typing)
                    .padding(.trailing, 14)
                    .frame(width: 120)
                Rectangle().fill(Palette.card).frame(width: 2)
                Menu {
                    Picker("Jednotka", selection: unitChoice) {
                        ForEach(units.indices, id: \.self) { Text(verbatim: units[$0].name).tag($0) }
                    }
                } label: {
                    HStack {
                        Text(verbatim: current.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.down").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.muted)
                    }
                    .padding(.horizontal, 16).frame(maxHeight: .infinity).contentShape(Rectangle())
                }
                .disabled(units.count == 1)
            }
            .frame(height: 50)
            .background(Palette.track, in: Capsule())
            .overlay { Capsule().stroke(Palette.amber, lineWidth: typing ? 1.5 : 0) }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Hotovo") { typing = false }.fontWeight(.semibold)
                }
            }

            HStack(spacing: 0) {
                column(selection: wholeChoice, values: Array(0...current.most), width: 90) { String($0) }
                    .id(current.most)
                column(selection: partChoice, values: Array(Self.parts.indices), width: 56) { Self.parts[$0].label }
                column(selection: unitChoice, values: Array(units.indices), width: nil) { units[$0].name }
            }
        }
        .onAppear(perform: start)
        .onChange(of: typing) { if typing { typed = amount > 0 ? Self.plain(value) : "" } }
    }

    /// One column of the wheel; one without a width takes the rest of the row.
    private func column(selection: Binding<Int>, values: [Int], width: CGFloat?, label: @escaping (Int) -> String) -> some View {
        Picker("Množství", selection: selection) {
            ForEach(values, id: \.self) { Text(verbatim: label($0)).font(.title3.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7).tag($0) }
        }
        .pickerStyle(.wheel)
        .frame(minWidth: 0, maxWidth: width ?? .infinity)
        .frame(height: 140)
        .clipped()
        .contentShape(Rectangle())
    }

    /// While typing, what was typed; else the amount: "249", "1½" or "0,4".
    private var field: Binding<String> {
        Binding(get: { typing ? typed : display }, set: { text in
            typed = text
            if let v = FoodAmountView.number(text) { amount = min(v, Double(current.most)) * current.size }
        })
    }

    private var display: String {
        if unit == 0 && !product.perPortion { return Self.plain(value) }
        if abs(Self.parts[part].value - rest) < 0.01 {
            if part == 0 { return String(whole) }
            return (whole > 0 ? String(whole) : "") + Self.parts[part].label
        }
        return Self.plain(value)
    }

    private var wholeChoice: Binding<Int> {
        Binding(get: { whole }, set: { typing = false; amount = (Double($0) + rest) * current.size })
    }

    private var partChoice: Binding<Int> {
        Binding(get: { part }, set: { typing = false; amount = (Double(whole) + Self.parts[$0].value) * current.size })
    }

    /// Another unit keeps about the same amount: whole grams, or the nearest fraction.
    private var unitChoice: Binding<Int> {
        Binding(get: { min(unit, units.count - 1) }, set: { index in
            let size = units[index].size, count = amount / size
            typing = false
            unit = index
            kind?.wrappedValue = units[index].kind
            if index == 0 && !product.perPortion {
                amount = max(1, count.rounded())
            } else {
                let w = count.rounded(.down)
                let near = Self.parts.map { w + $0.value } + [w + 1]
                let pick = near.min { abs($0 - count) < abs($1 - count) } ?? count
                amount = max(0.25, min(pick, Double(units[index].most))) * size
            }
        })
    }

    /// 1500 → "1500", 0.4 → "0,4": no thousands separator, so the field reads it back.
    static func plain(_ value: Double) -> String {
        value.formatted(.number.grouping(.never).precision(.fractionLength(0...1)).locale(L10n.locale))
    }

    /// "1⅓ porce", "1 sušenka", "2 × sušenka", "½ balení" or "19 g", for the add button.
    /// Named in the unit the wheel shows: ½ package stays "½ balení", not "3½ porce".
    var label: String { Self.label(product: product, amount: amount, kind: current.kind) }

    static func label(product: FoodProduct, amount: Double, kind: Kind? = nil) -> String {
        if kind == .base && !product.perPortion { return String(Int(amount.rounded())) + " " + product.unit }
        if kind == .package, let q = FoodProduct.size(product.quantity, unit: product.unit),
           let f = fractions.first(where: { abs($0.value * q - amount) < 0.01 }) {
            return f.label + " " + L10n.tr("balení")
        }
        let size = product.perPortion ? 1 : product.usableServing
        if let size, let f = fractions.first(where: { abs($0.value * size - amount) < 0.01 }) {
            let name = product.servingName
            if product.serving_name == nil || f.value == 1 { return f.label + " " + name }
            return f.label + " × " + name
        }
        if product.perPortion { return L10n.f("%@ porce", Fmt.decimal(amount, digits: 2)) }
        if let q = FoodProduct.size(product.quantity, unit: product.unit),
           let f = fractions.first(where: { abs($0.value * q - amount) < 0.01 }) {
            return L10n.f("%@ balení", f.label)
        }
        return String(Int(amount.rounded())) + " " + product.unit
    }

    /// Opens on a serving or package when the amount is a fraction of one, else on grams.
    private func start() {
        guard !ready else { return }
        ready = true
        amount = min(amount, Self.maxGrams)
        unit = units.indices.dropFirst().first { i in
            let count = amount / units[i].size
            return count <= Double(units[i].most) && Self.fractions.contains { abs($0.value - count) < 0.01 }
        } ?? 0
        kind?.wrappedValue = current.kind
    }
}
