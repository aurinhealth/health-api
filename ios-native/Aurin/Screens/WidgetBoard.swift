import SwiftUI
import UniformTypeIdentifiers

// Editing a panel's widgets like the iPhone home screen: "Upravit", holding a
// finger on an empty spot or the widget's own menu makes the cards wiggle with
// a minus to remove them, they move by dragging, "+" opens the gallery and a
// size is picked by swiping before "Přidat widget".

/// A panel's widgets: the saved layout, and while editing the edit controls.
struct WidgetBoard: View {
    @Environment(AppModel.self) private var model
    let panel: WidgetPanel
    let data: WidgetData
    @Binding var editing: Bool
    /// The button under the widgets that starts editing; nil when the panel
    /// puts its own somewhere else.
    var editTitle: String?
    @AppStorage private var stored: String
    @State private var dragging: WidgetKind?
    @State private var gallery = false
    /// How far "+" and "Hotovo" come down so they stay on screen while the page scrolls.
    @State private var pinned: CGFloat = 0
    @Environment(\.widgetEditingReport) private var report

    init(panel: WidgetPanel, data: WidgetData, editing: Binding<Bool>, editTitle: String? = "Upravit widgety") {
        self.panel = panel
        self.data = data
        self._editing = editing
        self.editTitle = editTitle
        self._stored = AppStorage(wrappedValue: "", WidgetLayoutStore.key(panel))
    }

    private var items: [PlacedWidget] { WidgetLayoutStore.decode(stored, panel: panel) }

    private var itemsBinding: Binding<[PlacedWidget]> {
        Binding(get: { items }, set: { save($0) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if editing {
                editHeader
                    .padding(.bottom, 22)
                    .zIndex(1)
            }
            VStack(spacing: 12) {
                ForEach(WidgetLayoutStore.rows(shown)) { row in
                    rowView(row)
                }
            }
            if !editing, let title = editTitle {
                WidgetEditButton(title: title, action: startEditing)
                .padding(.top, shown.isEmpty ? 0 : 28)
            }
        }
        .widgetEditHold($editing)
        .sensoryFeedback(.impact(weight: .medium), trigger: editing) { _, now in now }
        .onChange(of: editing, initial: true) { _, now in report?(now) }
        .onDisappear { if editing { report?(false) } }
        .task { await loadMissing(items.map(\.kind)) }
        .sheet(isPresented: $gallery) {
            WidgetGallery(panel: panel, data: data, placed: Set(items.map(\.kind))) { kind, size in
                add(kind, size)
            }
            .task { await loadMissing(WidgetKind.allCases) }
        }
    }

    /// While editing every widget, outside it only those with data.
    private var shown: [PlacedWidget] {
        editing ? items : items.filter { data.hasData($0.kind) }
    }

    /// The panel's name, and "+" and "Hotovo", which stay at the top of the
    /// screen wherever the page is scrolled, as on the home screen.
    private var editHeader: some View {
        ZStack {
            SectionLabel(text: panel.title)
            HStack {
                Button { gallery = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .frame(width: 36, height: 36)
                        .background(Palette.card, in: Circle())
                        .overlay(Circle().stroke(Palette.hairline, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Přidat widget")
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) { editing = false }
                } label: {
                    Text("Hotovo")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 16)
                        .frame(height: 34)
                        .background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .offset(y: pinned)
        }
        .frame(height: 36)
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named("pageScroll")).minY } action: { top in
            pinned = max(0, 8 - top)
        }
    }

    @ViewBuilder private func rowView(_ row: WidgetLayoutRow) -> some View {
        if row.half {
            WidgetRow {
                cell(row.items[0])
            } right: {
                if row.items.count > 1 { cell(row.items[1]) } else { Color.clear }
            }
        } else {
            cell(row.items[0])
        }
    }

    @ViewBuilder private func cell(_ item: PlacedWidget) -> some View {
        if editing {
            EditableWidget(item: item, data: data,
                           remove: { remove(item.kind) },
                           move: { offset in move(item.kind, by: offset) })
                .onDrag {
                    dragging = item.kind
                    return NSItemProvider(object: item.kind.rawValue as NSString)
                }
                .onDrop(of: [UTType.text], delegate: WidgetDropDelegate(target: item.kind, items: itemsBinding, dragging: $dragging))
        } else {
            // Held like a home screen widget: its menu.
            PanelWidget(item: item, data: data)
                .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 22, style: .continuous))
                .contextMenu {
                    Button(action: startEditing) {
                        Label(L10n.tr(editTitle ?? "Upravit widgety"), systemImage: "slider.horizontal.3")
                    }
                    Button(role: .destructive) { remove(item.kind) } label: {
                        Label("Odebrat widget", systemImage: "minus.circle")
                    }
                }
        }
    }

    private func startEditing() {
        withAnimation(.easeInOut(duration: 0.25)) { editing = true }
    }

    private func save(_ list: [PlacedWidget]) {
        stored = WidgetLayoutStore.encode(list)
    }

    private func add(_ kind: WidgetKind, _ size: WidgetSize) {
        var list = items.filter { $0.kind != kind }
        list.append(PlacedWidget(kind: kind, size: size))
        gallery = false
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { save(list) }
    }

    private func remove(_ kind: WidgetKind) {
        if kind == .journal { UserDefaults.standard.set(true, forKey: WidgetLayoutStore.journalRemovedKey) }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            save(items.filter { $0.kind != kind })
        }
    }

    /// VoiceOver's "Posunout výš / níž" instead of dragging.
    private func move(_ kind: WidgetKind, by offset: Int) {
        var list = items
        guard let from = list.firstIndex(where: { $0.kind == kind }) else { return }
        let to = from + offset
        guard to >= 0, to < list.count else { return }
        list.swapAt(from, to)
        withAnimation { save(list) }
    }

    /// The tabs whose data the widgets need and nobody has loaded yet.
    private func loadMissing(_ kinds: [WidgetKind]) async {
        var tabs: [AppTab] = []
        for kind in kinds {
            guard let tab = kind.source, !tabs.contains(tab), !data.has(tab) else { continue }
            tabs.append(tab)
        }
        for tab in tabs {
            await model.refreshIfStale(tab)
        }
    }
}

