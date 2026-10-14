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
                    Button("Smazat", role: .destructive) { Task { await delete(everywhere: true) } }
                case "intervals":
                    Button("Smazat jen v Aurinu", role: .destructive) { Task { await delete(everywhere: false) } }
                    Button("Smazat i v Intervals.icu", role: .destructive) { Task { await delete(everywhere: true) } }
                default:
                    Button("Smazat jen v Aurinu", role: .destructive) { Task { await delete(everywhere: false) } }
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

    private func delete(everywhere: Bool) async {
        do {
            try await model.api.deleteActivity(id: id, everywhere: everywhere)
            deleting = false
            await model.refreshTraining()
            await model.refresh()
            onDeleted()
        } catch {
            deleting = false
            self.error = error.localizedDescription
        }
    }

    private func saveKcal(_ value: Int?) async {
        guard !model.demo else { return }
        if let value, !(1...6000).contains(value) { error = L10n.tr("Zadej kalorie mezi 1 a 6000."); return }
        do {
            try await model.api.setActivityKcal(id: id, kcal: value)
            await model.refreshTraining()
            await model.refresh()
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
