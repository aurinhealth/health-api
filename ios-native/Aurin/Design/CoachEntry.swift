import SwiftUI
import TipKit

/// The way into the coach, top right on every screen (Petr 2026-11-16,
/// PRAVIDLO-KOUC-VPRAVO-NAHORE): one glass shape for both forms, so they never
/// drift apart. With the page's "i", "…" or "+" it is a capsule with the coach
/// FIRST (Petr's "B", 2026-11-16); alone it is a round disc as big as the back
/// button. Never at the bottom, never beside or above a button of the page.
/// Not on Settings, Weather and the add flows.
///
/// With the AI turned off by its consent (AppModel.aiOff) a tap asks for the
/// consent, it never opens a chat that answers with an error. Without Aurin Pro
/// the chat shows the paywall as before.
struct CoachEntry: View {
    /// What the coach is asked about; nil asks about the screen's day.
    var subject: CoachSubject? = nil
    /// The screen it is opened from when there is no subject (assistantAppContext view).
    var view = "today"
    /// The page's own button that shares the capsule, after the coach.
    var companion: ChromeAction? = nil
    /// The first subpage opened shows "Ask Coach about this" once.
    var hint = true
    /// As high as the back button (ChromeButton); 44 pt to tap.
    private let height: CGFloat = 40

    /// Optional: screen renders in the tests draw pages without the app.
    @Environment(AppModel.self) private var model: AppModel?
    @State private var open = false
    @State private var consent = false

    var body: some View {
        HStack(spacing: 0) {
            CoachEntryButton(size: height, hint: hint) { tap() }
            if let companion {
                Button(action: companion.action) {
                    Image(systemName: companion.systemImage)
                        .scaledFont(15, weight: .semibold, cap: .denseCap)
                        .foregroundStyle(companion.tint ?? Palette.ink)
                        .frame(width: height, height: height)
                        .contentShape(Rectangle())
                        .tapTarget(width: height, height: height)
                }
                .buttonStyle(.plain)
                .disabled(!companion.enabled)
                .opacity(companion.enabled ? 1 : 0.45)
                .accessibilityLabel(L10n.tr(companion.label))
            }
        }
        .padding(.horizontal, companion == nil ? 0 : 2)
        .frame(height: height)
        .chromeGlass(in: Capsule())
        .chromeShadow(0.08, radius: 6, y: 2)
        .fixedSize()
        .sheet(isPresented: $open) { CoachEntry.chat(subject: subject, view: view, date: model?.selectedDate) }
        .sheet(isPresented: $consent) { AIConsentAsk { open = true } }
    }

    private func tap() {
        CoachEntryTip().invalidate(reason: .actionPerformed)
        if let model, model.aiOff && !model.demo { consent = true } else { open = true }
    }

    /// The chat about the subject (CoachPill did this before), or about the day.
    @ViewBuilder static func chat(subject: CoachSubject?, view: String, date: String?) -> some View {
        if let subject {
            CoachView(view: subject.view, date: subject.date, subject: subject, openChat: WorkoutCoachChat.id(for: subject),
                      keepChat: { WorkoutCoachChat.keep($0, for: subject) })
        } else {
            CoachView(view: view, date: date)
        }
    }
}

/// The coach's tap target: Two lights, the label VoiceOver reads ("Coach",
/// "Kouč") and the one identifier UI tests look for in every language.
struct CoachEntryButton: View {
    var size: CGFloat = 40
    var hint = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            TwoLights(size: size * 0.7)
                .frame(width: size, height: size)
                .contentShape(Rectangle())
                .tapTarget(width: size, height: size)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: L10n.tr("Kouč")))
        .accessibilityHint(Text(verbatim: L10n.tr("Zeptej se kouče na tohle")))
        .accessibilityIdentifier("coach.entry")
        .modifier(CoachEntryHint(on: hint))
    }
}

/// "Ask Coach about this", once, the first time a subpage shows the coach:
/// the two lights alone could read as a status dot (tester, 2026-11-16).
struct CoachEntryTip: Tip {
    var title: Text { Text(verbatim: L10n.tr("Zeptej se kouče na tohle")) }
    var options: [any TipOption] { [Tips.MaxDisplayCount(1)] }
}

private struct CoachEntryHint: ViewModifier {
    let on: Bool

    func body(content: Content) -> some View {
        if on { content.popoverTip(CoachEntryTip(), arrowEdge: .top) } else { content }
    }
}

/// The AI consent from the coach's entry while AI is off: the one consent
/// card (AIConsentCard, redesign Z2) in a sheet. Povolit AI turns it on,
/// closes the sheet and opens the chat.
struct AIConsentAsk: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var accepted: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                AIConsentCard(allow: { try await model.api.allowAI() }) {
                    model.setAIOff(false)
                    dismiss()
                    // The consent sheet closes first, then the chat opens.
                    try? await Task.sleep(for: .milliseconds(450))
                    accepted()
                }
                Button { dismiss() } label: {
                    Text("Teď ne").font(Typo.body).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.18)) }
                }
                .buttonStyle(.plain)
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Palette.background)
    }
}
