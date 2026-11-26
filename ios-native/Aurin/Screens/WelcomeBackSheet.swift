import SwiftUI

/// Welcome back after a training gap (Petr 2026-11-26, one flow; mockup
/// navrat-k-zatezi-2026-11-25/jeden-tok): the gap question instead of a new
/// coach chat, once per gap. The answers are our statuses in a fixed order,
/// none preselected, with one line on what each does (privacy-compliance
/// 2026-11-16, MDR). "Took a break" after 14 days shows the easier week (R2)
/// with "Use the easier week" and "Keep as is". Texts come from the server.
struct WelcomeBackSheet: View {
    let question: WelcomeBack
    @State var week: EasierWeek?
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var coach: String?
    @State private var sending = false
    @State private var answered = false

    var body: some View {
        SheetFrame(title: question.title) {
            VStack(alignment: .leading, spacing: 14) {
                if !answered && week == nil {
                    Text(verbatim: question.text).font(Typo.body).foregroundStyle(Palette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let note = question.note {
                        Text(verbatim: note).font(Typo.small).foregroundStyle(Palette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(question.answers, id: \.self) { answer in
                            Button { Task { await send(answer.id) } } label: {
                                Text(verbatim: answer.label).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                                    .frame(maxWidth: .infinity).frame(minHeight: 44)
                                    .background(Palette.card, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("welcome-back.\(answer.id)")
                        }
                    }
                    if let outcomes = question.outcomes {
                        Text(verbatim: outcomes).font(Typo.small).foregroundStyle(Palette.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let later = question.later {
                        secondary(later) { Task { await send("later") } }
                    }
                } else {
                    if question.ended == true && !answered {
                        Text(verbatim: question.text).font(Typo.body).foregroundStyle(Palette.secondary)
                    }
                    if let week, !week.rows.isEmpty { weekCard(week) }
                    if let coach {
                        Text(verbatim: coach).font(Typo.coach(21)).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if week != nil {
                        Button { Task { await useEasier() } } label: {
                            Text(verbatim: L10n.tr("Použít lehčí týden")).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                                .frame(maxWidth: .infinity).frame(minHeight: 50)
                                .background(Palette.button, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("welcome-back.use")
                        secondary(L10n.tr("Nechat, jak je")) { Task { await send("keep", close: true) } }
                    } else {
                        secondary(L10n.tr("Hotovo")) { dismiss() }
                    }
                }
            }
            .disabled(sending || model.offline || model.demo)
        }
        .presentationDetents([.large])
        // Closed without an answer: "Not now", so the gap is never asked again.
        .onDisappear {
            guard !answered, !model.demo else { return }
            let api = model.api
            Task { _ = try? await api.answerWelcomeBack(question.ended == true ? "break" : "later") }
        }
    }

    private func secondary(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity).frame(minHeight: 44)
                .background(Palette.track, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func weekCard(_ week: EasierWeek) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(week.rows, id: \.self) { row in
                HStack(spacing: 12) {
                    Text(verbatim: row.date == APIClient.localToday() ? L10n.tr("Dnes") : Fmt.weekdayShort(row.date)).font(Typo.small).foregroundStyle(Palette.secondary)
                        .frame(width: 34, alignment: .leading)
                    RoundedRectangle(cornerRadius: 2).fill(Palette.Sport.color(row.sport ?? "")).frame(width: 4, height: 30)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: row.name ?? "").font(Typo.body).foregroundStyle(Palette.ink)
                        if let was = row.was {
                            Text(verbatim: L10n.f("bylo %@", [was.name, was.minutes.map(Fmt.duration)].compactMap { $0 }.joined(separator: ", ")))
                                .font(Typo.small).foregroundStyle(Palette.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    if let minutes = row.minutes { Text(verbatim: Fmt.duration(minutes)).font(Typo.bodyStrong).foregroundStyle(Palette.ink) }
                }
                .frame(minHeight: 56)
            }
            Text(verbatim: L10n.f("Celkem %@. Plán měl %@.", Fmt.duration(week.minutes), Fmt.duration(week.planMinutes)))
                .font(Typo.small).foregroundStyle(Palette.secondary).padding(.vertical, 12)
        }
        .padding(.horizontal, 16)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// A Rest that ended has no answer yet: "Use the easier week" saves it as a break.
    private func useEasier() async {
        if question.ended == true && !answered { await send("break", close: true) } else { dismiss() }
    }

    private func send(_ answer: String, close: Bool = false) async {
        sending = true
        defer { sending = false }
        guard let reply = try? await model.api.answerWelcomeBack(answer) else { return }
        let (said, easier) = reply
        answered = true
        if answer == "sick" || answer == "injured" { await model.refresh() }
        if close || answer == "later" || answer == "sick" || answer == "injured" { dismiss(); return }
        coach = said
        week = easier
    }
}
