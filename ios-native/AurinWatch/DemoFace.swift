import SwiftUI

/// The watch face for the screenshots (-demo -face, WatchDemo): Aurin's
/// complications under the watch's own clock (top right), laid out as on the
/// Modular face and drawn by the complications' own views (WideView and
/// SmallView from AurinWatchWidgets, compiled into the app for this), as the
/// simulator can't be given a face with them.
struct DemoFace: View {
    let s: WatchSnapshot

    init(s: WatchSnapshot) {
        self.s = s
        // The complications' words in the sample day's language.
        Lang.set(s)
    }

    var body: some View {
        let entry = DayEntry(date: WatchDemo.now, snapshot: s)
        VStack(alignment: .leading, spacing: 6) {
            Text(Self.day)
                .watchFont(15, .semibold, design: .rounded)
                .textCase(.uppercase)
                .foregroundStyle(W.amber)
            WideView(kind: .today, entry: entry)
                .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
            WideView(kind: .day, entry: entry)
                .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
            HStack(spacing: 0) {
                small(.workout, entry)
                Spacer(minLength: 0)
                small(.drinks, entry)
                Spacer(minLength: 0)
                small(.alarm, entry)
            }
        }
        .padding(.horizontal, 8)
        // "in 3 hr 9 min" ("za 3 h 9 min") in the sample day's language too.
        .environment(\.locale, W.locale)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.black.ignoresSafeArea())
    }

    /// "MON 2", "PO 2." in the sample day's language (Text with a format
    /// style took the watch's own language).
    private static var day: String {
        let formatter = DateFormatter()
        formatter.locale = W.locale
        formatter.setLocalizedDateFormatFromTemplate("EEEd")
        return formatter.string(from: WatchDemo.now)
    }

    private func small(_ metric: SmallMetric, _ entry: DayEntry) -> some View {
        SmallView(metric: metric, value: Small.value(metric, entry.snapshot, at: entry.date))
            .frame(width: 50, height: 50)
    }
}
