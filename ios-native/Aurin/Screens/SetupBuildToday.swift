import SwiftUI

/// Animation A of the onboarding concept (v38, part O): after "O tobě" the
/// answers go into Today. "Čtu tvůj profil" gathers them, "Nastavuji denní
/// cíle" pours them into the day's dials, "Skládám tvůj Today" sends the
/// sports up to the week, then Today. Meanwhile Today loads, so the first
/// screen has its numbers. Reduce Motion: the three lines only, no flying.
struct SetupBuildToday: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// "Muž", "1991", "182 cm", "78,5 kg".
    let chips: [String]
    /// The sports ticked on "O tobě".
    let sports: [String]
    let finish: () async -> Void

    private enum Step: Int { case reading, targets, building }
    @State private var step: Step
    @State private var shown: Bool
    @State private var poured = false
    @State private var sent = false

    /// still: the middle of it, standing (the snapshot test).
    init(chips: [String], sports: [String], still: Bool = false, finish: @escaping () async -> Void = {}) {
        self.chips = chips
        self.sports = sports
        self.finish = finish
        _step = State(initialValue: still ? .targets : .reading)
        _shown = State(initialValue: still)
    }

    private var title: String {
        switch step {
        case .reading: return L10n.tr("Čtu tvůj profil")
        case .targets: return L10n.tr("Nastavuji denní cíle")
        case .building: return L10n.tr("Skládám tvůj Today")
        }
    }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(spacing: 18) {
                Spacer()
                // Sports go up to the week (offset), the line stays.
                HStack(spacing: 10) {
                    ForEach(Array(sports.enumerated()), id: \.element) { i, kind in
                        Image(systemName: SportsChoice.symbol(kind))
                            .scaledFont(14, weight: .semibold)
                            .foregroundStyle(SportsChoice.color(kind))
                            .frame(width: 34, height: 34)
                            .background(SportsChoice.color(kind).opacity(0.16), in: Circle())
                            .offset(y: sent && !reduceMotion ? -260 - CGFloat(i) * 18 : 0)
                            .opacity(sent ? 0 : shown ? 1 : 0)
                            .animation(.easeInOut(duration: 0.8).delay(Double(i) * 0.1), value: sent)
                    }
                }
                .frame(height: 34)
                Text(verbatim: title)
                    .font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .contentTransition(.opacity)
                    .id(step)
                    .transition(.opacity)
                // How far along: one third a line.
                Capsule().fill(Palette.track).frame(width: 120, height: 3)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Palette.ink).frame(width: 40 * CGFloat(step.rawValue + 1), height: 3)
                    }
                    .animation(.easeInOut(duration: 0.6), value: step)
                // The answers, then into the dials below.
                HStack(spacing: 8) {
                    ForEach(Array(chips.enumerated()), id: \.offset) { i, chip in
                        Text(verbatim: chip).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Palette.card, in: Capsule())
                            .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
                            .scaleEffect(poured && !reduceMotion ? 0.4 : shown ? 1 : 0.8)
                            .offset(y: poured && !reduceMotion ? 120 : shown ? 0 : 14)
                            .opacity(poured ? 0 : shown ? 1 : 0)
                            .animation(.spring(response: 0.5, dampingFraction: 0.75).delay(Double(i) * 0.08), value: shown)
                            .animation(.easeIn(duration: 0.55).delay(Double(i) * 0.09), value: poured)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 8)
                dials
                    .opacity(step == .reading ? 0 : 1)
                    .offset(y: step == .reading && !reduceMotion ? 24 : 0)
                    .animation(.spring(response: 0.55, dampingFraction: 0.8), value: step)
                Spacer()
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: title))
        .accessibilityAddTraits(.updatesFrequently)
        .task { await play() }
    }

    /// Sleep, strain and HRV as on Today, filled once the answers pour in.
    private var dials: some View {
        HStack(spacing: 0) {
            dial("Spánek", "po dnešní noci", 0)
            dial("Námaha", "dnes zatím", 1)
            dial("HRV", "po dnešní noci", 2)
        }
        .padding(.vertical, 16)
        .cardSurface(cornerRadius: 22)
        .accessibilityHidden(true)
    }

    private func dial(_ name: String, _ note: String, _ i: Int) -> some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().trim(from: 0, to: 0.75).rotation(.degrees(135))
                    .stroke(Palette.track, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                Circle().trim(from: 0, to: poured ? 0.75 : 0).rotation(.degrees(135))
                    .stroke(Palette.ink.opacity(0.25), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .animation(.easeInOut(duration: 0.9).delay(0.25 + Double(i) * 0.11), value: poured)
                Text(verbatim: "–").font(Typo.number(20)).foregroundStyle(Palette.muted)
            }
            .frame(width: 58, height: 58)
            .scaleEffect(poured && !reduceMotion ? 1 : 0.96)
            .animation(.spring(response: 0.35, dampingFraction: 0.5).delay(0.6 + Double(i) * 0.11), value: poured)
            Text(L10n.tr(name)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            Text(L10n.tr(note)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity)
    }

    /// About four seconds, and at most four more while Today still loads.
    private func play() async {
        // Today loads under the animation; the cover closes on a ready screen.
        Task { await model.refresh() }
        shown = true
        try? await Task.sleep(for: .milliseconds(1200))
        withAnimation(.easeInOut(duration: 0.35)) { step = .targets }
        try? await Task.sleep(for: .milliseconds(500))
        poured = true
        try? await Task.sleep(for: .milliseconds(1100))
        withAnimation(.easeInOut(duration: 0.35)) { step = .building }
        sent = true
        try? await Task.sleep(for: .milliseconds(1200))
        for _ in 0..<8 where model.today == nil { try? await Task.sleep(for: .milliseconds(500)) }
        await finish()
    }
}
