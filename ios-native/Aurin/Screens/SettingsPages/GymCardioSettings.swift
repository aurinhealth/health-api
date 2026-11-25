import SwiftUI

/// Nastavení → Posilovna → Kardio, the same kind of page as Rozcvička and
/// Protažení: when it goes in a workout, how long, on which machine, and the
/// quick times offered when cardio starts (src/stretching.js cardioFor,
/// cardioOptions, cardioFavourites). Each change is saved at once.
struct GymCardioSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var prefs: GymPreferences?
    @State private var editingTimes = false
    @State private var addingTime = false
    @State private var error: String?
    /// Délka kardia while the slider moves: 0 = no limit.
    @State private var length = 0

    static let modes = [("start", "Na začátku"), ("end", "Na konci"), ("both", "Obojí"), ("none", "Vypnuto")]

    private var mode: String { prefs?.cardioMode ?? "start" }
    private var machine: String? { prefs?.cardioType ?? prefs?.cardioOptions?.first?.id }
    private var times: [Int] { prefs?.cardioFavourites ?? GymCardio.favourites }

    /// The active place's cardio machines (the sample day: all of them).
    private var machines: [(String, String)] {
        let options = prefs?.cardioOptions ?? GymCardio.all.map { GymPreferences.CardioOption(id: $0, name: GymCardio.name($0)) }
        return options.map { ($0.id, $0.name) }
    }

    var body: some View {
        SettingsPage(title: GymRoutineKind.cardio.title) {
            SettingsGroup(title: "Ve výchozím stavu", footer: "U Obojí dostane tuhle délku každá část.") {
                ForEach(Self.modes, id: \.0) { id, name in
                    if id != Self.modes.first?.0 { SettingsDivider() }
                    GymChoiceRow(title: L10n.tr(name), selected: mode == id) { save(["cardio": .string(id)]) }
                }
            }
            SettingsGroup(title: "Délka") {
                CardioLengthSlider(minutes: $length, title: "Délka kardia") { value in
                    if value != (prefs?.cardioLength ?? 0) { save(["cardioLength": .number(Double(value))]) }
                }
                .padding(16)
            }
            SettingsGroup(title: "Stroj") {
                ForEach(machines, id: \.0) { id, name in
                    if id != machines.first?.0 { SettingsDivider() }
                    GymChoiceRow(title: name, selected: machine == id) { save(["cardioType": .string(id)]) }
                }
            }
            quickTimes
            Text("Stroj a délka platí i pro kardio, které přidáš během tréninku.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .disabled(prefs == nil && !model.demo)
        .task { await load() }
        .sheet(isPresented: $addingTime) {
            CardioTimeSheet { value in saveTimes(times + [value]) }
        }
    }

    /// The times, Edit for removing them, Add a time (at most six).
    private var quickTimes: some View {
        SettingsGroup(title: "Rychlé časy", footer: "Nabídnou se jako tlačítka, když v tréninku spouštíš kardio.",
                      action: times.isEmpty ? nil : SettingsGroupAction(title: L10n.tr(editingTimes ? "Hotovo" : "Upravit")) { editingTimes.toggle() }) {
            ForEach(times, id: \.self) { minutes in
                HStack(spacing: 12) {
                    if editingTimes {
                        Button { saveTimes(times.filter { $0 != minutes }) } label: {
                            Image(systemName: "minus.circle.fill").scaledFont(20).foregroundStyle(Palette.rust)
                                .frame(width: 44, height: 44).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(L10n.f("Odebrat %@", "\(minutes) min")))
                    }
                    Text(verbatim: "\(minutes) min").font(.body).foregroundStyle(Palette.ink)
                    Spacer()
                }
                .padding(.leading, editingTimes ? 4 : 18).padding(.trailing, 16)
                .frame(minHeight: 50)
                SettingsDivider()
            }
            if !editingTimes && times.count < 6 {
                Button { addingTime = true } label: {
                    Label { Text("Přidat čas") } icon: { Image(systemName: "plus") }
                        .font(.body).foregroundStyle(Palette.green)
                        .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                        .padding(.horizontal, 18)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else if !editingTimes {
                Text("Víc než šest časů se nevejde. Nějaký odeber přes Upravit.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                    .padding(.horizontal, 18)
            }
        }
    }

    /// At most six, each once, shortest first (src/stretching.js cardioFavourites).
    private func saveTimes(_ list: [Int]) {
        let next = Array(Set(list.filter { (1...60).contains($0) })).sorted().prefix(6).map { $0 }
        if next.isEmpty { editingTimes = false }
        save(["cardioFavourites": .array(next.map { .number(Double($0)) })])
    }

    private func load() async {
        guard !model.demo else { return }
        do { apply(try await model.api.gymPreferences()); error = nil } catch { self.error = error.localizedDescription }
    }

    private func apply(_ value: GymPreferences) {
        prefs = value
        length = value.cardioLength ?? 0
    }

    private func save(_ change: JSONObject) {
        guard !model.demo else { return }
        Task {
            do { apply(try await model.api.saveGymPreferences(change)); error = nil } catch { self.error = error.localizedDescription }
        }
    }
}
