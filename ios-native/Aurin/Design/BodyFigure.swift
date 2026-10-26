import SwiftUI

// The body figure from the web (src/gym-focus-view.js, viewBox 0 0 180 326):
// the outline, the muscle regions zepředu and zezadu, and the anatomy lines.
// Muscle ids are the FOCUS_GROUPS of src/strength-generator.js.
enum BodyFigure {
    static let size = CGSize(width: 180, height: 326)
    static let outline: [String] = [
        "M90 6 C78 6 72 16 73 29 C74 43 81 51 90 52 C99 51 106 43 107 29 C108 16 102 6 90 6 Z",
        "M79 45 Q79 53 70 56 Q57 57 53 69 Q49 79 52 91 L60 132 Q66 148 69 165 L68 187 Q69 202 77 207 L90 211 L103 207 Q111 202 112 187 L111 165 Q114 148 120 132 L128 91 Q131 79 127 69 Q123 57 110 56 Q101 53 101 45 Z",
        "M54 65 Q47 70 46 84 L41 111 Q40 119 37 133 L31 156 Q29 165 34 170 L39 171 Q43 168 44 162 L52 139 Q55 129 57 115 L64 82 Z M126 65 Q133 70 134 84 L139 111 Q140 119 143 133 L149 156 Q151 165 146 170 L141 171 Q137 168 136 162 L128 139 Q125 129 123 115 L116 82 Z",
        "M69 186 Q65 204 67 224 L68 259 Q68 267 70 277 L71 307 Q69 316 72 319 L84 319 Q87 316 86 310 L88 274 Q89 263 89 254 L90 213 Q84 202 78 190 Z M111 186 Q115 204 113 224 L112 259 Q112 267 110 277 L109 307 Q111 316 108 319 L96 319 Q93 316 94 310 L92 274 Q91 263 91 254 L90 213 Q96 202 102 190 Z"
    ]
    static let frontLines = "M76 18 Q90 13 104 18 M75 29 Q73 35 76 37 M105 29 Q107 35 104 37 M82 40 Q90 44 98 40 M79 48 Q90 56 101 48 M72 59 Q79 62 85 67 M108 59 Q101 62 95 67 M69 88 Q79 95 89 94 M111 88 Q101 95 91 94 M90 99 L90 164 M75 105 Q81 109 88 107 M92 107 Q99 109 105 105 M76 118 Q82 122 88 120 M92 120 Q98 122 104 118 M77 131 Q83 135 88 133 M92 133 Q97 135 103 131 M79 145 Q84 149 88 147 M92 147 Q96 149 101 145 M58 91 Q52 98 50 109 M122 91 Q128 98 130 109 M70 176 Q81 186 87 202 M110 176 Q99 186 93 202 M76 216 Q82 229 84 249 M104 216 Q98 229 96 249 M71 280 Q79 290 80 303 M109 280 Q101 290 100 303"
    static let backLines = "M80 14 Q90 11 100 14 M79 48 Q90 54 101 48 M68 61 Q78 67 87 78 M112 61 Q102 67 93 78 M69 86 Q80 91 87 109 M111 86 Q100 91 93 109 M90 73 L90 166 M74 112 Q82 117 88 123 M106 112 Q98 117 92 123 M75 145 Q84 150 90 154 Q96 150 105 145 M56 91 Q52 102 51 114 M124 91 Q128 102 129 114 M71 182 Q81 190 89 200 M109 182 Q99 190 91 200 M75 217 Q81 232 83 251 M105 217 Q99 232 97 251 M73 280 Q78 291 80 306 M107 280 Q102 291 100 306"
    static let front: [(id: String, path: String)] = [
        ("front_delts", "M71 58 Q66 60 62 67 Q61 75 65 81 L72 66 Z M109 58 Q114 60 118 67 Q119 75 115 81 L108 66 Z"),
        ("side_delts", "M65 56 Q55 56 52 68 Q50 77 54 88 Q60 86 63 78 Q59 68 69 59 Z M115 56 Q125 56 128 68 Q130 77 126 88 Q120 86 117 78 Q121 68 111 59 Z"),
        ("chest", "M72 65 Q80 62 89 67 L89 94 Q80 95 67 88 Q64 80 68 70 Z M91 67 Q100 62 108 65 L112 70 Q116 80 113 88 Q100 95 91 94 Z"),
        ("biceps", "M52 87 Q57 88 61 83 L59 102 Q57 113 51 119 L45 116 Q47 98 52 87 Z M128 87 Q123 88 119 83 L121 102 Q123 113 129 119 L135 116 Q133 98 128 87 Z"),
        ("forearms", "M45 119 Q51 122 56 117 L54 134 Q50 147 45 160 L35 158 Q38 139 45 119 Z M135 119 Q129 122 124 117 L126 134 Q130 147 135 160 L145 158 Q142 139 135 119 Z"),
        ("obliques", "M68 95 Q73 98 77 100 L79 129 76 158 71 163 Q74 143 71 125 Z M112 95 Q107 98 103 100 L101 129 104 158 109 163 Q106 143 109 125 Z"),
        ("abs", "M79 98 Q90 100 101 98 L101 126 103 158 Q97 167 90 169 Q83 167 77 158 L79 126 Z"),
        ("hips", "M70 170 Q80 175 90 174 Q100 175 110 170 L112 190 Q108 201 101 207 L92 211 L90 197 L88 211 L79 207 Q72 201 68 190 Z"),
        ("quads", "M68 208 Q76 211 87 214 L88 248 Q86 260 82 269 L70 267 Q66 242 68 208 Z M112 208 Q104 211 93 214 L92 248 Q94 260 98 269 L110 267 Q114 242 112 208 Z"),
        ("calves", "M70 277 Q77 280 85 275 L84 306 L72 308 Q70 295 70 277 Z M110 277 Q103 280 95 275 L96 306 L108 308 Q110 295 110 277 Z")
    ]
    static let back: [(id: String, path: String)] = [
        ("rear_delts", "M66 56 Q55 56 52 68 Q50 77 54 88 Q61 86 67 77 L74 63 Z M114 56 Q125 56 128 68 Q130 77 126 88 Q119 86 113 77 L106 63 Z"),
        ("traps", "M80 46 Q90 51 100 46 L106 58 Q97 63 90 72 Q83 63 74 58 Z"),
        ("upper_back", "M74 59 Q83 64 90 74 Q97 64 106 59 L112 84 Q106 94 101 108 L90 117 L79 108 Q74 94 68 84 Z"),
        ("lats", "M69 89 Q77 109 90 119 Q103 109 111 89 L109 126 Q107 146 110 164 Q101 171 90 170 Q79 171 70 164 Q73 146 71 126 Z"),
        ("lower_back", "M82 132 Q90 137 98 132 L100 160 Q90 166 80 160 Z"),
        ("forearms", "M45 119 Q51 122 56 117 L54 134 Q50 147 45 160 L35 158 Q38 139 45 119 Z M135 119 Q129 122 124 117 L126 134 Q130 147 135 160 L145 158 Q142 139 135 119 Z"),
        ("triceps", "M53 86 Q59 86 61 82 L59 102 Q57 114 51 121 L44 117 Q47 98 53 86 Z M127 86 Q121 86 119 82 L121 102 Q123 114 129 121 L136 117 Q133 98 127 86 Z"),
        ("hips", "M70 170 Q80 173 90 171 Q100 173 110 170 L112 189 Q108 202 100 208 Q94 212 90 205 Q86 212 80 208 Q72 202 68 189 Z"),
        ("hamstrings", "M68 208 Q77 212 87 213 L88 247 Q86 260 82 269 L70 267 Q66 242 68 208 Z M112 208 Q103 212 93 213 L92 247 Q94 260 98 269 L110 267 Q114 242 112 208 Z"),
        ("calves", "M70 277 Q77 280 85 275 L84 306 L72 308 Q70 295 70 277 Z M110 277 Q103 280 95 275 L96 306 L108 308 Q110 295 110 277 Z")
    ]
}

