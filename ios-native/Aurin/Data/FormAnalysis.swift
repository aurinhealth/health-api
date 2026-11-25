import CoreGraphics
import Foundation

// My form: technique of one squat set from body points. Apple Vision finds the
// points in each frame; this file only does the maths, so it is tested without
// a camera. Each video is read from its own view only: the side view gives depth,
// knee and trunk angles, the front or back view gives knee tracking (an estimate:
// 2D front views agree poorly with 3D, so it stays out of release 1 until our test passes). The limits below are first
// guesses until the accuracy test on real videos sets them. Not shown in the app yet.

enum FormJoint: Hashable, CaseIterable, Sendable {
    case nose, leftShoulder, rightShoulder, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle
}

/// One video frame: time in seconds and the points Vision is sure of, in image
/// coordinates 0...1 with y going up (Vision's own convention).
struct FormFrame: Sendable {
    var time: Double
    var points: [FormJoint: CGPoint]
}

enum FormView: Equatable, Sendable { case side, front, back, oblique, unknown }

/// Squat depth from the lowest point of a rep: hip joint against knee joint.
enum FormDepth: Equatable, Sendable { case deep, parallel, above }

/// Knee seen from the front or back, against the line from hip to ankle.
enum FormKneeTracking: Equatable, Sendable { case inLine, inward, outward }

struct FormRep: Equatable, Sendable {
    var start: Double
    var bottom: Double
    var end: Double
    var down: Double { bottom - start }
    var up: Double { end - bottom }
    // Side view only.
    var depth: FormDepth?
    /// Knee angle at the bottom, rounded to 5°.
    var kneeAngle: Int?
    /// Trunk lean minus shin lean at the bottom, rounded to 5° (0 = parallel).
    var trunkMinusShin: Int?
    // Front or back view only, labelled an estimate.
    var leftKnee: FormKneeTracking?
    var rightKnee: FormKneeTracking?
}

struct FormResult: Equatable, Sendable {
    var view: FormView
    var reps: [FormRep]
}

enum FormAnalysis {
    // Shoulder width over torso length: about 0 from the side, about 0.6 or more face on.
    static let sideRatio = 0.3
    static let faceOnRatio = 0.55
    /// A rep counts when the hip drops this share of thigh length below standing.
    static let repDrop = 0.3
    /// Standing again within this share of thigh length.
    static let standingBand = 0.08
    /// Hip this share of thigh length above or below the knee is still parallel.
    static let parallelBand = 0.1
    /// Knee this share of hip width off the hip-ankle line counts as in or out.
    static let kneeBand = 0.25

    static func squat(_ frames: [FormFrame]) -> FormResult {
        let view = self.view(frames)
        guard view != .unknown, view != .oblique else { return FormResult(view: view, reps: []) }
        let hips = frames.compactMap { f in mid(f, .leftHip, .rightHip).map { (f, Double($0.y)) } }
        guard let thigh = median(frames.compactMap(thighLength)), thigh > 0, hips.count > 2 else {
            return FormResult(view: view, reps: [])
        }
        let smooth = movingAverage(hips.map(\.1), 5)
        let top = percentile(smooth, 0.9)
        var reps: [FormRep] = []
        var startIndex = 0
        var lowest: Int?
        for i in smooth.indices {
            if smooth[i] >= top - standingBand * thigh {
                if let low = lowest {
                    reps.append(rep(hips.map(\.0), start: startIndex, bottom: low, end: i, view: view, thigh: thigh))
                    lowest = nil
                }
                startIndex = i
            } else if smooth[i] < top - repDrop * thigh {
                if lowest == nil || smooth[i] < smooth[lowest!] { lowest = i }
            }
        }
        return FormResult(view: view, reps: reps)
    }

    /// Side, front or back from the median shape over the video. Front: the person's
    /// left shoulder is on the image's right.
    static func view(_ frames: [FormFrame]) -> FormView {
        var ratios: [Double] = [], facing: [Double] = []
        for f in frames {
            guard let l = f.points[.leftShoulder], let r = f.points[.rightShoulder],
                  let s = mid(f, .leftShoulder, .rightShoulder), let h = mid(f, .leftHip, .rightHip) else { continue }
            let torso = distance(s, h)
            guard torso > 0 else { continue }
            ratios.append(abs(Double(l.x - r.x)) / torso)
            facing.append(Double(l.x - r.x))
        }
        guard let ratio = median(ratios), let side = median(facing) else { return .unknown }
        if ratio < sideRatio { return .side }
        if ratio < faceOnRatio { return .oblique }
        return side > 0 ? .front : .back
    }

