import SwiftUI

/// Jídlo → a food of the diary: its amount (the server rescales the energy
/// and macros), the meal of the day and the day, a copy to another day, or
/// deleting it (/app/api/food/entry, src/food-entry-management.js).
struct FoodEntryEditSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let entry: FoodSnapshot.Entry
    /// The day the entry is logged on (yyyy-MM-dd).
    let date: String
    @State private var amountText = ""
    @State private var meal = "lunch"
    @State private var day = Date()
    @State private var copyDay = Date()
    @State private var copying = false
    @State private var working = false
    @State private var confirmDelete = false
    @State private var error: String?

    /// 150 and "g" from "150 g", the amount as the server shows it.
    private var logged: (value: Double, unit: String)? { Self.amount(entry.amount) }
    /// Millilitres are typed in fluid ounces in imperial units.
    private var fluid: Bool { logged?.unit == "ml" && Units.imperial }
    private var shownUnit: String? { fluid ? Units.volumeUnit : logged?.unit }

    /// The typed amount in the entry's own unit; nil when it is not a number.
    private var typedAmount: Double? {
        let t = amountText.replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: " ", with: "")
        guard let v = Double(t), v > 0 else { return nil }
        return fluid ? Units.ml(v) : v
    }

    private var amountChanged: Bool {
        guard let logged, let typed = typedAmount else { return false }
        return abs(typed - logged.value) >= 0.05
    }

    /// The energy for the typed amount, as the server will count it.
    private var previewKcal: Double? {
        guard let kcal = entry.kcal else { return nil }
        guard let logged, logged.value > 0, let typed = typedAmount else { return kcal }
        return kcal * typed / logged.value
    }

    private var lastDay: Date { Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date() }
    private var changed: Bool { amountChanged || meal != entry.meal || AppModel.localDate(day) != date }

    var body: some View {
        NavigationStack {
            SettingsPage(title: "Upravit jídlo") {
                Text(entry.name).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)

                SettingsGroup {
                    if let shownUnit {
                        SettingsField(title: "Množství", text: $amountText, unit: shownUnit)
                        SettingsDivider()
                    }
                    SettingsRow(title: "Energie", value: Fmt.int(previewKcal) + " kcal", chevron: false)
                    SettingsDivider()
                    Picker(selection: $meal) {
                        ForEach(MealSlot.all) { slot in Text(slot.label).tag(slot.id) }
                    } label: {
                        Text("Jídlo dne").font(.body).foregroundStyle(Palette.ink)
                    }
                    .pickerStyle(.menu)
                    .padding(.horizontal, 16).frame(minHeight: 50)
                    SettingsDivider()
                    DatePicker("Den", selection: $day, in: ...lastDay, displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16).frame(minHeight: 50)
                }

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                // A meal still waiting for signal (negative id) can only be deleted.
                if entry.id >= 0 {
                PrimaryButton(title: working ? "Ukládám…" : "Uložit", busy: working) { Task { await save() } }
                    .disabled(working || !changed || (logged != nil && typedAmount == nil))

                if copying {
                    SettingsGroup {
                        DatePicker("Kopírovat na den", selection: $copyDay, in: ...lastDay, displayedComponents: .date)
                            .environment(\.locale, Fmt.locale)
                            .padding(.horizontal, 16).frame(minHeight: 50)
                    }
                    PrimaryButton(title: "Kopírovat", systemImage: "doc.on.doc") { Task { await copy() } }
                        .disabled(working)
                } else {
                    SecondaryButton(title: "Kopírovat na jiný den", systemImage: "doc.on.doc") { copying = true }
                        .disabled(working)
                }
                }

                Button(role: .destructive) { confirmDelete = true } label: {
                    Text("Smazat").font(Typo.bodyStrong).foregroundStyle(Palette.rust).frame(maxWidth: .infinity).frame(height: 46)
                }
                .disabled(working)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } }
            }
        }
        .tint(Palette.ink)
        .confirmationDialog(L10n.f("Smazat „%@“?", entry.name), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Smazat", role: .destructive) { Task { await delete() } }
        }
        .onAppear {
            if let logged { amountText = Self.text(fluid ? Units.volume(logged.value) : logged.value) }
            meal = entry.meal
            day = Self.date(date) ?? Date()
            copyDay = Calendar.current.date(byAdding: .day, value: 1, to: day) ?? day
        }
    }

    // MARK: Changes

    private func run(_ work: () async throws -> Void) async {
        if model.demo { dismiss(); return }
        working = true
        error = nil
        defer { working = false }
        do {
            try await work()
            await model.refreshFood()
            await model.refresh()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        let newDay = AppModel.localDate(day)
        await run {
            try await model.api.updateFoodEntry(id: entry.id, amount: amountChanged ? typedAmount.map(Self.rounded) : nil,
                                                mealType: meal != entry.meal ? meal : nil, date: newDay != date ? newDay : nil)
        }
    }

    private func copy() async {
        let target = AppModel.localDate(copyDay)
        await run { try await model.api.copyFoodEntry(id: entry.id, to: target) }
    }

    private func delete() async {
        if model.demo { dismiss(); return }
        working = true
        await model.deleteFood(id: entry.id)
        working = false
        dismiss()
    }

    // MARK: Helpers

    /// 150 and "g" from "150 g", 0.5 and "porce" from "0.5 porce".
    static func amount(_ text: String?) -> (value: Double, unit: String)? {
        guard let text, let space = text.firstIndex(of: " ") else { return nil }
        let number = text[..<space].replacingOccurrences(of: ",", with: ".")
        let unit = text[text.index(after: space)...].trimmingCharacters(in: .whitespaces)
        guard let value = Double(number), value > 0, !unit.isEmpty else { return nil }
        return (value, unit)
    }

    /// "150", "12,5": what the amount field starts with.
    static func text(_ value: Double) -> String {
        let r = rounded(value)
        if r == r.rounded() { return String(Int(r)) }
        let s = String(format: "%.1f", r)
        return L10n.isEnglish ? s : s.replacingOccurrences(of: ".", with: ",")
    }

    static func rounded(_ value: Double) -> Double { (value * 10).rounded() / 10 }

    static func date(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso).flatMap { Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: $0) }
    }
}
