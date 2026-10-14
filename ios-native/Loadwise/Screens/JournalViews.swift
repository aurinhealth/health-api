import SwiftUI

// Deník, the habit journal (src/routes-journal.js): the Today card with the
// morning questions about yesterday, "Nový objev", the journal of a day with
// its week, ✕ / ✓ answers and inline follow-ups, and the amount/time sheet.
// Item names and values come from the server in the app's language.

// MARK: - Shared pieces

enum JournalStyle {
    /// Each category's colour (the catalogue's tabs and the journal's sections).
    static func color(_ category: String?) -> Color {
        switch category {
        case "sleep": return Palette.indigo
        case "food": return Palette.amber
        case "recovery": return Palette.blue
        case "health": return Palette.rust
        case "meds": return Palette.pink
        default: return Palette.brown
        }
    }

    /// "HH:mm" of a picked time.
    static func clock(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    /// Follow-up values as a JSON object for the request body.
    static func json(_ values: [String: Double]) -> JSONValue {
        var out: [String: JSONValue] = [:]
        for (key, value) in values { out[key] = .number(value) }
        return .object(out)
    }

    /// Today at "HH:MM", for the time pickers.
    static func date(from clock: String?) -> Date? {
        guard let clock, clock.count == 5, let h = Int(clock.prefix(2)), let m = Int(clock.suffix(2)) else { return nil }
        return Calendar.current.date(bySettingHour: h, minute: m, second: 0, of: Date())
    }

    /// "úterý", "Tuesday": the journal day's weekday on its own.
    static func weekday(_ isoDate: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: isoDate) else { return isoDate }
        let out = DateFormatter()
        out.locale = Fmt.locale
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = "cccc"
        return out.string(from: date)
    }
}

/// An item's symbol on a soft circle of its category's colour.
struct JournalIcon: View {
    let symbol: String
    let color: Color
    var size: CGFloat = 32

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.45, weight: .medium))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.18), in: Circle())
            .accessibilityHidden(true)
    }
}

/// A face for the mood: 1 a frown … 5 a broad smile.
private struct MoodMouth: Shape {
    let level: Int

    func path(in rect: CGRect) -> Path {
        let bends: [CGFloat] = [-0.2, -0.1, 0, 0.1, 0.2]
        let bend = bends[min(max(level - 1, 0), 4)]
        let y = rect.height * 0.64
        var p = Path()
        p.move(to: CGPoint(x: rect.width * 0.33, y: y))
        p.addQuadCurve(to: CGPoint(x: rect.width * 0.67, y: y), control: CGPoint(x: rect.midX, y: y + rect.height * bend))
        return p
    }
}

private struct MoodEyes: Shape {
    func path(in rect: CGRect) -> Path {
        let r = rect.width * 0.05
        var p = Path()
        p.addEllipse(in: CGRect(x: rect.width * 0.37 - r, y: rect.height * 0.42 - r, width: 2 * r, height: 2 * r))
        p.addEllipse(in: CGRect(x: rect.width * 0.63 - r, y: rect.height * 0.42 - r, width: 2 * r, height: 2 * r))
        return p
    }
}

struct MoodFace: View {
    let level: Int
    let color: Color

    var body: some View {
        ZStack {
            Circle().stroke(color, lineWidth: 1.8)
            MoodEyes().fill(color)
            MoodMouth(level: level).stroke(color, style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
        }
        .frame(width: 28, height: 28)
    }
}

/// "Jak se cítíš?": five faces, one chosen; a second tap clears it.
struct MoodPicker: View {
    let mood: Int?
    var disabled = false
    let choose: (Int?) -> Void

