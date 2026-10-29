import SwiftUI

/// Who recorded a done workout, with their logos: "Aurin", "Apple Watch",
/// "Aurin, Apple Watch" after a merge. `names` are the ones written out (all
/// by default), `detail` follows after a dot.
struct SourceLine: View {
    let sources: [ActivityDetail.Origin]
    var names: [String]? = nil
    var detail: String? = nil
    var size: CGFloat = 16

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 3) {
                ForEach(sources, id: \.name) { IntegrationIcon(id: $0.logo ?? "", size: size) }
            }
            Text(verbatim: ([(names ?? sources.map(\.name)).joined(separator: ", ")] + [detail].compactMap { $0 }).joined(separator: " · "))
                .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }

    /// The gym detail's line: "Aurin · tep a kalorie z Apple Watch" after a
    /// merge, else who recorded it.
    static func gym(_ session: WeekSession?) -> SourceLine? {
        guard let sources = session?.sources, !sources.isEmpty else { return nil }
        guard sources.count > 1, let energy = session?.mergeEnergy, sources.contains(where: { $0.name == energy }) else { return SourceLine(sources: sources) }
        let others = sources.filter { $0.name != energy }
        let from = L10n.isEnglish || energy != "Aurin" ? energy : "Aurinu"
        return SourceLine(sources: others + sources.filter { $0.name == energy }, names: others.map(\.name),
                          detail: L10n.f("tep a kalorie z %@", from))
    }
}

/// Under the day's list: two records of one workout, merge them or keep both.
struct MergeProposalCard: View {
    let proposal: MergeProposal
    var busy = false
    let merge: () -> Void
    let keepBoth: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: proposal.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
            Text(verbatim: proposal.text).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button(action: merge) {
                    Text("Sloučit").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 36).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                Button(action: keepBoth) {
                    Group {
                        if busy { ProgressView() } else { Text("Nechat oba") }
                    }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 36)
                    .overlay { Capsule().stroke(Palette.ink.opacity(0.18), lineWidth: 1) }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(busy)
            }
            .padding(.top, 10)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Palette.amber.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Palette.amber.opacity(0.25), lineWidth: 1) }
    }
}

/// Sloučit tréninky: the time the workout keeps and whose calories and heart
/// rate stay (src/workout-merge.js). One workout stays, everywhere.
struct MergeWorkoutsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let proposal: MergeProposal
    @State private var span = "both"
    @State private var energy = ""
    @State private var saving = false
    @State private var error: String?
    @State private var contentHeight: CGFloat = 560

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Sloučit tréninky").font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                Text(verbatim: proposal.note).font(Typo.small).foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                SectionLabel(text: "Čas").padding(.top, 20)
                ForEach(proposal.spans) { s in
                    choice(title: spanTitle(s), detail: s.text, logo: nil, on: span == s.key) { span = s.key }
                }
                SectionLabel(text: "Kalorie a tep").padding(.top, 20)
                ForEach(proposal.energy) { e in
                    choice(title: e.kcal.map { e.name + " · " + Fmt.int($0) + " kcal" } ?? e.name, detail: e.text, logo: e.logo ?? "", on: energy == e.key) { energy = e.key }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 12) }
                PrimaryButton(title: L10n.tr("Sloučit"), busy: saving) { Task { await save() } }
                    .disabled(saving || energy.isEmpty)
                    .padding(.top, 22)
            }
            .padding(.horizontal, 20).padding(.top, 28).padding(.bottom, 16)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .background { Palette.background.ignoresSafeArea() }
        .presentationDetents([.height(contentHeight + 20)])
        .presentationDragIndicator(.visible)
        .onAppear { if energy.isEmpty { energy = proposal.energy.first?.key ?? "" } }
    }

    /// "20:02 – 21:23 · 1 h 21 min".
    private func spanTitle(_ s: MergeProposal.Span) -> String {
        let clock = [s.start, s.end].compactMap { $0 }.map { ClockText.format($0) }.joined(separator: " – ")
        return [clock.isEmpty ? nil : clock, s.minutes.map { Fmt.duration($0) }].compactMap { $0 }.joined(separator: " · ")
    }

    private func choice(title: String, detail: String, logo: String?, on: Bool, pick: @escaping () -> Void) -> some View {
        Button(action: pick) {
            HStack(spacing: 12) {
                if let logo { IntegrationIcon(id: logo, size: 22) }
                VStack(alignment: .leading, spacing: 1) {
                    Text(verbatim: title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                    Text(verbatim: detail).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .scaledFont(22, cap: .denseCap).foregroundStyle(on ? Palette.green : Palette.faint)
            }
            .padding(.vertical, 11)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await model.api.mergeWorkouts(ids: proposal.ids, energy: energy, span: span)
            async let training: Void = model.refreshTraining()
            await model.refresh()
            await training
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
