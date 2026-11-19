import SwiftUI

/// The coach's thinking steps above his answer (src/coach-steps.js): while he
/// works, the steps come in one under another, done ones with a tick and the
/// running one with a ring; once answered, one grey line of what he looked
/// at with a chevron that opens them again (concept 09, 1/2; the choice is
/// remembered). Each step opens a sheet with its sentence and, for HRV, the
/// HRV detail of Health itself (no new chart).
struct CoachSteps: View {
    let steps: [CoachStep]
    /// Seconds of the whole answer; nil while the coach still works.
    let answeredIn: Int?
    @AppStorage("coach.stepsOpen") private var open = false
    @State private var opened: CoachStep?

    private var live: Bool { answeredIn == nil }

    /// The folded line: the steps' titles one after another.
    static func summary(_ steps: [CoachStep]) -> String {
        steps.map(\.title).enumerated().map { i, t in i == 0 ? t : t.prefix(1).lowercased() + t.dropFirst() }.joined(separator: ", ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !live { header }
            if live || open {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(steps) { step in row(step) }
                }
                .padding(.top, live ? 0 : 8)
                .transition(.opacity)
            }
        }
        .sheet(item: $opened) { step in
            CoachStepSheet(step: step, number: (steps.firstIndex(of: step) ?? 0) + 1, count: steps.count)
        }
    }

    private var header: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { open.toggle() }
        } label: {
            HStack(alignment: .center, spacing: 8) {
                Text(verbatim: Self.summary(steps)).lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Image(systemName: open ? "chevron.up" : "chevron.right").font(.caption2.weight(.semibold))
            }
            .font(Typo.caption).foregroundStyle(Palette.muted)
            .frame(minHeight: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(L10n.tr(open ? "Skryje kroky kouče." : "Ukáže kroky kouče."))
    }

    private func row(_ step: CoachStep) -> some View {
        let running = live && step.running
        return Button { if step.text != nil { opened = step } } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Group {
                    if running {
                        Circle().strokeBorder(Palette.ink.opacity(0.8), lineWidth: 2).frame(width: 9, height: 9)
                    } else {
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .semibold))
                    }
                }
                .frame(width: 14)
                .foregroundStyle(Palette.muted)
                StepTitle(title: step.title, since: running ? Date() : nil)
                    .font(Typo.small)
                    .foregroundStyle(running ? Palette.ink : Palette.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
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
    /// The HRV step's page: its cells and periods switch here too.
    @State private var hrvValue: HealthValue = .hrv
    @State private var hrvPeriod: ChartPeriod = .days30

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    Label(L10n.f("Krok %lld z %lld", number, count).uppercased(with: Fmt.locale), systemImage: step.icon ?? "circle")
                        .font(.caption.weight(.medium)).tracking(1.2).foregroundStyle(Palette.muted)
                    Spacer()
                    ChromeButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                }
                Text(verbatim: step.title).font(Typo.heading(24, relativeTo: .title2)).foregroundStyle(Palette.ink)
                if let text = step.text {
                    Text(verbatim: text).font(Typo.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                }
                if step.view == "hrv", let health = model.health, health.hrv != nil {
                    HealthValueContent(value: $hrvValue, period: $hrvPeriod)
                }
            }
            .padding(24)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
