import SwiftUI

// Trénink → Svaly: which muscles are tired and when they are rested again
// (GET /app/api/muscles, src/muscle-fatigue.js). The body figure comes later.

/// On Trénink: the three most tired muscles; a tap opens Svaly.
struct MuscleCard: View {
    @Environment(AppModel.self) private var model
    @State private var loaded: MuscleFatigue?

    private var data: MuscleFatigue? { model.demo ? DemoData.muscles : loaded }

    var body: some View {
        // A container that is always there, so the task below runs (TrainingPlanCard).
        VStack(spacing: 0) {
            if let data {
                RouteLink(route: .muscles) { card(data) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(accessibility(data))
                    .accessibilityAddTraits(.isButton)
            }
        }
        .task {
            guard !model.demo else { return }
            if let fresh = try? await model.api.muscles() { loaded = fresh }
        }
    }

    private func card(_ data: MuscleFatigue) -> some View {
        Card {
            WidgetHeader(title: MuscleFatigue.title, color: Palette.amberBar)
            let tired = Array(data.tired.prefix(3))
            if tired.isEmpty {
                Text("Všechny svaly jsou odpočaté").font(Typo.sentence(20)).foregroundStyle(Palette.ink)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(tired) { muscle in
                        HStack(spacing: 8) {
                            Circle().fill(muscle.color).frame(width: 8, height: 8)
                            Text(muscle.label).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                            Spacer(minLength: 8)
                            Text(verbatim: muscle.readyText(today: data.date)).font(Typo.caption).foregroundStyle(muscle.textColor).lineLimit(1)
                        }
                    }
                }
            }
        }
    }

    private func accessibility(_ data: MuscleFatigue) -> String {
        let tired = data.tired.prefix(3).map { L10n.tr($0.label) + " " + $0.readyText(today: data.date) }
        return ([MuscleFatigue.title] + (tired.isEmpty ? [L10n.tr("Všechny svaly jsou odpočaté")] : tired)).joined(separator: ", ")
    }
}

/// Svaly: every muscle with a bar and when it is rested, the most tired
/// first, and what tired them in the last 3 days.
struct MusclesView: View {
    @Environment(AppModel.self) private var model
    @State private var loaded: MuscleFatigue?
    @State private var error: String?

    private var data: MuscleFatigue? { model.demo ? DemoData.muscles : loaded }

    var body: some View {
        DetailScreen(glow: Palette.Glow.training, title: MuscleFatigue.title) {
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: MuscleFatigue.title).font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 24)
                if let data {
                    content(data)
                } else if let error {
                    VStack(spacing: 16) {
                        Text(error).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center)
                        Button("Zkusit znovu") { Task { await load() } }.font(Typo.bodyStrong)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
        }
        .task {
            guard !model.demo, loaded == nil else { return }
            await load()
        }
        .refreshable { await load() }
    }

    private func load() async {
        guard !model.demo else { return }
        do { loaded = try await model.api.muscles(); error = nil } catch { self.error = error.localizedDescription }
    }

    @ViewBuilder
    private func content(_ data: MuscleFatigue) -> some View {
        let muscles = data.muscles ?? []
        Card {
            ForEach(Array(muscles.enumerated()), id: \.element.id) { index, muscle in
                if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                row(muscle, today: data.date)
            }
        }
        .padding(.top, 14)

        let recent = data.recent ?? []
        if !recent.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Z posledních 3 dní").font(Typo.small).foregroundStyle(Palette.muted)
                    ForEach(recent, id: \.self) { source in
                        Text(verbatim: L10n.tr(source.title) + " · " + L10n.tr(source.day))
                            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    }
                }
            }
            .padding(.top, 12)
        }
    }

    private func row(_ muscle: MuscleFatigue.Muscle, today: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(muscle.label).font(Typo.body).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 8)
                Text(verbatim: muscle.readyText(today: today)).font(Typo.caption).foregroundStyle(muscle.textColor).lineLimit(1)
            }
            ProgressLine(fraction: max(muscle.level ?? 0, 0.03), color: muscle.color, height: 6)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.tr(muscle.label) + ", " + muscle.readyText(today: today))
    }
}
