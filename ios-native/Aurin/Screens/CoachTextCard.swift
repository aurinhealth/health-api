import StoreKit
import SwiftUI

// The coach's sentence on Today, Training and Food (GET /app/api/coach-text,
// src/screen-texts.js): a short text the AI wrote from the screen's own data
// once a day, the numbers it leaned on as chips, and "Proč?" with the data it
// used. Without AI (no consent, no subscription, the AI failed) the screen's
// rule-based text shows in the same card; without one the card is not shown.
// The chevron folds it to one line, per screen; Nastavení → Kouč na obrazovkách
// turns it off on a screen, which then does not ask for the text at all.

/// Where the coach's card shows (Nastavení → Kouč na obrazovkách). Živiny follow Jídlo.
enum CoachTextPlaces {
    static let screens = [("today", "Dnes"), ("training", "Trénink"), ("food", "Jídlo")]

    static func shownKey(_ screen: String) -> String {
        "coach-text-shown-" + (screen == "nutrients" ? "food" : screen)
    }

    static func foldedKey(_ screen: String) -> String { "coach-text-folded-" + screen }
}

/// The answers of this launch, so switching tabs does not ask again.
@MainActor
enum CoachTextMemory {
    static var values: [String: (text: CoachText, at: Date, revision: Int)] = [:]
}

struct CoachTextCard: View {
    @Environment(AppModel.self) private var model
    /// "today", "training" or "food".
    let screen: String
    var fallbackText: String? = nil
    var fallbackAdvice: String? = nil
    /// Only today's screen asks for the AI text; an earlier day keeps its rule-based one.
    var live = true
    /// Today's recovery tip under the sentence (RecoveryTipRows); it shows the card on its own too,
    /// also when the coach is off on Dnes.
    var tip: AnyView? = nil

    @State private var loaded: CoachText?
    @State private var showWhy = false
    /// The free week's line: the App Store's page of the subscription.
    @State private var manageSubscription = false
    @AppStorage private var shown: Bool
    @AppStorage private var folded: Bool

    init(screen: String, fallbackText: String? = nil, fallbackAdvice: String? = nil, live: Bool = true, tip: AnyView? = nil) {
        self.screen = screen
        self.fallbackText = fallbackText
        self.fallbackAdvice = fallbackAdvice
        self.live = live
        self.tip = tip
        self._shown = AppStorage(wrappedValue: true, CoachTextPlaces.shownKey(screen))
        self._folded = AppStorage(wrappedValue: false, CoachTextPlaces.foldedKey(screen))
    }

    private var ai: CoachText? { shown && live && (loaded?.isAI ?? false) ? loaded : nil }
    private var text: String? { shown ? ai?.text ?? fallbackText?.nilIfBlank : nil }
    private var advice: String? { !shown ? nil : ai != nil ? ai?.advice?.nilIfBlank : fallbackAdvice?.nilIfBlank }
    /// Today audit 40, on Today only: without Aurin Pro (the paywall on) the
    /// rule-based text says where the coach's personal word is; in the last two
    /// days of a free week that nothing follows, when it ends. Nothing blurred
    /// or greyed out. A tap opens the plans (Paywall), in the free week the
    /// App Store's own subscription page (it is bought already). Not once this
    /// Apple ID has Pro, before the server heard of the purchase.
    private var proLine: String? {
        guard screen == "today", shown, live, !model.demo else { return nil }
        if loaded?.reason == "pro", !ProStore.shared.entitled { return L10n.tr("Osobní rada kouče je v Aurin Pro") }
        if loaded?.paywall == true, ai != nil, let end = ProStore.shared.freeWeekEnding() {
            return L10n.f("Zkušební týden končí %@. Pak je osobní rada kouče v Aurin Pro.", Fmt.dayMonth(AppModel.localDate(end)))
        }
        return nil
    }
    private var chips: [String] { shown && live && !folded ? (loaded?.chips ?? []) : [] }
    private var basis: [CoachText.Basis] { shown && live && !folded ? (loaded?.basis ?? []) : [] }