extension View {
    /// The gaps between the widgets: a finger held there starts editing them,
    /// as on the home screen. Not behind the header, whose plain buttons
    /// (the avatar) would lose their taps to it.
    func widgetEditHold(_ editing: Binding<Bool>) -> some View {
        background {
            if !editing.wrappedValue {
                Color.clear
                    .contentShape(Rectangle())
                    .onLongPressGesture(minimumDuration: 0.5) {
                        withAnimation(.easeInOut(duration: 0.25)) { editing.wrappedValue = true }
                    }
                    .accessibilityHidden(true)
            }
        }
    }
}

/// "Upravit přehled" under the widgets.
struct WidgetEditButton: View {
    var title: String = "Upravit widgety"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(L10n.tr(title), systemImage: "slider.horizontal.3")
                .font(Typo.bodyStrong)
                .foregroundStyle(Palette.ink)
                .padding(.horizontal, 18)
                .frame(height: 40)
                .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
        }
        .frame(maxWidth: .infinity)
    }
}

/// A widget as a picture: its buttons and links do nothing, a gesture on the
/// whole card does.
struct WidgetPreview: View {
    let item: PlacedWidget
    let data: WidgetData

    var body: some View {
        PanelWidget(item: item, data: data, linked: false)
            .allowsHitTesting(false)
            .overlay {
                Color.clear.contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
    }
}

/// A widget while editing: it wiggles and has the minus badge.
struct EditableWidget: View {
    let item: PlacedWidget
    let data: WidgetData
    let remove: () -> Void
    let move: (Int) -> Void

