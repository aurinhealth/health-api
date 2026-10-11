import SwiftUI

// The coach's sentence on Today, Training and Food (GET /app/api/coach-text,
// src/screen-texts.js): a short text the AI wrote from the screen's own data
// once a day, the numbers it leaned on as chips, and "Proč?" with the data it
// used. Without AI (no consent, no subscription, the AI failed) the screen's
// rule-based text shows in the same card; without one the card is not shown.

/// The answers of this launch, so switching tabs does not ask again.
@MainActor
enum CoachTextMemory {
    static var values: [String: (text: CoachText, at: Date)] = [:]
}

struct CoachTextCard: View {
    @Environment(AppModel.self) private var model
    /// "today", "training" or "food".
    let screen: String
    var fallbackText: String? = nil
    var fallbackAdvice: String? = nil
    /// Only today's screen asks for the AI text; an earlier day keeps its rule-based one.
    var live = true

    @State private var loaded: CoachText?
    @State private var showWhy = false

    private var ai: CoachText? { live && (loaded?.isAI ?? false) ? loaded : nil }
    private var text: String? { ai?.text ?? fallbackText?.nilIfBlank }
    private var advice: String? { ai != nil ? ai?.advice?.nilIfBlank : fallbackAdvice?.nilIfBlank }
    private var chips: [String] { live ? (loaded?.chips ?? []) : [] }
    private var basis: [CoachText.Basis] { live ? (loaded?.basis ?? []) : [] }

    var body: some View {
        Group {
            if text != nil || advice != nil {
                card
            }
        }
        .task(id: live ? screen + "|" + AppModel.localDate(Date()) : "") { await load() }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold))
                Text("Kouč").font(Typo.bodyStrong)
                Spacer(minLength: 8)
                if let time = ai?.time {
                    Text(verbatim: L10n.tr("dnes") + " " + time).font(Typo.caption).foregroundStyle(Palette.faint)
                }
            }
            .foregroundStyle(Palette.indigo)

            sentence
                .font(Typo.sentence(21))
                .foregroundStyle(Palette.ink)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)

            if !chips.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
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
            }

            if !basis.isEmpty {
                Divider().overlay(Palette.hairline)
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { showWhy.toggle() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "magnifyingglass").font(.system(size: 13, weight: .semibold))
                        Text("Proč?").font(Typo.body)
                        Spacer()
                        Image(systemName: showWhy ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .semibold))
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
                        Text(ai != nil ? "Kouč vychází jen z těchto čísel. Text se píše jednou denně." : "Text podle pravidel aplikace, AI je vypnutá nebo nedostupná.")
                            .font(Typo.tiny).foregroundStyle(Palette.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .transition(.opacity)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 15, y: 10)
        .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
        .animation(.easeInOut(duration: 0.25), value: ai?.text)
    }

    /// The text, then the advice in green italics.
    private var sentence: Text {
        var out = Text(verbatim: text ?? "")
        if let advice {
            out = out + Text(verbatim: text == nil ? "" : " ") + Text(verbatim: advice).font(Typo.sentenceItalic(21)).foregroundColor(Palette.green)
        }
        return out
    }

    private func load() async {
        guard live, !model.demo else { return }
        let key = screen + "|" + AppModel.localDate(Date())
        if let kept = CoachTextMemory.values[key] {
            loaded = kept.text
            // Kept for ten minutes, then asked again (the server answers from its cache).
            if Date().timeIntervalSince(kept.at) < 600 { return }
        }
        do {
            let value = try await model.api.coachText(screen: screen)
            CoachTextMemory.values[key] = (value, Date())
            loaded = value
        } catch {
            // The rule-based text stays.
        }
    }
}
