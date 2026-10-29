import SwiftUI

/// The first days after the setup (review 2026-10-28): Today is still mostly
/// empty, so a card under readiness says what to do to fill it. It shows for
/// two weeks after the setup on this phone, until all three are done.
enum FirstDays {
    static let sinceKey = "firstDays.since"
    static let mealKey = "firstDays.meal"
    static let coachKey = "firstDays.coach"
    /// How long the card may show: readiness needs 14 nights of its own.
    static let days = 14

    /// The setup finished (SetupFlowView): the card starts.
    static func start() {
        let defaults = UserDefaults.standard
        defaults.set(Date().timeIntervalSince1970, forKey: sinceKey)
        defaults.removeObject(forKey: mealKey)
        defaults.removeObject(forKey: coachKey)
    }

    /// A meal logged (APIClient.logFood) or a question to the coach (APIClient.askCoach).
    static func mark(_ key: String) {
        if UserDefaults.standard.double(forKey: sinceKey) > 0 { UserDefaults.standard.set(true, forKey: key) }
    }

    /// Signed out: the next account starts from its own setup.
    static func forget() {
        for key in [sinceKey, mealKey, coachKey] { UserDefaults.standard.removeObject(forKey: key) }
    }
}

/// "První dny": wear the watch tonight, log a meal, ask the coach. Each row
/// opens its place and ticks itself off; the card goes when all three are done.
struct FirstDaysCard: View {
    let today: TodaySnapshot
    var openCoach: () -> Void = {}
    @Environment(AppModel.self) private var model
    @AppStorage(FirstDays.sinceKey) private var since: Double = 0
    @AppStorage(FirstDays.mealKey) private var meal = false
    @AppStorage(FirstDays.coachKey) private var coach = false

    private var night: Bool { today.readiness.score != nil }
    private var doneCount: Int { [night, meal, coach].filter { $0 }.count }

    /// Within two weeks of the setup and not everything done yet.
    private var showing: Bool {
        guard since > 0 else { return false }
        let age = Date().timeIntervalSince1970 - since
        return age < Double(FirstDays.days) * 86_400 && doneCount < 3
    }

    var body: some View {
        if showing {
            Card {
                HStack {
                    Text("První dny").font(Typo.bodyStrong).foregroundStyle(Palette.green)
                    Spacer()
                    Text(L10n.f("%@ ze 3", String(doneCount))).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                VStack(spacing: 0) {
                    RouteLink(route: .readiness) {
                        row("Nos dnes v noci hodinky", "Ráno uvidíš připravenost.", done: night)
                    }
                    Divider().overlay(Palette.hairline)
                    Button { model.tab = .food } label: {
                        row("Zapiš jídlo", "Vyfoť talíř nebo naskenuj kód.", done: meal)
                    }
                    .buttonStyle(PressableCardStyle())
                    Divider().overlay(Palette.hairline)
                    Button(action: openCoach) {
                        row("Zeptej se kouče", "Zná tvůj spánek, trénink i jídlo.", done: coach)
                    }
                    .buttonStyle(PressableCardStyle())
                }
                Text("S historií z hodinek budou čísla hotová zítra. Bez ní potřebuje připravenost asi 14 nocí, než se ustálí.")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func row(_ title: LocalizedStringKey, _ note: LocalizedStringKey, done: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .scaledFont(24, weight: .regular)
                .foregroundStyle(done ? Palette.green : Palette.faint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Typo.bodyStrong).foregroundStyle(done ? Palette.muted : Palette.ink)
                    .strikethrough(done, color: Palette.muted)
                Text(note).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(done ? L10n.tr("hotovo") : "")
    }
}