extension BodyFigure {
    /// FOCUS_GROUPS labels, in the order the builder lists them.
    static let muscles: [(id: String, label: String)] = [
        ("chest", "Hrudník"), ("upper_back", "Horní záda"), ("lats", "Široký sval zádový"), ("lower_back", "Spodní záda"),
        ("traps", "Trapézy"), ("front_delts", "Přední ramena"), ("side_delts", "Boční ramena"), ("rear_delts", "Zadní ramena"),
        ("biceps", "Biceps"), ("triceps", "Triceps"), ("forearms", "Předloktí"), ("abs", "Břišní svaly"),
        ("obliques", "Šikmé břišní svaly"), ("hips", "Hýždě a kyčle"), ("quads", "Přední stehna"), ("hamstrings", "Zadní stehna"),
        ("calves", "Lýtka")
    ]

    static func label(_ id: String) -> String { muscles.first { $0.id == id }.map { L10n.tr($0.label) } ?? id }
}

/// An SVG path with absolute M, L, Q, C and Z commands (what the figure uses).
enum SVGPath {
    static func parse(_ d: String) -> Path {
        var path = Path()
        var command: Character = "M"
        var numbers: [CGFloat] = []
        var tokens: [String] = []
        var current = ""
        for ch in d {
            if ch.isLetter {
                if !current.isEmpty { tokens.append(current); current = "" }
                tokens.append(String(ch))
            } else if ch == " " || ch == "," {
                if !current.isEmpty { tokens.append(current); current = "" }
            } else if ch == "-" && !current.isEmpty {
                tokens.append(current); current = "-"
            } else {
                current.append(ch)
            }
        }
        if !current.isEmpty { tokens.append(current) }

        func flush() {
            let need: Int
            switch command {
            case "M", "L": need = 2
            case "Q": need = 4
            case "C": need = 6
            default: need = 0
            }
            guard need > 0 else { return }
            var i = 0
            var first = true
            while i + need <= numbers.count {
                let n = Array(numbers[i..<(i + need)])
                switch command {
                case "M":
                    if first { path.move(to: CGPoint(x: n[0], y: n[1])) } else { path.addLine(to: CGPoint(x: n[0], y: n[1])) }
                case "L": path.addLine(to: CGPoint(x: n[0], y: n[1]))
                case "Q": path.addQuadCurve(to: CGPoint(x: n[2], y: n[3]), control: CGPoint(x: n[0], y: n[1]))
                case "C": path.addCurve(to: CGPoint(x: n[4], y: n[5]), control1: CGPoint(x: n[0], y: n[1]), control2: CGPoint(x: n[2], y: n[3]))
                default: break
                }
                first = false
                i += need
            }
            numbers = []
        }

        for token in tokens {
            if let c = token.first, c.isLetter {
                flush()
                command = c
                if c == "Z" || c == "z" { path.closeSubpath() }
            } else if let value = Double(token) {
                numbers.append(CGFloat(value))
            }
        }
        flush()
        return path
    }
}