    private static func rep(_ frames: [FormFrame], start: Int, bottom: Int, end: Int, view: FormView, thigh: Double) -> FormRep {
        let b = frames[bottom]
        var r = FormRep(start: frames[start].time, bottom: b.time, end: frames[end].time)
        if view == .side {
            // The side nearer the camera: Vision is surer of it, so its points are there more often.
            let left = frames.filter { $0.points[.leftHip] != nil && $0.points[.leftKnee] != nil && $0.points[.leftAnkle] != nil }.count
            let right = frames.filter { $0.points[.rightHip] != nil && $0.points[.rightKnee] != nil && $0.points[.rightAnkle] != nil }.count
            let (hip, knee, ankle, shoulder): (FormJoint, FormJoint, FormJoint, FormJoint) = left >= right
                ? (.leftHip, .leftKnee, .leftAnkle, .leftShoulder) : (.rightHip, .rightKnee, .rightAnkle, .rightShoulder)
            if let h = b.points[hip], let k = b.points[knee] {
                let d = Double(h.y - k.y) / thigh
                r.depth = d < -parallelBand ? .deep : d > parallelBand ? .above : .parallel
                if let a = b.points[ankle] {
                    r.kneeAngle = round5(angle(h, k, a))
                    if let s = b.points[shoulder] {
                        r.trunkMinusShin = round5(lean(h, s) - lean(a, k))
                    }
                }
            }
        } else if let lh = b.points[.leftHip], let rh = b.points[.rightHip] {
            let width = abs(Double(lh.x - rh.x))
            guard width > 0 else { return r }
            // Inward = towards the body's middle line.
            let middle = Double(lh.x + rh.x) / 2
            func track(_ hip: CGPoint, _ knee: CGPoint?, _ ankle: CGPoint?) -> FormKneeTracking? {
                guard let k = knee, let a = ankle, hip.y != a.y else { return nil }
                let t = Double((k.y - hip.y) / (a.y - hip.y))
                let lineX = Double(hip.x) + t * Double(a.x - hip.x)
                let out = (Double(k.x) - lineX) * (lineX >= middle ? 1 : -1) / width
                return out < -kneeBand ? .inward : out > kneeBand ? .outward : .inLine
            }
            r.leftKnee = track(lh, b.points[.leftKnee], b.points[.leftAnkle])
            r.rightKnee = track(rh, b.points[.rightKnee], b.points[.rightAnkle])
        }
        return r
    }

    // MARK: Maths

    private static func mid(_ f: FormFrame, _ a: FormJoint, _ b: FormJoint) -> CGPoint? {
        switch (f.points[a], f.points[b]) {
        case let (p?, q?): return CGPoint(x: (p.x + q.x) / 2, y: (p.y + q.y) / 2)
        case let (p?, nil), let (nil, p?): return p
        default: return nil
        }
    }

    private static func thighLength(_ f: FormFrame) -> Double? {
        if let h = f.points[.leftHip], let k = f.points[.leftKnee] { return distance(h, k) }
        if let h = f.points[.rightHip], let k = f.points[.rightKnee] { return distance(h, k) }
        return nil
    }

    static func distance(_ a: CGPoint, _ b: CGPoint) -> Double {
        hypot(Double(a.x - b.x), Double(a.y - b.y))
    }

    /// Angle at b between a and c, in degrees.
    static func angle(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint) -> Double {
        let u = atan2(Double(a.y - b.y), Double(a.x - b.x)), v = atan2(Double(c.y - b.y), Double(c.x - b.x))
        var d = abs(u - v) * 180 / .pi
        if d > 180 { d = 360 - d }
        return d
    }

    /// Lean of the line from low to high away from vertical, in degrees.
    static func lean(_ low: CGPoint, _ high: CGPoint) -> Double {
        atan2(abs(Double(high.x - low.x)), Double(high.y - low.y)) * 180 / .pi
    }

    static func round5(_ x: Double) -> Int { Int((x / 5).rounded()) * 5 }

    private static func median(_ xs: [Double]) -> Double? {
        xs.isEmpty ? nil : percentile(xs, 0.5)
    }

    private static func percentile(_ xs: [Double], _ p: Double) -> Double {
        let s = xs.sorted()
        return s[min(s.count - 1, Int(Double(s.count - 1) * p))]
    }

    private static func movingAverage(_ xs: [Double], _ n: Int) -> [Double] {
        xs.indices.map { i in
            let lo = max(0, i - n / 2), hi = min(xs.count - 1, i + n / 2)
            return xs[lo...hi].reduce(0, +) / Double(hi - lo + 1)
        }
    }
}
