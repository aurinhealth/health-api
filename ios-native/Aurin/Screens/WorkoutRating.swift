import SwiftUI

/// How well the generated workout fitted: sedělo, ujde, nesedělo (any sport,
/// POST /app/api/feedback/workout). Tapping the chosen one again clears it.
struct PlanFitPicker: View {
    @Binding var rating: String?

    struct Fit: Identifiable {
        let id: String
        let symbol: String
        let label: String
    }

    static let fits: [Fit] = [
        Fit(id: "good", symbol: "👍", label: "Sedělo"),
        Fit(id: "ok", symbol: "😐", label: "Ujde"),
        Fit(id: "bad", symbol: "👎", label: "Nesedělo")
    ]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Self.fits) { (fit: Fit) in
                let on: Bool = rating == fit.id
                Button { rating = on ? nil : fit.id } label: {
                    VStack(spacing: 4) {
                        Text(verbatim: fit.symbol).font(.system(size: 24))
                        Text(L10n.tr(fit.label)).font(.footnote.weight(.semibold))
                            .foregroundStyle(on ? Palette.onButton : Palette.ink)
                    }
                    .frame(maxWidth: .infinity).frame(height: 64)
                    .background(on ? Palette.button : Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// After "Dokončit trénink": a thumb up or down for each exercise (the next
/// plans leave out the disliked ones) and how well the plan fitted, with an
/// optional note. Nothing is required; "Přeskočit" just closes.
struct GymRatingSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    let exercises: [String]
    @State private var liked: [String: Bool] = [:]
    @State private var fit: String?
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        PageScroll {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Jak se ti trénink líbil?").font(Typo.sentence(28, relativeTo: .title2)).foregroundStyle(Palette.ink)
                    Spacer()
                    Button("Přeskočit") { dismiss() }.font(.subheadline).foregroundStyle(Palette.muted)
                }
                if !exercises.isEmpty {
                    SectionLabel(text: "Cviky").padding(.top, 4)
                    VStack(spacing: 0) {
                        ForEach(exercises, id: \.self) { (name: String) in
                            row(name)
                        }
                    }
                }
                SectionLabel(text: "Sedělo ti sestavení tréninku?").padding(.top, 8)
                PlanFitPicker(rating: $fit)
                if fit != nil {
                    TextField("Co nesedělo? (nepovinné)", text: $text, axis: .vertical)
                        .lineLimit(2...5)
                        .padding(12)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                PrimaryButton(title: L10n.tr(saving ? "Ukládám…" : "Uložit"), busy: saving) { Task { await save() } }
                    .disabled(saving || (liked.isEmpty && fit == nil))
            }
            .padding(24)
        }
        .presentationDetents([.large])
        .presentationBackground(Palette.background)
        .interactiveDismissDisabled(saving)
    }

    private func row(_ name: String) -> some View {
        let value: Bool? = liked[name]
        return HStack(spacing: 8) {
            Text(name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
            Spacer(minLength: 8)
            thumb(name, up: true, on: value == true)
            thumb(name, up: false, on: value == false)
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(Palette.hairline).frame(height: 1) }
    }

    private func thumb(_ name: String, up: Bool, on: Bool) -> some View {
        Button {
            liked[name] = on ? nil : up
        } label: {
            Image(systemName: up ? (on ? "hand.thumbsup.fill" : "hand.thumbsup") : (on ? "hand.thumbsdown.fill" : "hand.thumbsdown"))
                .font(.system(size: 18))
                .foregroundStyle(on ? (up ? Palette.green : Palette.rust) : Palette.muted)
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(up ? "Baví mě" : "Nebaví mě"))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func save() async {
        if model.demo { dismiss(); return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let items: [(exercise: String, liked: Bool?)] = exercises.compactMap { (name: String) -> (exercise: String, liked: Bool?)? in
                guard let value = liked[name] else { return nil }
                return (exercise: name, liked: Optional(value))
            }
            if !items.isEmpty { try await model.api.rateExercises(items) }
            if let fit {
                let note: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
                try await model.api.rateWorkout(date: date, sessionId: "gym:" + date, sport: "strength", rating: fit, text: note)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension GymDay {
    /// Each exercise of the day once, in the plan's order.
    var exerciseNames: [String] {
        var seen = Set<String>()
        return exercises.map(\.name).filter { seen.insert($0).inserted }
    }
}

/// "Jak to šlo?" right under a session's numbers: one row that opens
/// FeedbackSheet, and once rated says what was saved ("Náročnost 6 ·
/// Nesedělo" over the note). `reload` changes when the sheet closes.
struct FeedbackRow: View {
    @Environment(AppModel.self) private var model
    let session: WeekSession
    var workoutId: String? = nil
    var reload = 0
    let open: () -> Void
    @State private var rpe: Int?
    @State private var fit: String?
    @State private var note: String?

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                Image(systemName: "text.bubble").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.amber)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: title).font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                    if let note {
                        Text(verbatim: note).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 16).frame(minHeight: 54)
            .cardSurface(cornerRadius: 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .task(id: reload) { await load() }
    }

    private var title: String {
        let effort: String? = rpe.map { L10n.f("Náročnost %@", String($0)) }
        let fitted: String? = fit.flatMap { id in PlanFitPicker.fits.first { $0.id == id } }.map { L10n.tr($0.label) }
        let parts: [String] = [effort, fitted].compactMap { $0 }
        return parts.isEmpty ? L10n.tr("Jak to šlo?") : parts.joined(separator: " · ")
    }

    /// What FeedbackSheet saved for this session: the RPE (on the calendar
    /// link or the coach's note), the note and how well the plan fitted.
    private func load() async {
        guard !model.demo else { return }
        let api = model.api, date = session.date
        async let links = try? api.scheduledWorkouts()
        async let notesOfDay = try? api.coachReflections(date: date)
        async let ratingsOfDay = try? api.workoutRatings(date: date)
        let link = ScheduledWorkout.link(for: session, in: (await links) ?? [])
        let reflections: [CoachReflection] = (await notesOfDay) ?? []
        let own = ((await ratingsOfDay) ?? []).first { $0.sessionId == session.id }
        let id = link.flatMap { $0.workoutId.isEmpty ? nil : $0.workoutId } ?? workoutId
        // Only this session's note: the library workout's, else the day's note kept without one.
        let reflection: CoachReflection?
        if let id { reflection = reflections.first { $0.workoutId == id } } else { reflection = reflections.first { $0.workoutId == nil } }
        rpe = (link?.feedbackRpe ?? reflection?.rpe).map { Int($0.rounded()) }
        fit = own?.rating
        note = reflection?.notes?.nilIfBlank ?? own?.text?.nilIfBlank
    }
}