/// A path of the figure, scaled into the view (aspect fit).
struct FigureShape: Shape {
    let d: String

    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / BodyFigure.size.width, rect.height / BodyFigure.size.height)
        let dx = rect.midX - BodyFigure.size.width / 2 * scale, dy = rect.midY - BodyFigure.size.height / 2 * scale
        return SVGPath.parse(d).applying(CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: dx, ty: dy))
    }
}

/// The body zepředu and zezadu: chosen muscles green, the muscles a plan works
/// warm by how much (the main ones strong, the helping ones light), a tap on a
/// muscle chooses it (when onTap is set). Compact drops the titles and the
/// anatomy lines for small rows; legend explains the colours below.
struct BodyMap: View {
    var load: [String: Double] = [:]
    var selected: Set<String> = []
    var onTap: ((String) -> Void)? = nil
    var height: CGFloat = 260
    var compact = false
    var legend = false

    static let primary = 0.7
    static let secondary = 0.3

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: compact ? 2 : 10) {
                figure("Zepředu", BodyFigure.front, BodyFigure.frontLines)
                figure("Zezadu", BodyFigure.back, BodyFigure.backLines)
            }
            .frame(height: height)
            if legend && (!load.isEmpty || !selected.isEmpty) {
                HStack(spacing: 14) {
                    if !selected.isEmpty { key("Zvolené", Palette.green) }
                    if load.values.contains(where: { $0 >= Self.primary }) { key("Hlavně", Palette.rust) }
                    if load.values.contains(where: { $0 >= Self.secondary && $0 < Self.primary }) { key("Pomocně", Palette.amberBar) }
                    if load.values.contains(where: { $0 > 0 && $0 < Self.secondary }) { key("Trochu", Palette.sand) }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private func key(_ title: String, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(title).font(Typo.tiny).foregroundStyle(Palette.muted)
        }
    }

    private func figure(_ title: String, _ regions: [(id: String, path: String)], _ lines: String) -> some View {
        VStack(spacing: 6) {
            ZStack {
                ForEach(BodyFigure.outline, id: \.self) { d in
                    FigureShape(d: d)
                        .fill(LinearGradient(colors: [Palette.ink.opacity(0.11), Palette.ink.opacity(0.05)], startPoint: .top, endPoint: .bottom))
                    FigureShape(d: d).stroke(Palette.ink.opacity(compact ? 0.14 : 0.2), lineWidth: compact ? 0.6 : 1)
                }
                ForEach(regions.indices, id: \.self) { i in
                    let region = regions[i]
                    FigureShape(d: region.path)
                        .fill(fill(region.id))
                        .overlay(FigureShape(d: region.path).stroke(Palette.background.opacity(0.75), lineWidth: compact ? 0.4 : 0.8))
                        .shadow(color: glow(region.id), radius: compact ? 0 : 4)
                        .onTapGesture { onTap?(region.id) }
                        .allowsHitTesting(onTap != nil)
                }
                if !compact {
                    FigureShape(d: lines).stroke(Palette.ink.opacity(0.14), lineWidth: 0.7).allowsHitTesting(false)
                }
            }
            if !compact { Text(title).font(Typo.tiny).foregroundStyle(Palette.faint) }
        }
        .frame(maxWidth: .infinity)
    }

    private func fill(_ id: String) -> AnyShapeStyle {
        if selected.contains(id) {
            return AnyShapeStyle(LinearGradient(colors: [Palette.green, Palette.green.opacity(0.8)], startPoint: .top, endPoint: .bottom))
        }
        guard let w = load[id], w > 0 else { return AnyShapeStyle(Palette.ink.opacity(0.07)) }
        let color = w >= Self.primary ? Palette.rust : w >= Self.secondary ? Palette.amberBar : Palette.sand
        let strength = w >= Self.primary ? 0.75 + 0.25 * min(w, 1) : w >= Self.secondary ? 0.55 + 0.4 * w : 0.85
        return AnyShapeStyle(LinearGradient(colors: [color.opacity(strength), color.opacity(strength * 0.78)], startPoint: .top, endPoint: .bottom))
    }

    private func glow(_ id: String) -> Color {
        if selected.contains(id) { return Palette.green.opacity(0.35) }
        if let w = load[id], w >= Self.primary { return Palette.rust.opacity(0.25) }
        return .clear
    }

    private var accessibility: String {
        let chosen = selected.map(BodyFigure.label)
        let main = load.filter { $0.value >= Self.primary }.keys.map(BodyFigure.label)
        let helping = load.filter { $0.value >= Self.secondary && $0.value < Self.primary }.keys.map(BodyFigure.label)
        if !chosen.isEmpty { return L10n.f("Zvolené partie: %@", chosen.joined(separator: ", ")) }
        if !main.isEmpty {
            let mainText = L10n.f("Procvičí hlavně: %@", main.joined(separator: ", "))
            return helping.isEmpty ? mainText : mainText + L10n.f(", pomocně: %@", helping.joined(separator: ", "))
        }
        if !helping.isEmpty { return L10n.f("Procvičí: %@", helping.joined(separator: ", ")) }
        return L10n.tr("Postava zepředu a zezadu")
    }
}