    var body: some View {
        WidgetPreview(item: item, data: data)
            .overlay(alignment: .topLeading) {
                Button(action: remove) {
                    Image(systemName: "minus")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Palette.onButton)
                        .frame(width: 24, height: 24)
                        .background(Palette.muted, in: Circle())
                        .frame(width: 40, height: 40)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .offset(x: -16, y: -16)
                .accessibilityLabel(L10n.f("Odebrat %@", L10n.tr(item.kind.title)))
            }
            .modifier(Wiggle(amplitude: item.size == .small ? 1.4 : 0.6, seed: item.kind.rawValue.count))
            .transition(.scale(scale: 0.85).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: Text("Posunout výš")) { move(-1) }
            .accessibilityAction(named: Text("Posunout níž")) { move(1) }
    }
}

/// The home screen's jiggle: a small rotation back and forth. Drawn from the
/// clock, so the card coming in with an animation cannot stop it.
struct Wiggle: ViewModifier {
    let amplitude: Double
    let seed: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { context in
            content.rotationEffect(.degrees(reduceMotion ? 0 : angle(at: context.date)))
        }
    }

    private func angle(at date: Date) -> Double {
        let period = 0.26 + Double(seed % 4) * 0.03
        let phase = Double(seed % 3) * 0.7
        return amplitude * sin(date.timeIntervalSinceReferenceDate * 2 * .pi / period + phase)
    }
}

/// Moves the dragged widget to where it is over, so the others make room.
struct WidgetDropDelegate: DropDelegate {
    let target: WidgetKind
    @Binding var items: [PlacedWidget]
    @Binding var dragging: WidgetKind?

    func dropEntered(info: DropInfo) {
        guard let moving = dragging, moving != target,
              let from = items.firstIndex(where: { $0.kind == moving }),
              let to = items.firstIndex(where: { $0.kind == target }) else { return }
        var list = items
        list.move(fromOffsets: IndexSet(integer: from), toOffset: to > from ? to + 1 : to)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { items = list }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragging = nil
        return true
    }
}

// MARK: - Gallery

/// "+": search, Doporučené and the sections, only widgets not on the panel yet.
struct WidgetGallery: View {
    let panel: WidgetPanel
    let data: WidgetData
    let placed: Set<WidgetKind>
    let add: (WidgetKind, WidgetSize) -> Void
    @State private var query = ""
    @State private var choosing: WidgetKind?

    private var available: [WidgetKind] { WidgetKind.allCases.filter { !placed.contains($0) } }

    private var recommended: [WidgetKind] {
        Array(panel.recommended.filter { !placed.contains($0) && data.hasData($0) }.prefix(6))
    }

    private var matches: [WidgetKind] {
        let q = query.trimmingCharacters(in: .whitespaces)
        return available.filter {
            L10n.tr($0.title).localizedCaseInsensitiveContains(q) || L10n.tr($0.section.title).localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    searchField
                    if query.trimmingCharacters(in: .whitespaces).isEmpty {
                        if !recommended.isEmpty { recommendedRow }
                        sections
                    } else {
                        WidgetPreviewList(kinds: matches, data: data) { choosing = $0 }
                            .padding(.top, 20)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Palette.background.ignoresSafeArea())
            .navigationTitle("Widgety")
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: WidgetSection.self) { section in
                WidgetSectionPage(section: section, kinds: available.filter { $0.section == section }, data: data) { choosing = $0 }
            }
        }
        .tint(Palette.ink)
        .presentationDragIndicator(.visible)
        .sheet(item: $choosing) { kind in
            WidgetAddSheet(kind: kind, data: data) { size in add(kind, size) }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Palette.faint)
            TextField("Hledat widgety", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Smazat")
            }
        }
        .font(Typo.body)
        .foregroundStyle(Palette.ink)
        .padding(.horizontal, 12)
        .frame(height: 40)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var recommendedRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Doporučené").font(.headline).foregroundStyle(Palette.ink)
                .padding(.top, 26)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(recommended) { kind in
                        WidgetPreview(item: PlacedWidget(kind: kind, size: kind.defaultSize), data: data)
                            .frame(width: kind.defaultSize == .small ? 170 : 300)
                            .onTapGesture { choosing = kind }
                            .accessibilityAddTraits(.isButton)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
            }
            .padding(.horizontal, -20)
        }
    }

    private var sections: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sekce").font(.headline).foregroundStyle(Palette.ink)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(WidgetSection.allCases) { section in
                    NavigationLink(value: section) {
                        WidgetSectionTile(section: section, count: available.filter { $0.section == section }.count)
                    }
                    .buttonStyle(PressableCardStyle())
                }
            }
        }
        .padding(.top, 22)
    }
}

