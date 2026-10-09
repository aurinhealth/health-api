import SwiftUI

/// The coach's answer as the web shows it: headings, lists, numbered steps,
/// tables, bold and links, in the system font (SF Pro) so long answers read
/// easily. Text is never a format string: "80 %" stays as it is.
struct CoachMarkdown: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(Self.blocks(text).enumerated()), id: \.offset) { _, block in
                view(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    enum Block: Equatable {
        case heading(Int, String)
        case paragraph(String)
        case bullets([String])
        case numbered([String])
        case table([[String]])
        case rule
    }

    @ViewBuilder
    private func view(_ block: Block) -> some View {
        switch block {
        case .heading(let level, let t):
            Text(Self.inline(t))
                .font(level <= 1 ? .title3.weight(.semibold) : level == 2 ? .headline : .subheadline.weight(.semibold))
                .foregroundStyle(Palette.ink)
                .padding(.top, 4)
        case .paragraph(let t):
            Text(Self.inline(t)).font(.body).foregroundStyle(Palette.ink).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        case .bullets(let items):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 9) {
                        Circle().fill(Palette.green).frame(width: 5, height: 5).offset(y: -3)
                        Text(Self.inline(item)).font(.body).foregroundStyle(Palette.ink).lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .numbered(let items):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(i + 1).").font(.body.weight(.semibold).monospacedDigit()).foregroundStyle(Palette.green)
                        Text(Self.inline(item)).font(.body).foregroundStyle(Palette.ink).lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .table(let rows):
            ScrollView(.horizontal, showsIndicators: false) {
                Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 6) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                        GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                Text(Self.inline(cell))
                                    .font(r == 0 ? .footnote.weight(.semibold) : .footnote)
                                    .foregroundStyle(r == 0 ? Palette.muted : Palette.ink)
                            }
                        }
                        if r == 0 { Divider().gridCellUnsizedAxes(.horizontal) }
                    }
                }
                .padding(10)
            }
            .background(Palette.track.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        case .rule:
            Rectangle().fill(Palette.hairline).frame(height: 1)
        }
    }

    /// **bold**, *italic*, `code` and links; plain text when it is not markdown.
    static func inline(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }

    static func blocks(_ text: String) -> [Block] {
        var out: [Block] = []
        var paragraph: [String] = []
        var bullets: [String] = []
        var numbered: [String] = []
        var table: [[String]] = []

        func flush() {
            if !paragraph.isEmpty { out.append(.paragraph(paragraph.joined(separator: " "))); paragraph = [] }
            if !bullets.isEmpty { out.append(.bullets(bullets)); bullets = [] }
            if !numbered.isEmpty { out.append(.numbered(numbered)); numbered = [] }
            if !table.isEmpty { out.append(.table(table)); table = [] }
        }

        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { flush(); continue }
            if line.hasPrefix("|") {
                let cells = line.trimmingCharacters(in: CharacterSet(charactersIn: "|")).components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
                if cells.allSatisfy({ !$0.isEmpty && $0.allSatisfy { "-:".contains($0) } }) { continue }
                if table.isEmpty { flush() }
                table.append(cells)
                continue
            }
            if let level = heading(line) {
                flush()
                out.append(.heading(level, String(line.drop { $0 == "#" }).trimmingCharacters(in: .whitespaces)))
                continue
            }
            if line == "---" || line == "***" { flush(); out.append(.rule); continue }
            if let item = bullet(line) {
                if bullets.isEmpty { flush() }
                bullets.append(item)
                continue
            }
            if let item = number(line) {
                if numbered.isEmpty { flush() }
                numbered.append(item)
                continue
            }
            if !bullets.isEmpty || !numbered.isEmpty || !table.isEmpty { flush() }
            paragraph.append(line)
        }
        flush()
        return out
    }

    private static func heading(_ line: String) -> Int? {
        let hashes = line.prefix { $0 == "#" }.count
        guard hashes > 0, hashes <= 4, line.dropFirst(hashes).first == " " else { return nil }
        return hashes
    }

    private static func bullet(_ line: String) -> String? {
        for marker in ["- ", "* ", "• ", "– "] where line.hasPrefix(marker) {
            return String(line.dropFirst(marker.count))
        }
        return nil
    }

    private static func number(_ line: String) -> String? {
        let digits = line.prefix { $0.isNumber }
        guard !digits.isEmpty, digits.count <= 2 else { return nil }
        let rest = line.dropFirst(digits.count)
        guard rest.hasPrefix(". ") || rest.hasPrefix(") ") else { return nil }
        return String(rest.dropFirst(2))
    }
}

/// A picture under the coach's answer, drawn from the app's own data (the
/// same widgets as on the screens); a tap opens the screen.
struct CoachVisual: View {
    @Environment(AppModel.self) private var model
    let kind: String

    var body: some View {
        Group {
            switch kind {
            case "sleep":
                if let h = model.health { SleepWidget(sleep: h.sleep) } else { loading }
            case "recovery":
                if let h = model.health, let hrv = h.hrv { HRVWideWidget(hrv: hrv, restingHR: h.restingHR?.value) } else if model.health == nil { loading }
            case "form":
                if let f = model.training?.form { FormWidget(form: f) } else if model.training == nil { loading }
            case "nutrition":
                if let t = model.today { FoodWidget(nutrition: t.nutrition) } else { loading }
            case "week":
                if let t = model.training {
                    Card {
                        WidgetHeader(title: "Zátěž v týdnu", color: Palette.amberBar)
                        WeekStrainBars(days: t.days)
                    }
                } else { loading }
            case "training":
                if let t = model.training { ThisWeekWidget(week: t.thisWeek, loads: t.load.weeks) } else { loading }
            case "zones":
                if let z = model.training?.zones { ZonesWidget(zones: z) } else if model.training == nil { loading }
            default:
                EmptyView()
            }
        }
    }

    private var loading: some View {
        Card { ProgressView().frame(maxWidth: .infinity) }
            .task {
                switch kind {
                case "sleep", "recovery": await model.refreshHealth()
                case "nutrition": await model.refresh()
                default: await model.refreshTraining()
                }
            }
    }
}
