import SwiftUI

/// The watch's own look (Shared/Palette.swift is the iPhone's, with UIKit):
/// the dark palette's colours on black, Instrument Serif for numbers and
/// titles, Newsreader for sentences, a coloured glow at the top of each page.
@MainActor
enum W {
    static let ink = Color(hex: 0xECEAE6)
    static let secondary = Color(hex: 0xD9D6D0)
    static let muted = Color(hex: 0x9AA39F)
    static let dim = Color(hex: 0x5C6063)
    static let track = Color(hex: 0x2A2C2E)
    static let disc = Color(hex: 0x121314)
    static let tile = Color.white.opacity(0.07)

    static let green = Color(hex: 0x8FE6C4)
    static let amber = Color(hex: 0xF2B46B)
    static let indigo = Color(hex: 0xA5A1FF)
    static let pink = Color(hex: 0xF59BB0)
    static let red = Color(hex: 0xFF6B5B)
    /// The iPhone's dark macro and water colours (Shared/Palette.swift).
    static let carbs = Color(hex: 0xFFC274)
    static let protein = Color(hex: 0x83C7FF)
    static let fat = Color(hex: 0xB3A1FF)
    static let blue = Color(hex: 0x7CC3F0)

    /// The glow at the top of a page, one per part of the day.
    enum Glow {
        static let readiness = Color(hex: 0x163A2E)
        static let sleep = Color(hex: 0x262556)
        static let restingHR = Color(hex: 0x3D1D2A)
        static let strain = Color(hex: 0x3A2A17)
        static let food = Color(hex: 0x163047)
    }

    /// A shape style, for containerBackground: the colour fades into black.
    static func glow(_ color: Color) -> RadialGradient {
        RadialGradient(colors: [color, .black], center: UnitPoint(x: 0.5, y: -0.05), startRadius: 0, endRadius: 150)
    }

    static func zoneColor(_ zone: String?) -> Color {
        switch zone {
        case "yellow": amber
        case "red": red
        default: green
        }
    }

    static func serif(_ size: CGFloat) -> Font { .custom("InstrumentSerif-Regular", size: size) }
    static func news(_ size: CGFloat) -> Font { .custom("Newsreader-Regular", size: size) }
    static func label(_ size: CGFloat = 9) -> Font { .system(size: size, weight: .semibold) }

    // MARK: Language

    /// The iPhone app's language; the watch's own until the first snapshot.
    static var english: Bool {
        if let language = WatchStore.shared.snapshot?.language { return language == "en" }
        let first = Locale.preferredLanguages.first?.lowercased() ?? ""
        return !(first.hasPrefix("cs") || first.hasPrefix("sk"))
    }

    static func tr(_ czech: String, _ english: String) -> String { self.english ? english : czech }

    static var locale: Locale { Locale(identifier: english ? "en_US" : "cs_CZ") }

    // MARK: Numbers

    static func number(_ value: Double, digits: Int = 0) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    /// A signed change: "+4", "−2", "0".
    static func change(_ value: Double, digits: Int = 0) -> String {
        let text = number(abs(value), digits: digits)
        if text == number(0, digits: digits) { return text }
        return (value > 0 ? "+" : "−") + text
    }

    /// 432 minutes as "7:12".
    static func clock(minutes: Double) -> String {
        let m = Int(minutes.rounded())
        return "\(m / 60):" + String(format: "%02d", m % 60)
    }

    /// 432 minutes as "7h 12m" ("7 h 12 min" in Czech).
    static func duration(minutes: Double) -> String {
        let m = Int(minutes.rounded())
        return english ? "\(m / 60)h \(m % 60)m" : "\(m / 60) h \(m % 60) min"
    }

    static func minutesChange(_ value: Double) -> String {
        let m = Int(value.rounded())
        let sign = m > 0 ? "+" : m < 0 ? "−" : ""
        let a = abs(m)
        if a >= 60 { return sign + "\(a / 60):" + String(format: "%02d", a % 60) }
        return sign + "\(a) min"
    }

