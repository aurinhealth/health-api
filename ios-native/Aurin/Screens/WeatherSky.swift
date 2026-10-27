import SwiftUI

// The sky at the top of the weather's detail (Petr, 2026-10-27, mockups 9 and
// 10): its colour follows the weather and the time of day in light and dark,
// and a quiet animation shows the weather: rain streaks, snow flakes, drifting
// clouds, a storm's flash, stars and the moon at night, the sun by day. Two
// layers: the time of day is the base (night blue at night) and the weather
// goes on top, so a rainy night is the night sky with rain and no stars. Still
// with Reduce Motion.

/// What the sky shows, from the WMO code and whether it is day.
struct SkyLook: Equatable {
    enum Weather { case clear, partly, cloudy, rain, snow, storm }

    let weather: Weather
    let night: Bool

    init(code: Double?, daylight: Bool?) {
        switch Int(code ?? 2) {
        case 0, 1: weather = .clear
        case 3, 45, 48: weather = .cloudy
        case 51...67, 80...82: weather = .rain
        case 71...77, 85, 86: weather = .snow
        case 95...99: weather = .storm
        default: weather = .partly
        }
        night = daylight == false
    }

    /// The sky's colour (light, dark).
    var colors: (light: UInt32, dark: UInt32) {
        if night { return (0xC9CFE6, 0x14204A) }
        switch weather {
        case .clear, .partly: return (0xBFDDF2, 0x235A86)
        case .cloudy: return (0xDCE1E5, 0x3A434B)
        case .rain: return (0xC9D3DC, 0x2C3E50)
        case .storm: return (0xC8C3D6, 0x3A3157)
        case .snow: return (0xE6EEF5, 0x4A5C6E)
        }
    }

    /// The sun by day or the moon at night, beside the temperature.
    var showsBody: Bool { weather == .clear || weather == .partly }
    var clouds: Int {
        switch weather {
        case .clear: return 0
        case .partly: return 2
        default: return 3
        }
    }
    var rains: Bool { weather == .rain || weather == .storm }
    /// Stars only under a clear or partly cloudy night.
    var stars: Int { !night ? 0 : weather == .clear ? 40 : weather == .partly ? 14 : 0 }
}

/// Fixed scattered points for the particles, the same every time.
private enum SkySeeds {
    struct Point { let x: Double; let y: Double; let s: Double; let p: Double }
    static let points: [Point] = {
        var seed: UInt64 = 2026_10_27
        func next() -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double(seed >> 33) / Double(1 << 31)
        }
        return (0..<55).map { _ in Point(x: next(), y: next(), s: next(), p: next() * 6.28) }
    }()
}

private func skyColor(_ hex: UInt32, _ alpha: Double = 1) -> Color {
    Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
}

