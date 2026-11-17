import SwiftUI

/// The coach's thinking steps above his answer (src/coach-steps.js): while he
/// works, the steps come in one under another, the running one with a spinner
/// and its seconds; once answered, one row "Answered in 9 s, 7 steps" that
/// opens them again (the choice is remembered). Each step opens a sheet with
/// its sentence and, for HRV, the HRV detail of Health itself (no new chart).
struct CoachSteps: View {
    let steps: [CoachStep]
    /// Seconds of the whole answer; nil while the coach still works.
    let answeredIn: Int?
    @AppStorage("coach.stepsOpen") private var open = false
    @State private var opened: CoachStep?

    private var live: Bool { answeredIn == nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if live || open {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                        row(step, last: index == steps.count - 1)
                    }
                }
                .padding(.top, 8)
                .transition(.opacity)
            }
        }
        .padding(.leading, 4)
        .sheet(item: $opened) { step in
            CoachStepSheet(step: step, number: (steps.firstIndex(of: step) ?? 0) + 1, count: steps.count)
        }
    }

    @ViewBuilder private var header: some View {
        if let seconds = answeredIn {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { open.toggle() }
            } label: {
                HStack(spacing: 6) {
                    if !open {
                        ForEach(steps.prefix(3)) { step in
                            Image(systemName: step.icon ?? "circle").font(.caption2)
                        }
                    }
                    Text(verbatim: L10n.f("Odpověď za %lld s, %@", seconds, L10n.plural("%lld kroků", steps.count)))
                    Image(systemName: open ? "chevron.up" : "chevron.right").font(.caption2.weight(.semibold))
                }
                .font(Typo.caption).foregroundStyle(Palette.faint)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(L10n.tr(open ? "Skryje kroky kouče." : "Ukáže kroky kouče."))
        } else {
            Text(L10n.tr("Pracuji")).font(Typo.caption).foregroundStyle(Palette.faint)
        }
    }

    private func row(_ step: CoachStep, last: Bool) -> some View {
        let running = live && step.running
        return Button { if step.text != nil { opened = step } } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    Group {
                        if running { ProgressView().controlSize(.mini) } else { Image(systemName: step.icon ?? "circle").font(.footnote) }
                    }
                    .frame(width: 18, height: 18)
                    .foregroundStyle(Palette.muted)
                    if !last { Rectangle().fill(Palette.faint.opacity(0.35)).frame(width: 1).frame(minHeight: 12) }
                }
                StepTitle(title: step.title, since: running ? Date() : nil)
                    .font(Typo.small)
                    .foregroundStyle(running ? Palette.ink : Palette.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, last ? 0 : 10)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(step.text == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(step.title + (running ? ", " + L10n.tr("probíhá") : ""))
        .accessibilityHint(step.text == nil ? "" : L10n.tr("Ukáže čísla."))
    }
}

/// The step's title and, from 3 s, its seconds: "Writing your answer 5 s".
private struct StepTitle: View {
    let title: String
    let since: Date?
    @State private var start = Date()

    var body: some View {
        if since != nil {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let seconds = Int(context.date.timeIntervalSince(start))
                Text(verbatim: title) + Text(verbatim: seconds >= 3 ? "  " + L10n.f("%lld s", seconds) : "").foregroundColor(Palette.faint)
            }
        } else {
            Text(verbatim: title)
        }
    }
}

/// One step opened: "STEP 2 OF 7", the title, the server's sentence with the
/// athlete's numbers and, when the step has one, the app's own detail of that
/// value 1:1 (HRV: the usual range bar and "HRV by night" with 7, 30, 90 days).
struct CoachStepSheet: View {
    let step: CoachStep
    let number: Int
    let count: Int
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    Label(L10n.f("Krok %lld z %lld", number, count).uppercased(with: Fmt.locale), systemImage: step.icon ?? "circle")
                        .font(.caption.weight(.medium)).tracking(1.2).foregroundStyle(Palette.muted)
                    Spacer()
                    ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                }
                Text(verbatim: step.title).font(Typo.sentence(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                if let text = step.text {
                    Text(verbatim: text).font(Typo.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                if step.view == "hrv", let health = model.health, health.hrv != nil {
                    MetricDetailContent(metric: .hrv, health: health)
                }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