/// A section in the gallery: its icon, name and how many widgets can be added.
struct WidgetSectionTile: View {
    let section: WidgetSection
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Image(systemName: section.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(section.color)
                Spacer()
                Text(String(count)).font(Typo.caption).foregroundStyle(Palette.faint)
            }
            Text(section.title)
                .font(Typo.bodyStrong)
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .padding(.top, 26)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [section.color.opacity(0.24), section.color.opacity(0.06)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .cardSurface(cornerRadius: 18)
        .accessibilityElement(children: .combine)
    }
}

/// Small widgets two to a row, like on the panel.
struct WidgetPreviewList: View {
    let kinds: [WidgetKind]
    let data: WidgetData
    let choose: (WidgetKind) -> Void

    var body: some View {
        VStack(spacing: 12) {
            ForEach(WidgetLayoutStore.rows(kinds.map { PlacedWidget(kind: $0, size: $0.defaultSize) })) { row in
                if row.half {
                    WidgetRow {
                        tile(row.items[0])
                    } right: {
                        if row.items.count > 1 { tile(row.items[1]) } else { Color.clear }
                    }
                } else {
                    tile(row.items[0])
                }
            }
        }
    }

    private func tile(_ item: PlacedWidget) -> some View {
        WidgetPreview(item: item, data: data)
            .onTapGesture { choose(item.kind) }
            .accessibilityAddTraits(.isButton)
    }
}

/// One section's widgets that are not on the panel yet.
struct WidgetSectionPage: View {
    let section: WidgetSection
    let kinds: [WidgetKind]
    let data: WidgetData
    let choose: (WidgetKind) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 10) {
                    Image(systemName: section.icon)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(section.color)
                    Text(section.title)
                        .font(Typo.sentence(30, relativeTo: .title))
                        .foregroundStyle(Palette.ink)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                WidgetPreviewList(kinds: kinds, data: data, choose: choose)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .background(Palette.background.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
    }
}

// MARK: - Add widget

/// Like the iPhone's "Přidat widget": the widget in each size, swiped through.
struct WidgetAddSheet: View {
    let kind: WidgetKind
    let data: WidgetData
    let add: (WidgetSize) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var current: WidgetSize?

    init(kind: WidgetKind, data: WidgetData, add: @escaping (WidgetSize) -> Void) {
        self.kind = kind
        self.data = data
        self.add = add
        self._current = State(initialValue: kind.sizes.first)
    }

    private var shown: WidgetSize { current ?? kind.sizes.first ?? .medium }

    var body: some View {
        VStack(spacing: 0) {
            header
            Text(kind.title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Palette.ink)
                .padding(.top, 30)
            Text(shown.title)
                .font(Typo.body)
                .foregroundStyle(Palette.muted)
                .padding(.top, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(kind.sizes) { size in
                        WidgetPreview(item: PlacedWidget(kind: kind, size: size), data: data)
                            .frame(width: size == .small ? 170 : nil)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .containerRelativeFrame(.horizontal)
                            .id(size)
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 34, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $current)
            .frame(maxHeight: .infinity)

            if kind.sizes.count > 1 {
                HStack(spacing: 7) {
                    ForEach(kind.sizes) { size in
                        Circle()
                            .fill(size == shown ? Palette.ink : Palette.faint.opacity(0.35))
                            .frame(width: 7, height: 7)
                            .onTapGesture { withAnimation { current = size } }
                    }
                }
                .accessibilityHidden(true)
                .padding(.top, 12)
            }

            Button { add(shown) } label: {
                Label("Přidat widget", systemImage: "plus")
                    .font(Typo.bodyStrong)
                    .foregroundStyle(Palette.onAccent)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Palette.blue, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 16)
        }
        .background(Palette.background.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: kind.section.icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(kind.section.color)
                .frame(width: 30, height: 30)
                .background(kind.section.color.opacity(0.16), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(kind.section.title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Zavřít")
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }
}