    var body: some View {
        // A stack, not a Group: on an empty Group the task never runs.
        VStack(spacing: 0) {
            if text != nil || advice != nil || tip != nil || proLine != nil {
                card
            }
        }
        .task(id: live && shown ? memoryKey + "|" + String(model.dataRevision) : "") { await load() }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 12) {
            if text != nil || advice != nil {
                Button { withAnimation(.snappy) { folded.toggle() } } label: {
                    header(chevron: true).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // Not "Kouč": that is the button that opens the chat.
                .accessibilityLabel(Text(verbatim: L10n.tr("Rada kouče")))
                .accessibilityIdentifier("coach-text.fold")
                .accessibilityHint(Text(verbatim: L10n.tr(folded ? "Rozbalit" : "Sbalit")))

                if folded {
                    Button { withAnimation(.snappy) { folded = false } } label: {
                        sentence
                            .font(Typo.sentence(17))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else {
                    sentence
                        .font(Typo.sentence(21))
                        .foregroundStyle(Palette.ink)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                header(chevron: false)
            }

            if !chips.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(chips, id: \.self) { chip in
                            Text(verbatim: chip)
                                .font(Typo.caption.weight(.medium))
                                .foregroundStyle(Palette.secondary)
                                .padding(.horizontal, 10)
                                .frame(height: 28)
                                .background(Palette.track, in: Capsule())
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }

            if let tip {
                Divider().overlay(Palette.hairline)
                tip
            }

            if let line = proLine {
                Divider().overlay(Palette.hairline)
                Button { if loaded?.reason == "pro" { Paywall.present(model) } else { manageSubscription = true } } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "sparkles").scaledFont(12, weight: .semibold).foregroundStyle(Palette.indigo)
                        Text(verbatim: line).font(Typo.body).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right").scaledFont(12, weight: .semibold).foregroundStyle(Palette.faint)
                            .accessibilityHidden(true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("coach-text.pro")
                .manageSubscriptionsSheet(isPresented: $manageSubscription)
            }

            if !basis.isEmpty {
                Divider().overlay(Palette.hairline)
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { showWhy.toggle() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "magnifyingglass").scaledFont(13, weight: .semibold)
                        Text("Proč?").font(Typo.body)
                        Spacer()
                        Image(systemName: showWhy ? "chevron.up" : "chevron.down").scaledFont(12, weight: .semibold)
                    }
                    .foregroundStyle(Palette.muted)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(showWhy ? .isSelected : [])

                if showWhy {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(basis, id: \.self) { row in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(verbatim: row.label).font(Typo.caption).foregroundStyle(Palette.muted)
                                Spacer(minLength: 8)
                                Text(verbatim: row.value).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.ink)
                                    .multilineTextAlignment(.trailing)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        // No note under the numbers, for the AI's text or the app's own
                        // (Petr 2026-11-04: the AI consent says it, and it only takes space).
                    }
                    .transition(.opacity)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        // Another day: its text at once, not faded over the one before (inside
        // the animation below, so it wins over it).
        .transaction(value: live) { $0.animation = nil }
        .animation(.easeInOut(duration: 0.25), value: ai?.text)
    }

    /// "Kouč", the time the AI wrote it and the chevron that folds the text.
    private func header(chevron: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkles").scaledFont(13, weight: .semibold)
            Text("Kouč").font(Typo.bodyStrong)
            Spacer(minLength: 8)
            if let time = ai?.time {
                Text(verbatim: L10n.f("dnes %@", ClockText.format(time))).font(Typo.caption).foregroundStyle(Palette.faint)
            }
            if chevron {
                Image(systemName: "chevron.up").font(.footnote.weight(.semibold)).foregroundStyle(Palette.muted)
                    .rotationEffect(.degrees(folded ? 180 : 0))
            }
        }
        .foregroundStyle(Palette.indigo)
    }

    /// The text, then the advice in green italics.
    private var sentence: Text {
        var out = Text(verbatim: text ?? "")
        if let advice {
            out = out + Text(verbatim: text == nil ? "" : " ") + Text(verbatim: advice).font(Typo.sentenceItalic(folded ? 17 : 21)).foregroundColor(Palette.green)
        }
        return out
    }

    private var memoryKey: String { screen + "|" + AppModel.localDate(Date()) }

    private func load() async {
        guard live, shown, !model.demo else { return }
        if screen == "today" { await model.afterTodayLoads() }
        let key = memoryKey
        if let kept = CoachTextMemory.values[key] {
            loaded = kept.text
            // Asked again whenever any data changed; the server writes a new
            // text when the change matters and answers from its cache otherwise.
            if kept.revision == model.dataRevision { return }
            // One write reloads Food, Health and Today one after another: ask once, after the last.
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
        }
        do {
            var value = try await model.api.coachText(screen: screen)
            loaded = value
            // The AI is still writing: asked again a moment later, at most twice.
            var asked = 0
            while value.writing == true && asked < 2 {
                asked += 1
                try await Task.sleep(for: .seconds(6))
                value = try await model.api.coachText(screen: screen)
                loaded = value
            }
            // A text still being written is not kept, so the next opening asks again.
            if value.writing != true { CoachTextMemory.values[key] = (value, Date(), model.dataRevision) }
        } catch {
            // The rule-based text stays.
        }
    }
}
