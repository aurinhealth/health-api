import SwiftUI

// MARK: - Mood

/// Deník → Nálada: how the day felt on a scale from very unpleasant to very
/// pleasant (1–5, src/journal-catalog.js) and up to three words for it, the
/// same as Apple Health's State of Mind (MoodHealth writes it there).
struct JournalMoodSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: JournalItem
    let date: String
    let save: (JSONObject) async -> String?
    @State private var level: Int
    @State private var labels: Int
    @State private var busy = false
    @State private var error: String?

    init(item: JournalItem, date: String, save: @escaping (JSONObject) async -> String?) {
        self.item = item
        self.date = date
        self.save = save
        _level = State(initialValue: item.amount.map { Int($0) } ?? 3)
        _labels = State(initialValue: Int(item.extra?["labels"] ?? 0))
    }

    static let words = [("Velmi nepříjemná", "Very unpleasant"), ("Nepříjemná", "Unpleasant"), ("Neutrální", "Neutral"),
                        ("Příjemná", "Pleasant"), ("Velmi příjemná", "Very pleasant")]
    /// In the order of MoodHealth.labelKeys.
    static let labelWords = [("Klid", "Calm"), ("Spokojenost", "Content"), ("Radost", "Happy"), ("Vděčnost", "Grateful"),
                             ("Sebejistota", "Confident"), ("Nadšení", "Excited"), ("Vyčerpání", "Drained"), ("Stres", "Stressed"),
                             ("Úzkost", "Anxious"), ("Podráždění", "Irritated"), ("Smutek", "Sad"), ("Zahlcení", "Overwhelmed")]
    static let colors = [Palette.indigo, Palette.blue, Palette.muted, Palette.gold, Palette.amberBar]

    private static func text(_ pair: (String, String)) -> String { L10n.isEnglish ? pair.1 : pair.0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: L10n.isEnglish ? "How do you feel?" : "Jak se cítíš?")
                        .font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
                    Text(verbatim: Fmt.capitalized(JournalStyle.weekday(date))).font(Typo.small).foregroundStyle(Palette.muted)
                }
                VStack(spacing: 10) {
                    MoodShape(level: level).frame(width: 120, height: 120)
                    Text(verbatim: Self.text(Self.words[level - 1])).font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
                MoodScale(level: $level)
                Text(verbatim: L10n.isEnglish ? "DESCRIBES IT BEST" : "CO TO VYSTIHUJE")
                    .font(.caption.weight(.medium)).tracking(1.4).foregroundStyle(Palette.muted)
                    .padding(.top, 4)
                FlowLayout(spacing: 8) {
                    ForEach(Self.labelWords.indices, id: \.self) { i in chip(i) }
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            }
            .padding(24)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 10) {
                PrimaryButton(title: L10n.tr("Uložit"), busy: busy) { submit(1) }
                    .disabled(busy)
                if item.isAnswered && item.fromData != true {
                    SecondaryButton(title: "Smazat odpověď") { submit(nil) }.disabled(busy)
                }
            }
            .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 8)
            .background(Palette.background)
            .overlay(alignment: .top) { Rectangle().fill(Palette.hairline).frame(height: 1) }
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .sensoryFeedback(.selection, trigger: level)
    }

    /// Up to three words; a fourth is not taken.
    private func chip(_ i: Int) -> some View {
        let on = labels & (1 << i) != 0
        let full = labels.nonzeroBitCount >= 3
        return Button {
            if on { labels &= ~(1 << i) } else if !full { labels |= 1 << i }
        } label: {
            Text(verbatim: Self.text(Self.labelWords[i])).font(.subheadline.weight(.medium))
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .padding(.horizontal, 13).frame(minHeight: 36)
                .background(on ? Palette.button : Palette.card, in: Capsule())
                .opacity(!on && full ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func submit(_ answer: Int?) {
        var body: JSONObject = ["date": .string(date), "key": .string(item.key)]
        if let answer {
            body["answer"] = .number(Double(answer))
            body["amount"] = .number(Double(level))
            body["extra"] = .object(["labels": .number(Double(labels))])
        } else {
            body["answer"] = JSONValue.null
        }
        busy = true
        error = nil
        let request = body, level = level, labels = labels, date = date
        Task {
            let failure = await save(request)
            busy = false
            if let failure { error = failure; return }
            if answer == 1 { await MoodHealth.save(level: level, labels: labels, date: date) }
            dismiss()
        }
    }
}

/// The mood as a soft shape in its colour: blue when unpleasant, warm when pleasant.
struct MoodShape: View {
    let level: Int

    var body: some View {
        let color = JournalMoodSheet.colors[min(4, max(0, level - 1))]
        UnevenRoundedRectangle(topLeadingRadius: 52, bottomLeadingRadius: 60, bottomTrailingRadius: 46, topTrailingRadius: 64, style: .continuous)
            .fill(color.gradient)
            .rotationEffect(.degrees(Double(level) * 18))
            .animation(.snappy, value: level)
            .accessibilityHidden(true)
    }
}

/// Very unpleasant … very pleasant: five stops on one bar, dragged or tapped.
struct MoodScale: View {
    @Binding var level: Int

    var body: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                let width = geo.size.width - 28
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: JournalMoodSheet.colors, startPoint: .leading, endPoint: .trailing))
                        .frame(height: 6).padding(.horizontal, 14)
                    Circle().fill(Color.white).frame(width: 28, height: 28)
                        .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
                        .offset(x: width * CGFloat(level - 1) / 4)
                        .animation(.snappy, value: level)
                }
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                    let stop = Int(((value.location.x - 14) / max(1, width) * 4).rounded())
                    level = min(5, max(1, stop + 1))
                })
            }
            .frame(height: 36)
            HStack {
                Text(verbatim: L10n.isEnglish ? "Very unpleasant" : "Velmi nepříjemná")
                Spacer()
                Text(verbatim: L10n.isEnglish ? "Very pleasant" : "Velmi příjemná")
            }
            .font(.caption).foregroundStyle(Palette.muted)
        }
        .accessibilityElement()
        .accessibilityLabel(L10n.isEnglish ? "Mood" : "Nálada")
        .accessibilityValue(L10n.isEnglish ? JournalMoodSheet.words[level - 1].1 : JournalMoodSheet.words[level - 1].0)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: level = min(5, level + 1)
            case .decrement: level = max(1, level - 1)
            @unknown default: break
            }
        }
    }
}
