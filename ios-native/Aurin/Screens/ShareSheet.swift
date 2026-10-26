import PhotosUI
import SwiftUI

// MARK: - Sdílet

/// Sdílet: the type, a big preview, the layouts as thumbnails, Upravit and
/// Sdílet, which opens the phone's share sheet with the image.
struct ShareSheet: View {
    enum Source {
        case today(TodaySnapshot)
        case activity(WeekSession, ActivityDetail?)
    }

    @Environment(AppModel.self) private var model
    let source: Source
    @State private var kind: ShareKind
    @State private var options: [ShareKind: ShareOptions]
    @State private var day: ShareDay? = nil
    @State private var workout: ShareWorkout? = nil
    @State private var food: ShareFood? = nil
    @State private var week: ShareWeek? = nil
    @State private var milestones: ShareMilestones? = nil
    @State private var editing = false
    @State private var busy = false
    @State private var instagram = false
    /// Fotka: the photo behind the image and where the numbers were moved on it.
    @State private var photo: UIImage?
    @State private var offsets: [String: [String: CGSize]] = [:]
    @State private var photoFlow: SharePhotoFlow.Step?
    @State private var pickingPhoto = false
    @State private var pickedPhoto: PhotosPickerItem?
    /// The photo the flow opens with: one picked from Photos, or the current one to move its numbers.
    @State private var flowPhoto: UIImage?

    /// start: the page to open on (Jídlo opens on food, Trénink on the last workout).
    init(source: Source, start: ShareKind? = nil) {
        self.source = source
        switch source {
        case .today(let today):
            let day = ShareDay(today: today)
            _day = State(initialValue: day)
            _food = State(initialValue: ShareFood(date: today.date, nutrition: today.nutrition))
            _workout = State(initialValue: day.workouts.last)
            _kind = State(initialValue: start == .activity && day.workouts.isEmpty ? .day : start ?? .day)
        case .activity(let session, let detail):
            _workout = State(initialValue: ShareWorkout(session: session, detail: detail))
            _kind = State(initialValue: .activity)
        }
        _options = State(initialValue: Dictionary(uniqueKeysWithValues: ShareKind.allCases.map { ($0, ShareOptions.load($0)) }))
    }

    private var kinds: [ShareKind] {
        ShareKind.allCases.filter { k in
            switch k {
            case .day: return day != nil
            case .activity: return workout != nil
            case .food: return food != nil
            case .week: return week != nil
            case .milestone: return milestones?.isEmpty == false
            }
        }
    }

    private var current: Binding<ShareOptions> {
        Binding(get: { options[kind] ?? ShareOptions() },
                set: { value in
                    options[kind] = value
                    value.save(kind)
                })
    }

    private func card(_ options: ShareOptions, width: CGFloat) -> ShareCard {
        ShareCard(kind: kind, options: options, day: day, workout: workout, food: food, week: week, milestones: milestones, width: width,
                  photo: photo, offsets: offsets[Self.offsetKey(kind, options)] ?? [:])
    }

    /// The moved blocks belong to one layout of one type.
    static func offsetKey(_ kind: ShareKind, _ options: ShareOptions) -> String { kind.rawValue + "." + String(options.variant) }

