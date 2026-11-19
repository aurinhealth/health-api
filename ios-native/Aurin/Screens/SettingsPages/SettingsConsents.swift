import SwiftUI

// Soukromí a data → "Co Aurin smí používat" (Settings concept v18, Petr
// 2026-11-13: every consent and data switch in one place). Each consent is
// its own switch (the four GDPR art. 9 consents are never merged): AI
// features, the sensitive journal items and the cycle for the coach (only
// while AI is on and the feature is on), and sexual activity from Apple
// Health (only while the journal is on); one still given always shows. Turning one on shows its consent
// text first; turning one off needs none. Deník and Cyklus link here.

struct PrivacyConsentsGroup: View {
    @Environment(AppModel.self) private var model
    @Binding var ai: Bool
    let aiLoaded: Bool
    let setAI: (Bool) -> Void
    @Binding var error: String?

    @State private var journalOn = false
    @State private var shareSensitive = false
    @State private var appleSex = JournalSwitch.tracksSex
    @State private var askingAI = false
    @State private var askingSensitive = false
    @State private var askingSex = false
    @State private var askingCycle = false
    @State private var saving = false

    private var cycleOn: Bool { model.cycle?.enabled == true }
    private var cycleShared: Bool { model.cycle?.settings?.shareWithCoach == true }

    var body: some View {
        SettingsGroup(title: "Co Aurin smí používat", footer: "Každý souhlas je samostatný a kdykoli ho vypneš. Bez nich zbytek aplikace funguje dál.") {
            SettingsToggle(title: "AI funkce", subtitle: "Kouč, fotky jídla, dohledání potravin",
                           isOn: Binding(get: { ai }, set: { on in if on { askingAI = true } else { setAI(false) } }),
                           disabled: !aiLoaded || model.demo)
            // What the coach may see only matters while the coach is on; a
            // consent still given always shows, so it can be withdrawn.
            if (ai && journalOn) || shareSensitive {
                SettingsDivider()
                SettingsToggle(title: "Citlivé položky", subtitle: "Kouč vidí náladu, úzkost, konopí, CBD a léky z deníku",
                               isOn: Binding(get: { shareSensitive }, set: { on in
                                   if on { askingSensitive = true } else { Task { await setSensitive(false) } }
                               }), disabled: saving || model.demo)
            }
            if (ai && cycleOn) || cycleShared {
                SettingsDivider()
                SettingsToggle(title: "Kouč ví o cyklu", subtitle: "Kouč vidí, ve které části cyklu jsi",
                               isOn: Binding(get: { cycleShared }, set: { on in
                                   if on { askingCycle = true } else { Task { await setCycle(false) } }
                               }), disabled: saving || model.demo)
            }
            if journalOn || appleSex {
                SettingsDivider()
                SettingsToggle(title: "Sexuální aktivita", subtitle: "Z Apple Health do deníku, nikdy do AI",
                               isOn: Binding(get: { appleSex }, set: { on in
                                   if on { askingSex = true } else { Task { await setAppleSex(false) } }
                               }), disabled: saving || model.demo)
            }
        }
        .animation(.snappy, value: ai)
        .sheet(isPresented: $askingAI) {
            // The onboarding's full consent text (PRIV-1), the same card as in the coach.
            NavigationStack {
                ScrollView {
                    AIConsentCard(allow: { try await model.api.allowAI() }) {
                        ai = true
                        model.setAIOff(false)
                        error = nil
                        askingAI = false
                    }
                    .padding(20)
                }
                .background { Palette.background.ignoresSafeArea() }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Teď ne") { askingAI = false } }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $askingSensitive) {
            JournalSensitiveConsentSheet { Task { await setSensitive(true) } }
        }
        .sheet(isPresented: $askingSex) {
            AppleSexConsentSheet { Task { await setAppleSex(true) } }
        }
        .sheet(isPresented: $askingCycle) {
            CoachCycleConsentSheet(isOn: cycleShared) { Task { await setCycle(true) } }
        }
        .task { await load() }
    }

    private func load() async {
        if model.cycle == nil { await model.loadCycle() }
        if model.demo {
            journalOn = true
            return
        }
        guard let catalog = try? await model.api.journalCatalog() else { return }
        journalOn = catalog.enabled ?? true
        shareSensitive = catalog.shareSensitive ?? false
        appleSex = catalog.appleSex ?? false
    }

    /// Whether the server stored it; if not, the reason shows under the page.
    private func saveJournal(_ body: JSONObject) async -> Bool {
        guard !model.demo else { return true }
        saving = true
        defer { saving = false }
        do {
            try await model.api.setJournalOptions(body)
            error = nil
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    private func setSensitive(_ on: Bool) async {
        if await saveJournal(["shareSensitive": .bool(on)]) { shareSensitive = on } else { await load() }
    }

    /// The phone reads and sends sexual activity only once the server holds
    /// the consent (src/apple-health.js). On reads the last 90 days again; off
    /// stops at once and the server deletes what it has.
    private func setAppleSex(_ on: Bool) async {
        guard await saveJournal(["appleSex": .bool(on)]) else {
            if !on { await load() }
            return
        }
        appleSex = on
        JournalSwitch.remember(appleSex: on)
        if on, !model.demo { await AppleHealth.shared.readSexHistory(api: model.api) }
    }

    private func setCycle(_ on: Bool) async {
        saving = true
        defer { saving = false }
        do {
            try await model.saveCycleSettings(["shareWithCoach": .bool(on)])
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// On Deník and Cyklus: their consents live in Soukromí a data.
struct PrivacyLinkRow: View {
    let subtitle: String

    var body: some View {
        SettingsGroup {
            NavigationLink { PrivacySettingsView() } label: {
                SettingsRow(title: "Soukromí a data", subtitle: subtitle)
            }
            .buttonStyle(.plain)
        }
    }
}
