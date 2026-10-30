import SceneKit
import SwiftUI
import UIKit

// Svaly's 3D figure: the licensed ecorché ("Muscle Anatomy Visualized | Ecorche" by Alexander
// Lashko) as scripts/build-muscle-model.mjs packs it. The model is paid, so it never goes in the
// public repository: CI copies it from R2 into the app's bundle at build
// (.github/scripts/fetch-muscle-model.sh), which also shows it in the sample day. A build without
// it (no secret) downloads it once from /app/api/muscles/model (src/muscle-model.js) and keeps it
// in Application Support. Until it is there, the screens show the flat MuscleFigurePair.

/// The parsed file: vertices, normals and the triangles of each muscle group.
struct MuscleMesh: Sendable {
    struct Group: Sendable {
        /// A muscle of src/muscle-fatigue.js MUSCLES, "other" or "bone".
        let name: String
        let indices: Data
        let indexCount: Int
        /// The middle of the group (both sides of the body) and how far it reaches.
        let centre: SIMD3<Float>
        let radius: Float
    }

    let vertexCount: Int
    let positions: Data
    let normals: Data
    let groups: [Group]

    init?(data: Data) {
        let data = Data(data)
        guard data.count > 16, data.prefix(4) == Data("AURM".utf8) else { return nil }
        func u32(_ offset: Int) -> Int { Int(data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }) }
        func f32(_ offset: Int) -> Float { data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: Float.self) } }
        guard u32(4) == 1 else { return nil }
        let vertexCount = u32(8), groupCount = u32(12)
        var offset = 16
        var heads: [(name: String, count: Int, centre: SIMD3<Float>, radius: Float)] = []
        for _ in 0..<groupCount {
            guard offset + 24 <= data.count else { return nil }
            let length = u32(offset + 20)
            guard offset + 24 + length <= data.count else { return nil }
            let name = String(decoding: data[(offset + 24)..<(offset + 24 + length)], as: UTF8.self)
            heads.append((name, u32(offset), SIMD3(f32(offset + 4), f32(offset + 8), f32(offset + 12)), f32(offset + 16)))
            offset += 24 + (length + 3) / 4 * 4
        }
        let bytes = vertexCount * 12
        let indexBytes = heads.reduce(0) { $0 + $1.count * 4 }
        guard offset + 2 * bytes + indexBytes == data.count else { return nil }
        positions = data.subdata(in: offset..<(offset + bytes))
        offset += bytes
        normals = data.subdata(in: offset..<(offset + bytes))
        offset += bytes
        var groups: [Group] = []
        for head in heads {
            groups.append(Group(name: head.name, indices: data.subdata(in: offset..<(offset + head.count * 4)), indexCount: head.count,
                                centre: head.centre, radius: head.radius))
            offset += head.count * 4
        }
        self.vertexCount = vertexCount
        self.groups = groups
    }
}

/// The figure ready to draw: one geometry, one element per group, shared by every view.
final class MuscleFigure3D {
    let geometry: SCNGeometry
    let groups: [MuscleMesh.Group]

    init(mesh: MuscleMesh) {
        let vertices = SCNGeometrySource(data: mesh.positions, semantic: .vertex, vectorCount: mesh.vertexCount, usesFloatComponents: true,
                                         componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
        let normals = SCNGeometrySource(data: mesh.normals, semantic: .normal, vectorCount: mesh.vertexCount, usesFloatComponents: true,
                                        componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12)
        let elements = mesh.groups.map {
            SCNGeometryElement(data: $0.indices, primitiveType: .triangles, primitiveCount: $0.indexCount / 3, bytesPerIndex: 4)
        }
        geometry = SCNGeometry(sources: [vertices, normals], elements: elements)
        groups = mesh.groups
    }

    func group(_ name: String?) -> MuscleMesh.Group? { groups.first { $0.name == name } }

    /// Muscles on the back of the body are shown from behind.
    static func facing(_ id: String) -> Float {
        ["hamstrings", "glutes", "calves", "back", "lower_back", "traps", "rear_delts", "triceps"].contains(id) ? .pi - 0.3 : 0.3
    }
}

/// Reads the model from the bundle, or downloads it once and keeps it.
@MainActor
@Observable
final class MuscleModelStore {
    static let shared = MuscleModelStore()
    /// The file format the app reads (?v= of /app/api/muscles/model).
    static let format = 1

    private(set) var figure: MuscleFigure3D?
    @ObservationIgnored private var loading = false

