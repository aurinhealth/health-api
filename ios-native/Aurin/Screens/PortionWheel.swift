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

            // One wheel of three columns with one shared band, as the concept
            // draws it (02-jidlo, food detail): number, fraction, unit.
            WheelColumns(columns: [
                .init(rows: (0...current.most).map(String.init), width: 90, selection: wholeChoice),
                // Grams take whole numbers only: no fraction of a gram.
                .init(rows: current.kind == .base && !product.perPortion ? ["–"] : Self.parts.map(\.label), width: 56, selection: partChoice),
                .init(rows: units.map(\.name), width: nil, selection: unitChoice),
            ])
            .frame(height: 160)
        }
        .onAppear(perform: start)
        .onChange(of: typing) { if typing { typed = amount > 0 ? Self.plain(value) : "" } }
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

    /// Another unit keeps about the same amount: whole grams, or the nearest fraction;
    /// less than one serving or package becomes one, so picking "balení" never shows 0 ¼.
    private var unitChoice: Binding<Int> {
        Binding(get: { min(unit, units.count - 1) }, set: { index in
            typing = false
            unit = index
            kind?.wrappedValue = units[index].kind
            amount = Self.amount(amount, switchedTo: units[index])
        })
    }

    static func amount(_ amount: Double, switchedTo unit: Unit) -> Double {
        if unit.kind == .base { return max(1, amount.rounded()) }
        let count = amount / unit.size
        if count < 1 { return unit.size }
        let w = count.rounded(.down)
        let near = parts.map { w + $0.value } + [w + 1]
        let pick = near.min { abs($0 - count) < abs($1 - count) } ?? count
        return min(pick, Double(unit.most)) * unit.size
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

    /// Opens on grams, as the concept shows the amount (02-jidlo, food detail);
    /// on a serving or package only when the amount is a whole number of them
    /// ("1 can"), so 25 g never opens as "¼ serving (100 g)".
    private func start() {
        guard !ready else { return }
        ready = true
        amount = min(amount, Self.maxGrams)
        unit = units.indices.dropFirst().first { i in
            let count = amount / units[i].size
            return count >= 1 && count <= Double(units[i].most) && abs(count - count.rounded()) < 0.01
        } ?? 0
        kind?.wrappedValue = current.kind
    }
}

/// A UIKit wheel of several columns: one selection band across all of them,
/// which separate SwiftUI wheel pickers can't share. A column without a width
/// takes the rest of the row.
struct WheelColumns: UIViewRepresentable {
    struct Column {
        let rows: [String]
        let width: CGFloat?
        let selection: Binding<Int>
    }

    let columns: [Column]

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIPickerView {
        let picker = Wheel()
        picker.dataSource = context.coordinator
        picker.delegate = context.coordinator
        picker.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        picker.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return picker
    }

    /// The last column's width comes from the row's: asked again when it changes.
    final class Wheel: UIPickerView {
        private var laidOutWidth: CGFloat = 0
        override func layoutSubviews() {
            super.layoutSubviews()
            guard bounds.width != laidOutWidth else { return }
            laidOutWidth = bounds.width
            reloadAllComponents()
        }
    }

    func updateUIView(_ picker: UIPickerView, context: Context) {
        let coordinator = context.coordinator
        let rows = columns.map(\.rows)
        let widths = columns.map(\.width)
        coordinator.columns = columns
        if coordinator.rows != rows || coordinator.widths != widths {
            coordinator.rows = rows
            coordinator.widths = widths
            picker.reloadAllComponents()
        }
        for (i, column) in columns.enumerated() where !column.rows.isEmpty {
            let row = min(max(column.selection.wrappedValue, 0), column.rows.count - 1)
            if picker.selectedRow(inComponent: i) != row { picker.selectRow(row, inComponent: i, animated: false) }
        }
    }

    final class Coordinator: NSObject, UIPickerViewDataSource, UIPickerViewAccessibilityDelegate {
        var columns: [Column] = []
        var rows: [[String]] = []
        var widths: [CGFloat?] = []

        func numberOfComponents(in pickerView: UIPickerView) -> Int { rows.count }
        func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int { rows[component].count }
        func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat {
            UIFont.preferredFont(forTextStyle: .title3).lineHeight + 14
        }

        func pickerView(_ pickerView: UIPickerView, widthForComponent component: Int) -> CGFloat {
            if let width = widths[component] { return width }
            let fixed = widths.compactMap { $0 }.reduce(0, +)
            return max(60, pickerView.bounds.width - fixed - 16)
        }

        func pickerView(_ pickerView: UIPickerView, viewForRow row: Int, forComponent component: Int, reusing view: UIView?) -> UIView {
            let label = (view as? UILabel) ?? UILabel()
            let size = UIFont.preferredFont(forTextStyle: .title3).pointSize
            label.font = .systemFont(ofSize: size, weight: .semibold)
            label.textColor = UIColor(Palette.ink)
            label.adjustsFontSizeToFitWidth = true
            label.minimumScaleFactor = 0.7
            label.textAlignment = widths[component] == nil ? .left : .center
            label.text = rows[component][row]
            label.accessibilityLabel = label.text == "–" ? L10n.tr("žádný zlomek") : nil
            return label
        }

        func pickerView(_ pickerView: UIPickerView, accessibilityLabelForComponent component: Int) -> String? {
            L10n.tr(["Celé", "Zlomek", "Jednotka"][min(component, 2)])
        }

        func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
            guard component < columns.count else { return }
            columns[component].selection.wrappedValue = row
        }
    }
}
