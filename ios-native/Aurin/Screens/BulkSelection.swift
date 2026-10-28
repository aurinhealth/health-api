import SwiftUI

/// Vybrat in a meal and in Pití dnes: tick several foods or drinks, then copy,
/// move or delete them at once (/app/api/food/entries, /app/api/fluids?bulk=1).

/// The circle in front of a row while selecting: ticked in the button colour.
struct SelectCircle: View {
    let on: Bool

    var body: some View {
        ZStack {
            if on {
                Circle().fill(Palette.button)
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Palette.onButton)
            } else {
                Circle().stroke(Palette.ink.opacity(0.3), lineWidth: 1.5)
            }
        }
        .frame(width: 24, height: 24)
        .animation(.easeOut(duration: 0.15), value: on)
    }
}

/// A row while selecting: the circle in front, a tap ticks or unticks it.
struct SelectableRow<Content: View>: View {
    let on: Bool
    let toggle: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 12) {
            SelectCircle(on: on)
            content
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: toggle)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

/// Kopírovat · Přesunout · Smazat under the list while selecting.
struct BulkActionBar: View {
    let count: Int
    var copy: () -> Void
    var move: () -> Void
    var delete: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            item("doc.on.doc", "Kopírovat", Palette.ink, copy)
            item("arrow.right", "Přesunout", Palette.ink, move)
            item("trash", "Smazat", Palette.rust, delete)
        }
        .padding(.vertical, 10)
        .chromeGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 10, y: 3)
        .disabled(count == 0)
        .opacity(count == 0 ? 0.45 : 1)
    }

    private func item(_ symbol: String, _ title: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: symbol).font(.system(size: 18, weight: .medium))
                Text(L10n.tr(title)).font(.caption.weight(.medium))
            }
            .foregroundStyle(color)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Where the selection goes: the day (Dnes, Zítra or another) and, for food,
/// the meal of the day.
struct BulkMoveSheet: View {
    @Environment(\.dismiss) private var dismiss
    /// "Přesunout" or "Kopírovat".
    let verb: String
    let count: Int
    /// The day the items are on now.
    let from: String
    /// The meal they are in now; nil for drinks (no meal to choose).
    var meal: String? = nil
    let confirm: (_ date: String, _ meal: String?) async -> String?
    @State private var day = Date()
    @State private var chosenMeal = "breakfast"
    @State private var working = false
    @State private var error: String?

    private var today: Date { Date() }
    private var tomorrow: Date { Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date() }
    private var lastDay: Date { Calendar.current.date(byAdding: .day, value: AppModel.foodDaysAhead, to: Date()) ?? Date() }

    var body: some View {
        NavigationStack {
            SettingsPage(title: L10n.f(verb == "Kopírovat" ? "Kopírovat %@" : "Přesunout %@", Self.items(count))) {
                SettingsGroup(title: "Den") {
                    HStack(spacing: 8) {
                        chip("Dnes", Calendar.current.isDate(day, inSameDayAs: today)) { day = today }
                        chip("Zítra", Calendar.current.isDate(day, inSameDayAs: tomorrow)) { day = tomorrow }
                        Spacer(minLength: 4)
                        DatePicker("", selection: $day, in: ...lastDay, displayedComponents: .date)
                            .labelsHidden()
                            .environment(\.locale, Fmt.locale)
                    }
                    .padding(.horizontal, 16).frame(minHeight: 54)
                }
                if meal != nil {
                    SettingsGroup(title: "Jídlo") {
                        ForEach(Array(MealSlot.all.enumerated()), id: \.element.id) { index, slot in
                            if index > 0 { SettingsDivider() }
                            Button { chosenMeal = slot.id } label: {
                                HStack {
                                    Text(L10n.tr(slot.label)).font(.body).foregroundStyle(Palette.ink)
                                    Spacer()
                                    if chosenMeal == slot.id {
                                        Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                                    }
                                }
                                .padding(.horizontal, 16).frame(minHeight: 48)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: working ? "Ukládám…" : verb, busy: working) {
                    Task {
                        working = true
                        error = await confirm(AppModel.localDate(day), meal == nil ? nil : chosenMeal)
                        working = false
                        if error == nil { dismiss() }
                    }
                }
                .disabled(working)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } }
            }
        }
        .tint(Palette.ink)
        .presentationDetents([.large])
        .onAppear {
            day = FoodEntryEditSheet.date(from) ?? Date()
            if let meal { chosenMeal = meal }
        }
    }

    private func chip(_ title: String, _ on: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(L10n.tr(title)).font(on ? Typo.bodyStrong : .body)
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 14).frame(height: 34)
                .background(on ? Palette.button : .clear, in: Capsule())
                .overlay(Capsule().stroke(Palette.ink.opacity(on ? 0 : 0.18), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    /// "2 položky", "5 položek".
    static func items(_ n: Int) -> String {
        L10n.plural("%lld položek", n)
    }
}
