import SwiftUI

/// ⋯ on a done activity → Upravit kalorie and Smazat aktivitu
/// (src/activity-edits.js). Both stay in Aurin unless the activity is the
/// app's own or the user deletes it in Intervals.icu too.
struct ActivityEditing: ViewModifier {
    @Environment(AppModel.self) private var model
    /// The activity's id on the server: its external id, or gym:<date>.
    let id: String
    let title: String
    /// The calories Aurin counts now, for the field.
    var kcal: Double? = nil
    /// Already set in Aurin: the field offers going back to the device's number.
    var edited = false
    @Binding var deleting: Bool
    @Binding var editingKcal: Bool
    var onDeleted: () -> Void = {}
    @State private var options: ActivityDeleteOptions?
    @State private var kcalText = ""
    @State private var error: String?

    func body(content: Content) -> some View {
        content
            .onChange(of: deleting) { _, now in if now { Task { await loadOptions() } } }
            .onChange(of: editingKcal) { _, now in if now { kcalText = kcal.map { Fmt.int($0) } ?? "" } }
            .confirmationDialog(L10n.f("Smazat „%@“?", title),
                                isPresented: Binding(get: { options != nil }, set: { if !$0 { options = nil; deleting = false } }),
                                titleVisibility: .visible, presenting: options) { o in
                switch o.kind {
                case "app":
                    Button("Smazat", role: .destructive) { Task { await delete(o, everywhere: true) } }
                case "intervals":
                    Button("Smazat jen v Aurinu", role: .destructive) { Task { await delete(o, everywhere: false) } }
                    Button("Smazat i v Intervals.icu", role: .destructive) { Task { await delete(o, everywhere: true) } }
                default:
                    Button("Smazat jen v Aurinu", role: .destructive) { Task { await delete(o, everywhere: false) } }
                }
                Button("Zrušit", role: .cancel) {}
            } message: { o in
                Text(Self.message(o))
            }
            .alert("Upravit kalorie", isPresented: $editingKcal) {
                TextField("kcal", text: $kcalText).keyboardType(.numberPad)
                Button("Uložit") { Task { await saveKcal(Int(kcalText.filter(\.isNumber))) } }
                if edited { Button("Vrátit hodnotu zařízení") { Task { await saveKcal(nil) } } }
                Button("Zrušit", role: .cancel) {}
            } message: {
                Text("Změní se jen v Aurinu, zdroj aktivity zůstane beze změny.")
            }
            .alert("Nepovedlo se", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(verbatim: error ?? "")
            }
    }

    static func message(_ o: ActivityDeleteOptions) -> String {
        switch o.kind {
        case "app": return L10n.tr("Trénink zapsaný v Aurinu zmizí i z Intervals.icu, kam ho Aurin poslal.")
        case "intervals": return L10n.tr("Jen v Aurinu: Intervals.icu ho dál má, Aurin ho nepočítá.")
        default:
            if o.source == "strava" { return L10n.tr("Jen v Aurinu: aktivita přišla ze Stravy a smazat jde jen ve Stravě. Aurin ji přestane počítat.") }
            if o.source == "wahoo" { return L10n.tr("Jen v Aurinu: Wahoo ho dál má, Aurin ho nepočítá.") }
            return o.source == "apple"
                ? L10n.tr("Apple Health dovolí smazat trénink jen aplikaci, která ho zapsala. Aurin ho přestane počítat.")
                : L10n.tr("Google Health dovolí smazat trénink jen ve své aplikaci. Aurin ho přestane počítat.")
        }
    }

    private func loadOptions() async {
        guard !model.demo else { deleting = false; return }
        do { options = try await model.api.activityDeleteOptions(id: id) }
        catch { self.error = error.localizedDescription; deleting = false }
    }

