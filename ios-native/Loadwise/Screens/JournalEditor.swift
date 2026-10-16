import SwiftUI

// Co sledovat: the whole catalogue on one screen. Category chips switch the
// list in place, search looks through all of it; each item has a switch, the
// tracked ones first, "✦ automaticky" on those the day's data fills in. The day
// orders them by time, so there is nothing to reorder. "Vlastní položka" adds
// an item of one's own.

struct JournalEditorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var catalog: JournalCatalog?
    @State private var pinned: [String] = []
    @State private var query = ""
    @State private var tab = ""
    @State private var saving = false
    @State private var error: String?

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let catalog {
                        searchField(catalog.count)
                        if !searching { tabs(catalog.categories) }
                        list(catalog)
                    } else if let error {
                        Text(error).font(Typo.sentence(19)).foregroundStyle(Palette.secondary).padding(.top, 30)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                    if let error, catalog != nil {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle(L10n.tr("Co sledovat"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(L10n.tr("Zrušit")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("Hotovo")) { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(saving || catalog == nil)
                }
            }
        }
        .task { await load() }
    }

    private func searchField(_ count: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Palette.faint)
            TextField(L10n.f("Hledat ve %@ položkách", String(count)), text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if searching {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Smazat"))
            }
        }
        .padding(.horizontal, 14).frame(height: 44)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.top, 8)
    }

    private func tabs(_ categories: [JournalCategory]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(categories) { c in chip(c.key, title: c.title) }
            }
        }
    }

    private func chip(_ key: String, title: String) -> some View {
        let on = tab == key
        let count = catalog?.items.filter { $0.category == key && pinned.contains($0.key) }.count ?? 0
        return Button { tab = key } label: {
            HStack(spacing: 5) {
                Text(verbatim: title)
                if count > 0 { Text(verbatim: String(count)).opacity(0.6) }
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(on ? Palette.onButton : Palette.ink)
            .padding(.horizontal, 13).frame(height: 32)
            .background(on ? Palette.button : Palette.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The chosen category, or everything matching the search. The catalogue
    /// comes with the tracked items first; a switch doesn't move its row.
    private func shown(_ catalog: JournalCatalog) -> [JournalItem] {
        let q = query.trimmingCharacters(in: .whitespaces).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Fmt.locale)
        return catalog.items.filter { item in
            q.isEmpty
                ? item.category == tab
                : item.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Fmt.locale).contains(q)
        }
    }

    private func list(_ catalog: JournalCatalog) -> some View {
        let items = shown(catalog)
        return VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                row(item)
            }
            if items.isEmpty {
                Text("Nic takového tu není. Přidej si to jako vlastní položku.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 16)
            }
            Rectangle().fill(Palette.hairline).frame(height: 1)
            NavigationLink {
                JournalCustomItemView(categories: catalog.categories, start: tab.isEmpty ? "supplements" : tab) { key in
                    if let key, !pinned.contains(key) { pinned.append(key) }
                    Task { await load(keepPinned: true) }
                }
            } label: {
                HStack(spacing: 12) {
                    JournalIcon(symbol: "plus", color: Palette.ink)
                    Text("Vlastní položka").font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .frame(minHeight: 54)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 2)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func row(_ item: JournalItem) -> some View {
        let on = Binding(
            get: { pinned.contains(item.key) },
            set: { value in
                if value { if !pinned.contains(item.key) { pinned.append(item.key) } } else { pinned.removeAll { $0 == item.key } }
            }
        )
        return Toggle(isOn: on) {
            HStack(spacing: 12) {
                JournalIcon(symbol: item.icon, color: JournalStyle.color(item.category))
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: item.name).font(.body).foregroundStyle(Palette.ink).lineLimit(2)
                    if item.auto == true {
                        Text("✦ automaticky").font(.caption.weight(.medium)).foregroundStyle(Palette.amber)
                    }
                }
            }
        }
        .toggleStyle(LoadwiseToggleStyle())
        .frame(minHeight: 54)
        .contextMenu {
            if item.custom == true {
                Button(role: .destructive) { Task { await remove(item.key) } } label: {
                    Label(L10n.tr("Smazat položku"), systemImage: "trash")
                }
            }
        }
    }

    // MARK: Loading and saving

    private func load(keepPinned: Bool = false) async {
        if model.demo {
            if catalog == nil {
                catalog = DemoJournal.catalog
                pinned = catalog?.pinned ?? []
                if tab.isEmpty { tab = catalog?.categories.first?.key ?? "" }
            }
            return
        }
        do {
            let fresh = try await model.api.journalCatalog()
            catalog = fresh
            if !keepPinned { pinned = fresh.pinned }
            if tab.isEmpty { tab = fresh.categories.first?.key ?? "" }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard !model.demo else { dismiss(); return }
        saving = true
        defer { saving = false }
        do {
            try await model.api.setJournalPinned(pinned)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ key: String) async {
        pinned.removeAll { $0 == key }
        guard !model.demo else { return }
        _ = try? await model.api.addJournalItem(["remove": .string(key)])
        await load(keepPinned: true)
    }
}

/// Vlastní položka: a name, how to answer (Ano / ne, Množství with its unit
/// and usual amount, Čas, Škála 1–5), when to ask and the category.
struct JournalCustomItemView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let categories: [JournalCategory]
    let saved: (String?) -> Void
    @State private var name = ""
    @State private var type = "yesno"
    @State private var unit = ""
    @State private var usual = ""
    @State private var when = "morning"
    @State private var category: String
    @State private var busy = false
    @State private var error: String?

    init(categories: [JournalCategory], start: String, saved: @escaping (String?) -> Void) {
        self.categories = categories
        self.saved = saved
        _category = State(initialValue: start)
    }

    private static let types: [(key: String, title: String)] = [
        ("yesno", "Ano / ne"), ("amount", "Množství"), ("time", "Čas"), ("scale", "Škála 1–5")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                SettingsGroup(title: "Název") {
                    TextField(L10n.tr("Např. Hořčík večer"), text: $name)
                        .font(.body).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 16).frame(minHeight: 50)
                }
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel(text: "Odpověď").padding(.horizontal, 4)
                    Picker(L10n.tr("Odpověď"), selection: $type) {
                        ForEach(Self.types, id: \.key) { t in Text(L10n.tr(t.title)).tag(t.key) }
                    }
                    .pickerStyle(.segmented)
                }
                if type == "amount" {
                    SettingsGroup {
                        SettingsField(title: "Jednotka", text: $unit, keyboard: .default, placeholder: "mg")
                        SettingsDivider()
                        SettingsField(title: "Obvyklé množství", text: $usual, unit: unit.isEmpty ? nil : unit, placeholder: "1")
                    }
                }
                SettingsGroup(title: "Kdy se ptát") {
                    whenRow("morning", title: "Ráno za včerejšek")
                    SettingsDivider()
                    whenRow("evening", title: "Večer za dnešek")
                }
                SettingsGroup(title: "Kategorie") {
                    HStack {
                        Text("Kategorie").font(.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Picker(L10n.tr("Kategorie"), selection: $category) {
                            ForEach(categories) { c in Text(verbatim: c.title).tag(c.key) }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .tint(Palette.secondary)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 50)
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: L10n.tr("Uložit"), busy: busy) { Task { await save() } }
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .background(Palette.background.ignoresSafeArea())
        .navigationTitle(L10n.tr("Vlastní položka"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func whenRow(_ key: String, title: String) -> some View {
        Button { when = key } label: {
            HStack {
                Text(title).font(.body).foregroundStyle(Palette.ink)
                Spacer(minLength: 8)
                if when == key {
                    Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                }
            }
            .padding(.horizontal, 16).frame(minHeight: 50)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(when == key ? .isSelected : [])
    }

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        if model.demo {
            saved(nil)
            dismiss()
            return
        }
        var body: JSONObject = [
            "name": .string(trimmed), "type": .string(type), "when": .string(when), "category": .string(category)
        ]
        if type == "amount" {
            body["unit"] = .string(unit.trimmingCharacters(in: .whitespaces))
            if let value = Double(usual.replacingOccurrences(of: ",", with: ".")), value > 0 { body["usual"] = .number(value) }
        }
        busy = true
        defer { busy = false }
        do {
            let key = try await model.api.addJournalItem(body)
            saved(key)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
