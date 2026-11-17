import SwiftUI

/// Every shared part of the new design on one page with sample values
/// (redesign Z2), for the snapshot test (light, dark, large text) and the
/// Xcode preview. Not reachable in the app.
struct ComponentGallery: View {
    /// Both halves, or one (the large-text snapshot is too tall for one image).
    enum Part { case all, charts, rest }
    var part: Part = .all
    static let today = "2026-11-16"
    @State private var period: ChartPeriod = .days30
    @State private var cell = "restingHR"
    @State private var day = "2026-11-12"

    /// 400 days of a resting heart rate with a band, two nights above it, one
    /// far above, and a gap of four days.
    static let points: [ChartPoint] = (0..<400).compactMap { i in
        let date = ISODay.shift(ComponentGallery.today, i - 399)
        if (230...233).contains(i) { return nil }
        let wave = 53 + 1.6 * sin(Double(i) / 9) + 0.8 * sin(Double(i) / 2.3)
        let value = i == 395 ? 58.0 : i == 388 ? 56.2 : (wave * 10).rounded() / 10
        let state = i == 395 ? "far" : i == 388 ? "slightly" : "within"
        return ChartPoint(date: date, value: value, low: 50.5 + sin(Double(i) / 30), high: 55.5 + sin(Double(i) / 30),
                          state: state, side: state == "within" ? nil : "above")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if part != .rest { charts }
            if part != .charts { rest }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 24)
    }

    @ViewBuilder private var charts: some View {
            DetailTitleRow(title: "Klidový tep", back: {}) {
                Circle().fill(Palette.track).frame(width: 44, height: 44)
            }
            SiblingCells(cells: [
                SiblingCell(id: "restingHR", title: "Klidový tep", value: "53", unit: "bpm"),
                SiblingCell(id: "hrv", title: "HRV", value: "68", unit: "ms"),
                SiblingCell(id: "respiration", title: "Dech", value: "16,1", unit: "/min")
            ], selected: cell) { cell = $0 }
            DetailHeadline(label: "Dnes, nejnižší tep v klidu", value: "53", unit: "bpm", state: .within, usual: "Obvyklé rozmezí 50 až 56 bpm")
            DetailHeadline(value: "58", unit: "bpm", state: .far(above: true))
            Card {
                DetailChart(points: Self.points, today: Self.today, period: $period, unit: "bpm",
                            note: "Každý bod je jeden den. Šedý pruh je tvoje obvyklé rozmezí, čárkovaně průměr období.",
                            source: "Apple Watch")
            }
            Card {
                TrendTable(sentence: "O něco níž než před měsícem, celou dobu v obvyklém rozmezí.",
                           rows: TrendMath.rows(Self.points, today: Self.today), unit: "bpm", digits: 0)
            }
    }

    @ViewBuilder private var rest: some View {
            HowMeasuredCard(text: "Aurin odhaduje tvůj VO2max ze všech tréninků, klidového tepu a profilu. Je to odhad, ne laboratorní test.",
                            rows: [("Data z", "Apple Watch"), ("Ve srovnání s", "Muži 30 až 39 let v laboratorních testech (registr FRIEND)")])
            Card {
                MonthCalendar(month: Self.today, today: Self.today, selected: day, subtitle: "12 tréninků",
                              pick: { day = $0 }, move: { _ in }) { d in
                    Circle().fill(d <= Self.today && Int(d.suffix(2)).map { $0 % 3 == 0 } == true ? Palette.Sport.run : Palette.track)
                        .frame(width: 6, height: 6)
                }
            }
            HStack {
                Spacer()
                RangeDial(value: 1.05, scale: 0.6...1.6, band: 0.9...1.15, ends: ("Lehčí", "Těžší"), size: 200) {
                    Text(verbatim: L10n.tr("Jako obvykle")).font(Typo.heading(30)).foregroundStyle(Palette.ink)
                }
                Spacer()
            }
            HStack {
                Spacer()
                RangeDial(value: 8.4, scale: 0...21, band: 10...13.5, fill: true, ends: ("0", "21"), size: 200) {
                    Text(verbatim: "8,4").font(Typo.number(56)).foregroundStyle(Palette.ink)
                }
                Spacer()
            }
            Card {
                LearningState(kind: .learning(have: 9, need: 21, per: .days),
                              text: "Load balance porovnává tvých posledních 7 dní s obvyklými 4 týdny.")
            }
            Card { LearningState(kind: .missing, text: "Připoj hodinky nebo prsten a hodnota se ukáže po první noci.") }
            AIConsentCard(allow: {})
    }
}

#Preview("Light") {
    ScrollView { ComponentGallery() }.background { ScreenBackground(glow: Palette.Glow.health) }
}

#Preview("Dark, large text") {
    ScrollView { ComponentGallery() }.background { ScreenBackground(glow: Palette.Glow.health) }
        .preferredColorScheme(.dark)
        .dynamicTypeSize(.accessibility1)
}
