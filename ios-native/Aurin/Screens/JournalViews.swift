import SwiftUI

// Deník, the habit journal (src/routes-journal.js): the card on Zdraví with
// the biggest effects and "Doplnit", the morning sheet "Včera" on the first
// open of the day, and the journal of a day: the week, then the day's items
// by part of the day, filled in from the data where it can, ✕ / ✓ where not.
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

/// ✕ and ✓ as two round buttons (an unanswered row).
struct JournalAnswerButtons: View {
    let choose: (Int) -> Void

    var body: some View {
        HStack(spacing: 8) {
            button(0, symbol: "xmark", label: "Ne")
            button(1, symbol: "checkmark", label: "Ano")
        }
    }

    private func button(_ value: Int, symbol: String, label: String) -> some View {
        Button { choose(value) } label: {
            Image(systemName: symbol).scaledFont(13, weight: .bold, cap: .denseCap).foregroundStyle(Palette.secondary)
                .frame(width: 34, height: 34).background(Palette.track, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}

/// The answer's circle: amber when the day's data (or "Vždy") filled it in,
/// green ✓ or rust ✕ for the athlete's own answer.
struct JournalStateMark: View {
    let item: JournalItem

    var body: some View {
        let yes = item.answer == 1
        let own = item.fromData != true && item.fixed == nil
        let color = own ? (yes ? Palette.green : Palette.rust) : Palette.amber
        Image(systemName: yes ? "checkmark" : "xmark")
            .scaledFont(13, weight: .bold, cap: .denseCap)
            .foregroundStyle(own ? Palette.onAccent : color)
            .frame(width: 34, height: 34)
            .background(own ? color : color.opacity(0.18), in: Circle())
            .accessibilityLabel(L10n.tr(yes ? "Ano" : "Ne"))
    }
}

// MARK: - Zdraví

/// On Zdraví under Připravenost: "Včerejšek čeká · Doplnit" while yesterday
/// has open items, and the biggest effects on readiness to swipe through.
/// A widget, so it can be removed like the others.
struct JournalHealthCard: View {
    @Environment(AppModel.self) private var model
    @State private var data: JournalToday?
    @State private var page = 0

    var body: some View {
        Card {
            let top = data?.top ?? []
            WidgetHeader(title: L10n.tr("Deník"), color: Palette.indigo, trailing: top.count > 1 ? "\(page + 1) / \(top.count)" : nil)
            if let card = data?.card {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Včerejšek čeká").font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                        Text(verbatim: L10n.plural("%lld otázek", card.open))
                            .font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    Button { model.push(.journal(card.date)) } label: {
                        Text("Doplnit").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 18).frame(height: 40).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                if !top.isEmpty { Rectangle().fill(Palette.hairline).frame(height: 1) }
            }
            if !top.isEmpty {
                TabView(selection: $page) {
                    ForEach(Array(top.enumerated()), id: \.element.id) { index, effect in
                        Button { model.push(.journalImpact) } label: { effectView(effect) }
                            .buttonStyle(.plain)
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(height: 92)
                if top.count > 1 { dots(top.count) }
            } else if data?.card == nil, data != nil {
                Button { model.push(.journal(AppModel.shift(AppModel.localDate(Date()), by: -1) ?? AppModel.localDate(Date()))) } label: {
                    Text("Co na tebe působí, ukážu po pár dnech.").font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { model.push(.journal(data?.card?.date ?? (AppModel.shift(AppModel.localDate(Date()), by: -1) ?? AppModel.localDate(Date())))) }
        .task { await load() }
    }

    private func effectView(_ effect: JournalEffect) -> some View {
        let color = effect.effect < 0 ? Palette.rust : Palette.green
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: effect.icon).scaledFont(15, weight: .medium).foregroundStyle(color)
                Text(verbatim: effect.name).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(verbatim: JournalText.percent(effect.effect)).font(Typo.number(48)).foregroundStyle(color)
                Text("připravenost další ráno").font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func dots(_ count: Int) -> some View {
        HStack(spacing: 5) {
            ForEach(0..<count, id: \.self) { i in
                Capsule().fill(i == page ? Palette.secondary : Palette.ink.opacity(0.22))
                    .frame(width: i == page ? 14 : 6, height: 6)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    private func load() async {
        if model.demo {
            data = DemoJournal.today
            return
        }
        if let fresh = try? await model.api.journalToday() {
            data = fresh
            JournalSwitch.remember(fresh.enabled)
        }
    }
}

// MARK: - The morning sheet

/// "Včera": on the first open of the day while yesterday has open items and
/// Ranní otázky are on. Pulled down, it waits on the Zdraví card.
struct JournalMorningPrompt: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase
    @AppStorage("journal.sheetDay") private var shownOn = ""
    @State private var date: String?

    func body(content: Content) -> some View {
        content
            .task(id: phase) {
                guard phase == .active, !model.demo, JournalSwitch.isOn else { return }
                let today = AppModel.localDate(Date())
                guard shownOn != today, let fresh = try? await model.api.journalToday() else { return }
                JournalSwitch.remember(fresh.enabled)
                guard let card = fresh.card, card.ask != false else { return }
                shownOn = today
                date = card.date
            }
            .sheet(item: Binding(get: { date.map(JournalSheetDate.init) }, set: { date = $0?.date })) { d in
                JournalMorningSheet(date: d.date)
            }
    }
}

struct JournalSheetDate: Identifiable {
    let date: String
    var id: String { date }
}

extension View {
    func journalMorningPrompt() -> some View { modifier(JournalMorningPrompt()) }
}

struct JournalMorningSheet: View {
    @Environment(\.dismiss) private var dismiss
    let date: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Včera").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .padding(.top, 24)
                JournalDayEditor(date: date, inSheet: true)
                PrimaryButton(title: L10n.tr("Hotovo")) { dismiss() }
                    .padding(.top, 24)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.card)
    }
}

// MARK: - The journal of a day

/// Deník: the week, the chosen day's items by part of the day, and "Co na
/// tebe působí". ··· holds Co sledovat, Ranní otázky and turning Deník off.
struct JournalView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    @State private var tracking = false
    @State private var askMorning = true
    @State private var reload = 0

    var body: some View {
        DetailScreen(glow: Palette.Glow.health, title: "Deník") {
            HStack(alignment: .center, spacing: 8) {
                Text("Deník").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                Menu {
                    Button { tracking = true } label: { Label("Co sledovat", systemImage: "checklist") }
                    Toggle(isOn: Binding(get: { askMorning }, set: { on in askMorning = on; Task { await setOption(["askMorning": .bool(on)]) } })) {
                        Label("Ranní otázky", systemImage: "bell")
                    }
                    Button(role: .destructive) {
                        Task {
                            await setOption(["enabled": .bool(false)])
                            JournalSwitch.remember(false)
                            dismiss()
                        }
                    } label: { Label("Vypnout Deník", systemImage: "eye.slash") }
                } label: {
                    Image(systemName: "ellipsis").scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                        .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                }
                .accessibilityLabel(L10n.tr("Další možnosti"))
            }
            .padding(.top, 8)
            JournalDayEditor(date: date, inSheet: false, reload: reload)
        }
        .sheet(isPresented: $tracking, onDismiss: { reload += 1 }) { JournalEditorView() }
        .task {
            guard !model.demo, let catalog = try? await model.api.journalCatalog() else { return }
            askMorning = catalog.askMorning ?? true
        }
    }

    private func setOption(_ body: JSONObject) async {
        guard !model.demo else { return }
        try? await model.api.setJournalOptions(body)
    }
}

/// The day itself: in the journal with its week and the link to the effects,
/// in the morning sheet without them.
struct JournalDayEditor: View {
    @Environment(AppModel.self) private var model
    @State private var date: String
    let inSheet: Bool
    /// Bumped after Co sledovat closes: the day loads again.
    var reload = 0
    @State private var day: JournalDay?
    @State private var error: String?
    @State private var valueItem: JournalItem?

    init(date: String, inSheet: Bool, reload: Int = 0) {
        _date = State(initialValue: date)
        self.inSheet = inSheet
        self.reload = reload
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let day {
                if !inSheet {
                    weekStrip(day).padding(.top, 14)
                    Text(verbatim: Fmt.capitalized(JournalStyle.weekday(date)) + " " + Fmt.dayMonth(date))
                        .font(.headline).foregroundStyle(Palette.ink)
                        .padding(.top, 18)
                }
                // Another day tapped: its answers, never the last day's under its name.
                if !model.demo && day.date != date {
                    if error == nil { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                } else {
                    if day.sections.isEmpty {
                        Text("Nic nesleduješ. Vyber si to v Co sledovat.")
                            .font(Typo.sentence(19)).foregroundStyle(Palette.secondary)
                            .padding(.top, 20)
                    }
                    ForEach(day.sections) { section in sectionView(section) }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
                if !inSheet { JournalImpactLink().padding(.top, 24) }
            } else if let error {
                Text(error).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).padding(.top, 40)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
        }
        .task(id: date + "|" + String(reload)) { await load() }
        .sheet(item: $valueItem) { item in
            if item.key == "mood" {
                JournalMoodSheet(item: item, date: date) { body in await save(body) }
            } else {
                JournalValueSheet(item: item, date: date) { body in await save(body) }
            }
        }
    }

    private func weekStrip(_ day: JournalDay) -> some View {
        HStack(spacing: 2) {
            ForEach(day.week) { d in
                Button { if d.state != "future" { date = d.date } } label: {
                    VStack(spacing: 6) {
                        Text(verbatim: Fmt.weekdayShort(d.date)).font(.caption).foregroundStyle(Palette.muted)
                        Text(verbatim: String(Int(d.date.suffix(2)) ?? 0)).font(.subheadline.weight(.semibold))
                            .foregroundStyle(d.state == "future" ? Palette.faint : Palette.ink)
                        mark(d.state)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(d.date == date ? Palette.ink.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(d.state == "future")
                .accessibilityLabel(Fmt.dayMonth(d.date))
                .accessibilityAddTraits(d.date == date ? .isSelected : [])
            }
        }
    }

    /// Done: a green ✓; open items: an amber ring; nothing yet: a faint ring.
    @ViewBuilder private func mark(_ state: String) -> some View {
        switch state {
        case "done":
            Image(systemName: "checkmark").scaledFont(11, weight: .bold, cap: .denseCap).foregroundStyle(Palette.green)
                .frame(width: 26, height: 26).background(Palette.green.opacity(0.18), in: Circle())
        case "partial":
            Circle().stroke(Palette.amber, lineWidth: 2).frame(width: 24, height: 24).frame(width: 26, height: 26)
        case "future":
            Circle().stroke(Palette.ink.opacity(0.08), lineWidth: 1).frame(width: 24, height: 24).frame(width: 26, height: 26)
        default:
            Circle().stroke(Palette.ink.opacity(0.22), lineWidth: 2).frame(width: 24, height: 24).frame(width: 26, height: 26)
        }
    }

    private func sectionView(_ section: JournalSection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: section.title).padding(.horizontal, 2)
            ForEach(section.items) { item in itemRow(item) }
        }
        .padding(.top, 18)
    }

    /// One row: the time, the item, its value and the answer; open rows have
    /// ✕ / ✓ and a thin amber edge. Held: Vždy ne / Vždy ano / Nesledovat.
    private func itemRow(_ item: JournalItem) -> some View {
        let open = !item.isAnswered
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(verbatim: item.time ?? "").font(.footnote).foregroundStyle(Palette.faint)
                    .frame(width: 40, alignment: .leading)
                Image(systemName: item.icon).scaledFont(16, weight: .medium, cap: .denseCap).foregroundStyle(JournalStyle.color(item.category))
                    .frame(width: 24)
                Text(verbatim: item.name).font(.body.weight(open ? .medium : .regular))
                    .foregroundStyle(open ? Palette.ink : Palette.secondary).lineLimit(2)
                Spacer(minLength: 8)
                if let short = item.short, item.isAnswered {
                    HStack(spacing: 4) {
                        if item.fixed != nil {
                            Image(systemName: "arrow.triangle.2.circlepath").scaledFont(11, weight: .semibold)
                        }
                        Text(verbatim: short).lineLimit(1)
                    }
                    .font(.subheadline).foregroundStyle(Palette.muted)
                }
                answer(item)
            }
            .padding(.leading, 12).padding(.trailing, 10)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
            .onTapGesture { if !item.isYesNo && item.isAnswered { valueItem = item } }
            if item.isYesNo, item.answer == 1, item.follow?.isEmpty == false, item.fromData != true {
                JournalFollowUps(item: item) { extra in Task { await saveExtra(item, extra) } }
                    .padding(.leading, 86).padding(.trailing, 12).padding(.bottom, 12)
            }
        }
        .background(inSheet ? Palette.ink.opacity(0.05) : Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            if open { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Palette.amber.opacity(0.35), lineWidth: 1) }
        }
        .contextMenu {
            if item.fixed != 0 {
                Button { Task { await fix(item, 0) } } label: { Label("Vždy ne", systemImage: "xmark") }
            }
            if item.fixed != 1, item.type != "time" {
                Button { Task { await fix(item, 1) } } label: { Label("Vždy ano", systemImage: "checkmark") }
            }
            if item.fixed != nil {
                Button { Task { await fix(item, nil) } } label: { Label("Ptát se zase", systemImage: "arrow.uturn.backward") }
            }
            Button(role: .destructive) { Task { await untrack(item) } } label: { Label("Nesledovat", systemImage: "eye.slash") }
        }
    }

    /// Open: ✕ / ✓ (a ✓ of a quantity or a time opens its sheet). Answered:
    /// its circle; a tap clears an own answer, or turns the data's or the
    /// "Vždy" answer around for this day.
    @ViewBuilder private func answer(_ item: JournalItem) -> some View {
        if !item.isAnswered {
            JournalAnswerButtons { value in
                if value == 1 && !item.isYesNo { valueItem = item } else { Task { await setAnswer(item, value) } }
            }
        } else {
            Button {
                let own = item.fromData != true && item.fixed == nil
                if !item.isYesNo && own { valueItem = item; return }
                Task { await setAnswer(item, own ? nil : (item.answer == 1 ? 0 : 1)) }
            } label: { JournalStateMark(item: item) }
            .buttonStyle(.plain)
        }
    }

    // MARK: Loading and saving

    private func load() async {
        if model.demo {
            if day == nil { day = DemoJournal.day }
            return
        }
        let asked = date
        do {
            let loaded = try await model.api.journalDay(date: asked)
            guard asked == date else { return }
            day = loaded
            error = nil
            await moodFromHealth(loaded)
        } catch {
            guard asked == date else { return }
            self.error = error.localizedDescription
        }
    }

    /// A mood logged in Apple Health (Apple Watch, Mindfulness) fills in a day without one.
    private func moodFromHealth(_ loaded: JournalDay) async {
        guard let mood = loaded.sections.flatMap(\.items).first(where: { $0.key == "mood" }), !mood.isAnswered,
              let logged = await MoodHealth.logged(on: loaded.date), loaded.date == date else { return }
        let body: JSONObject = ["date": .string(loaded.date), "key": .string("mood"), "answer": .number(1),
                                "amount": .number(Double(logged.level)), "extra": .object(["labels": .number(Double(logged.labels))])]
        _ = await save(body)
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
        update(item.key) { $0.answer = value; $0.answered = value != nil; $0.fromData = false; $0.fixed = nil }
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

    private func fix(_ item: JournalItem, _ answer: Int?) async {
        if model.demo {
            update(item.key) { row in
                row.fixed = answer
                row.answer = answer ?? row.answer
                row.answered = answer != nil || row.answered == true
                row.short = answer.map { L10n.tr($0 == 1 ? "vždy ano" : "vždy ne") } ?? row.short
            }
            return
        }
        do {
            let saved = try await model.api.setJournalFixed(key: item.key, answer: answer, date: date)
            if saved.date == date { day = saved }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func untrack(_ item: JournalItem) async {
        guard var d = day else { return }
        for s in d.sections.indices { d.sections[s].items.removeAll { $0.key == item.key } }
        d.sections.removeAll { $0.items.isEmpty }
        day = d
        guard !model.demo, let catalog = try? await model.api.journalCatalog() else { return }
        try? await model.api.setJournalPinned(catalog.pinned.filter { $0 != item.key })
    }

    /// Saves an answer; the day comes back with it. Nil on success, else the message.
    private func save(_ body: JSONObject) async -> String? {
        if model.demo {
            applyDemo(body)
            return nil
        }
        do {
            let saved = try await model.api.saveJournalEntry(body)
            // An answer of a day left meanwhile stays off the day shown now.
            if saved.date == date { day = saved }
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
        update(key) { item in
            item.answer = answer
            item.answered = answer != nil
            item.fromData = false
            item.fixed = nil
            if item.type == "amount" {
                let value: Double = answer == 1 ? (amount ?? 0) : 0
                item.amount = value
                item.time = answer == 1 ? time : nil
                var text = JournalText.amount(value)
                let unit = item.unitText(for: value)
                if !unit.isEmpty { text += " " + unit }
                item.short = answer == nil ? nil : text
            } else if item.type == "time" {
                item.time = answer == 1 ? time : nil
                item.short = answer == 0 ? L10n.tr("Ne") : nil
            } else if item.type == "scale" {
                item.amount = amount
                item.short = amount.map { JournalText.amount($0) }
            }
        }
    }
}

/// "Co na tebe působí" under the day: the two biggest effects, opening the chart.
struct JournalImpactLink: View {
    @Environment(AppModel.self) private var model
    @State private var top: [JournalEffect] = []

    var body: some View {
        Button { model.push(.journalImpact) } label: {
            Card {
                HStack(spacing: 5) {
                    Text("Co na tebe působí").font(Typo.bodyStrong).foregroundStyle(Palette.secondary)
                    Image(systemName: "chevron.right").scaledFont(11, weight: .semibold).foregroundStyle(Palette.faint)
                }
                if top.isEmpty {
                    Text("Ukážu, až bude dost dní s ✓ i s ✕.").font(Typo.caption).foregroundStyle(Palette.muted)
                }
                ForEach(top.prefix(2)) { effect in
                    HStack(spacing: 8) {
                        Image(systemName: effect.icon).scaledFont(14, cap: .denseCap).foregroundStyle(Palette.muted).frame(width: 20)
                        Text(verbatim: effect.name).font(.subheadline.weight(.medium)).foregroundStyle(Palette.secondary)
                        Spacer(minLength: 8)
                        Text(verbatim: JournalText.percent(effect.effect)).font(Typo.number(22))
                            .foregroundStyle(effect.effect < 0 ? Palette.rust : Palette.green)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .task {
            if model.demo { top = DemoJournal.today.top ?? []; return }
            top = (try? await model.api.journalToday())?.top ?? []
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
            Image(systemName: symbol).scaledFont(13, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
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
    @State private var detent: PresentationDetent

    init(item: JournalItem, date: String, save: @escaping (JSONObject) async -> String?) {
        self.item = item
        self.date = date
        self.save = save
        var start = item.usual ?? 1
        if let given = item.amount, given > 0 { start = given }
        _amount = State(initialValue: start)
        _time = State(initialValue: JournalStyle.date(from: item.time) ?? JournalStyle.date(from: item.late) ?? Date())
        _hasTime = State(initialValue: item.time != nil)
        let wheel = item.type == "time" || (item.withTime == true && item.time != nil)
        _detent = State(initialValue: wheel ? .large : .medium)
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
            }
            .padding(24)
        }
        // Save stays at the bottom, so the time wheel never pushes it off the sheet.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 10) {
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
            .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 8)
            .background(Palette.background)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationBackground(Palette.background)
        // Turning on the time shows the wheel: the sheet grows to show it whole.
        .onChange(of: hasTime) { _, on in
            if on { withAnimation(.snappy) { detent = .large } }
        }
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
                        .toggleStyle(AurinToggleStyle())
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
            Image(systemName: symbol).scaledFont(20, weight: .medium, cap: .denseCap).foregroundStyle(Palette.ink)
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