    /// An axis date: "28 Sep" / "28. 9.", or the month alone over 90 days.
    static func axisDate(_ date: Date, month: Bool) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = month ? "LLL" : (english ? "d MMM" : "d. M.")
        return formatter.string(from: date)
    }

    static func weekday(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = "EEE"
        return formatter.string(from: date)
    }

    /// "2026-10-31" as a date at noon (no day shifts across time zones).
    static func day(_ text: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH"
        return formatter.date(from: text + " 12")
    }

    /// "sobota", "Saturday".
    static func dayName(_ text: String) -> String {
        guard let date = day(text) else { return text }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = "EEEE"
        return formatter.string(from: date)
    }

    /// The day's letter under its dot: "P Ú S Č P S N", "M T W T F S S".
    static func dayLetter(_ text: String) -> String {
        guard let date = day(text) else { return "" }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: date)
        let letters = english ? ["S", "M", "T", "W", "T", "F", "S"] : ["N", "P", "Ú", "S", "Č", "P", "S"]
        return letters[(weekday - 1) % 7]
    }

    /// "07:30" as "7:30".
    static func clockText(_ time: String) -> String {
        let t = time.count > 5 ? String(time.prefix(5)) : time
        return t.hasPrefix("0") && t.count == 5 ? String(t.dropFirst()) : t
    }

    /// The sport's SF Symbol, as on the iPhone (SportIcon).
    static func sportSymbol(_ sport: String) -> String {
        switch sport {
        case "ride": "bicycle"
        case "run": "figure.run"
        case "strength", "gym": "dumbbell.fill"
        case "swim": "figure.pool.swim"
        case "walk": "figure.walk"
        default: "figure.mixed.cardio"
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// The segmented ring of every Aurin watch screen: ten arcs over three
/// quarters of a circle on a dark disc, lit up to `fraction`.
struct Ring<Content: View>: View {
    let fraction: Double
    let color: Color
    var size: CGFloat = 94
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Circle().fill(W.disc)
            ForEach(0..<10, id: \.self) { i in
                Arc(start: 135 + Double(i) * 27 + 2, end: 135 + Double(i) * 27 + 25)
                    .stroke(i < Int((fraction * 10).rounded()) ? color : W.track,
                            style: StrokeStyle(lineWidth: size * 0.08, lineCap: .butt))
                    .frame(width: size * 0.8, height: size * 0.8)
            }
            VStack(spacing: 1) { content }
        }
        .frame(width: size, height: size)
    }

    private struct Arc: Shape {
        let start: Double
        let end: Double

        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width / 2,
                        startAngle: .degrees(start), endAngle: .degrees(end), clockwise: false)
            return path
        }
    }
}

/// The big number in a ring and its small label under it.
struct RingValue: View {
    let value: String
    let label: String
    let color: Color
    var size: CGFloat = 32

    var body: some View {
        VStack(spacing: 1) {
            text
        }
    }

    @ViewBuilder private var text: some View {
        Text(value)
            .font(W.serif(size))
            .foregroundStyle(W.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        Text(label.uppercased())
            .font(W.label(8.5))
            .tracking(0.5)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

/// The three tiles at the bottom of a page, all the same height; the first
/// one is the highlighted one, with its colour along the top.
struct Tiles: View {
    struct Item {
        let label: String
        let value: String
    }

    let items: [Item]
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { index, item in
                VStack(spacing: 2) {
                    Text(item.value)
                        // Numbers in the serif, words ("short", "high") in the system font.
                        .font(item.value.contains(where: \.isLetter) ? .system(size: 13, weight: .semibold)
                              : W.serif(item.value.count < 4 ? 19 : 15))
                        .foregroundStyle(W.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .frame(height: 20)
                    Text(item.label)
                        .font(W.label(8))
                        .foregroundStyle(index == 0 ? color : W.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(W.tile, in: RoundedRectangle(cornerRadius: 12))
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(index == 0 ? color : W.dim)
                        .frame(height: 2)
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}
