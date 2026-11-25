import CoreGraphics
import XCTest
@testable import Aurin

/// My form: a drawn stick figure squats; the maths must find its reps, depth
/// and which side the video is from.
final class FormAnalysisTests: XCTestCase {
    private let shin = 0.2, thigh = 0.2, torso = 0.25

    /// Side view: thigh angle from vertical goes 0 -> peak -> 0 in each rep, 30 frames a second.
    private func sideSquats(_ peaks: [Double], down: Double = 1.5, up: Double = 1.0) -> [FormFrame] {
        var frames: [FormFrame] = []
        var t = 0.0
        func add(_ thighDeg: Double) {
            let tr = thighDeg * .pi / 180, s = tr * 0.4, r = tr * 0.45
            let ankle = CGPoint(x: 0.5, y: 0.1)
            let knee = CGPoint(x: ankle.x + shin * sin(s), y: ankle.y + shin * cos(s))
            let hip = CGPoint(x: knee.x - thigh * sin(tr), y: knee.y + thigh * cos(tr))
            let shoulder = CGPoint(x: hip.x + torso * sin(r), y: hip.y + torso * cos(r))
            // The far side sits a little behind and Vision misses it half the time.
            var p: [FormJoint: CGPoint] = [.leftAnkle: ankle, .leftKnee: knee, .leftHip: hip, .leftShoulder: shoulder]
            if Int(t * 30) % 2 == 0 {
                p[.rightShoulder] = CGPoint(x: shoulder.x + 0.01, y: shoulder.y)
                p[.rightHip] = CGPoint(x: hip.x + 0.01, y: hip.y)
            }
            frames.append(FormFrame(time: t, points: p))
            t += 1.0 / 30
        }
        for _ in 0..<20 { add(0) }
        for peak in peaks {
            for i in 0..<Int(down * 30) { add(peak * Double(i) / (down * 30)) }
            for i in 0...Int(up * 30) { add(peak * (1 - Double(i) / (up * 30))) }
            for _ in 0..<20 { add(0) }
        }
        return frames
    }

    /// Front or back view, one rep; knees move `kneeIn` towards the middle and the hips `shift` sideways at the bottom.
    private func faceOnSquat(front: Bool, kneeIn: CGFloat, shift: CGFloat = 0) -> [FormFrame] {
        var frames: [FormFrame] = []
        let steps: [Double] = (0..<20).map { _ in 0.0 } + (0..<45).map { Double($0) / 45 } + (0...30).map { 1 - Double($0) / 30 } + (0..<20).map { _ in 0.0 }
        for (i, step) in steps.enumerated() {
            let depth = CGFloat(step)
            let sign: CGFloat = front ? 1 : -1  // front: the person's left is on the image's right
            let hipY: CGFloat = 0.5 - 0.2 * depth, kneeY: CGFloat = 0.3, ankleY: CGFloat = 0.1
            func side(_ s: CGFloat) -> (CGPoint, CGPoint, CGPoint, CGPoint) {
                let x = 0.5 + s * 0.1
                return (CGPoint(x: x + shift * depth, y: hipY + 0.3),
                        CGPoint(x: x + shift * depth, y: hipY),
                        CGPoint(x: x - s * kneeIn * depth, y: kneeY),
                        CGPoint(x: x, y: ankleY))
            }
            let l = side(sign), r = side(-sign)
            frames.append(FormFrame(time: Double(i) / 30, points: [
                .leftShoulder: l.0, .leftHip: l.1, .leftKnee: l.2, .leftAnkle: l.3,
                .rightShoulder: r.0, .rightHip: r.1, .rightKnee: r.2, .rightAnkle: r.3,
            ]))
        }
        return frames
    }

    func testSideViewCountsRepsAndBandsTheDepth() {
        let result = FormAnalysis.squat(sideSquats([80, 90, 115]))
        XCTAssertEqual(result.view, .side)
        XCTAssertEqual(result.reps.map(\.depth), [.above, .parallel, .deep])
    }

    func testTempoAndAnglesAreRounded() {
        let rep = FormAnalysis.squat(sideSquats([100], down: 2, up: 1)).reps.first
        XCTAssertNotNil(rep)
        XCTAssertEqual(rep?.down ?? 0, 2, accuracy: 0.5)
        XCTAssertEqual(rep?.up ?? 0, 1, accuracy: 0.5)
        XCTAssertEqual((rep?.kneeAngle ?? 1) % 5, 0)
        XCTAssertNotNil(rep?.trunkMinusShin)
        XCTAssertNil(rep?.leftKnee)
    }

    func testAShallowBobIsNotARep() {
        XCTAssertEqual(FormAnalysis.squat(sideSquats([20])).reps.count, 0)
    }

    func testFrontAndBackAreToldApart() {
        XCTAssertEqual(FormAnalysis.view(faceOnSquat(front: true, kneeIn: 0)), .front)
        XCTAssertEqual(FormAnalysis.view(faceOnSquat(front: false, kneeIn: 0)), .back)
    }

    func testFrontViewTracksTheKneesNotTheDepth() {
        let straight = FormAnalysis.squat(faceOnSquat(front: true, kneeIn: 0)).reps.first
        XCTAssertEqual(straight?.leftKnee, .inLine)
        XCTAssertEqual(straight?.rightKnee, .inLine)
        XCTAssertNil(straight?.depth)
        let caving = FormAnalysis.squat(faceOnSquat(front: false, kneeIn: 0.08)).reps.first
        XCTAssertEqual(caving?.leftKnee, .inward)
        XCTAssertEqual(caving?.rightKnee, .inward)
    }

    func testHipShiftIsMeasuredFromTheFeet() {
        let rep = FormAnalysis.squat(faceOnSquat(front: true, kneeIn: 0, shift: 0.04)).reps.first
        XCTAssertEqual(rep?.hipShift ?? 0, 0.2, accuracy: 0.05)
    }

    func testAnObliqueVideoGivesNoNumbers() {
        var frames = sideSquats([100])
        for i in frames.indices {
            frames[i].points[.rightShoulder] = frames[i].points[.leftShoulder].map { CGPoint(x: $0.x + 0.1, y: $0.y) }
        }
        let result = FormAnalysis.squat(frames)
        XCTAssertEqual(result.view, .oblique)
        XCTAssertTrue(result.reps.isEmpty)
    }
}