    /// Gone from the screens now, from the server after "Vrátit" had its 6 s
    /// (AppModel.deleteLater); the toast says where the activity stays.
    private func delete(_ o: ActivityDeleteOptions, everywhere: Bool) async {
        let model = model
        let id = id
        let note = Self.stays(o, everywhere: everywhere)
        deleting = false
        model.deleteLater(L10n.tr("Aktivita smazána"), note: note, activity: id) {
            do {
                try await model.api.deleteActivity(id: id, everywhere: everywhere)
            } catch {
                model.notice = error.localizedDescription
            }
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
        }
        onDeleted()
    }

    /// Where a deleted activity still is, under "Aktivita smazána".
    static func stays(_ o: ActivityDeleteOptions, everywhere: Bool) -> String? {
        if o.kind == "app" || (o.kind == "intervals" && everywhere) { return nil }
        switch o.kind == "intervals" ? "intervals" : o.source ?? "" {
        case "intervals": return L10n.tr("Jen v Aurinu. Intervals.icu ji dál má.")
        case "strava": return L10n.tr("Jen v Aurinu. Strava ji dál má.")
        case "wahoo": return L10n.tr("Jen v Aurinu. Wahoo ji dál má.")
        case "apple": return L10n.tr("Jen v Aurinu. Apple Health ji dál má.")
        default: return L10n.tr("Jen v Aurinu. Google Health ji dál má.")
        }
    }

    private func saveKcal(_ value: Int?) async {
        guard !model.demo else { return }
        if let value, !(1...6000).contains(value) { error = L10n.tr("Zadej hodnotu od 1 do 6 000 kcal."); return }
        do {
            try await model.api.setActivityKcal(id: id, kcal: value)
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension View {
    func activityEditing(id: String, title: String, kcal: Double? = nil, edited: Bool = false,
                         deleting: Binding<Bool>, editingKcal: Binding<Bool>, onDeleted: @escaping () -> Void = {}) -> some View {
        modifier(ActivityEditing(id: id, title: title, kcal: kcal, edited: edited, deleting: deleting, editingKcal: editingKcal, onDeleted: onDeleted))
    }
}

/// ⋯ Odpárovat od plánu on a done activity the app paired with a plan (an
/// Intervals.icu plan, or the gym plan saved for that day): the activity stays
/// and counts, the plan goes back to the day as not done; "Vrátit" pairs them
/// again (src/manual-pairs.js).
struct ActivityUnpairing: ViewModifier {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    @Binding var asking: Bool
    var onUnpaired: () -> Void = {}
    @State private var error: String?

    func body(content: Content) -> some View {
        content
            .confirmationDialog(L10n.f("Zrušit spárování „%@“?", session.title), isPresented: $asking, titleVisibility: .visible) {
                Button("Zrušit spárování") { Task { await unpair() } }
                Button("Zrušit", role: .cancel) {}
            } message: {
                Text("Aktivita zůstane a dál se počítá. Naplánovaný trénink se vrátí do plánu.")
            }
            .alert("Nepovedlo se", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(verbatim: error ?? "")
            }
    }

    private func unpair() async {
        guard let target = session.unpairTarget, !model.demo else { return }
        let model = model
        let session = session
        do {
            try await model.api.pairActivity(plannedId: target, activityId: nil, date: session.date)
        } catch {
            self.error = error.localizedDescription
            return
        }
        onUnpaired()
        async let training: Void = model.refreshTraining()
        await model.refresh()
        await training
        model.undoToast = PlanToast(title: L10n.tr("Spárování zrušeno"), note: L10n.tr("Naplánovaný trénink je zpět v plánu."), cancelled: false, undo: {
            // A gym plan goes back to the automatic pairing, a plan to this activity.
            if target.hasPrefix("gym:") {
                try? await model.api.resetPair(plannedId: target, date: session.date)
            } else {
                try? await model.api.pairActivity(plannedId: target, activityId: session.id, date: session.date)
            }
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
        })
    }
}

extension View {
    func activityUnpairing(session: WeekSession?, asking: Binding<Bool>, onUnpaired: @escaping () -> Void = {}) -> some View {
        Group {
            if let session, session.unpairTarget != nil {
                modifier(ActivityUnpairing(session: session, asking: asking, onUnpaired: onUnpaired))
            } else {
                self
            }
        }
    }
}
