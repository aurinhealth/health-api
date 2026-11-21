import SwiftUI

/// The coach above Training's load cards (src/load-advice.js, decision 6 of
/// the 602 review): the conclusion in the coach's serif, at most two
/// sentences, and below the usual load "Add to plan", which writes one easy
/// session on the named day only after the tap. Rule-based, so it shows
/// without Aurin Pro too.
struct LoadAdviceCard: View {
    @Environment(AppModel.self) private var model
    let advice: TrainingSnapshot.LoadAdvice
    @State private var state: AddState = .idle

    enum AddState: Equatable { case idle, adding, added, failed(String) }

    var body: some View {
        Card {
            HStack(spacing: 8) {
                TwoLights(size: 20)
                Text("Kouč").font(.caption.weight(.medium)).tracking(1.2).foregroundStyle(Palette.muted)
            }
            Text(verbatim: advice.text)
                .font(Typo.coach(21)).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            // Kept after the reload: the new advice has no action once the session is planned.
            if state == .added {
                Label(L10n.tr("Přidáno do plánu"), systemImage: "checkmark")
                    .font(Typo.bodyStrong).foregroundStyle(Palette.green)
            } else if let action = advice.action, !model.demo {
                switch state {
                case .failed(let message):
                    Text(verbatim: message).font(Typo.small).foregroundStyle(Palette.rust)
                    addButton(action)
                default:
                    addButton(action)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func addButton(_ action: TrainingSnapshot.LoadAdvice.Action) -> some View {
        Button { Task { await add(action) } } label: {
            HStack(spacing: 6) {
                if state == .adding { ProgressView().tint(Palette.onAccent) }
                Text(L10n.tr("Přidat do plánu"))
            }
            .font(Typo.bodyStrong).foregroundStyle(Palette.onAccent)
            .padding(.horizontal, 16).frame(height: 40)
            .background(Palette.green, in: Capsule())
            .tapTarget(width: 44, height: 40)
        }
        .buttonStyle(.plain)
        .disabled(state == .adding)
        .accessibilityIdentifier("load-advice.add")
    }

    private func add(_ action: TrainingSnapshot.LoadAdvice.Action) async {
        state = .adding
        do {
            try await model.api.addEasySession(sport: action.sport, date: action.date)
            state = .added
            await model.refreshTraining()
        } catch APIError.message(let message) {
            // The server's own words ("Choose a day in the next two weeks.").
            state = .failed(message)
        } catch {
            state = .failed(L10n.tr("Nepodařilo se uložit."))
        }
    }
}
