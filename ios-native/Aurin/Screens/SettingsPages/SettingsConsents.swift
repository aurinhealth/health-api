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
            // All four always show, so a page that links here never lands on a
            // missing switch: one that needs AI, the journal or cycle tracking
            // first says so, and one still given can always be turned off.
            SettingsDivider()
            consent("Citlivé položky", "Kouč vidí náladu, úzkost, konopí, CBD a léky z deníku",
                    blocked: !ai ? "Nejdřív zapni AI funkce" : !journalOn ? "Nejdřív zapni Deník" : nil,
                    isOn: shareSensitive, ask: { askingSensitive = true }, off: { await setSensitive(false) })
            SettingsDivider()
            consent("Kouč ví o cyklu", "Kouč vidí, ve které části cyklu jsi",
                    blocked: !ai ? "Nejdřív zapni AI funkce" : !cycleOn ? "Nejdřív zapni sledování cyklu" : nil,
                    isOn: cycleShared, ask: { askingCycle = true }, off: { await setCycle(false) })
            SettingsDivider()
            consent("Sexuální aktivita", "Z Apple Health do deníku, nikdy do AI",
                    blocked: !journalOn ? "Nejdřív zapni Deník" : nil,
                    isOn: appleSex, ask: { askingSex = true }, off: { await setAppleSex(false) })
            // Cycle data is the most sensitive: tracking shows here too, and is
            // turned on only in Cyklus with its own consent (plan, decision 3).
            SettingsDivider()
            NavigationLink { CycleSettingsView() } label: {
                SettingsRow(title: "Sledovat cyklus", value: L10n.tr(cycleOn ? "Zapnuto" : "Vypnuto"))
            }
            .buttonStyle(.plain)
        }
        .sheet(isPresented: $askingAI) {
            // The onboarding's full consent text (PRIV-1), the same card as in the coach.
            SheetFrame(title: "AI funkce") {
                VStack(spacing: 10) {
                    AIConsentCard(allow: { try await model.api.allowAI() }) {
                        ai = true
                        model.setAIOff(false)
                        error = nil
                        askingAI = false
                    }
                    // Declining is an answer of its own, not only closing.
                    SecondaryButton(title: "Teď ne") { askingAI = false }
                }
            }
            .glassSheetBackground()
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

    /// A consent switch; `blocked` names what must be on first, and greys the
    /// switch out unless the consent is still given.
    private func consent(_ title: String, _ subtitle: String, blocked: String?, isOn: Bool,
                         ask: @escaping () -> Void, off: @escaping () async -> Void) -> some View {
        SettingsToggle(title: title, subtitle: blocked.map { L10n.tr($0) } ?? L10n.tr(subtitle),
                       isOn: Binding(get: { isOn }, set: { on in if on { ask() } else { Task { await off() } } }),
                       disabled: saving || model.demo || (blocked != nil && !isOn))
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
    @Environment(\.inPrivacySettings) private var inPrivacy

    var body: some View {
        // Opened from Soukromí a data: no way round to it again.
        if !inPrivacy {
            SettingsGroup {
                NavigationLink { PrivacySettingsView() } label: {
                    SettingsRow(title: "Soukromí a data", subtitle: subtitle)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

extension EnvironmentValues {
    /// Inside Soukromí a data and the pages it opens.
    @Entry var inPrivacySettings = false
}
