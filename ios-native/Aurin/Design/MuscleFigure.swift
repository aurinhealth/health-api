import SwiftUI

/// Aurin's own anatomical figure for Trénink → Svaly (viewBox 0 0 200 430):
/// the left half of the body is drawn here and mirrored around x = 100.
/// Muscle ids are those of GET /app/api/muscles (src/muscle-fatigue.js);
/// "shins" has no data and stays rested.
enum MuscleFigure {
    static let size = CGSize(width: 200, height: 430)
    static let skin = "M100 46 L91 46 C91 53 90 58 87 61 C79 65 70 67 61 69 C47 71 39 81 38 96 C37 110 38 124 39 136 C39 148 38 160 37 168 C34 184 31 204 29 226 C26 236 24 250 27 262 C29 270 37 271 40 264 C42 256 42 244 41 234 C45 214 51 194 56 172 C58 158 59 140 60 124 C61 118 62 114 64 112 C64 130 65 150 68 168 C69 178 67 188 64 198 C61 214 61 236 63 256 C65 272 68 286 71 298 C71 308 69 316 67 326 C64 340 65 356 70 372 C72 380 73 388 73 394 C70 402 68 410 70 415 C76 420 86 420 90 415 C90 407 88 400 87 394 C87 386 88 378 89 370 C93 354 94 336 91 320 C90 312 92 306 93 298 C96 284 98 264 98.5 244 C99 232 99.5 222 100 216 Z"
    static let front: [(id: String, path: String)] = [
        ("traps", "M89 58 C82 63 73 66 64 69 L73 73.5 C81 70 87 67 91 64 Z"),
        ("side_delts", "M60 70 C48 71 40 80 39 94 C38 104 39 112 41 118 C44 108 48 98 52 90 C55 82 57 76 60 70 Z"),
        ("shoulders", "M63 70 C58 78 54 88 51 98 C49 106 47 112 45 118 C52 112 59 103 63 95 C66 88 69 80 72 75 Z"),
        ("chest", "M74 75 C83 72 92 72 98.5 76 L98.5 111 C90 118 78 118 69 111 C64 106 62 99 63 92 C66 85 69 80 74 75 Z"),
        ("biceps", "M44 121 C40 133 40 149 43.5 162 C48 166 54 164 56 158 C58 143 58 129 55 117 C51 116 47 117 44 121 Z"),
        ("forearms", "M42 170 C36 188 32 205 30.5 226 C33 230 37 231 40 229 C44 210 50 192 55 172 C51 167 46 167 42 170 Z"),
        ("core", "M67 117 C65 134 66 154 70 172 C73 184 79 192 86 199 L86 123 C80 121 73 119 67 117 Z"),
        ("core", "M92 118 L94.5 118 C96.71 118 98.5 119.79 98.5 122 L98.5 131.5 C98.5 133.71 96.71 135.5 94.5 135.5 L92 135.5 C89.79 135.5 88 133.71 88 131.5 L88 122 C88 119.79 89.79 118 92 118 Z"),
        ("core", "M92 138 L94.5 138 C96.71 138 98.5 139.79 98.5 142 L98.5 151.5 C98.5 153.71 96.71 155.5 94.5 155.5 L92 155.5 C89.79 155.5 88 153.71 88 151.5 L88 142 C88 139.79 89.79 138 92 138 Z"),
        ("core", "M92 158 L94.5 158 C96.71 158 98.5 159.79 98.5 162 L98.5 171.5 C98.5 173.71 96.71 175.5 94.5 175.5 L92 175.5 C89.79 175.5 88 173.71 88 171.5 L88 162 C88 159.79 89.79 158 92 158 Z"),
        ("core", "M88 179 L98.5 179 L98.5 207 C94 205 90 199 88 191 Z"),
        ("abductors", "M66 192 C62 202 61 214 62 226 C66 218 70 210 72 202 C70 198 68 195 66 192 Z"),
        ("quads", "M70.5 203 C63 222 62 254 68 284 C71 291 74 295 77 296 C75 270 74 240 75.5 210 C74 206 72 204 70.5 203 Z"),
        ("quads", "M77 207 C75 236 76 266 79 292 C81 294 83 293 84 290 C85 276 86.5 262 88 250 C89.5 236 90 222 89 214 C85 209 81 207 77 207 Z"),
        ("quads", "M89.5 250 C95.5 260 97 277 93 291 C91 298 86 300 82.5 297 C84.5 293 85.5 287 86 280 C87 268 88 258 89.5 250 Z"),
        ("adductors", "M91 211 C95 212 98.5 216 98.5 221 C98.5 232 97.5 242 95.5 249 C93.5 247 92 244 91 240 C90.5 230 90.5 220 91 211 Z"),
        ("shins", "M68.5 318 C66 334 67 352 72 370 C74 378 76 384 78 386 C80 386 81 383 80.5 378 C79.5 356 79 336 79.5 316 C76 315 72 316 68.5 318 Z"),
        ("calves", "M81.5 315 C90 322 94.5 344 90 368 C87 376 84 380 82 380 C81.5 356 81 334 81.5 315 Z")
    ]
    static let back: [(id: String, path: String)] = [
        ("traps", "M100 47 L92 51 C90 59 80 64 64 69 C74 76 83 86 89 98 C93 108 97 119 100 129 Z"),
        ("side_delts", "M60 70 C48 71 40 80 39 94 C38 104 39 112 41 118 C44 108 48 98 52 90 C55 82 57 76 60 70 Z"),
        ("rear_delts", "M63 70 C58 78 54 88 51 98 C49 106 47 112 45 118 C52 112 59 103 63 95 C66 88 68 81 70 76 Z"),
        ("back", "M71 80 C79 85 85 93 88 103 C84 109 77 111 70 108 C66 100 66 90 71 80 Z"),
        ("back", "M65 112 C74 117 84 117 90 113 C91 128 91.5 146 91 168 C89 176 85 182 80 185.5 C73 177 68 160 66 140 C65 130 64.5 120 65 112 Z"),
        ("lower_back", "M93.5 131 C96 132.5 98.5 134 98.5 136 L98.5 188 C95 188 90 186.5 86.5 184.5 C90 180 92.5 175 93 168 C93.5 156 93.5 142 93.5 131 Z"),
        ("triceps", "M44 121 C40 135 40 150 43.5 163 C48 166 54 163 56 157 C58 143 58 129 55 117 C51 116 47 117 44 121 Z"),
        ("forearms", "M42 170 C36 188 32 205 30.5 226 C33 230 37 231 40 229 C44 210 50 192 55 172 C51 167 46 167 42 170 Z"),
        ("abductors", "M65.5 199 C68 191 77 186.5 88 185.5 C82 190 76 196 71.5 204 C69 208 66.5 209 65.5 205 Z"),
        ("glutes", "M98.5 193 C90 192.5 80 196 73.5 205 C66 213 63 226 66 237 C69 246 75 250 82 251 C90 252 98.5 246 98.5 238 Z"),
        ("hamstrings", "M67 253 C64 270 66 289 72 302 L80 302 C80 285 81.5 268 83.5 254 C78 255 72 254 67 253 Z"),
        ("hamstrings", "M86 254 C84 271 84 289 84 302 L91 302 C95 287 97 268 96.5 252 C93 254 89 254 86 254 Z"),
        ("calves", "M68 318 C63 334 64 350 72 366 C78 360 80 344 80 318 Z"),
        ("calves", "M82 316 C82 340 84 358 90 366 C95 350 95 330 90 316 Z")
    ]
}