    private static let labels = ["Hodně špatně", "Špatně", "Normálně", "Dobře", "Výborně"]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(1...5, id: \.self) { level in
                let on = mood == level
                Button { choose(on ? nil : level) } label: {
                    MoodFace(level: level, color: on ? Palette.onButton : Palette.secondary)
                        .frame(width: 52, height: 52)
                        .background(on ? Palette.button : Palette.track, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(L10n.tr(Self.labels[level - 1]))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// ✕ and ✓ side by side; the chosen one coloured. Tapping it again clears
/// the answer (unanswered is not ✕).
struct YesNoToggle: View {
    let answer: Int?
    let choose: (Int?) -> Void

    var body: some View {
        HStack(spacing: 3) {
            button(0, symbol: "xmark", color: Palette.rust, fill: Palette.rust.opacity(0.2), label: "Ne")
            button(1, symbol: "checkmark", color: Palette.green, fill: Palette.greenSoft, label: "Ano")
        }
        .padding(3)
        .background(Palette.track, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func button(_ value: Int, symbol: String, color: Color, fill: Color, label: String) -> some View {
        let on = answer == value
        return Button { choose(on ? nil : value) } label: {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(on ? color : Palette.faint)
                .frame(width: 36, height: 30)
                .background(on ? fill : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: - Today

/// On Today: "Nový objev" once, and in the morning the questions about
/// yesterday, most of them already filled in from the day's data.
struct JournalTodayCard: View {
    @Environment(AppModel.self) private var model
    @State private var data: JournalToday?
    @State private var mood: Int?
    @State private var busy = false

    var body: some View {
        VStack(spacing: 12) {
            if let discovery = data?.discovery { discoveryCard(discovery) }
            if let card = data?.card { journalCard(card) }
        }
        .padding(.top, data?.card != nil || data?.discovery != nil ? 12 : 0)
        .task { await load() }
    }

    private func load() async {
        if model.demo {
            data = DemoJournal.today
        } else if let fresh = try? await model.api.journalToday() {
            data = fresh
        }
        mood = data?.card?.mood.map { Int($0) }
    }

    private func discoveryCard(_ d: JournalDiscovery) -> some View {
        Card {
            WidgetHeader(title: "Nový objev", color: Palette.green)
            HStack(spacing: 14) {
                JournalIcon(symbol: d.icon, color: d.effect < 0 ? Palette.rust : Palette.green, size: 48)
                Text(verbatim: d.text).font(Typo.sentence(20)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 10) {
                PrimaryButton(title: L10n.tr("Ukázat")) {
                    Task {
                        await seen()
                        model.push(.journalItem(d.key, d.metric))
                    }
                }
                SecondaryButton(title: "Zavřít") { Task { await seen() } }
            }
        }
    }

    private func journalCard(_ card: JournalCard) -> some View {
        Card {
            HStack(spacing: 7) {
                Circle().fill(Palette.indigo).frame(width: 8, height: 8)
                Text(verbatim: L10n.tr("Deník") + " · " + (card.isToday ? L10n.tr("dnes") : JournalStyle.weekday(card.date)))
                    .font(Typo.bodyStrong).foregroundStyle(Palette.secondary).lineLimit(1)
                Spacer(minLength: 4)
                Text(verbatim: L10n.f("%@ z %@", String(card.answered), String(card.total)))
                    .font(Typo.caption).foregroundStyle(Palette.faint)
                Button { Task { await dismissCard(card) } } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                        .frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.tr("Dnes už neukazovat"))
            }
            Text("Jak se cítíš?").font(Typo.sentence(21)).foregroundStyle(Palette.ink)
            MoodPicker(mood: mood, disabled: busy) { level in Task { await setMood(card, level) } }
            VStack(spacing: 0) {
                ForEach(Array(card.rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    Button { model.push(.journal(card.date)) } label: {
                        HStack(spacing: 12) {
                            JournalIcon(symbol: row.icon, color: JournalStyle.color(row.category))
                            Text(verbatim: row.name).font(.body).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text(verbatim: row.value).font(.subheadline.weight(.medium)).foregroundStyle(Palette.secondary).lineLimit(1)
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                        }
                        .frame(minHeight: 50)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if card.open > 0 {
                PrimaryButton(title: L10n.f("Doplnit %@", String(card.open) + " " + Fmt.plural(card.open, "otázku", "otázky", "otázek"))) {
                    model.push(.journal(card.date))
                }
            }
        }
    }

    private func setMood(_ card: JournalCard, _ level: Int?) async {
        mood = level
        guard !model.demo else { return }
        busy = true
        defer { busy = false }
        var body: JSONObject = ["date": .string(card.date), "key": .string("mood")]
        if let level { body["amount"] = .number(Double(level)) } else { body["answer"] = JSONValue.null }
        _ = try? await model.api.saveJournalEntry(body)
        await load()
    }

    private func dismissCard(_ card: JournalCard) async {
        data?.card = nil
        guard !model.demo else { return }
        try? await model.api.dismissJournal(["date": .string(card.date)])
    }

    private func seen() async {
        data?.discovery = nil
        guard !model.demo else { return }
        try? await model.api.dismissJournal(["discovery": .bool(true)])
    }
}

// MARK: - The journal of a day

/// Deník: the week (Po–Ne, each day done, partial or empty), then the pinned
/// items by section. A yes/no item is ✕ / ✓; a quantity, a time or a scale
/// shows its value and opens the sheet. A ✓ with follow-ups opens them inline.
struct JournalView: View {
    @Environment(AppModel.self) private var model
    @State private var date: String
    @State private var day: JournalDay?
    @State private var error: String?
    @State private var editing = false
    @State private var valueItem: JournalItem?

    init(date: String) {
        _date = State(initialValue: date)
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.today, title: "Deník") {
            header
            if let day {
                weekStrip(day).padding(.top, 14)
                if day.sections.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Deník je prázdný. Vyber si, na co se tě mám ptát.")
                            .font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                        SecondaryButton(title: "Upravit deník", systemImage: "square.and.pencil") { editing = true }
                    }
                    .padding(.top, 24)
                }
                ForEach(day.sections) { section in sectionView(section) }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            } else if let error {
                Text(error).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).padding(.top, 40)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .task(id: date) { await load() }
        .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) { JournalEditorView() }
        .sheet(item: $valueItem) { item in
            JournalValueSheet(item: item, date: date) { body in await save(body) }
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            Text("Deník").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            Spacer(minLength: 8)
            Button { model.push(.journalImpact) } label: {
                Label("Co na tebe působí", systemImage: "chart.bar")
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                    .lineLimit(1)
                    .padding(.horizontal, 12).frame(height: 36)
                    .background(Palette.card, in: Capsule())
            }
            .buttonStyle(.plain)
            Menu {
                Button { editing = true } label: { Label("Upravit deník", systemImage: "square.and.pencil") }
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                    .frame(width: 36, height: 36).background(Palette.card, in: Circle())
            }
            .accessibilityLabel(L10n.tr("Další možnosti"))
        }
        .padding(.top, 8)
    }

    private func weekStrip(_ day: JournalDay) -> some View {
        HStack(spacing: 2) {
            ForEach(day.week) { d in
                Button { if d.state != "future" { date = d.date } } label: {
                    VStack(spacing: 5) {
                        Text(verbatim: Fmt.weekdayShort(d.date)).font(.caption).foregroundStyle(Palette.muted)
                        Text(verbatim: String(Int(d.date.suffix(2)) ?? 0)).font(.subheadline.weight(.semibold))
                            .foregroundStyle(d.state == "future" ? Palette.faint : Palette.ink)
                        mark(d.state)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(d.date == date ? Palette.card : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(d.state == "future")
                .accessibilityLabel(Fmt.dayMonth(d.date))
                .accessibilityAddTraits(d.date == date ? .isSelected : [])
            }
        }
    }

    @ViewBuilder private func mark(_ state: String) -> some View {
        switch state {
        case "done":
            Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.onAccent)
                .frame(width: 24, height: 24).background(Palette.amber, in: Circle())
        case "partial":
            ZStack {
                Circle().stroke(Palette.track, lineWidth: 2.6)
                Circle().trim(from: 0, to: 0.66).stroke(Palette.amber, style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 22, height: 22).frame(width: 24, height: 24)
        default:
            Circle().stroke(Palette.track, lineWidth: 2).frame(width: 22, height: 22).frame(width: 24, height: 24)
        }
    }

    private func sectionView(_ section: JournalSection) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            SectionLabel(text: section.title).padding(.horizontal, 2)
            VStack(spacing: 0) {
                ForEach(Array(section.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    itemRow(item)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .padding(.top, 22)
    }

    private func itemRow(_ item: JournalItem) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                JournalIcon(symbol: item.icon, color: JournalStyle.color(item.category))
                Text(verbatim: item.name).font(.body).foregroundStyle(Palette.ink).lineLimit(2)
                Spacer(minLength: 8)
                if item.isYesNo {
                    YesNoToggle(answer: item.answer) { value in Task { await setAnswer(item, value) } }
                } else {
                    Button { valueItem = item } label: {
                        HStack(spacing: 6) {
                            Text(verbatim: item.value ?? "–").font(.subheadline.weight(.medium))
                                .foregroundStyle(item.isAnswered ? Palette.secondary : Palette.faint).lineLimit(1)
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(minHeight: 54)
            if item.isYesNo, item.answer == 1, item.follow?.isEmpty == false {
                JournalFollowUps(item: item) { extra in Task { await saveExtra(item, extra) } }
                    .padding(.leading, 44).padding(.bottom, 12)
            }
        }
    }

    // MARK: Loading and saving

    private func load() async {
        if model.demo {
            if day == nil { day = DemoJournal.day }
            return
        }
        do {
            day = try await model.api.journalDay(date: date)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func update(_ key: String, _ change: (inout JournalItem) -> Void) {
        guard var d = day else { return }
        for s in d.sections.indices {
            for i in d.sections[s].items.indices where d.sections[s].items[i].key == key {
                change(&d.sections[s].items[i])
            }
        }
        day = d
    }

    private func setAnswer(_ item: JournalItem, _ value: Int?) async {
        update(item.key) { $0.answer = value; $0.answered = value != nil }
        var body: JSONObject = ["date": .string(date), "key": .string(item.key)]
        if let value { body["answer"] = JSONValue.number(Double(value)) } else { body["answer"] = JSONValue.null }
        if value == 1, let extra = item.extra { body["extra"] = JournalStyle.json(extra) }
        if let failure = await save(body) { error = failure }
    }

    private func saveExtra(_ item: JournalItem, _ extra: [String: Double]) async {
        update(item.key) { $0.extra = extra }
        let body: JSONObject = ["date": .string(date), "key": .string(item.key), "answer": .number(1), "extra": JournalStyle.json(extra)]
        if let failure = await save(body) { error = failure }
    }

    /// Saves an answer; the day comes back with it. Nil on success, else the message.
    private func save(_ body: JSONObject) async -> String? {
        if model.demo {
            applyDemo(body)
            return nil
        }
        do {
            day = try await model.api.saveJournalEntry(body)
            error = nil
            return nil
        } catch {
            await load()
            return error.localizedDescription
        }
    }

    /// The sample journal changes only on the phone.
    private func applyDemo(_ body: JSONObject) {
        guard case .string(let key)? = body["key"] else { return }
        let answer: Int?
        switch body["answer"] {
        case .none: answer = 1
        case .some(.null): answer = nil
        case .some(let given): answer = Int(given.number ?? 1)
        }
        let amount = body["amount"]?.number
        let time = body["time"]?.string
        let last = L10n.isEnglish ? "last" : "do"
        update(key) { item in
            item.answer = answer
            item.answered = answer != nil
            item.fromData = false
            if item.type == "amount" {
                let value: Double = answer == 1 ? (amount ?? 0) : 0
                item.amount = value
                item.time = answer == 1 ? time : nil
                var text = JournalText.amount(value)
                if let unit = item.unit, !unit.isEmpty { text += " " + unit }
                if answer == 1, let time { text += " · " + last + " " + time }
                item.value = answer == nil ? nil : text
            } else if item.type == "time" {
                item.time = answer == 1 ? time : nil
                var text: String? = nil
                if answer == 1 { text = time } else if answer == 0 { text = L10n.tr("Ne") }
                item.value = text
            } else if item.type == "scale" {
                item.amount = amount
                item.value = amount.map { JournalText.amount($0) }
            }
        }
    }
}

/// A ✓ item's follow-ups inline: a stepper (Kolik minut) or chips (Teplota).
struct JournalFollowUps: View {
    let item: JournalItem
    let save: ([String: Double]) -> Void
    @State private var values: [String: Double]

    init(item: JournalItem, save: @escaping ([String: Double]) -> Void) {
        self.item = item
        self.save = save
        var start: [String: Double] = [:]
        for f in item.follow ?? [] {
            if let v = item.extra?[f.key] ?? f.initial { start[f.key] = v }
        }
        _values = State(initialValue: start)
    }

    var body: some View {
        VStack(spacing: 10) {
            ForEach(item.follow ?? [], id: \.key) { f in
                HStack(spacing: 8) {
                    Text(verbatim: f.label).font(Typo.small).foregroundStyle(Palette.muted)
                    Spacer(minLength: 8)
                    if f.kind == "chips" { chips(f) } else { stepper(f) }
                }
            }
        }
    }

    private func stepper(_ f: JournalFollow) -> some View {
        let value = values[f.key] ?? f.initial ?? 0
        return HStack(spacing: 12) {
            stepButton("minus", label: "Méně") { change(f, by: -(f.step ?? 1)) }
            Text(verbatim: JournalText.amount(value)).font(Typo.number(24)).foregroundStyle(Palette.ink)
                .frame(minWidth: 34)
            stepButton("plus", label: "Více") { change(f, by: f.step ?? 1) }
        }
    }

    private func chips(_ f: JournalFollow) -> some View {
        HStack(spacing: 6) {
            ForEach(f.options ?? [], id: \.self) { option in
                let on = values[f.key] == option
                Button {
                    values[f.key] = option
                    save(values)
                } label: {
                    Text(verbatim: JournalText.amount(option) + (f.unit.map { " " + $0 } ?? ""))
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(on ? Palette.onButton : Palette.ink)
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(on ? Palette.button : Palette.track, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    private func stepButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.ink)
                .frame(width: 30, height: 30).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }

    private func change(_ f: JournalFollow, by step: Double) {
        let current = values[f.key] ?? f.initial ?? 0
        let low = f.low ?? 0
        let high = f.high ?? 1000
        values[f.key] = Swift.min(high, Swift.max(low, current + step))
        save(values)
    }
}

// MARK: - Amount, time or scale

/// The sheet of a quantity (stepper, and the time of the last one for alcohol
/// and caffeine), a time (a wheel) or a scale (1–5). "Nic" / "Ne" is ✕;
/// "Smazat odpověď" makes it unanswered again.
struct JournalValueSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: JournalItem
    let date: String
    let save: (JSONObject) async -> String?
    @State private var amount: Double
    @State private var time: Date
    @State private var hasTime: Bool
    @State private var level: Int?
    @State private var busy = false
    @State private var error: String?

    init(item: JournalItem, date: String, save: @escaping (JSONObject) async -> String?) {
        self.item = item
        self.date = date
        self.save = save
        var start = item.usual ?? 1
        if let given = item.amount, given > 0 { start = given }
        _amount = State(initialValue: start)
        _time = State(initialValue: JournalStyle.date(from: item.time) ?? JournalStyle.date(from: item.late) ?? Date())
        _hasTime = State(initialValue: item.time != nil)
        _level = State(initialValue: item.type == "scale" ? item.amount.map { Int($0) } : nil)
    }

    private var step: Double { item.step ?? 1 }
    private var limit: Double { item.limit ?? 100000 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    JournalIcon(symbol: item.icon, color: JournalStyle.color(item.category), size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: item.name).font(.headline).foregroundStyle(Palette.ink)
                        Text(verbatim: Fmt.capitalized(JournalStyle.weekday(date))).font(Typo.small).foregroundStyle(Palette.muted)
                    }
                }
                editor
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: L10n.tr("Uložit"), busy: busy) { submit(1) }
                    .disabled(busy || (item.type == "scale" && level == nil))
                HStack(spacing: 10) {
                    SecondaryButton(title: item.type == "amount" ? "Nic" : "Ne") { submit(0) }
                    if item.isAnswered && item.fromData != true {
                        SecondaryButton(title: "Smazat odpověď") { submit(nil) }
                    }
                }
                .disabled(busy)
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
    }

    @ViewBuilder private var editor: some View {
        switch item.type {
        case "amount":
            VStack(spacing: 14) {
                HStack {
                    roundButton("minus", label: "Méně") { amount = Swift.max(0, ((amount - step) * 100).rounded() / 100) }
                    Spacer()
                    VStack(spacing: 0) {
                        Text(verbatim: JournalText.amount(amount)).font(Typo.number(44)).foregroundStyle(Palette.ink)
                        Text(verbatim: item.unitText(for: amount)).font(Typo.small).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    roundButton("plus", label: "Více") { amount = Swift.min(limit, ((amount + step) * 100).rounded() / 100) }
                }
                .padding(12)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                if item.withTime == true {
                    Toggle(isOn: $hasTime) { Text("Čas posledního").font(.body).foregroundStyle(Palette.ink) }
                        .toggleStyle(LoadwiseToggleStyle())
                    if hasTime {
                        DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                            .datePickerStyle(.wheel).labelsHidden().frame(maxWidth: .infinity)
                    }
                }
            }
        case "time":
            DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel).labelsHidden().frame(maxWidth: .infinity)
        default:
            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { n in
                    let on = level == n
                    Button { level = n } label: {
                        Text(verbatim: String(n)).font(Typo.number(26))
                            .foregroundStyle(on ? Palette.onButton : Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 56)
                            .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func roundButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 20, weight: .medium)).foregroundStyle(Palette.ink)
                .frame(width: 44, height: 44).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }

    /// 1 ✓ with the value, 0 ✕, nil clears.
    private func submit(_ answer: Int?) {
        var body: JSONObject = ["date": .string(date), "key": .string(item.key)]
        if let answer {
            body["answer"] = .number(Double(answer))
        } else {
            body["answer"] = JSONValue.null
        }
        if answer == 1 {
            switch item.type {
            case "amount":
                body["amount"] = .number(amount)
                if item.withTime == true && hasTime { body["time"] = .string(JournalStyle.clock(time)) }
            case "time":
                body["time"] = .string(JournalStyle.clock(time))
            case "scale":
                if let level { body["amount"] = .number(Double(level)) }
            default:
                break
            }
        }
        busy = true
        error = nil
        let request = body
        Task {
            let failure = await save(request)
            busy = false
            if let failure { error = failure } else { dismiss() }
        }
    }
}
