import SwiftUI

/// A training plan's race day on the watch (mockup hodinky-zavod, Petr
/// 2026-11-02): a duathlon, aquabike, aquathlon or triathlon as one card with
/// its legs in race order and one start, an open-water race as its one leg.
/// The legs come joined like a brick (WeekPlanView saves them so), each marked
/// as a race leg by the server (src/workout-library.js).
struct RaceDay: Hashable {
    var legs: [WatchSnapshot.Session]

    /// The day's race, from its first leg not yet done along `next`; nil on a day without one.
    init?(_ planned: [WatchSnapshot.Session]) {
        let raceIds = Set(planned.filter { $0.race == true }.compactMap(\.eventId))
        guard let first = planned.first(where: { $0.race == true && !($0.after.map(raceIds.contains) ?? false) }) else { return nil }
        var legs = [first]
        while legs.count < 5, let next = legs.last?.next,
              let leg = planned.first(where: { $0.eventId == next && $0.race == true }), !legs.contains(leg) {
            legs.append(leg)
        }
        self.legs = legs
    }

    var first: WatchSnapshot.Session { legs[0] }

    /// "Duatlon", "Aquabike"; one leg goes by its own name without the distance.
    @MainActor
    var name: String {
        switch legs.map(\.sport) {
        case ["swim", "ride", "run"]: W.tr("Triatlon", "Triathlon")
        case ["run", "ride", "run"]: W.tr("Duatlon", "Duathlon")
        case ["swim", "ride"]: "Aquabike"
        case ["swim", "run"]: W.tr("Aquatlon", "Aquathlon")
        default: legs.count == 1 ? Self.withoutDistance(first.name) : W.tr("Závod", "Race")
        }
    }

    /// The whole race with five minutes for each change (src/planned-links.js CHANGE_MINUTES).
    var minutes: Int? {
        let each = legs.compactMap(\.minutes)
        guard each.count == legs.count else { return nil }
        return each.reduce(0, +) + 5 * (legs.count - 1)
    }

    /// The leg's distance from its name ("Závod 5 km", "Duatlon: kolo 20 km", "Open-water race 1500 m").
    @MainActor
    static func distance(_ leg: WatchSnapshot.Session) -> String? {
        guard let d = trailingDistance(leg.name) else { return nil }
        return W.number(d.value, digits: d.value.rounded() == d.value ? 0 : 1) + " " + d.unit
    }

    static func withoutDistance(_ name: String) -> String {
        trailingDistance(name)?.rest ?? name
    }

    /// "Open-water race 1500 m" as 1500, "m" and "Open-water race".
    private static func trailingDistance(_ name: String) -> (value: Double, unit: String, rest: String)? {
        var words = name.split(separator: " ").map(String.init)
        guard let unit = words.popLast(), unit == "km" || unit == "m", let number = words.popLast(), !words.isEmpty,
              let value = Double(number.replacingOccurrences(of: ",", with: ".")), value > 0 else { return nil }
        return (value, unit, words.joined(separator: " "))
    }

    @MainActor
    static func sportName(_ sport: String) -> String {
        switch sport {
        case "swim": W.tr("Plavání", "Swim")
        case "ride": W.tr("Kolo", "Bike")
        case "run": W.tr("Běh", "Run")
        default: W.tr("Úsek", "Leg")
        }
    }

    @MainActor
    static func color(_ sport: String) -> Color {
        switch sport {
        case "swim": W.blue
        case "run": W.rust
        default: W.amber
        }
    }

    /// "33 min", "1 h 06".
    static func length(_ minutes: Int) -> String {
        minutes < 60 ? "\(minutes) min" : "\(minutes / 60) h " + String(format: "%02d", minutes % 60)
    }

    /// The leg's own target from its plan: watts on the bike, the pace on a run or swim.
    @MainActor
    static func target(_ plan: WatchPlan?, sport: String) -> (value: String, unit: String)? {
        guard let step = plan?.main else { return nil }
        if sport == "ride", let low = step.wattsLow {
            let high = step.wattsHigh ?? low
            return (high > low ? "\(Int(low.rounded()))–\(Int(high.rounded()))" : "\(Int(low.rounded()))", "W")
        }
        guard let pace = step.pace else { return nil }
        if sport == "run" { return (clock(W.imperial ? pace * 1.609344 : pace), W.imperial ? "/mi" : "/km") }
        if sport == "swim" { return (clock(pace), "/100 m") }
        return nil
    }

    private static func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded())
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}

/// Tapping the race card: each leg with its length and target, the same as
/// the race card on the iPhone.
struct RaceDetail: View {
    let race: RaceDay
    @ObservedObject private var plans = PlanStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    Image(systemName: "flag.fill").font(.system(size: 11))
                    Text(when.uppercased()).font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(W.amber)
                Text(race.name)
                    .font(W.news(21))
                    .foregroundStyle(W.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
                VStack(spacing: 0) {
                    ForEach(Array(race.legs.enumerated()), id: \.offset) { index, leg in
                        if index > 0 { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
                        row(leg)
                    }
                }
                .padding(.top, 4)
                if race.legs.count > 1, let minutes = race.minutes {
                    Text(W.tr("Celkem asi \(RaceDay.length(minutes)) i s depem", "About \(RaceDay.length(minutes)) with the changes"))
                        .font(.system(size: 11))
                        .foregroundStyle(W.muted)
                        .padding(.top, 6)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear { for leg in race.legs { plans.load(leg, shelf: false) } }
        .containerBackground(W.glow(W.Glow.strain), for: .navigation)
    }

    /// "dnes · 9:00".
    private var when: String {
        W.relativeDay(race.first.date) + (race.first.time.map { " · " + W.clockText($0) } ?? "")
    }

    private func row(_ leg: WatchSnapshot.Session) -> some View {
        let plan = leg.eventId.flatMap { plans.plans[$0] }
        let detail = [RaceDay.distance(leg), leg.minutes.map(RaceDay.length)].compactMap { $0 }.joined(separator: " · ")
        return HStack(spacing: 7) {
            Image(systemName: W.sportSymbol(leg.sport)).font(.system(size: 13)).foregroundStyle(RaceDay.color(leg.sport)).frame(width: 18)
            VStack(alignment: .leading, spacing: 0) {
                Text(RaceDay.sportName(leg.sport)).font(.system(size: 13, weight: .semibold)).foregroundStyle(W.ink)
                if !detail.isEmpty { Text(detail).font(.system(size: 11)).foregroundStyle(W.muted).lineLimit(1) }
            }
            Spacer(minLength: 4)
            if let target = RaceDay.target(plan, sport: leg.sport) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(target.value).font(W.news(17)).foregroundStyle(W.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(target.unit).font(.system(size: 9)).foregroundStyle(W.muted)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