/// A path of the muscle figure scaled into the view (aspect fit), mirrored
/// for the right half of the body.
struct MuscleFigureShape: Shape {
    let d: String
    var mirrored = false

    func path(in rect: CGRect) -> Path {
        let size = MuscleFigure.size
        let scale = min(rect.width / size.width, rect.height / size.height)
        let dx = rect.midX - size.width / 2 * scale, dy = rect.midY - size.height / 2 * scale
        var transform = CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: dx, ty: dy)
        if mirrored { transform = CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: size.width, ty: 0).concatenating(transform) }
        return SVGPath.parse(d).applying(transform)
    }
}

/// The head of the figure, scaled like MuscleFigureShape.
private struct MuscleFigureHead: Shape {
    func path(in rect: CGRect) -> Path {
        let size = MuscleFigure.size
        let scale = min(rect.width / size.width, rect.height / size.height)
        let dx = rect.midX - size.width / 2 * scale, dy = rect.midY - size.height / 2 * scale
        return Path(ellipseIn: CGRect(x: dx + 84.5 * scale, y: dy + 6.5 * scale, width: 31 * scale, height: 39 * scale))
    }
}

/// The body zepředu or zezadu with each muscle in its colour (rested muscles
/// stay grey); a tap on a muscle calls onTap, the selected one gets a ring.
struct MuscleBody: View {
    var back = false
    var colors: [String: Color] = [:]
    var selected: String? = nil
    var onTap: ((String) -> Void)? = nil

    var body: some View {
        let parts = back ? MuscleFigure.back : MuscleFigure.front
        ZStack {
            MuscleFigureHead().fill(Palette.ink.opacity(0.09))
            MuscleFigureShape(d: MuscleFigure.skin).fill(Palette.ink.opacity(0.09))
            MuscleFigureShape(d: MuscleFigure.skin, mirrored: true).fill(Palette.ink.opacity(0.09))
            ForEach(parts.indices, id: \.self) { i in
                muscle(parts[i], mirrored: false)
                muscle(parts[i], mirrored: true)
            }
        }
        .aspectRatio(MuscleFigure.size.width / MuscleFigure.size.height, contentMode: .fit)
    }

    private func muscle(_ part: (id: String, path: String), mirrored: Bool) -> some View {
        let shape = MuscleFigureShape(d: part.path, mirrored: mirrored)
        let color = colors[part.id]
        return shape
            .fill(LinearGradient(colors: color.map { [$0, $0.opacity(0.78)] } ?? [Palette.ink.opacity(0.2), Palette.ink.opacity(0.15)],
                                 startPoint: .top, endPoint: .bottom))
            .overlay(shape.stroke(selected == part.id ? Palette.ink : Palette.card, lineWidth: selected == part.id ? 1.6 : 0.9))
            .shadow(color: (color ?? .clear).opacity(0.35), radius: color == nil ? 0 : 3)
            .contentShape(shape)
            .onTapGesture { onTap?(part.id) }
            .allowsHitTesting(onTap != nil && part.id != "shins")
    }
}
