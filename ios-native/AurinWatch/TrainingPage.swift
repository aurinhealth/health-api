import SwiftUI

/// The second page by the crown: today's gym from the iPhone, its first
/// exercises and Start (Začít), which opens the session (GymSessionView).
struct TrainingPage: View {
    @ObservedObject private var store = GymStore.shared
    @State private var running = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(W.tr("Trénink", "Training"))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(W.amber)
            if let gym = store.gym, !gym.exercises.isEmpty {
                plan(gym)
            } else if store.loading {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 20)
            } else if store.failed {
                Text(W.tr("Otevři Aurin v iPhonu", "Open Aurin on your iPhone"))
                    .font(W.serif(19)).foregroundStyle(W.ink).padding(.top, 4)
                Text(W.tr("Posilovnu hodinky dostanou z iPhonu.", "Your watch gets the gym from your iPhone."))
                    .font(W.news(13)).foregroundStyle(W.secondary)
                Spacer(minLength: 8)
                Button(W.tr("Zkusit znovu", "Try again")) { store.load() }
            } else {
                Text(W.tr("Dnes bez posilovny", "No gym workout today"))
                    .font(W.serif(19)).foregroundStyle(W.ink).padding(.top, 4)
                Text(W.tr("Posilovnu si naplánuješ v iPhonu.", "Plan a gym workout on your iPhone."))
                    .font(W.news(13)).foregroundStyle(W.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear { store.load() }
        .fullScreenCover(isPresented: $running) { GymSessionView() }
        .containerBackground(W.glow(W.Glow.strain), for: .tabView)
    }

    @ViewBuilder private func plan(_ gym: WatchGym) -> some View {
        HStack(spacing: 5) {
            Image(systemName: "dumbbell.fill").font(.system(size: 13)).foregroundStyle(W.amber)
            Text(title(gym)).font(.system(size: 16, weight: .semibold)).foregroundStyle(W.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.top, 2)
        VStack(alignment: .leading, spacing: 1) {
            ForEach(gym.exercises.prefix(3), id: \.name) { e in
                Text(GymText.line(e)).lineLimit(1)
            }
            if gym.exercises.count > 3 {
                let more = gym.exercises.count - 3
                Text(W.tr("+ \(more) \(more < 5 ? "další cviky" : "dalších cviků")", "+ \(more) more"))
                    .foregroundStyle(W.muted)
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(W.secondary)
        .padding(.top, 4)
        Spacer(minLength: 6)
        if gym.allDone {
            Label(W.tr("Hotovo", "Done"), systemImage: "checkmark")
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(W.green)
                .frame(maxWidth: .infinity)
        } else {
            Button {
                running = true
            } label: {
                Text(gym.started ? W.tr("Pokračovat", "Continue") : W.tr("Začít", "Start"))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(W.green)
        }
    }

    private func title(_ gym: WatchGym) -> String {
        let name = W.tr("Posilovna", "Gym")
        guard let minutes = gym.minutes, minutes > 0 else { return name }
        return name + " · \(minutes) min"
    }
}

/// Texts of the gym screens.
@MainActor
enum GymText {
    /// "Dřep 4 × 8".
    static func line(_ e: WatchGym.Exercise) -> String {
        let work = e.lifts.filter(\.work)
        let sets = Set(work.map(\.number)).count
        let reps = work.first?.plannedReps ?? work.first?.reps.map(String.init)
        return e.name + (sets > 0 ? " \(sets) × " + (reps ?? "–") : "")
    }

    /// 77.5 as "77,5" in Czech, 80 as "80".
    static func kg(_ value: Double) -> String {
        W.number(value, digits: value.rounded() == value ? 0 : 1)
    }

    /// 2140 kg as "2,1 t".
    static func volume(_ kg: Double) -> String {
        kg >= 1000 ? W.number(kg / 1000, digits: 1) + " t" : W.number(kg) + " kg"
    }

    static func elapsed(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}
