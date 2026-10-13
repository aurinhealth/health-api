import MapKit
import SwiftUI

/// The route of a workout on a map, coloured by the heart-rate zone, the
/// speed or the power at each point (the switch above the map).
struct ActivityRouteMap: View {
    let detail: ActivityDetail
    /// The route read on the iPhone (Apple Health), when the detail has none.
    var localRoute: [ActivityDetail.StreamPoint] = []
    @State private var mode: Mode = .heart

    enum Mode: String, CaseIterable, Identifiable {
        case heart = "Tep", speed = "Rychlost", power = "Výkon"
        var id: String { rawValue }
    }

    /// One stretch of the route drawn in one colour.
    struct Segment: Identifiable {
        let id: Int
        let coordinates: [CLLocationCoordinate2D]
        let color: Color
    }

    private struct Point {
        let t: Double
        let coordinate: CLLocationCoordinate2D
    }

    static let zoneColors: [Color] = [Palette.faint, Palette.blue, Palette.green, Palette.amberBar, Palette.rust]
    private static let scale: [Color] = [Palette.blue, Palette.green, Palette.gold, Palette.amberBar, Palette.rust]

    private var points: [Point] {
        let stream = detail.streams?.first { $0.type == "latlng" }?.points ?? []
        let source = stream.contains { $0.ll != nil } ? stream : localRoute
        return source.compactMap { p in
            guard let ll = p.ll, ll.count == 2, abs(ll[0]) <= 90, abs(ll[1]) <= 180, ll[0] != 0 || ll[1] != 0 else { return nil }
            return Point(t: p.t, coordinate: CLLocationCoordinate2D(latitude: ll[0], longitude: ll[1]))
        }
    }

    private var modes: [Mode] {
        var list: [Mode] = []
        if !(stream("heartrate").isEmpty) { list.append(.heart) }
        list.append(.speed)
        if stream("watts").count > 10 { list.append(.power) }
        return list
    }

