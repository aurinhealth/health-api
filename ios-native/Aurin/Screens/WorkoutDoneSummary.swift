import SwiftUI

/// The top of a finished gym workout (concept 08, Summary): what it was, when,
/// from what, how much of the plan, the workout's strain, new records and the
/// workout details. The rating, Close and the rest follow in TrainingModeView.
struct WorkoutDoneSummary: View {
    struct Strain: Equatable {
        /// What the workout added to the day (0–21).
        let workout: Double
        let dayFrom: Double
        let dayTo: Double
        var target: (low: Double, high: Double)? = nil

        static func == (a: Strain, b: Strain) -> Bool {
            a.workout == b.workout && a.dayFrom == b.dayFrom && a.dayTo == b.dayTo
                && a.target?.low == b.target?.low && a.target?.high == b.target?.high
        }
    }

    struct Record: Identifiable, Equatable {
        let name: String
        /// "102.5" and "kg × 6".
        let value: String
        let unit: String
        /// The record before ("100 kg"), nil without one shown.
        let was: String?
        var id: String { name }
    }

    let title: String
    /// "Today, 17:30 to 18:25"; nil without the times.
    let when: String?
    /// Where it came from: "Aurin", "Apple Watch".
    let sources: [String]
    let doneSets: Int
    let plannedSets: Int
    var strain: Strain? = nil
    var records: [Record] = []
    let minutes: Int?
    let volume: (value: String, unit: String)
    var volumeChange: String? = nil
    var volumeBetter = true
    let exercises: Int
    var avgHr: Double? = nil
    var kcal: Double? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            hero.padding(.top, 8).padding(.bottom, 6)
            if let strain { strainCard(strain) }
            ForEach(records) { record in recordCard(record) }
            SectionLabel(text: "Detaily tréninku").padding(.horizontal, 4).padding(.top, 14)
            details
        }
    }

    // MARK: The hero

    private var hero: some View {
        HStack(alignment: .center, spacing: 16) {
            Image(systemName: "figure.strengthtraining.traditional")
                .scaledFont(30, weight: .semibold)
                .foregroundStyle(Palette.onAccent)
                .frame(width: 72, height: 72)
                .background(Palette.Sport.gym, in: Circle())
                .shadow(color: Palette.Sport.gym.opacity(0.55), radius: 18)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                SectionLabel(text: "Posilovna")
                Text(verbatim: title).font(Typo.heading(32, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                    .lineLimit(2).minimumScaleFactor(0.7)
                if let when { Text(verbatim: when).font(Typo.small).foregroundStyle(Palette.secondary) }
                if !sources.isEmpty {
                    Text(verbatim: sources.joined(separator: ", ")).font(Typo.small).foregroundStyle(Palette.secondary)
                }
                planPill.padding(.top, 6)
            }
        }
    }

    private var planPill: some View {
        let percent = plannedSets > 0 ? Int((Double(doneSets) / Double(plannedSets) * 100).rounded()) : nil
        return HStack(spacing: 8) {
            if let percent {
                Text(verbatim: L10n.f("%@ %% plánu", String(min(percent, 100))))
                    .font(.footnote.weight(.semibold)).foregroundStyle(Palette.green)
            }
            Text(verbatim: L10n.f("%@ z %@ sérií", String(doneSets), String(plannedSets)))
                .font(.footnote).foregroundStyle(Palette.secondary)
        }
        .padding(.horizontal, 14).frame(minHeight: 36)
        .cardSurface(cornerRadius: 14)
        .accessibilityElement(children: .combine)
    }

    // MARK: Strain and records

    private func strainCard(_ strain: Strain) -> some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().stroke(Palette.hairline, lineWidth: 4)
                Circle().trim(from: 0, to: min(1, strain.workout / 21))
                    .stroke(Palette.ink, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(verbatim: Fmt.decimal(strain.workout, digits: 1)).font(Typo.heading(17)).foregroundStyle(Palette.ink)
            }
            .frame(width: 48, height: 48)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Zátěž tréninku").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: strainLine(strain)).font(Typo.caption).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text(verbatim: Fmt.decimal(strain.workout, digits: 1)))
    }

    private func strainLine(_ strain: Strain) -> String {
        let day = L10n.f("Zátěž dne z %@ na %@", Fmt.decimal(strain.dayFrom, digits: 1), Fmt.decimal(strain.dayTo, digits: 1))
        guard let target = strain.target else { return day }
        return day + ", " + L10n.f("cíl %@ až %@", Fmt.decimal(target.low, digits: 0), Fmt.decimal(target.high, digits: 0))
    }

    private func recordCard(_ record: Record) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "star")
                .scaledFont(17, weight: .semibold)
                .foregroundStyle(Palette.amber)
                .frame(width: 44, height: 44)
                .overlay(Circle().stroke(Palette.amber, lineWidth: 1.5))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Nový rekord").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                Text(verbatim: record.was.map { L10n.f("%@, předtím %@", record.name, $0) } ?? record.name)
                    .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(2)
            }
            Spacer(minLength: 6)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(verbatim: record.value).font(Typo.heading(26)).foregroundStyle(Palette.ink)
                Text(verbatim: record.unit).font(Typo.caption).foregroundStyle(Palette.muted)
            }
            .lineLimit(1).fixedSize()
        }
        .padding(16)
        .cardSurface(cornerRadius: 22)
        .accessibilityElement(children: .combine)
    }

    // MARK: Workout details

    private var details: some View {
        let columns = [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: 18) {
            if let minutes { detail(String(minutes), "min", "Trvání") }
            detail(String(doneSets), nil, "Série")
            detail(volume.value, volume.unit, "Objem", change: volumeChange)
            detail(String(exercises), nil, "Cviky")
            if let avgHr { detail(Fmt.int(avgHr), "bpm", "Průměrný tep") }
            if let kcal { detail(Fmt.int(kcal), "kcal", "Aktivní energie") }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 22)
    }

    private func detail(_ value: String, _ unit: String?, _ label: String, change: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(verbatim: value).font(Typo.heading(30)).foregroundStyle(Palette.ink)
                if let unit { Text(verbatim: unit).font(Typo.caption).foregroundStyle(Palette.muted) }
                if let change {
                    Text(verbatim: change).font(.footnote.weight(.semibold))
                        .foregroundStyle(volumeBetter ? Palette.green : Palette.rust)
                }
            }
            .lineLimit(1).minimumScaleFactor(0.6)
            Text(verbatim: L10n.tr(label)).font(Typo.small).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
    }
}
