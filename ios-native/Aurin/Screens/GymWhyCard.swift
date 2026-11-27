import SwiftUI

/// Why the gym plan is what it is (Petr, 2026-10-30): the generator's note
/// (src/strength-generator.js rationale) as short rows instead of a paragraph.
/// The time plan and the sentence about other sports are the same every time,
/// so both go; any sentence not known here stays as it is.
enum GymWhy {
    struct Reason: Equatable, Identifiable {
        let symbol: String
        /// A short title ("Goal"), nil for a sentence shown as it is.
        let title: String?
        let detail: String
        var id: String { (title ?? "") + detail }
    }

    /// The coach's one or two sentences under the title (max 2 on a card):
    /// what spares the legs or what is up next first, the goal last.
    static func coachLine(_ reasons: [Reason]) -> String? {
        func rank(_ r: Reason) -> Int {
            switch r.title {
            case L10n.tr("Šetřím nohy"): return 0
            // The split's long explanation stays in the sheet; another plain sentence is the coach's.
            case nil: return r.detail.hasPrefix(L10n.tr("Na řadě")) ? 1 : r.detail.lowercased().contains("split") ? 9 : 4
            case L10n.tr("Odlehčený týden"), L10n.tr("Bolest"), L10n.tr("První trénink"): return 2
            case L10n.tr("Nové cviky"), L10n.tr("Nová varianta"): return 3
            case L10n.tr("Cíl"): return 5
            default: return 4
            }
        }
        let picked = reasons.enumerated().filter { rank($0.element) < 9 }
            .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }.prefix(2).map(\.element)
        guard !picked.isEmpty else { return nil }
        return picked.map { r -> String in
            // A title with a fragment ("New exercises", "Different from Thu 19 Nov") reads as one sentence.
            let sentence: String
            if let title = r.title, [L10n.tr("Cíl"), L10n.tr("Nové cviky"), L10n.tr("Nová varianta"), L10n.tr("Výskoky")].contains(title) {
                sentence = title + ": " + r.detail.prefix(1).lowercased() + r.detail.dropFirst()
            } else {
                sentence = r.detail
            }
            return sentence.hasSuffix(".") ? sentence : sentence + "."
        }.joined(separator: " ")
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
            return Reason(symbol: "arrow.triangle.2.circlepath", title: L10n.tr("Nové cviky"), detail: L10n.f("Jiné než %@", trimmed(day, capitalised: false)))
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
        if has("deload", "odlehčen", "recovery week", "regenerační týden") {
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

    /// A day inside a sentence keeps its small letter ("Jiné než čt 29. 10").
    private static func trimmed(_ s: String, capitalised: Bool = true) -> String {
        var t = s.trimmingCharacters(in: .whitespaces)
        while t.hasSuffix(".") { t.removeLast() }
        return capitalised ? t.prefix(1).uppercased() + t.dropFirst() : t
    }
}

/// Why this workout (concept K04/017, Petr 2026-11-16: no card on the page,
/// one coach sentence under the title opens this sheet): the reasons as rows,
/// the kind on the left, no icons.
struct GymWhySheet: View {
    let reasons: [GymWhy.Reason]

    var body: some View {
        SheetFrame(title: "Proč tenhle trénink") {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(reasons.enumerated()), id: \.element.id) { index, reason in
                        if index > 0 { Rectangle().fill(Palette.hairline).frame(height: 1) }
                        // The kind on the left, what it means on the right (concept sheet "whyg").
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(verbatim: reason.title ?? L10n.tr("Kouč")).font(Typo.caption).foregroundStyle(Palette.muted)
                                .frame(width: 96, alignment: .leading)
                            Text(verbatim: reason.detail).font(Typo.bodyStrong.weight(.medium)).foregroundStyle(Palette.ink)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, 12)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal, 18)
                .cardSurface(cornerRadius: 20)
                Text("Kouč vybírá odpočaté partie, drží týdenní zátěž v cíli a řídí se fází tvého plánu. Kterýkoli cvik můžeš vyměnit nebo změnit celý trénink.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .glassSheetBackground()
    }
}