    /// Transparent only without a photo behind it.
    private var clear: Bool { current.wrappedValue.clear && photo == nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Text(L10n.tr("Sdílet")).font(.headline).foregroundStyle(Palette.ink).padding(.top, 18)
                    if kinds.count > 1 { kindChips.padding(.top, 14) }
                    SharePreview(card: card(current.wrappedValue, width: 240), clear: clear, dark: current.wrappedValue.dark)
                        .padding(.top, 18)
                    thumbnails.padding(.top, 14)
                    HStack(spacing: 10) {
                        photoMenu
                        SecondaryButton(title: "Upravit", systemImage: "slider.horizontal.3") { editing = true }
                    }
                    .padding(.top, 22)
                    PrimaryButton(title: L10n.tr("Sdílet"), systemImage: "square.and.arrow.up", busy: busy) { share() }
                        .disabled(busy)
                        .padding(.top, 10)
                    if instagram {
                        SecondaryButton(title: "Do příběhu na Instagramu", systemImage: "camera") { shareToInstagram() }
                            .padding(.top, 10)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
            }
            .background(Palette.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $editing) {
                ShareEditView(kind: kind, options: current, workout: workout, milestones: milestones?.items ?? [], hasPhoto: photo != nil) { self.card($0, width: $1) }
            }
        }
        .fullScreenCover(item: Binding(get: { photoFlow.map { FlowStart(step: $0) } }, set: { photoFlow = $0?.step })) { start in
            SharePhotoFlow(kind: kind, layouts: kind.layouts(workout), options: current, card: { options, width in
                ShareCard(kind: kind, options: options, day: day, workout: workout, food: food, week: week, milestones: milestones, width: width)
            }, step: start.step, photo: start.step == .camera ? nil : flowPhoto, offsets: offsets) { image, moved in
                photo = image
                offsets = moved
            }
        }
        .photosPicker(isPresented: $pickingPhoto, selection: $pickedPhoto, matching: .images)
        .onChange(of: pickedPhoto) {
            guard let item = pickedPhoto else { return }
            pickedPhoto = nil
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { return }
                flowPhoto = SharePhoto.fitted(image)
                photoFlow = .place(fromLibrary: true)
            }
        }
        .task {
            instagram = ShareExport.canShareToInstagram
            await load()
        }
        .onChange(of: kind) { fixLayout() }
    }

    private struct FlowStart: Identifiable {
        let step: SharePhotoFlow.Step
        var id: String { step == .camera ? "camera" : "place" }
    }

    /// Fotka: take one with the numbers in the camera, pick one from Photos,
    /// move the numbers on it or take it away.
    private var photoMenu: some View {
        Menu {
            Button { photoFlow = .camera } label: { Label(L10n.tr("Vyfotit"), systemImage: "camera") }
            Button { pickingPhoto = true } label: { Label(L10n.tr("Vybrat z knihovny"), systemImage: "photo") }
            if let photo {
                Button {
                    flowPhoto = photo
                    photoFlow = .place(fromLibrary: true)
                } label: { Label(L10n.tr("Posunout údaje"), systemImage: "hand.draw") }
                Button(role: .destructive) { self.photo = nil } label: { Label(L10n.tr("Odebrat fotku"), systemImage: "trash") }
            }
        } label: {
            HStack(spacing: 8) {
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFill().frame(width: 22, height: 22)
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                } else {
                    Image(systemName: "camera")
                }
                Text(L10n.tr("Fotka"))
            }
            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 46)
            .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    /// The types as underlined words spread across the width; when they don't
    /// fit (a small phone, large text) they scroll, never cut short.
    private var kindChips: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) {
                ForEach(Array(kinds.enumerated()), id: \.element) { i, k in
                    if i > 0 { Spacer(minLength: 14) }
                    kindTab(k)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 22) { ForEach(kinds) { kindTab($0) } }
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.ink.opacity(0.1)).frame(height: 1) }
    }

    private func kindTab(_ k: ShareKind) -> some View {
        let on = k == kind
        return Button { kind = k } label: {
            Text(L10n.tr(k.title))
                .font(.subheadline.weight(on ? .semibold : .medium))
                .foregroundStyle(on ? Palette.ink : Palette.muted)
                .lineLimit(1).fixedSize()
                .padding(.top, 8).padding(.bottom, 11)
                .overlay(alignment: .bottom) {
                    if on { Capsule().fill(Palette.ink).frame(height: 2.5) }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var thumbnails: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(kind.layouts(workout), id: \.index) { layout in
                let i = layout.index, name = layout.name
                let selected = current.wrappedValue.variant == i
                let shown = previewOptions(variant: i)
                Button { current.wrappedValue.variant = i } label: {
                    VStack(spacing: 6) {
                        card(shown, width: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .stroke(selected ? Palette.ink : Palette.ink.opacity(0.1), lineWidth: selected ? 2 : 1))
                            .opacity(selected ? 1 : 0.6)
                        Text(L10n.tr(name)).font(.caption.weight(.medium)).foregroundStyle(selected ? Palette.ink : Palette.muted)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.tr(name))
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private func previewOptions(variant: Int) -> ShareOptions {
        var shown = current.wrappedValue
        shown.variant = variant
        return shown
    }

    /// The week, the milestones, the night's stages and the done workouts'
    /// details, after the sheet shows.
    private func load() async {
        defer { fixLayout() }
        guard case .today(let today) = source else {
            if workout?.isGym == true, let date = workout?.date { await addGym(date) }
            return
        }
        if model.demo {
            week = ShareWeek.sample
            milestones = ShareMilestones.sample
            if day?.workouts.contains(where: \.isGym) == true { await addGym(today.date) }
            workout = day?.workouts.last
            return
        }
        week = try? await model.api.shareWeek(date: today.date)
        milestones = try? await model.api.shareMilestones()
        let items = ShareDay.doneWorkouts(today)
        for (i, item) in items.enumerated() {
            guard let session = item.session else { continue }
            var detail: ActivityDetail?
            if let id = session.activityId {
                detail = try? await model.api.activityDetail(id: id)
            } else if let watch = session.watch {
                detail = try? await model.api.watchDetail(watch)
            }
            if let detail, day?.workouts.indices.contains(i) == true { day?.workouts[i].add(detail) }
        }
        if let night = try? await model.api.night(date: today.date) { day?.add(night) }
        if day?.workouts.contains(where: \.isGym) == true { await addGym(today.date) }
        workout = day?.workouts.last
    }

    /// The gym sheet's sets for that day's lifting: the best set of each exercise, volume and sets.
    private func addGym(_ date: String) async {
        var gym: GymDay? = DemoData.gym
        if !model.demo { gym = try? await model.api.gym(date: date) }
        guard let gym else { return }
        if var w = workout, w.isGym {
            w.add(gym)
            workout = w
        }
        if let i = day?.workouts.lastIndex(where: \.isGym) { day?.workouts[i].add(gym) }
    }

    /// A layout this workout doesn't offer (a chart without heart rate) goes to the first one it does.
    private func fixLayout() {
        let layouts = kind.layouts(workout)
        if !layouts.contains(where: { $0.index == current.wrappedValue.variant }), let first = layouts.first {
            current.wrappedValue.variant = first.index
        }
    }

    private func share() {
        busy = true
        defer { busy = false }
        let options = current.wrappedValue
        guard let image = ShareExport.image(card(options, width: ShareCard.width), clear: clear) else { return }
        let date = (kind == .week ? week?.start : nil) ?? day?.date ?? food?.date ?? workout?.date ?? AppModel.localDate(Date())
        let title = kind == .week ? week.map { ShareText.range($0.start, $0.end) } ?? ShareText.date(date) : ShareText.date(date)
        guard let url = ShareExport.file(image, name: "Aurin-" + kind.rawValue + "-" + date) else { return }
        ShareExport.present(url, title: "Aurin · " + title, image: image)
    }

    private func shareToInstagram() {
        let options = current.wrappedValue
        guard let image = ShareExport.image(card(options, width: ShareCard.width), clear: clear) else { return }
        ShareExport.instagram(image, clear: clear, dark: options.dark)
    }
}

/// The preview at its size: rounded, on a checkerboard when transparent.
struct SharePreview: View {
    let card: ShareCard
    let clear: Bool
    let dark: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: card.width * 0.065, style: .continuous)
        card
            .background { if clear { ShareChecker(dark: dark, cell: max(4, card.width / 24)) } }
            .clipShape(shape)
            .overlay(shape.stroke(Palette.ink.opacity(0.08), lineWidth: 1))
            .shadow(color: .black.opacity(0.25), radius: 14, y: 8)
    }
}

/// The squares that show where an image is transparent.
struct ShareChecker: View {
    let dark: Bool
    var cell: CGFloat = 10

    var body: some View {
        Canvas { context, size in
            let a = Color(hex: dark ? 0x2A2C2E : 0xE4E0D9), b = Color(hex: dark ? 0x1E2022 : 0xF4F1EC)
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(b))
            var y: CGFloat = 0, row = 0
            while y < size.height {
                var x: CGFloat = row % 2 == 0 ? 0 : cell
                while x < size.width {
                    context.fill(Path(CGRect(x: x, y: y, width: cell, height: cell)), with: .color(a))
                    x += cell * 2
                }
                y += cell
                row += 1
            }
        }
    }
}

extension ShareDay {
    /// Today's done workouts as the plan lists them, the first three by time.
    static func doneWorkouts(_ today: TodaySnapshot) -> [TodaySnapshot.PlanItem] {
        Array(today.plan.filter { $0.kind == "workout" && ($0.status == "done" || $0.done) }
            .sorted { ($0.time ?? "") < ($1.time ?? "") }
            .prefix(3))
    }
}

// MARK: - Upravit

/// Upravit: a small live preview, the look as picture tiles and the rows as
/// switches, with the values of the night and a workout as chips under them.
struct ShareEditView: View {
    let kind: ShareKind
    @Binding var options: ShareOptions
    let workout: ShareWorkout?
    var milestones: [ShareMilestones.Item] = []
    /// With a photo behind it the image has no background of its own to pick.
    var hasPhoto = false
    let card: (ShareOptions, CGFloat) -> ShareCard
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                HStack {
                    Spacer()
                    SharePreview(card: card(options, 132), clear: options.clear && !hasPhoto, dark: options.dark)
                    Spacer()
                }
                .padding(.top, 12)
                SectionLabel(text: "Vzhled").padding(.top, 24).padding(.horizontal, 4)
                HStack(spacing: 10) {
                    look("Tmavé", on: options.dark, swatch: .dark) { options.dark = true }
                    look("Světlé", on: !options.dark, swatch: .light) { options.dark = false }
                }
                .padding(.top, 10)
                if !hasPhoto {
                    HStack(spacing: 10) {
                        look("Pozadí", on: !options.clear, swatch: .background) { options.clear = false }
                        look("Průhledné", on: options.clear, swatch: .clear) { options.clear = true }
                    }
                    .padding(.top, 10)
                }
                if kind == .milestone && options.variant != 2 && milestones.count > 1 {
                    SectionLabel(text: "Milník").padding(.top, 26).padding(.horizontal, 4)
                    let chosen = milestones.first { item in item.key == options.milestone }?.key ?? milestones[0].key
                    ChipFlow(items: milestones.map(\.key), label: { key in L10n.tr(milestones.first { item in item.key == key }?.title ?? key) },
                             isOn: { key in key == chosen },
                             toggle: { key in options.milestone = key })
                        .padding(.top, 10)
                }
                if !(kind == .milestone && options.variant == 2) && !(kind == .week && options.variant == 1) {
                    SectionLabel(text: kind == .day && options.variant == 0 ? "Na ose" : "Údaje").padding(.top, 26).padding(.horizontal, 4)
                    rows.padding(.top, 10)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 30)
        }
        .background(Palette.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.secondary)
                    .frame(width: 44, height: 44, alignment: .leading)
            }
            .accessibilityLabel(L10n.tr("Zpět"))
            Spacer()
            Text(L10n.tr("Upravit")).font(.headline).foregroundStyle(Palette.ink)
            Spacer()
            Button { dismiss() } label: {
                Text(L10n.tr("Hotovo")).font(.body.weight(.semibold)).foregroundStyle(Palette.amber)
                    .frame(width: 70, height: 44, alignment: .trailing)
            }
        }
        .padding(.top, 6)
    }

    // Vzhled

    private enum Swatch { case dark, light, background, clear }

    private func look(_ title: String, on: Bool, swatch: Swatch, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                mini(swatch)
                    .frame(height: 58)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                Text(L10n.tr(title)).font(.subheadline.weight(.medium)).foregroundStyle(on ? Palette.ink : Palette.muted)
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? Palette.ink : Palette.ink.opacity(0.08), lineWidth: on ? 2 : 1))
            .overlay(alignment: .topTrailing) {
                if on {
                    Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(Palette.onButton)
                        .frame(width: 20, height: 20).background(Palette.button, in: Circle())
                        .padding(7)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// A tiny image: the mark, a line of text and two dots in that look.
    private func mini(_ swatch: Swatch) -> some View {
        let dark = swatch == .light ? false : (swatch == .dark ? true : options.dark)
        let ink = Color(hex: dark ? 0xECEAE6 : 0x1B1A17)
        return ZStack(alignment: .topLeading) {
            switch swatch {
            case .clear: ShareChecker(dark: dark, cell: 6)
            case .background: ShareTheme(dark: dark, clear: false).background(.indigo, width: 160)
            default: Color(hex: dark ? 0x14161A : 0xF3EFE8)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 5) {
                    AurinMark(size: 11)
                    Capsule().fill(ink.opacity(0.8)).frame(width: 26, height: 4)
                }
                ForEach(0..<2, id: \.self) { i in
                    HStack(spacing: 6) {
                        Circle().strokeBorder(i == 0 ? Color(hex: dark ? 0xA5A1FF : 0x4F46C8) : Color(hex: dark ? 0x8FE6C4 : 0x1F6B52), lineWidth: 2)
                            .frame(width: 7, height: 7)
                        Capsule().fill(ink.opacity(0.55)).frame(width: i == 0 ? 40 : 28, height: 5)
                    }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
        }
        .environment(\.colorScheme, dark ? .dark : .light)
    }

    // Na ose / Údaje

    private struct Row: Identifiable {
        let key: String
        let color: Color
        var chips: [String] = []
        var id: String { key }
    }

    private var rowList: [Row] {
        switch kind {
        case .day:
            return [Row(key: "Spánek", color: Palette.indigo, chips: ShareDay.sleepStats), Row(key: "Připravenost", color: Palette.green),
                    Row(key: "Trénink", color: Palette.amber, chips: ShareDay.workoutStats), Row(key: "Námaha", color: Palette.rust),
                    Row(key: "Kroky", color: Palette.blue)]
        case .activity:
            let available = workout?.available ?? ShareWorkout.stats
            return available.map { Row(key: $0, color: Palette.amber) }
        case .food:
            return [Row(key: "Energie", color: Palette.green), Row(key: "Bílkoviny", color: Palette.protein), Row(key: "Sacharidy", color: Palette.carbs),
                    Row(key: "Tuky", color: Palette.fat), Row(key: "Voda", color: Palette.blue)]
        case .week:
            let colors: [String: Color] = ["Zátěž": Palette.amber, "Kolo": Palette.amber, "Běh": Palette.green, "Spánek": Palette.indigo, "Připravenost": Palette.green]
            return ShareWeek.rows.map { Row(key: $0, color: colors[$0] ?? Palette.secondary) }
        case .milestone:
            return ShareMilestones.rows.map { Row(key: $0, color: Palette.amber) }
        }
    }

    private var rows: some View {
        let list = rowList
        return VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, row in
                VStack(alignment: .leading, spacing: 0) {
                    Toggle(isOn: Binding(get: { options.shows(row.key) }, set: { _ in options.toggle(row.key) })) {
                        HStack(spacing: 12) {
                            Circle().strokeBorder(row.color, lineWidth: 3).frame(width: 12, height: 12)
                            Text(L10n.tr(row.key)).font(.body).foregroundStyle(Palette.ink)
                        }
                    }
                    .tint(Palette.green)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 52)
                    if !row.chips.isEmpty && options.shows(row.key) {
                        ChipFlow(items: row.chips, label: { L10n.tr($0) }, isOn: { chipOn(row.key, $0) }, toggle: { toggleChip(row.key, $0) })
                            .padding(.leading, 40).padding(.trailing, 16).padding(.bottom, 14)
                    }
                }
                .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 40) } }
            }
        }
        .cardSurface(cornerRadius: 18)
    }

    private func chipOn(_ row: String, _ chip: String) -> Bool {
        row == "Spánek" ? options.sleep.contains(chip) : options.workout.contains(chip)
    }

    private func toggleChip(_ row: String, _ chip: String) {
        if row == "Spánek" {
            if let i = options.sleep.firstIndex(of: chip) { options.sleep.remove(at: i) } else { options.sleep.append(chip) }
        } else {
            if let i = options.workout.firstIndex(of: chip) { options.workout.remove(at: i) } else { options.workout.append(chip) }
        }
    }
}