/// The sky behind the top of the detail: the colour fading into the page, clouds, rain, snow, a flash and stars.
struct WeatherSky: View {
    let look: SkyLook
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600)
            Canvas { g, size in draw(&g, size, t) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(_ g: inout GraphicsContext, _ size: CGSize, _ t: Double) {
        let dark = scheme == .dark, w = size.width, h = size.height
        let sky = skyColor(dark ? look.colors.dark : look.colors.light)
        g.fill(Path(CGRect(origin: .zero, size: size)),
               with: .radialGradient(Gradient(stops: [.init(color: sky, location: 0), .init(color: sky.opacity(0.75), location: 0.45), .init(color: sky.opacity(0), location: 1)]),
                                     center: CGPoint(x: w / 2, y: -h * 0.1), startRadius: 0, endRadius: h * 1.1))
        let points = SkySeeds.points

        for (i, q) in points.prefix(look.stars).enumerated() {
            let a = 0.35 + 0.65 * max(0, sin(t * 2 + q.p * 3))
            let r = 1 + q.s * 1.6, x = q.x * w, y = q.y * h * 0.6
            // Not over the moon.
            if look.showsBody, x > w * 0.68, y < h * 0.62, i % 2 == 0 { continue }
            g.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)),
                   with: .color(dark ? Color.white.opacity(a) : skyColor(0x505A8C, a * 0.7)))
        }

        let cloudColor: UInt32 = look.weather == .storm ? (dark ? 0x55505F : 0x9A96A6) : (dark ? 0x5B636B : 0xFFFFFF)
        for i in 0..<look.clouds {
            let cw = 150 + Double(i) * 40, speed = 8 + Double(i) * 5
            let x = (Double(i) * 130 + t * speed).truncatingRemainder(dividingBy: w + cw) - cw / 2
            cloud(&g, x: x, y: h * (0.2 + Double(i) * 0.09), width: cw,
                  color: skyColor(cloudColor, (dark ? 0.55 : 0.85) * (look.night ? 0.7 : 1)))
        }

        if look.rains {
            let streak = dark ? skyColor(0xA0C8EB, 0.4) : skyColor(0x1D6FA3, 0.32)
            var path = Path()
            for q in points {
                let y = (q.y * h + t * (360 + q.s * 160)).truncatingRemainder(dividingBy: h + 40) - 20
                let x = q.x * w - y * 0.15
                path.move(to: CGPoint(x: x, y: y))
                path.addLine(to: CGPoint(x: x - 4, y: y + 18))
            }
            g.stroke(path, with: .color(streak), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
        }

        if look.weather == .snow {
            let flake = dark ? skyColor(0xEBF0F8, 0.85) : skyColor(0x8CAFCD, 0.85)
            for q in points.prefix(45) {
                let y = (q.y * h + t * (40 + q.s * 30)).truncatingRemainder(dividingBy: h + 10) - 5
                let x = q.x * w + sin(t * 1.2 + q.p) * 10, r = 2 + q.s * 2.2
                g.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)), with: .color(flake))
            }
        }

        // A flash about every 3.2 s; none with Reduce Motion.
        if look.weather == .storm, !reduceMotion {
            let phase = t.truncatingRemainder(dividingBy: 3.2)
            let flash = phase < 0.12 ? 0.55 : phase < 0.2 ? 0.1 : phase < 0.3 ? 0.4 : 0
            if flash > 0 {
                g.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color.white.opacity(flash * (dark ? 0.35 : 0.5))))
            }
        }
    }

    private func cloud(_ g: inout GraphicsContext, x: Double, y: Double, width: Double, color: Color) {
        var path = Path()
        path.addEllipse(in: CGRect(x: x - width * 0.5, y: y - width * 0.22, width: width, height: width * 0.44))
        path.addEllipse(in: CGRect(x: x - width * 0.4, y: y - width * 0.32, width: width * 0.44, height: width * 0.4))
        path.addEllipse(in: CGRect(x: x - width * 0.14, y: y - width * 0.4, width: width * 0.52, height: width * 0.48))
        g.fill(path, with: .color(color))
    }
}

/// The sun (a pulsing glow, slowly turning rays) or the crescent moon, in the place of the weather's symbol.
struct WeatherSkyBody: View {
    let night: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600)
            Canvas { g, size in
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                if night { moon(&g, c) } else { sun(&g, c, t) }
            }
        }
        .frame(width: 120, height: 120)
        .padding(-16)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func sun(_ g: inout GraphicsContext, _ c: CGPoint, _ t: Double) {
        let gold = skyColor(0xF5B82E), pulse = 1 + 0.06 * sin(t * 1.6), glow = 58 * pulse
        g.fill(Path(ellipseIn: CGRect(x: c.x - glow, y: c.y - glow, width: 2 * glow, height: 2 * glow)),
               with: .radialGradient(Gradient(colors: [skyColor(0xF5B82E, 0.55), skyColor(0xF5B82E, 0)]), center: c, startRadius: 0, endRadius: glow))
        var rays = Path()
        for i in 0..<8 {
            let a = t * 0.15 + Double(i) * .pi / 4
            rays.move(to: CGPoint(x: c.x + cos(a) * 30, y: c.y + sin(a) * 30))
            rays.addLine(to: CGPoint(x: c.x + cos(a) * 38, y: c.y + sin(a) * 38))
        }
        g.stroke(rays, with: .color(gold), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        g.fill(Path(ellipseIn: CGRect(x: c.x - 21, y: c.y - 21, width: 42, height: 42)), with: .color(gold))
    }

    private func moon(_ g: inout GraphicsContext, _ c: CGPoint) {
        g.drawLayer { layer in
            layer.fill(Path(ellipseIn: CGRect(x: c.x - 22, y: c.y - 22, width: 44, height: 44)), with: .color(skyColor(0xE8D9A8)))
            layer.blendMode = .destinationOut
            layer.fill(Path(ellipseIn: CGRect(x: c.x - 8, y: c.y - 30, width: 38, height: 38)), with: .color(.black))
        }
    }
}
