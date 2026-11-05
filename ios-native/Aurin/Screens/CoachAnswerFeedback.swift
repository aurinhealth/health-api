import SwiftUI
import UIKit

/// Under the coach's last answer: copy, thumbs up and down, and the time it
/// came (as at Bevel). Older answers have the same in the menu of a long press.
/// Only the answer's id, the thumb and a reason are stored (src/assistant-chats.js).
struct AnswerActions: View {
    let text: String
    let rating: String?
    let at: Date?
    /// nil when the answer can't be rated (not stored).
    var rate: ((String?) -> Void)?
    @State private var copied = false

    var body: some View {
        HStack(spacing: 0) {
            icon(copied ? "checkmark" : "doc.on.doc", tint: copied ? Palette.green : Palette.muted, label: copied ? "Zkopírováno" : "Kopírovat") {
                Self.copy(text)
                withAnimation(.easeOut(duration: 0.15)) { copied = true }
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    withAnimation(.easeOut(duration: 0.2)) { copied = false }
                }
            }
            if let rate {
                icon(rating == "up" ? "hand.thumbsup.fill" : "hand.thumbsup", tint: rating == "up" ? Palette.ink : Palette.muted, label: "Dobrá odpověď", on: rating == "up") {
                    rate(rating == "up" ? nil : "up")
                }
                icon(rating == "down" ? "hand.thumbsdown.fill" : "hand.thumbsdown", tint: rating == "down" ? Palette.ink : Palette.muted, label: "Špatná odpověď", on: rating == "down") {
                    rate(rating == "down" ? nil : "down")
                }
            }
            Spacer(minLength: 8)
            if copied {
                Text("Zkopírováno").font(Typo.caption).foregroundStyle(Palette.muted)
            } else if let at {
                Text(verbatim: at.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(L10n.locale)))
                    .font(Typo.caption).foregroundStyle(Palette.muted).monospacedDigit()
            }
        }
        .padding(.leading, 2)
        .sensoryFeedback(.selection, trigger: rating)
    }

    /// A thin grey icon in a 44 pt target.
    private func icon(_ symbol: String, tint: Color, label: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).scaledFont(15, weight: .regular, cap: .denseCap).foregroundStyle(tint)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The answer as plain text, without the Markdown marks.
    static func copy(_ text: String) {
        UIPasteboard.general.string = CoachMarkdown.plainText(text)
    }

    /// The long-press menu of any answer.
    @ViewBuilder static func menu(text: String, rating: String?, rate: ((String?) -> Void)?) -> some View {
        Button { copy(text) } label: { Label(L10n.tr("Kopírovat"), systemImage: "doc.on.doc") }
        if let rate {
            Button { rate(rating == "up" ? nil : "up") } label: {
                Label(L10n.tr("Dobrá odpověď"), systemImage: rating == "up" ? "hand.thumbsup.fill" : "hand.thumbsup")
            }
            Button { rate(rating == "down" ? nil : "down") } label: {
                Label(L10n.tr("Špatná odpověď"), systemImage: rating == "down" ? "hand.thumbsdown.fill" : "hand.thumbsdown")
            }
        }
    }
}

/// What a thumb down may say: a reason from the list, never words of the chat.
enum AnswerFeedbackReason: String, CaseIterable, Identifiable {
    case numbers, unhelpful, other
    var id: String { rawValue }
    var title: String {
        switch self {
        case .numbers: return L10n.tr("Čísla nesedí")
        case .unhelpful: return L10n.tr("Nepomohlo to")
        case .other: return L10n.tr("Něco jiného")
        }
    }
}

/// The short panel after a thumb down: one tap on a reason and Odeslat.
/// "Report this answer…" opens Nahlásit problém with the answer in it (App
/// Store guideline 1.2 for content made by AI); it is sent only from there.
struct AnswerFeedbackSheet: View {
    /// The picked reason, or nil when sent without one.
    let send: (String?) -> Void
    let report: () -> Void
    @State private var reason: AnswerFeedbackReason?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Co v odpovědi nesedělo?").font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
            Text("Uloží se jen důvod, ne text chatu.").font(Typo.small).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4).padding(.bottom, 12)
            ForEach(AnswerFeedbackReason.allCases) { r in
                Divider().overlay(Palette.hairline)
                Button { reason = r } label: {
                    HStack {
                        Text(r.title).font(.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Image(systemName: reason == r ? "largecircle.fill.circle" : "circle")
                            .scaledFont(17, weight: .regular, cap: .denseCap)
                            .foregroundStyle(reason == r ? Palette.ink : Palette.muted)
                    }
                    .frame(minHeight: 46).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(reason == r ? .isSelected : [])
            }
            PrimaryButton(title: "Odeslat") { send(reason?.rawValue) }
                .padding(.top, 16)
            Button(action: report) {
                Text("Nahlásit tuto odpověď…").font(Typo.small.weight(.medium)).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .padding(.horizontal, 24).padding(.top, 28).padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background { Palette.card.ignoresSafeArea() }
    }
}

/// Nahlásit problém for one coach answer: the same form and sending as in
/// Settings (src/support-report.js), with the answer already in the description.
struct CoachAnswerReport: View {
    @Environment(AppModel.self) private var model
    let answer: String
    @State private var store: SettingsStore?

    /// The server takes up to 4000 characters; the answer leaves room for the athlete's words.
    static func startText(_ answer: String) -> String {
        var plain = CoachMarkdown.plainText(answer)
        if plain.count > 3000 { plain = String(plain.prefix(3000)) + "…" }
        return L10n.tr("Odpověď kouče, kterou hlásím:") + "\n\n" + plain + "\n\n" + L10n.tr("Co je na ní špatně: ")
    }

    var body: some View {
        Group {
            if let store {
                ReportProblemView(store: store, startText: Self.startText(answer), title: "Nahlásit odpověď")
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            guard store == nil else { return }
            let s = SettingsStore(api: model.api, demo: model.demo)
            store = s
            // The diagnostics read the connections and the last sync.
            await s.load()
        }
    }
}