    var body: some View {
        let route = points
        if route.count >= 2 {
            let shown = modes.contains(mode) ? mode : (modes.first ?? .speed)
            let colored = segments(route, shown)
            VStack(alignment: .leading, spacing: 10) {
                if modes.count > 1 { modePicker(shown) }
                Map(initialPosition: .rect(Self.rect(route.map(\.coordinate))), interactionModes: [.zoom]) {
                    ForEach(colored.segments) { segment in
                        MapPolyline(coordinates: segment.coordinates).stroke(segment.color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                    }
                    Annotation("", coordinate: route[0].coordinate) {
                        Circle().fill(Palette.background).frame(width: 12, height: 12).overlay(Circle().stroke(Palette.ink, lineWidth: 3))
                    }
                    Annotation("", coordinate: route[route.count - 1].coordinate) {
                        Circle().fill(Palette.ink).frame(width: 12, height: 12)
                    }
                }
                .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll))
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                legend(colored.legend)
            }
            .padding(.top, 18)
        }
    }

    private func modePicker(_ shown: Mode) -> some View {
        HStack(spacing: 6) {
            ForEach(modes) { m in
                let on = m == shown
                Button { mode = m } label: {
                    Text(m.rawValue).font(.footnote.weight(.medium))
                        .foregroundStyle(on ? Palette.onButton : Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 34)
                        .background(on ? Palette.button : Palette.card, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    private func legend(_ items: [(String, Color)]) -> some View {
        HStack(spacing: 12) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(spacing: 5) {
                    Capsule().fill(item.1).frame(width: 14, height: 5)
                    Text(verbatim: item.0).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
        }
    }

    // MARK: Colours

    private func stream(_ type: String) -> [(t: Double, v: Double)] {
        (detail.streams?.first { $0.type == type }?.points ?? []).compactMap { p in p.v.map { (p.t, $0) } }
    }

    /// The stream's value nearest to the time t (the streams are sorted by time).
    private static func value(at t: Double, in samples: [(t: Double, v: Double)]) -> Double? {
        guard !samples.isEmpty else { return nil }
        var lo = 0, hi = samples.count - 1
        while lo < hi {
            let mid = (lo + hi) / 2
            if samples[mid].t < t { lo = mid + 1 } else { hi = mid }
        }
        let before = max(0, lo - 1)
        let best = abs(samples[before].t - t) < abs(samples[lo].t - t) ? before : lo
        return abs(samples[best].t - t) <= 120 ? samples[best].v : nil
    }

    /// Speed in m/s over about 20 s around each point.
    private static func speeds(_ route: [Point]) -> [Double?] {
        route.indices.map { i in
            var j = i
            while j > 0 && route[i].t - route[j].t < 20 { j -= 1 }
            let dt = route[i].t - route[j].t
            guard dt > 0 else { return nil }
            let a = CLLocation(latitude: route[j].coordinate.latitude, longitude: route[j].coordinate.longitude)
            let b = CLLocation(latitude: route[i].coordinate.latitude, longitude: route[i].coordinate.longitude)
            return b.distance(from: a) / dt
        }
    }

    /// The upper bpm of each zone: the detail's zones, else none.
    private var zoneHighs: [Double] {
        (detail.hrZones ?? []).compactMap(\.max)
    }

    private func segments(_ route: [Point], _ mode: Mode) -> (segments: [Segment], legend: [(String, Color)]) {
        var bins: [Int?]
        var legend: [(String, Color)]
        switch mode {
        case .heart:
            let hr = stream("heartrate"), highs = zoneHighs
            bins = route.map { p -> Int? in
                guard let v = Self.value(at: p.t, in: hr) else { return nil }
                if highs.isEmpty { return nil }
                return highs.firstIndex { v <= $0 } ?? min(highs.count, Self.zoneColors.count - 1)
            }
            legend = (0..<min(5, max(highs.count + 1, 0))).map { ("Z\($0 + 1)", Self.zoneColors[$0]) }
        case .speed:
            let values = Self.speeds(route).map { $0.map { $0 * 3.6 } }
            (bins, legend) = Self.scaled(values, unit: Units.imperial ? "mph" : "km/h", shown: { Units.distance($0) })
        case .power:
            let watts = stream("watts")
            (bins, legend) = Self.scaled(route.map { Self.value(at: $0.t, in: watts) }, unit: "W", shown: { $0 })
        }
        var out: [Segment] = []
        var current: [CLLocationCoordinate2D] = [route[0].coordinate]
        var bin = bins[0]
        for i in 1..<route.count {
            current.append(route[i].coordinate)
            let next = bins[i] ?? bin
            if next != bin || i == route.count - 1 {
                out.append(Segment(id: out.count, coordinates: current, color: color(bin, mode)))
                current = [route[i].coordinate]
                bin = next
            }
        }
        return (out, legend)
    }

    private func color(_ bin: Int?, _ mode: Mode) -> Color {
        guard let bin else { return Palette.muted }
        let list = mode == .heart ? Self.zoneColors : Self.scale
        return list[max(0, min(list.count - 1, bin))]
    }

    /// Five steps between the 5th and 95th percentile; the legend shows the ends and the middle.
    private static func scaled(_ values: [Double?], unit: String, shown: @escaping (Double) -> Double) -> ([Int?], [(String, Color)]) {
        let sorted = values.compactMap { $0 }.filter { $0 > 0 }.sorted()
        guard sorted.count >= 2 else { return (values.map { _ in nil }, []) }
        let lo = sorted[sorted.count / 20], hi = sorted[sorted.count * 19 / 20]
        let span = max(hi - lo, 0.001)
        let bins: [Int?] = values.map { v in
            guard let v, v > 0 else { return nil }
            return Int(((v - lo) / span * 5).rounded(.down)).clamped(0, 4)
        }
        func label(_ v: Double) -> String { Fmt.int(shown(v)) + " " + unit }
        return (bins, [(label(lo), scale[0]), (label((lo + hi) / 2), scale[2]), (label(hi), scale[4])])
    }

    private static func rect(_ coordinates: [CLLocationCoordinate2D]) -> MKMapRect {
        let points = coordinates.map(MKMapPoint.init)
        let xs = points.map(\.x), ys = points.map(\.y)
        let minX = xs.min() ?? 0, maxX = xs.max() ?? 0, minY = ys.min() ?? 0, maxY = ys.max() ?? 0
        let pad = max(maxX - minX, maxY - minY) * 0.12 + 200
        return MKMapRect(x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad)
    }
}

private extension Int {
    func clamped(_ lo: Int, _ hi: Int) -> Int { Swift.max(lo, Swift.min(hi, self)) }
}
