import SwiftUI

/// Left and right (L, P) of one-sided exercises (src/gym-sides.js): the sets
/// of each side, which side lags and how each exercise was done last time.
enum GymSides {
    private static let oneSidedPattern = try! NSRegularExpression(
        pattern: "bulhar|bulgarian|split squat|jednoru[čc]|jednono[žz]|jedn[ée]\\s*(ruk|noh)|single[- ]?(arm|leg)|one[- ]?(arm|leg)|unilateral|iso[- ]?lateral|výpad|vypad|lunge|step[- ]?up|výstup|vystup|pistol|koncentrova|concentration|suitcase|copenhagen|kozákov|cossack",
        options: [.caseInsensitive])

    /// An exercise done one side at a time by its name (the server's list).
    static func oneSided(_ name: String) -> Bool {
        oneSidedPattern.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)) != nil
    }

    static func color(_ side: String) -> Color { side == "L" ? Palette.blue : Palette.amber }

    /// The last pair of the exercise with both sides done, when they differ:
    /// "Pravá strana dala o 2 opakování míň. Levou dělej jen tolik co pravou…"
    static func note(_ exercise: GymExercise) -> String? {
        let done = exercise.sets.filter { $0.done && !$0.warmup && $0.side != nil }
        let numbers = Set(done.map(\.number))
        guard let number = exercise.sets.map(\.number).filter({ numbers.contains($0) }).last(where: { n in
            done.contains { $0.number == n && $0.side == "L" } && done.contains { $0.number == n && $0.side == "P" }
        }), let left = done.last(where: { $0.number == number && $0.side == "L" }), let right = done.last(where: { $0.number == number && $0.side == "P" }) else { return nil }
        let l = Double(left.reps ?? "") ?? 0, r = Double(right.reps ?? "") ?? 0
        guard l != r, l > 0, r > 0 else { return nil }
        let gap = String(Int(abs(l - r)))
        return l < r
            ? L10n.f("Levá strana dala o %@ opakování míň. Pravou dělej jen tolik co levou, ať se rozdíl nezvětšuje.", gap)
            : L10n.f("Pravá strana dala o %@ opakování míň. Levou dělej jen tolik co pravou, ať se rozdíl nezvětšuje.", gap)
    }
}

/// GET /app/api/gym/sides: one-sided exercises, the last session's sides.
struct GymSideBalance: Decodable, Equatable {
    struct Item: Decodable, Equatable, Identifiable {
        let exercise: String
        let left: Double
        let right: Double
        let gap: Int
        let weaker: String?
        var id: String { exercise }
    }
    let sides: [Item]?
    /// How each exercise was done last time: "sides" or "both".
    let choices: [String: String]?
}

extension APIClient {
    func gymSides() async throws -> GymSideBalance {
        try await get("/app/api/gym/sides")
    }
}

/// Posilovna · historie: "Levá a pravá strana".
struct GymSidesView: View {
    let items: [GymSideBalance.Item]

    var body: some View {
        DetailScreen(glow: Palette.Glow.training) {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "Posilovna · historie").padding(.top, 24)
                Text("Levá a pravá strana").font(Typo.sentence(32, relativeTo: .title)).foregroundStyle(Palette.ink).padding(.top, 10)
                Card {
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(items) { item in row(item) }
                    }
                }
                .padding(.top, 18)
                if let weak = items.first(where: { $0.weaker != nil }), let side = weak.weaker {
                    CoachNote(text: L10n.f(side == "P" ? "%@: pravou stranu dorovnáváme, dokud zaostává, dostane jednu sérii navíc." : "%@: levou stranu dorovnáváme, dokud zaostává, dostane jednu sérii navíc.", weak.exercise))
                        .padding(.top, 14)
                }
            }
        }
    }

    private func row(_ item: GymSideBalance.Item) -> some View {
        let top = max(item.left, item.right, 1)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: item.exercise).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 6)
                Text(item.weaker.map { L10n.f($0 == "L" ? "L o %@ %% slabší" : "P o %@ %% slabší", String(item.gap)) } ?? L10n.tr("vyrovnané"))
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            bar("L", item.left / top)
            bar("P", item.right / top)
        }
    }

    private func bar(_ side: String, _ share: Double) -> some View {
        HStack(spacing: 8) {
            Text(verbatim: side).font(Typo.caption.weight(.semibold)).foregroundStyle(GymSides.color(side)).frame(width: 12)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.track)
                    Capsule().fill(GymSides.color(side)).frame(width: geo.size.width * share)
                }
            }
            .frame(height: 6)
        }
    }
}

/// An amber card with the coach's sparkle and one sentence.
struct CoachNote: View {
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "sparkles").font(.footnote).foregroundStyle(Palette.amber)
            Text(verbatim: text).font(Typo.sentence(16)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
