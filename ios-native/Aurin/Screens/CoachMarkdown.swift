import SwiftUI

/// The coach's answer as the web shows it: headings, lists, numbered steps,
/// tables, bold and links, in the system font (SF Pro) so long answers read
/// easily. Text is never a format string: "80 %" stays as it is.
struct CoachMarkdown: View, Equatable {
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
        /// The number the list starts at (the model's own, "3." stays 3) and its items.
        case numbered(Int, [String])
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
        case .numbered(let start, let items):
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(start + i).").font(.body.weight(.semibold).monospacedDigit()).foregroundStyle(Palette.green)
                        Text(Self.inline(item)).font(.body).foregroundStyle(Palette.ink).lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .table(let rows):
            ScrollView(.horizontal) {
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
            .scrollIndicators(.hidden)
            .background(Palette.track.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        case .rule:
            Rectangle().fill(Palette.hairline).frame(height: 1)
        }
    }

    /// **bold**, *italic*, `code` and links; plain text when it is not markdown.
    /// Only a link to aurin.health stays tappable: an answer that picked up a
    /// link from somewhere else shows its words without it.
    static func inline(_ text: String) -> AttributedString {
        var out = (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
        let foreign = out.runs.compactMap { run in run.link.flatMap { allowedLink($0) ? nil : run.range } }
        for range in foreign { out[range].link = nil }
        return out
    }

    /// The answer as plain text for "Kopírovat": no #, ** or | marks, a list
    /// item per line with its bullet or number.
    static func plainText(_ text: String) -> String {
        let plain: (String) -> String = { String(inline($0).characters) }
        return blocks(text).compactMap { block -> String? in
            switch block {
            case .heading(_, let t), .paragraph(let t): return plain(t)
            case .bullets(let items): return items.map { "• " + plain($0) }.joined(separator: "\n")
            case .numbered(let start, let items): return items.enumerated().map { "\(start + $0.offset). " + plain($0.element) }.joined(separator: "\n")
            case .table(let rows): return rows.map { $0.map(plain).joined(separator: "\t") }.joined(separator: "\n")
            case .rule: return nil
            }
        }
        .joined(separator: "\n\n")
    }

    /// https on aurin.health, the hosts of the app's own links.
    static func allowedLink(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && AppRoute.linkHosts.contains(url.host()?.lowercased() ?? "")
    }

    /// Lines kept as the coach wrote them (a week of "Po: …", "Út: …" stays
    /// a line a day). A blank line between the items of a list keeps the list
    /// ("1. … ⏎⏎ 2. …" counts on), and an indented line under an item belongs
    /// to that item.
    static func blocks(_ text: String) -> [Block] {
        var out: [Block] = []
        var paragraph: [String] = []
        var bullets: [String] = []
        var numbered: [String] = []
        var start = 1
        var table: [[String]] = []
        /// How far the open list's items are indented: a line indented more is part of the last item.
        var listIndent = 0
        /// A blank line after a list item: the list goes on only with another item of it.
        var gap = false

        func flush() {
            if !paragraph.isEmpty { out.append(.paragraph(paragraph.joined(separator: "\n"))); paragraph = [] }
            if !bullets.isEmpty { out.append(.bullets(bullets)); bullets = [] }
            if !numbered.isEmpty { out.append(.numbered(start, numbered)); numbered = [] }
            if !table.isEmpty { out.append(.table(table)); table = [] }
            gap = false
        }

        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            let inList = !bullets.isEmpty || !numbered.isEmpty
            if line.isEmpty {
                if inList { gap = true } else { flush() }
                continue
            }
            let indent = Self.indent(raw)
            if inList, indent > listIndent, !line.hasPrefix("|") {
                let more = "\n" + (bullet(line).map { "• " + $0 } ?? line)
                if !bullets.isEmpty { bullets[bullets.count - 1] += more } else { numbered[numbered.count - 1] += more }
                gap = false
                continue
            }
            if gap {
                let goesOn = (!bullets.isEmpty && bullet(line) != nil) || (!numbered.isEmpty && number(line) != nil)
                if goesOn { gap = false } else { flush() }
            }
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
                if bullets.isEmpty { flush(); listIndent = indent }
                bullets.append(item)
                continue
            }
            if let item = number(line) {
                if numbered.isEmpty { flush(); start = item.n; listIndent = indent }
                numbered.append(item.text)
                continue
            }
            if !bullets.isEmpty || !numbered.isEmpty || !table.isEmpty { flush() }
            paragraph.append(line)
        }
        flush()
        return out
    }

    /// Spaces before the line, a tab as four.
    private static func indent(_ raw: String) -> Int {
        raw.prefix { $0 == " " || $0 == "\t" }.reduce(0) { $0 + ($1 == "\t" ? 4 : 1) }
    }

    private static func heading(_ line: String) -> Int? {
        let hashes = line.prefix { $0 == "#" }.count
        guard hashes > 0, hashes <= 4, line.dropFirst(hashes).first == " " else { return nil }
        return hashes
    }

    private static func bullet(_ line: String) -> String? {
        for marker in ["- ", "* ", "+ ", "• ", "– "] where line.hasPrefix(marker) {
            return String(line.dropFirst(marker.count))
        }
        return nil
    }

    /// "3. Vyjetí" → (3, "Vyjetí").
    private static func number(_ line: String) -> (n: Int, text: String)? {
        let digits = line.prefix { $0.isASCII && $0.isNumber }
        guard !digits.isEmpty, digits.count <= 2, let n = Int(digits) else { return nil }
        let rest = line.dropFirst(digits.count)
        guard rest.hasPrefix(". ") || rest.hasPrefix(") ") else { return nil }
        return (n, String(rest.dropFirst(2)))
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
                if let t = model.today { FoodWidget(nutrition: t.nutrition, waterFailed: t.unavailable?.contains("fluids") == true, foodFailed: t.unavailable?.contains("food") == true) } else { loading }
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