    private static var file: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "muscles-v\(format).bin")
    }

    /// The copy CI put in the app (muscles-v1.bin), nil in a build without it.
    private static var bundled: URL? { Bundle.main.url(forResource: "muscles-v\(format)", withExtension: "bin") }

    /// `api` nil (the sample day): only the bundle and a kept copy, never the server.
    func load(api: APIClient?) async {
        guard figure == nil, !loading else { return }
        loading = true
        defer { loading = false }
        let file = Self.file
        if let bundled = Self.bundled, let data = try? Data(contentsOf: bundled), let mesh = await Self.parse(data) {
            figure = MuscleFigure3D(mesh: mesh)
            // A copy downloaded before the model came in the app is no longer needed.
            try? FileManager.default.removeItem(at: file)
            return
        }
        if let data = try? Data(contentsOf: file), let mesh = await Self.parse(data) {
            figure = MuscleFigure3D(mesh: mesh)
            return
        }
        guard let api, let data = try? await api.getData("/app/api/muscles/model?v=\(Self.format)"), let mesh = await Self.parse(data) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
        figure = MuscleFigure3D(mesh: mesh)
    }

    private static func parse(_ data: Data) async -> MuscleMesh? {
        await Task.detached(priority: .userInitiated) { MuscleMesh(data: data) }.value
    }
}

/// The figure in SceneKit: a finger dragged sideways turns it, a tap names the muscle under it,
/// `selected` lights one muscle and dims the rest, `focus` moves the camera in on a muscle.
struct Muscle3DView: UIViewRepresentable {
    let figure: MuscleFigure3D
    /// Tired and recovering muscles by id; the rest stay grey.
    var colors: [String: Color]
    var selected: String? = nil
    var focus: String? = nil
    var yaw: Float = 0
    /// A sideways drag turns the figure; off for the fixed front and back views.
    var turns = true
    /// The whole figure from a little further away (narrow views fit the arms).
    var distance: Float = 1
    /// The muscle tapped (nil off the muscles) and where.
    var onTap: ((String?, CGPoint) -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator(figure: figure) }

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(frame: .zero, options: nil)
        view.backgroundColor = .clear
        view.antialiasingMode = .multisampling4X
        view.scene = context.coordinator.scene
        view.pointOfView = context.coordinator.camera
        view.isAccessibilityElement = false
        if turns {
            let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
            pan.delegate = context.coordinator
            view.addGestureRecognizer(pan)
        }
        context.coordinator.distance = distance
        view.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:))))
        context.coordinator.turntable.eulerAngles.y = yaw
        context.coordinator.place(focus: focus, animated: false)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onTap = onTap
        let traits = UITraitCollection(userInterfaceStyle: context.environment.colorScheme == .dark ? .dark : .light)
        coordinator.paint(colors: colors.mapValues { UIColor($0).resolvedColor(with: traits) }, selected: selected, traits: traits)
        if coordinator.focus != focus { coordinator.place(focus: focus, animated: true) }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        let figure: MuscleFigure3D
        let scene = SCNScene()
        let turntable = SCNNode()
        let camera = SCNNode()
        var focus: String?
        var distance: Float = 1
        var onTap: ((String?, CGPoint) -> Void)?
        private var materials: [SCNMaterial] = []
        private var painted: [String: UIColor]?
        private var paintedSelection: String?
        private var paintedStyle: UIUserInterfaceStyle?

        init(figure: MuscleFigure3D) {
            self.figure = figure
            super.init()
            scene.background.contents = UIColor.clear
            let geometry = figure.geometry.copy() as? SCNGeometry ?? figure.geometry
            materials = figure.groups.map { _ in
                let material = SCNMaterial()
                material.lightingModel = .lambert
                return material
            }
            geometry.materials = materials
            turntable.addChildNode(SCNNode(geometry: geometry))
            scene.rootNode.addChildNode(turntable)

            let lens = SCNCamera()
            lens.fieldOfView = CGFloat(2 * Figure3DStyle.halfField * 180 / .pi)
            lens.zNear = 0.05
            lens.zFar = 20
            camera.camera = lens
            scene.rootNode.addChildNode(camera)

            let ambient = SCNNode()
            ambient.light = SCNLight()
            ambient.light?.type = .ambient
            ambient.light?.intensity = 420
            scene.rootNode.addChildNode(ambient)
            // A key light from the upper left in front and a softer one from the right.
            for (angles, intensity) in [(SCNVector3(-0.6, -0.45, 0), CGFloat(900)), (SCNVector3(-0.2, 0.9, 0), CGFloat(380))] {
                let node = SCNNode()
                node.light = SCNLight()
                node.light?.type = .directional
                node.light?.intensity = intensity
                node.eulerAngles = angles
                scene.rootNode.addChildNode(node)
            }
        }

        /// The whole figure, or close on one muscle.
        func place(focus: String?, animated: Bool) {
            self.focus = focus
            var target = SIMD3<Float>(0, 0.9, 0)
            var distance: Float = 0.98 / tan(Figure3DStyle.halfField) * self.distance
            if let group = figure.group(focus) {
                target = SIMD3(0, group.centre.y, 0)
                distance = max(0.8, group.radius * 1.15 / tan(Figure3DStyle.halfField))
            }
            SCNTransaction.begin()
            SCNTransaction.animationDuration = animated ? 0.5 : 0
            SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            camera.position = SCNVector3(target.x, target.y, target.z + distance)
            SCNTransaction.commit()
        }

        func paint(colors: [String: UIColor], selected: String?, traits: UITraitCollection) {
            guard colors != painted || selected != paintedSelection || traits.userInterfaceStyle != paintedStyle else { return }
            let first = painted == nil
            painted = colors
            paintedSelection = selected
            paintedStyle = traits.userInterfaceStyle
            SCNTransaction.begin()
            SCNTransaction.animationDuration = first ? 0 : 0.25
            for (index, group) in figure.groups.enumerated() {
                let base = group.name == "bone" ? Figure3DStyle.bone.resolvedColor(with: traits) : colors[group.name] ?? Figure3DStyle.rest.resolvedColor(with: traits)
                let lit = selected == group.name
                materials[index].diffuse.contents = selected == nil || lit ? base : base.scaled(0.62)
                materials[index].emission.contents = lit ? base.scaled(0.35) : UIColor.black
            }
            SCNTransaction.commit()
        }

        @objc func pan(_ gesture: UIPanGestureRecognizer) {
            if gesture.state == .began { turntable.removeAction(forKey: "spin") }
            let move = gesture.translation(in: gesture.view)
            gesture.setTranslation(.zero, in: gesture.view)
            turntable.eulerAngles.y += Float(move.x) * 0.012
            if gesture.state == .ended {
                // Let it run on a little after the finger lifts.
                let spin = SCNAction.rotateBy(x: 0, y: gesture.velocity(in: gesture.view).x * 0.012 * 0.25, z: 0, duration: 0.5)
                spin.timingMode = .easeOut
                turntable.runAction(spin, forKey: "spin")
            }
        }

        @objc func tap(_ gesture: UITapGestureRecognizer) {
            guard let view = gesture.view as? SCNView else { return }
            let point = gesture.location(in: view)
            let hit = view.hitTest(point, options: [.searchMode: SCNHitTestSearchMode.closest.rawValue]).first
            let name = hit.flatMap { $0.geometryIndex < figure.groups.count ? figure.groups[$0.geometryIndex].name : nil }
            onTap?(name == "other" || name == "bone" ? nil : name, point)
        }

        /// Only sideways drags turn the figure; up and down still scroll the screen.
        func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
            guard let pan = gesture as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) > abs(velocity.y)
        }
    }
}

