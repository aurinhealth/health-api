import SwiftUI

/// Animation A of the onboarding concept (v38, part O): after "O tobě" the
/// answers go into Today. "Čtu tvůj profil" gathers them, "Nastavuji denní
/// cíle" flies them into the day's dials, "Skládám tvůj den" lets the rest go
/// and the dials card slides down to its place on Today. Meanwhile Today and
/// the free week's answer load, so the first screen has its numbers. Reduce
/// Motion: nothing flies, moves or grows, it fades, in half the time.
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
    @State private var landed = false
    /// Where each chip and the dials card are, to fly the chips into the dials.
    @State private var chipFrames: [Int: CGRect] = [:]
    @State private var dialsFrame: CGRect = .zero

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
        case .building: return L10n.tr("Skládám tvůj den")
        }
    }

    /// The last third of the line waits for Today's data.
    private var progress: CGFloat {
        step == .building && model.today == nil ? 100 : 40 * CGFloat(step.rawValue + 1)
    }

    var body: some View {
        ZStack {
            ScreenBackground(glow: Palette.Glow.today)
            VStack(spacing: 18) {
                Spacer()
                Text(verbatim: title)
                    .font(Typo.heading(30, relativeTo: .title)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .frame(minHeight: 72, alignment: .bottom)
                    .id(step)
                    .transition(.opacity)
                Capsule().fill(Palette.track).frame(width: 120, height: 3)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Palette.ink).frame(width: progress, height: 3)
                    }
                    .animation(.easeInOut(duration: 0.6), value: progress)
                    .opacity(landed ? 0 : 1)
                chipRow.padding(.top, 8)
                // The sports stay under the answers and fade with them.
                HStack(spacing: 10) {
                    ForEach(sports, id: \.self) { kind in
                        Image(systemName: SportsChoice.symbol(kind))
                            .scaledFont(14, weight: .semibold)
                            .foregroundStyle(SportsChoice.color(kind))
                            .frame(width: 34, height: 34)
                            .background(SportsChoice.color(kind).opacity(0.16), in: Circle())
                    }
                }
                .opacity(shown && step != .building ? 1 : 0)
                .animation(.easeInOut(duration: 0.4), value: step)
                .animation(.easeOut(duration: 0.4), value: shown)
                dials
                    .opacity(step == .reading ? 0 : 1)
                    .offset(y: reduceMotion ? 0 : step == .reading ? 24 : landed ? 150 : 0)
                    .animation(.spring(response: 0.55, dampingFraction: 0.8), value: step)
                    .animation(.easeInOut(duration: 0.7), value: landed)
                Spacer()
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .coordinateSpace(.named("build"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: title))
        .accessibilityAddTraits(.isModal)
        .onChange(of: step) { _, _ in AccessibilityNotification.Announcement(title).post() }
        .task { await play() }
    }

    /// The answers; each flies in an arc to its dial (0 sleep, 1 and 2 strain, 3 HRV).
    private var chipRow: some View {
        HStack(spacing: 8) {
            ForEach(Array(chips.enumerated()), id: \.offset) { i, chip in
                Text(verbatim: chip).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Palette.card, in: Capsule())
                    .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("build")) } action: { chipFrames[i] = $0 }
                    .modifier(Flight(p: poured ? 1 : 0, move: reduceMotion ? .zero : flight(i)))
                    .animation(.timingCurve(0.45, 0, 0.3, 1, duration: 0.8).delay(Double(i) * 0.1), value: poured)
                    .opacity(shown ? 1 : 0)
                    .offset(y: shown || reduceMotion ? 0 : 14)
                    .animation(.spring(response: 0.5, dampingFraction: 0.75).delay(Double(i) * 0.08), value: shown)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    /// From a chip's middle to its dial's middle.
    private func flight(_ i: Int) -> CGSize {
        guard let chip = chipFrames[i], dialsFrame != .zero else { return .zero }
        let column = [0, 1, 1, 2][min(i, 3)]
        let x = dialsFrame.minX + dialsFrame.width * (CGFloat(column) + 0.5) / 3 + (i == 1 ? -12 : i == 2 ? 12 : 0)
        let y = dialsFrame.minY + 16 + 29
        return CGSize(width: x - chip.midX, height: y - chip.midY)
    }

    /// Sleep, strain and HRV as on Today; each answers the chips' arrival.
    private var dials: some View {
        HStack(alignment: .top, spacing: 0) {
            dial("Spánek", night ? nil : "po dnešní noci", value: nil, 0)
            dial("Námaha", "dnes zatím", value: poured ? (model.today?.strain.score ?? 0) : 0, 1)
            dial("HRV", night ? nil : "po dnešní noci", value: nil, 2)
        }
        .padding(.vertical, 16)
        .cardSurface(cornerRadius: 22)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("build")) } action: { dialsFrame = $0 }
        .accessibilityHidden(true)
    }

    /// Last night is in already (the watch's history): no "after tonight".
    private var night: Bool { AppleHealth.shared.readyToScore }

    private func dial(_ name: String, _ note: String?, value: Double?, _ i: Int) -> some View {
        VStack(spacing: 6) {
            ZStack {
                // The dial's track draws itself, as on Today when empty.
                Circle().trim(from: 0, to: shown ? 0.75 : 0).rotation(.degrees(135))
                    .stroke(Palette.track, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .animation(.easeInOut(duration: 0.9).delay(0.2 + Double(i) * 0.11), value: shown)
                if let value {
                    Text(verbatim: Fmt.decimal(value)).font(Typo.number(20)).foregroundStyle(Palette.ink)
                        .contentTransition(.numericText(value: value))
                        .animation(.easeOut(duration: 0.85).delay(0.9), value: value)
                } else {
                    Text(verbatim: "–").font(Typo.number(20)).foregroundStyle(Palette.muted)
                }
            }
            .frame(width: 58, height: 58)
            // The chips land: the dial gives a little.
            .keyframeAnimator(initialValue: 1.0, trigger: poured) { content, scale in
                content.scaleEffect(reduceMotion ? 1 : scale)
            } keyframes: { _ in
                KeyframeTrack {
                    LinearKeyframe(1.0, duration: 0.7 + Double(i) * 0.1)
                    SpringKeyframe(1.08, duration: 0.18)
                    SpringKeyframe(1.0, duration: 0.25)
                }
            }
            Text(L10n.tr(name)).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            if let note { Text(L10n.tr(note)).font(Typo.caption).foregroundStyle(Palette.muted) }
        }
        .frame(maxWidth: .infinity)
    }

    /// About four seconds (two with Reduce Motion), and while Today still
    /// loads at most four more; the free week's answer is fetched meanwhile.
    private func play() async {
        let pace = reduceMotion ? 0.5 : 1.0
        func wait(_ ms: Double) async { try? await Task.sleep(for: .milliseconds(Int(ms * pace))) }
        Task { await model.refresh() }
        Task { await SetupProOffer.prefetch(model) }
        shown = true
        await wait(1200)
        withAnimation(.easeInOut(duration: 0.35)) { step = .targets }
        await wait(450)
        poured = true
        await wait(1300)
        withAnimation(.easeInOut(duration: 0.35)) { step = .building }
        for _ in 0..<8 where model.today == nil { try? await Task.sleep(for: .milliseconds(500)) }
        await wait(500)
        // The card goes down to its place on Today, then Today.
        landed = true
        await wait(700)
        await finish()
    }
}

/// A chip on its way to a dial: an arc, a little bigger halfway, whole until
/// near the end, then small and gone in the dial (never dissolving on the way).
private struct Flight: ViewModifier, Animatable {
    var p: Double
    let move: CGSize

    var animatableData: Double {
        get { p }
        set { p = newValue }
    }

    func body(content: Content) -> some View {
        let arc = -46 * sin(.pi * p)
        let scale = p < 0.4 ? 1 + 0.1 * p / 0.4 : 1.1 - 0.8 * (p - 0.4) / 0.6
        let opacity = p < 0.86 ? 1 : max(0, (1 - p) / 0.14)
        let still = move == .zero
        return content
            .scaleEffect(still ? 1 : scale)
            .offset(x: move.width * p, y: move.height * p + (still ? 0 : arc))
            .opacity(still ? 1 - p : opacity)
    }
}
