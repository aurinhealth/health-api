import SwiftUI

/// Why the gym plan is what it is (Petr, 2026-10-30): the generator's note
/// (src/strength-generator.js rationale) as short rows instead of a paragraph.
/// The time plan is in GymTimeCard above and the sentence about other sports is
/// the same every time, so both go; any sentence not known here stays as it is.
enum GymWhy {
    struct Reason: Equatable, Identifiable {
        let symbol: String
        /// A short title ("Goal"), nil for a sentence shown as it is.
        let title: String?
        let detail: String
        var id: String { (title ?? "") + detail }
    }

    static func reasons(_ note: String?) -> [Reason] {
        guard let note = GymSessionView.withoutMuscleList(note) else { return [] }
        return sentences(note).compactMap(reason)
    }

    /// Sentences end at . ! ? before a capital letter ("29. 10." and "2.5" stay whole).
    static func sentences(_ text: String) -> [String] {
        let marked = text.replacingOccurrences(of: #"(?<=[.!?])\s+(?=\p{Lu})"#, with: "\u{1F}", options: .regularExpression)
        return marked.split(separator: "\u{1F}").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private static func reason(_ s: String) -> Reason? {
        let low = s.lowercased()
        func has(_ parts: String...) -> Bool { parts.contains { low.contains($0) } }
        if has("time plan:", "časový plán:", "zátěž z ostatních sportů upravuje", "load from other sports adjusts") || s.hasPrefix("On top:") || s.hasPrefix("Navíc ") {
            return nil
        }
        if let goal = after(s, ["Goal from your sport – ", "Cíl podle tvého sportu – "]) {
            return Reason(symbol: "target", title: L10n.tr("Cíl"), detail: L10n.f("%@, podle tvého sportu", firstClause(goal, cut: ":")))
        }
        if let goal = after(s, ["Goal ", "Cíl "]) {
            return Reason(symbol: "target", title: L10n.tr("Cíl"), detail: firstClause(goal, cut: ":"))
        }
        if has("differ from the plan for", "liší od plánu na") {
            let day = s.components(separatedBy: low.contains("plan for") ? "plan for " : "plánu na ").last ?? s
            return Reason(symbol: "arrow.triangle.2.circlepath", title: L10n.tr("Nové cviky"), detail: L10n.f("Jiné než %@", trimmed(day)))
        }
        if has("about pain", "o bolesti") {
            return Reason(symbol: "bandage", title: L10n.tr("Bolest"), detail: s)
        }
        if has("first workout in the app", "první trénink v aplikaci") {
            return Reason(symbol: "sparkles", title: L10n.tr("První trénink"), detail: firstClause(afterColon(s) ?? s, cut: ";"))
        }
        if has("new variant after", "nová varianta") {
            return Reason(symbol: "arrow.up.right", title: L10n.tr("Nová varianta"), detail: trimmed(afterColon(s) ?? s))
        }
        if has("short jumps", "krátké výskoky") {
            return Reason(symbol: "figure.jumprope", title: L10n.tr("Výskoky"), detail: firstClause(s, cut: ":"))
        }
        if has("deload", "odlehčen") {
            return Reason(symbol: "arrow.down.right", title: L10n.tr("Odlehčený týden"), detail: firstClause(s, cut: ";"))
        }
        if has("sparing your legs", "šetřím nohy", "leg loading", "zatížení nohou", "legs get at most", "nohy nejvýše", "nohy proto mají") {
            return Reason(symbol: "figure.strengthtraining.traditional", title: L10n.tr("Šetřím nohy"), detail: firstClause(s, cut: ";"))
        }
        return Reason(symbol: "info.circle", title: nil, detail: firstClause(s, cut: ";"))
    }

    private static func after(_ s: String, _ prefixes: [String]) -> String? {
        prefixes.first { s.hasPrefix($0) }.map { String(s.dropFirst($0.count)) }
    }

    private static func afterColon(_ s: String) -> String? {
        s.range(of: ": ").map { String(s[$0.upperBound...]) }
    }

    /// The part before ":" or ";" (the rest explains how), capitalised, without the full stop.
    private static func firstClause(_ s: String, cut: Character) -> String {
        trimmed(s.split(separator: cut, maxSplits: 1).first.map(String.init) ?? s)
    }

    private static func trimmed(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespaces)
        while t.hasSuffix(".") { t.removeLast() }
        return t.prefix(1).uppercased() + t.dropFirst()
    }
}

/// The reasons in a card, as "Co procvičíš" above it.
struct GymWhyCard: View {
    let reasons: [GymWhy.Reason]

    var body: some View {
        Card {
            WidgetHeader(title: "Proč tenhle trénink", color: Palette.amberBar)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(reasons.enumerated()), id: \.element.id) { index, reason in
                    if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                    HStack(alignment: .center, spacing: 12) {
                        Image(systemName: reason.symbol).scaledFont(15, weight: .medium).foregroundStyle(Palette.amber)
                            .frame(width: 34, height: 34).background(Palette.amberSoft, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            if let title = reason.title {
                                Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            }
                            Text(verbatim: reason.detail).font(Typo.small)
                                .foregroundStyle(reason.title == nil ? Palette.secondary : Palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10)
                }
            }
        }
    }
}
