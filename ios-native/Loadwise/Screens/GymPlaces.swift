import PhotosUI
import SwiftUI

// MARK: - A place's stations

/// One place: body parts and kinds of equipment on the left, the stations of
/// the chosen one on the right, each ticked on or off, with "i" for what it is
/// and the exercises done on it.
struct GymPlaceView: View {
    @Binding var place: GymPlace
    let stations: [GymEquipment.Station]
    let sections: [GymEquipment.Section]
    @Binding var catalog: [GymCatalogExercise]
    let onDelete: () -> Void

    @State private var section: String?
    @State private var info: GymEquipment.Station?
    @State private var toast: Toast?
    @State private var renaming = false
    @State private var newName = ""
    @State private var confirmDelete = false
    @State private var detecting = false

    struct Toast: Equatable {
        let station: GymEquipment.Station
        let text: String
    }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: place.name) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel(text: place.name + " · " + EquipmentView.countLine(place))
                    Spacer(minLength: 8)
                    menu
                }
                .padding(.top, 24)
                Text("Co tam je").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 6)

                HStack(alignment: .top, spacing: 10) {
                    rail.frame(width: 112)
                    list
                }
                .padding(.top, 18)
                .padding(.bottom, toast == nil ? 0 : 70)
            }
        }
        .overlay(alignment: .bottom) { if let toast { toastView(toast) } }
        .animation(.easeOut(duration: 0.2), value: toast)
        .task(id: toast) {
            guard toast != nil else { return }
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled { toast = nil }
        }
        .sheet(item: $info) { station in
            StationSheet(station: station, sectionLabel: label(of: station), place: $place, catalog: $catalog)
        }
        .sheet(isPresented: $detecting) {
            AddGymSheet(detectOnly: true, url: place.url) { name, found, url in
                place.stations = Array(Set(found).union(place.stations.contains("floor_mats") ? ["floor_mats"] : [])).sorted()
                if !url.isEmpty { place.url = url }
                if place.name.isEmpty, let name { place.name = name }
            }
        }
        .alert("Přejmenovat", isPresented: $renaming) {
            TextField("Název", text: $newName)
            Button("Uložit") { if let name = newName.trimmingCharacters(in: .whitespaces).nilIfBlank { place.name = String(name.prefix(80)) } }
            Button("Zrušit", role: .cancel) {}
        }
        .confirmationDialog(L10n.f("Smazat %@?", place.name), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { onDelete() }
        }
        .onAppear { if section == nil { section = firstSection } }
    }

    private var menu: some View {
        Menu {
            Button { newName = place.name; renaming = true } label: { Label("Přejmenovat", systemImage: "pencil") }
            Button { detecting = true } label: { Label("Poznat automaticky", systemImage: "sparkles") }
            Button(role: .destructive) { confirmDelete = true } label: { Label("Smazat", systemImage: "trash") }
        } label: {
            Image(systemName: "ellipsis.circle").font(.system(size: 20)).foregroundStyle(Palette.ink)
                .frame(width: 40, height: 32).contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.tr("Upravit"))
    }

    /// The sections that have stations, in the server's order.
    private var shownSections: [GymEquipment.Section] {
        sections.filter { s in stations.contains { $0.sectionIds.contains(s.id) } }
    }

    private var firstSection: String? {
        let selected = Set(place.stations)
        return shownSections.first { s in stations.contains { $0.sectionIds.contains(s.id) && selected.contains($0.id) } }?.id ?? shownSections.first?.id
    }

    private func items(_ id: String?) -> [GymEquipment.Station] {
        stations.filter { $0.sectionIds.contains(id ?? "") }
    }

    private func label(of station: GymEquipment.Station) -> String {
        let id = station.sectionIds.first ?? ""
        return sections.first { $0.id == id }?.label ?? station.group
    }

    private var rail: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(shownSections) { s in
                let all = items(s.id)
                let on = all.filter { place.stations.contains($0.id) }.count
                let chosen = s.id == section
                Button { section = s.id } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.label).font(.subheadline.weight(chosen ? .semibold : .regular)).foregroundStyle(chosen ? Palette.ink : Palette.secondary)
                            .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        Text(verbatim: "\(on)/\(all.count)").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(chosen ? Palette.card : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(alignment: .leading) {
                        if chosen { Capsule().fill(Palette.green).frame(width: 3).padding(.vertical, 10) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(chosen ? .isSelected : [])
            }
        }
    }

    private var list: some View {
        let rows = items(section)
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, station in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1).padding(.leading, 14) }
                row(station)
            }
        }
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .frame(maxWidth: .infinity)
    }

    private func row(_ station: GymEquipment.Station) -> some View {
        let on = place.stations.contains(station.id)
        return HStack(spacing: 4) {
            Button { toggle(station) } label: {
                HStack {
                    Text(station.label).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { info = station } label: {
                Image(systemName: "info.circle").font(.system(size: 19)).foregroundStyle(Palette.muted)
                    .frame(width: 34, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.f("O stroji %@", station.label))
            Button { toggle(station) } label: {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22)).foregroundStyle(on ? Palette.green : Palette.faint)
                    .frame(width: 34, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(station.label)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
        .padding(.leading, 14).padding(.trailing, 6).padding(.vertical, 4)
        .frame(minHeight: 52)
    }

    /// Ticking one on says how many exercises it opens up.
    private func toggle(_ station: GymEquipment.Station) {
        if let i = place.stations.firstIndex(of: station.id) {
            place.stations.remove(at: i)
            if toast?.station.id == station.id { toast = nil }
            return
        }
        let before = Set(place.stations).union(["floor_mats"])
        place.stations.append(station.id)
        let after = before.union([station.id])
        let opened = catalog.filter { ex in
            let needs = Set(ex.stations ?? [])
            return needs.contains(station.id) && needs.isSubset(of: after) && !needs.isSubset(of: before)
        }.count
        let text = opened > 0
            ? L10n.f("%@ · %@ %@", station.label, String(opened), Fmt.plural(opened, "nový cvik", "nové cviky", "nových cviků"))
            : L10n.f("Přidáno: %@", station.label)
        toast = Toast(station: station, text: text)
    }

    private func toastView(_ t: Toast) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.green)
            Text(t.text).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
            Spacer(minLength: 8)
            Button { info = t.station; toast = nil } label: {
                Text("Cviky ›").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.amber)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).frame(minHeight: 52)
        .background(Palette.card, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
        .padding(.horizontal, 20).padding(.bottom, 14)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// MARK: - One station

/// What the station is, whether the place has it, and its exercises with a
/// thumb up (offered more) or down (left out); no thumb is neutral.
struct StationSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let station: GymEquipment.Station
    let sectionLabel: String
    @Binding var place: GymPlace
    @Binding var catalog: [GymCatalogExercise]
    @State private var error: String?
    /// The exercise whose "i" was tapped: what it is and how it's done.
    @State private var technique: String?

    private var exercises: [GymCatalogExercise] {
        catalog.filter { ($0.stations ?? []).contains(station.id) }
    }

    var body: some View {
        let on = place.stations.contains(station.id)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: sectionLabel).padding(.top, 28)
                HStack(alignment: .center) {
                    Text(station.label).font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Button {
                        if on { place.stations.removeAll { $0 == station.id } } else { place.stations.append(station.id) }
                    } label: {
                        Image(systemName: on ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 28)).foregroundStyle(on ? Palette.green : Palette.faint)
                            .frame(width: 44, height: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(station.label)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
                .padding(.top, 6)
                if let line = station.description?.nilIfBlank {
                    Text(line).font(.body).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true).padding(.top, 6)
                }

                if station.id == "dumbbells", on {
                    DumbbellWeightsEditor(weights: $place.dumbbellWeights).padding(.top, 22)
                }

                if !exercises.isEmpty {
                    SectionLabel(text: L10n.f("Cviky · %@", String(exercises.count))).padding(.top, 24)
                    VStack(spacing: 0) {
                        ForEach(Array(exercises.enumerated()), id: \.element.id) { index, ex in
                            if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                            row(ex)
                        }
                    }
                    .padding(.horizontal, 14)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .padding(.top, 10)
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
            }
            .padding(.horizontal, 20).padding(.bottom, 28)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.background)
        .sheet(item: Binding(get: { technique.map { Named(name: $0) } }, set: { technique = $0?.name })) { TechniqueSheet(exercise: $0.name) }
    }

    private func row(_ ex: GymCatalogExercise) -> some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 2) {
                Text(ex.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                if let muscle = ex.muscle?.nilIfBlank { Text(muscle).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1) }
            }
            Spacer(minLength: 8)
            Button { technique = ex.name } label: {
                Image(systemName: "info.circle").font(.system(size: 19)).foregroundStyle(Palette.muted)
                    .frame(width: 34, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.f("Technika: %@", ex.name))
            thumb(ex, up: true)
            thumb(ex, up: false)
        }
        .padding(.vertical, 8)
    }

    private func thumb(_ ex: GymCatalogExercise, up: Bool) -> some View {
        let on = ex.liked == up
        return Button { rate(ex, on ? nil : up) } label: {
            Image(systemName: up ? (on ? "hand.thumbsup.fill" : "hand.thumbsup") : (on ? "hand.thumbsdown.fill" : "hand.thumbsdown"))
                .font(.system(size: 16))
                .foregroundStyle(on ? (up ? Palette.green : Palette.rust) : Palette.muted)
                .frame(width: 38, height: 38)
                .background(on ? (up ? Palette.greenSoft : Palette.pinkSoft) : Palette.track, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(up ? "Baví mě" : "Nebaví mě"))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// Saved at once; the plans read it (src/exercise-feedback.js).
    private func rate(_ ex: GymCatalogExercise, _ value: Bool?) {
        guard let i = catalog.firstIndex(where: { $0.name == ex.name }) else { return }
        let old = catalog[i].liked
        catalog[i].liked = value
        guard !model.demo else { return }
        Task {
            do {
                try await model.api.rateExercises([(exercise: ex.name, liked: value)])
                error = nil
            } catch {
                if let j = catalog.firstIndex(where: { $0.name == ex.name }) { catalog[j].liked = old }
                self.error = error.localizedDescription
            }
        }
    }
}

// MARK: - Dumbbells

/// The dumbbells there are: tap the weights, or add an odd one.
struct DumbbellWeightsEditor: View {
    @Binding var weights: [Double]
    @State private var customWeight = ""

    var body: some View {
        let set = Set(weights)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(text: "Jednoručky")
                Spacer()
                Text(weights.isEmpty ? L10n.tr("plán navrhne jakoukoli váhu") : L10n.f("%@ %@", String(weights.count), Fmt.plural(weights.count, "váha", "váhy", "vah")))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 8) {
                if Units.imperial {
                    preset(L10n.f("%@ po %@", "5–50 lb", "5")) { stride(from: 5.0, through: 50, by: 5).map(EquipmentView.kgFromPounds) }
                    preset(L10n.f("%@ po %@", "10–100 lb", "10")) { stride(from: 10.0, through: 100, by: 10).map(EquipmentView.kgFromPounds) }
                } else {
                    preset("2–40 po 2") { Array(stride(from: 2.0, through: 40, by: 2)) }
                    preset("2,5–25 po 2,5") { Array(stride(from: 2.5, through: 25, by: 2.5)) }
                }
                preset(L10n.isEnglish ? "Clear" : "Zrušit") { [] }
            }
            ChipFlow(items: Array(Set(EquipmentView.shownOptions).union(set)).sorted(), label: { EquipmentView.kg($0) },
                     isOn: { set.contains($0) },
                     toggle: { w in weights = set.contains(w) ? weights.filter { $0 != w } : (weights + [w]).sorted() })
            HStack(spacing: 8) {
                TextField(L10n.f("Jiná váha, %@", Units.weightUnit), text: $customWeight)
                    .keyboardType(.decimalPad)
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Button("Přidat") {
                    if let shown = Double(customWeight.replacingOccurrences(of: ",", with: ".")), shown > 0, Units.kg(shown) <= 100 {
                        let kg = Units.kg(shown)
                        let w = Units.imperial ? (kg * 100).rounded() / 100 : (kg * 4).rounded() / 4
                        if !set.contains(w) { weights = (weights + [w]).sorted() }
                        customWeight = ""
                    }
                }
                .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .disabled(customWeight.isEmpty)
            }
        }
    }

    private func preset(_ title: String, _ values: @escaping () -> [Double]) -> some View {
        Button { weights = Array(Set(values())).sorted() } label: {
            Text(title).font(.footnote.weight(.medium)).foregroundStyle(Palette.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Adding a gym

/// "Přidat posilovnu": AI reads the gym's web page (its text and photos) and
/// the athlete's own photos at once, or the athlete ticks the stations.
struct AddGymSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// Only recognising, for a place that exists.
    var detectOnly = false
    @State var url = ""
    /// name (when AI read one), stations, web page.
    let onDone: (String?, [String], String) -> Void

    @State private var photos: [PhotosPickerItem] = []
    @State private var busy = false
    @State private var error: String?

    init(detectOnly: Bool = false, url: String = "", onDone: @escaping (String?, [String], String) -> Void) {
        self.detectOnly = detectOnly
        _url = State(initialValue: url)
        self.onDone = onDone
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(detectOnly ? "Poznat automaticky" : "Přidat posilovnu").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).padding(.top, 22)

                VStack(alignment: .leading, spacing: 12) {
                    if !detectOnly {
                        Label("Poznat automaticky", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    }
                    HStack(spacing: 8) {
                        Image(systemName: "globe").foregroundStyle(Palette.muted)
                        TextField("https://posilovna.cz", text: $url)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(Palette.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    let photoCount = photos.count
                    PhotosPicker(selection: $photos, maxSelectionCount: 8, matching: .images) {
                        Label(photoCount == 0 ? L10n.tr("Přidat fotky") : L10n.f("Přidat fotky (%@)", String(photoCount)), systemImage: "camera")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 44)
                            .overlay(Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1))
                    }
                    .disabled(busy)
                    PrimaryButton(title: L10n.tr(busy ? "Poznávám…" : "Poznat"), busy: busy) { Task { await detect() } }
                        .disabled(busy || model.demo || (photos.isEmpty && !cleanUrl.hasPrefix("http")))
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true) }
                }
                .padding(16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Palette.green, lineWidth: 1.5))

                if !detectOnly {
                    Button {
                        onDone(nil, [], "")
                        dismiss()
                    } label: {
                        Label("Vybrat sám", systemImage: "pencil").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, 24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.background)
        .interactiveDismissDisabled(busy)
    }

    private var cleanUrl: String { url.trimmingCharacters(in: .whitespaces) }

    private func detect() async {
        busy = true
        defer { busy = false }
        var jpegs: [Data] = []
        for item in photos {
            if let raw = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: raw), let jpeg = image.jpegForUpload(side: 1400) {
                jpegs.append(jpeg)
            }
        }
        let link = cleanUrl.hasPrefix("http") ? cleanUrl : ""
        guard !jpegs.isEmpty || !link.isEmpty else { error = L10n.tr("Fotky se nepodařilo načíst."); return }
        do {
            let r = try await model.api.detectGymEquipment(photos: jpegs, url: link)
            if r.found == true, let found = r.stations, !found.isEmpty {
                onDone(r.gymName?.nilIfBlank, Array(Set(found).union(["floor_mats"])).sorted(), link)
                dismiss()
            } else {
                error = r.message ?? L10n.tr("Vybavení se nepodařilo poznat.")
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