/// The figure fixed from the front and from behind: the muscles picked in
/// Sestavit trénink, today's muscles in the rest of Režim tréninku.
struct MuscleFigureFixedPair: View {
    let figure: MuscleFigure3D
    /// Colours by muscle of the model (src/muscle-fatigue.js MUSCLES); the rest stay grey.
    var colors: [String: Color]
    var labels = true
    /// A tap on a muscle of the model.
    var onTap: ((String) -> Void)? = nil

    var body: some View {
        HStack(spacing: 2) {
            side(0, "Zepředu")
            side(.pi, "Zezadu")
        }
    }

    private func side(_ yaw: Float, _ title: String) -> some View {
        VStack(spacing: 6) {
            Muscle3DView(figure: figure, colors: colors, yaw: yaw, turns: false, distance: 1.12,
                         onTap: onTap.map { tap in { (id: String?, _: CGPoint) in if let id { tap(id) } } })
            if labels { Text(L10n.tr(title)).font(Typo.tiny).foregroundStyle(Palette.faint) }
        }
        .frame(maxWidth: .infinity)
    }

    /// The model's muscles behind the gym's muscles (BodyFigure ids), each in its colour.
    static func colors(_ body: [String: Color]) -> [String: Color] {
        var out: [String: Color] = [:]
        for (id, color) in body { for muscle in MuscleFatigue.fatigueIds(body: id) { out[muscle] = color } }
        return out
    }
}

/// The grey of rested muscles and of the bones, and half the camera's vertical field of view.
private enum Figure3DStyle {
    static let rest = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0x4A4B4C) : UIColor(hex: 0xC9C3BA) }
    static let bone = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0x2C2D2E) : UIColor(hex: 0xE4DFD7) }
    static let halfField: Float = 14 * .pi / 180
}

private extension UIColor {
    func scaled(_ factor: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: r * factor, green: g * factor, blue: b * factor, alpha: a)
    }
}
