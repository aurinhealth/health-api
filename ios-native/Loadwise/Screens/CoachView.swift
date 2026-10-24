import SwiftUI

/// The AI coach: today's summary and what matters, then a chat. Answers stream
/// in as they are written; changes the coach proposes wait for "Potvrdit".
struct CoachView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// The screen the coach was opened from and the day it shows (src/assistant-app-context.js).
    var view = "today"
    var date: String? = nil
    /// Opened from a detail ("✦ Kouč"): what the athlete asks about (CoachFromDetail.swift).
    var subject: CoachSubject? = nil
    /// Opened from the coach's push: the chat it answered in.
    var openChat: Int? = nil
    @State private var messages: [Bubble] = []
    @State private var chatId: Int?
    @State private var input = ""
    @State private var sending = false
    @State private var progress: String?
    @State private var error: String?
    @State private var needsConsent = false
    /// The coach needs Loadwise Pro (402): the offer instead of an error.
    @State private var needsSubscription = false
    /// The question that asked for the AI consent: sent again once it is given.
    @State private var unsent: (bubble: UUID, text: String)?
    @State private var home: CoachesSnapshot?
    @State private var showChats = false
    @State private var showMemory = false
    /// This week's messages to the coach (src/coach-allowance.js); nil for the owner.
    @State private var allowance: CoachAllowance?
    /// Used up and this conversation can't go on: the card and a dimmed field.
    @State private var usedUp = false
    @FocusState private var focused: Bool

    struct Bubble: Identifiable, Equatable {
        let id = UUID()
        let mine: Bool
        var text: String
        var actions: [CoachAction] = []
        var decided: [Int: String] = [:]
        /// A decision that didn't go through: the error, with Potvrdit and Ne still there.
        var failed: [Int: String] = [:]
        /// A confirmed change of a done activity that "Vrátit" can take back.
        var undo: [Int: String] = [:]
        var visuals: [String] = []
        var memory: [CoachMemoryChip] = []
        /// Food read from a sentence, waiting for "Zapsat"; `logged` once decided.
        var food: FoodDraft? = nil
        var logged: String? = nil
        var loggedOK = false
        /// A quiet line from the app (how many messages are left), not the coach.
        var note = false
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        // Lazy: a long chat lays out only the bubbles on screen.
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if messages.isEmpty { welcome }
                            else if let subject { CoachSubjectCard(subject: subject) }
                            ForEach(messages) { bubble in
                                BubbleView(bubble: bubble,
                                           decide: { action, confirm in Task { await decide(action, confirm: confirm, in: bubble.id) } },
                                           undoMemory: { chip in Task { await undo(chip, in: bubble.id) } },
                                           undoAction: { action in Task { await undo(action, in: bubble.id) } },
                                           logFood: { items, meal in Task { await logFood(items, meal: meal, in: bubble.id) } })
                                    .id(bubble.id)
                            }
                            if let progress, sending {
                                HStack(spacing: 8) { ProgressView(); Text(progress).font(Typo.caption).foregroundStyle(Palette.muted) }
                            }
                            if needsConsent { consentCard }
                            if needsSubscription { AISubscriptionCard { Paywall.present(model) } }
                            if usedUp { usedUpCard }
                            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                            Color.clear.frame(height: 1).id("end")
                        }
                        .padding(20)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages) { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                }
                inputBar
            }
            .background(ScreenBackground(glow: Palette.Glow.today))
            .navigationTitle("Kouč")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { newChat() } label: { Label("Nová konverzace", systemImage: "square.and.pencil") }
                        Button { showChats = true } label: { Label("Předchozí konverzace", systemImage: "clock.arrow.circlepath") }
                        Button { showMemory = true } label: { Label("Co si kouč pamatuje", systemImage: "sparkles") }
                    } label: { Image(systemName: "ellipsis.circle") }
                    // Not while an answer streams in: it writes into the current conversation.
                    .disabled(sending)
                    .accessibilityLabel("Konverzace")
                }
            }
            .sheet(isPresented: $showChats) { ChatsSheet { id in Task { await open(id) } } }
            .navigationDestination(isPresented: $showMemory) { CoachMemoryView() }
        }
        .tint(Palette.ink)
        .task {
            guard !model.demo, home == nil else { return }
            if let openChat, chatId == nil { await open(openChat) }
            home = try? await model.api.coaches(date: AppModel.localDate(Date()))
            allowance = (try? await model.api.subscription())?.coachAllowance
            if allowance?.usedUp == true { usedUp = true }
        }
    }

    // MARK: Parts

    @ViewBuilder private var welcome: some View {
        if let subject {
            VStack(alignment: .leading, spacing: 14) {
                CoachSubjectCard(subject: subject)
                SectionLabel(text: "Zkus třeba").padding(.top, 10)
                ForEach(subject.questions.map(L10n.tr), id: \.self) { suggestion($0) }
            }
        } else {
            dayWelcome
        }
    }

    /// A question to try: sent as it is.
    private func suggestion(_ q: String) -> some View {
        Button { input = q; Task { await send() } } label: {
            Text(q).font(.subheadline).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var dayWelcome: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let s = home?.morningSummary, let headline = s.headline {
                Text(headline).font(Typo.sentence(26, relativeTo: .title2)).foregroundStyle(Palette.ink)
                if let text = s.text { Text(text).font(Typo.sentence(18)).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true) }
                if let rec = s.recommendation { Text(rec).font(Typo.sentenceItalic(18)).foregroundStyle(Palette.green).fixedSize(horizontal: false, vertical: true) }
            } else {
                Text("Na co se chceš zeptat?").font(Typo.sentence(28, relativeTo: .title)).foregroundStyle(Palette.ink)
            }
            if let priorities = home?.priorities, !priorities.isEmpty {
                SectionLabel(text: "Dnes je důležité").padding(.top, 6)
                ForEach(priorities, id: \.self) { p in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Palette.faint)
                        Text(p).font(Typo.small).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            HStack(spacing: 10) {
                NavigationLink { DayReviewView() } label: { coachTool("Posoudit dnešek", "checkmark.seal") }
                NavigationLink { WeekPlanView() } label: { coachTool("Naplánovat týden", "calendar.badge.plus") }
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
            SectionLabel(text: "Zkus třeba").padding(.top, 6)
            // After a workout, on a low morning, the day before a hard session: about that.
            ForEach(CoachSuggestions.forDay(today: model.today, sessions: model.training?.sessions ?? [], date: AppModel.localDate(Date())), id: \.self) { suggestion($0) }
        }
    }

    private func coachTool(_ title: String, _ symbol: String) -> some View {
        Label(L10n.tr(title), systemImage: symbol)
            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity).frame(height: 46)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var consentCard: some View {
        Card {
            Text("Kouč používá AI").font(.headline)
            Text("Aby mohl odpovídat, pošle Aurin potřebné údaje o zdraví, včetně dat z připojených hodinek a prstenů, společnosti OpenAI v USA. Jde to kdykoli vypnout v Nastavení → Soukromí a data.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Button {
                Task {
                    do {
                        try await model.api.allowAI()
                        needsConsent = false
                        error = nil
                        // The question that ran into the consent goes out now, no need to type it again.
                        if let question = unsent {
                            unsent = nil
                            messages.removeAll { $0.id == question.bubble }
                            input = question.text
                            await send()
                        }
                    } catch { self.error = error.localizedDescription }
                }
            } label: {
                Text("Povolit AI").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
            }
        }
    }

    /// The week's messages are used up: what happened and when more come.
    private var usedUpCard: some View {
        Card {
            Text("Zprávy koučovi na tento týden jsou vyčerpané.").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(CoachAllowance.comesBack).font(Typo.small).foregroundStyle(Palette.muted)
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField(usedUp ? CoachAllowance.placeholder : L10n.tr("Napiš kouči…"), text: $input, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($focused)
                // From 75 % on: how many are left, until the new week.
                if let allowance, allowance.near, !allowance.usedUp, !usedUp {
                    Text(allowance.counter).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).fixedSize()
                        .padding(.bottom, 2)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(Palette.onButton)
                    .frame(width: 40, height: 40).background(Palette.button, in: Circle())
            }
            .disabled(sending || usedUp || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.demo)
            .accessibilityLabel("Odeslat")
        }
        .disabled(usedUp)
        .opacity(usedUp ? 0.55 : 1)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    // MARK: Actions

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        // The demo has no account to ask with.
        guard !text.isEmpty, !sending, !usedUp, !model.demo else { return }
        input = ""
        error = nil
        let mine = Bubble(mine: true, text: text)
        messages.append(mine)
        let reply = Bubble(mine: false, text: "")
        messages.append(reply)
        // By id, not index: the list may change while the answer streams in.
        let id = reply.id
        sending = true
        progress = "Kouč přemýšlí…"
        defer { sending = false; progress = nil }
        // The answer streams in a few words at a time; the bubble shows it at
        // most ten times a second, so a long answer does not re-lay the chat
        // with every word. The last text always shows.
        var unshown: String?
        var shownAt = Date.distantPast
        do {
            for try await event in model.api.askCoach(text, chatId: chatId, view: view, date: date, appContext: subject?.appContext) {
                switch event {
                case .progress(let p): progress = p
                case .answer(let a):
                    if Date().timeIntervalSince(shownAt) >= 0.1 {
                        edit(id) { $0.text = a }
                        shownAt = Date()
                        unshown = nil
                    } else {
                        unshown = a
                    }
                case .done(let result):
                    let last = unshown
                    unshown = nil
                    edit(id) {
                        if let a = result.answer ?? last { $0.text = a }
                        $0.actions = result.actions ?? []
                        $0.visuals = result.visuals ?? []
                        $0.memory = result.memoryChanges?.chips ?? []
                        // A food sentence: the card says it all, the summary text is not shown.
                        if result.kind == "food_draft", let draft = result.draft, draft.items.contains(where: { $0.product != nil }) {
                            $0.food = draft
                            $0.text = ""
                        }
                    }
                    if let chat = result.chatId { chatId = chat }
                    if let a = result.coachAllowance {
                        allowance = a
                        if a.notice == true { messages.append(Bubble(mine: false, text: a.chatNotice, note: true)) }
                        // The extra messages are gone too: the card now, not a refused message later.
                        if a.more == false { usedUp = true }
                    }
                }
            }
            if let last = unshown { edit(id) { $0.text = last } }
            messages.removeAll { $0.id == id && $0.text.isEmpty && $0.food == nil }
        } catch APIError.aiConsentRequired {
            messages.removeAll { $0.id == id }
            unsent = (mine.id, text)
            needsConsent = true
        } catch APIError.subscriptionRequired {
            messages.removeAll { $0.id == id }
            needsSubscription = true
        } catch APIError.coachAllowanceUsed(_, let a) {
            // The question stays in the field for next week.
            messages.removeAll { $0.id == id || $0.id == mine.id }
            input = text
            if let a { allowance = a }
            usedUp = true
        } catch {
            messages.removeAll { $0.id == id && $0.text.isEmpty }
            self.error = error.localizedDescription
        }
    }

    private func edit(_ id: UUID, _ change: (inout Bubble) -> Void) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        change(&messages[i])
    }

    private func decide(_ action: CoachAction, confirm: Bool, in bubble: UUID) async {
        guard let draftId = action.draftId else { return }
        do {
            edit(bubble) { $0.failed[draftId] = nil }
            let answer = try await model.api.decideCoachAction(draftId: draftId, confirm: confirm)
            edit(bubble) {
                $0.decided[draftId] = answer.message ?? (confirm ? "Hotovo." : "Zamítnuto.")
                if let token = answer.undo { $0.undo[draftId] = token }
            }
            if confirm { await model.refreshTraining(); await model.refresh() }
        } catch {
            edit(bubble) { $0.failed[draftId] = error.localizedDescription }
        }
    }

    /// "Vrátit" under a confirmed change of a done activity.
    private func undo(_ action: CoachAction, in bubble: UUID) async {
        guard let draftId = action.draftId, let token = messages.first(where: { $0.id == bubble })?.undo[draftId] else { return }
        do {
            try await model.api.undoActivityChange(token: token)
            edit(bubble) { $0.undo[draftId] = nil; $0.decided[draftId] = L10n.tr("Vráceno") }
            await model.refreshTraining(); await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// "Zpět" under an answer: what the coach remembered, forgot or rewrote goes back.
    private func undo(_ chip: CoachMemoryChip, in bubble: UUID) async {
        do {
            switch chip.kind {
            case .saved: try await model.api.forgetMemory(chip.text)
            case .forgotten: try await model.api.addMemory(chip.text)
            case .updated: try await model.api.editMemory(from: chip.text, to: chip.from ?? chip.text)
            }
            edit(bubble) { b in
                if let i = b.memory.firstIndex(where: { $0.id == chip.id }) { b.memory[i].undone = true }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Logs the confirmed foods (nil items: "Ne"), then says what is left of the day.
    private func logFood(_ items: [(product: FoodProduct, amount: Double, meal: String)]?, meal: String, in bubble: UUID) async {
        guard let draft = messages.first(where: { $0.id == bubble })?.food else { return }
        guard let items else { edit(bubble) { $0.logged = L10n.tr("Nezapsáno.") }; return }
        var failed: String?
        for item in items {
            if let message = await model.logFood(product: item.product, amount: item.amount, meal: item.meal, day: draft.date, refreshAfter: false) { failed = message }
        }
        // Shown at once; they go out in the background, Food and Today load after.
        Task { await model.sendOutbox(reloadToday: true) }
        if model.food == nil { await model.refreshFood() }
        if let failed { edit(bubble) { $0.logged = failed }; return }
        edit(bubble) { $0.logged = L10n.tr(Self.loggedTo[meal] ?? "Zapsáno"); $0.loggedOK = true }
        if let left = Self.leftText(model.food, date: draft.date) { messages.append(Bubble(mine: false, text: left)) }
    }

    static let loggedTo = ["breakfast": "Zapsáno do snídaně", "snack_am": "Zapsáno do dopolední svačiny", "lunch": "Zapsáno do oběda",
                           "snack_pm": "Zapsáno do odpolední svačiny", "dinner": "Zapsáno do večeře", "snack_late": "Zapsáno do druhé večeře"]

    /// "Zbývá ti 1 340 kcal a 88 g bílkovin." from the day's food, when it is that day.
    static func leftText(_ food: FoodSnapshot?, date: String) -> String? {
        guard let food, food.date == date, let target = food.target else { return nil }
        let kcal = Int((target - (food.kcal ?? 0)).rounded())
        if kcal <= 0 { return L10n.tr("Cíl na dnešek je splněný.") }
        let protein = food.macros.protein.target.map { Int(($0 - (food.macros.protein.eaten ?? 0)).rounded()) } ?? 0
        return protein > 0 ? L10n.f("Zbývá ti %d kcal a %d g bílkovin.", kcal, protein) : L10n.f("Zbývá ti %d kcal.", kcal)
    }

    private func newChat() {
        messages = []
        chatId = nil
        error = nil
        // A new conversation gets no extra messages.
        usedUp = allowance?.usedUp == true
    }

    /// The server keeps a one-line "[Návrhy: …]" with each answer, so later
    /// turns know what was proposed; a reopened chat shows the answer only.
    static func withoutProposalNote(_ text: String) -> String {
        text.replacingOccurrences(of: #"\s*\[(?:Návrhy|Proposals): [^\]]*\]\s*$"#, with: "", options: .regularExpression)
    }

    private func open(_ id: Int) async {
        do {
            let chat = try await model.api.chat(id: id)
            chatId = chat.id
            usedUp = allowance?.usedUp == true
            // The proposals stay under the answer they came with, decided or still open.
            let actions = chat.actions ?? []
            messages = chat.messages.map { m in
                var bubble = Bubble(mine: m.role == "user", text: m.role == "user" ? m.content : Self.withoutProposalNote(m.content))
                if m.role != "user", let id = m.serverId {
                    bubble.actions = actions.filter { $0.messageId == id }
                    for a in bubble.actions {
                        guard let draft = a.draftId, let state = a.draftStatus, state != "draft" else { continue }
                        bubble.decided[draft] = state == "confirmed" ? L10n.tr("Potvrzeno.") : state == "rejected" ? L10n.tr("Zamítnuto.") : L10n.tr("Návrh už neplatí.")
                    }
                }
                return bubble
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BubbleView: View {
    let bubble: CoachView.Bubble
    var decide: (CoachAction, Bool) -> Void
    var undoMemory: (CoachMemoryChip) -> Void = { _ in }
    var undoAction: (CoachAction) -> Void = { _ in }
    var logFood: ([(product: FoodProduct, amount: Double, meal: String)]?, String) -> Void = { _, _ in }

    var body: some View {
        VStack(alignment: bubble.mine ? .trailing : .leading, spacing: 8) {
            if bubble.note {
                Text(bubble.text).font(Typo.caption).foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.center).frame(maxWidth: .infinity)
            } else if !bubble.text.isEmpty {
                if bubble.mine {
                    Text(bubble.text)
                        .font(.body)
                        .foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Palette.button, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .textSelection(.enabled)
                } else {
                    CoachMarkdown(text: bubble.text)
                        .equatable()
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .textSelection(.enabled)
                }
            }
            ForEach(bubble.visuals, id: \.self) { kind in
                CoachVisual(kind: kind)
            }
            ForEach(bubble.memory) { chip in
                MemoryChipView(chip: chip) { undoMemory(chip) }
            }
            ForEach(bubble.actions) { action in
                ActionCard(action: action, result: action.draftId.flatMap { bubble.decided[$0] },
                           failure: action.draftId.flatMap { bubble.failed[$0] },
                           canUndo: action.draftId.map { bubble.undo[$0] != nil } ?? false,
                           decide: { decide(action, $0) }, undo: { undoAction(action) })
            }
            if let food = bubble.food {
                FoodDraftCard(draft: food, logged: bubble.logged, ok: bubble.loggedOK, log: logFood)
            }
        }
        .frame(maxWidth: .infinity, alignment: bubble.mine ? .trailing : .leading)
        .padding(bubble.mine ? .leading : .trailing, bubble.note ? 0 : 40)
    }
}

/// A proposed change with "Potvrdit" and "Ne".
struct ActionCard: View {
    let action: CoachAction
    let result: String?
    var failure: String? = nil
    var canUndo = false
    var decide: (Bool) -> Void
    var undo: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let preview = action.preview, action.type == "workout", preview.workout != nil || preview.plan != nil {
                WorkoutPreviewBlock(action: action, preview: preview)
            } else {
                Label(action.title, systemImage: "wand.and.stars").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
            }
            if let detail = action.detail, !detail.isEmpty {
                Text(detail).font(Typo.caption).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let reason = action.reason { Text(reason).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
            if let result {
                HStack(spacing: 6) {
                    if canUndo { Image(systemName: "checkmark").font(.caption.weight(.bold)) }
                    Text(result).font(Typo.caption.weight(.medium))
                    if canUndo {
                        Text("·")
                        Button(action: undo) { Text("Vrátit").font(Typo.caption.weight(.medium)) }
                            .buttonStyle(.plain)
                    }
                }
                .foregroundStyle(Palette.green)
            } else if action.draftId != nil {
                HStack(spacing: 8) {
                    Button { decide(true) } label: {
                        Text("Potvrdit").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 16).frame(height: 34).background(Palette.button, in: Capsule())
                    }
                    Button { decide(false) } label: {
                        Text("Ne").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 16).frame(height: 34).overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                    }
                }
                .buttonStyle(.plain)
                if let failure {
                    Text(failure).font(Typo.caption).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// The proposed session on the coach's card: "Naplánovat · Pá 16. 10.", its
/// name, the profile with length, TSS and the hardest step, or the gym
/// exercises with their sets and weights.
struct WorkoutPreviewBlock: View {
    let action: CoachAction
    let preview: CoachAction.Preview

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(L10n.tr("Naplánovat") + (action.date.map { " · " + Fmt.weekdayShort($0) + " " + Fmt.dayMonth($0) } ?? ""), systemImage: "wand.and.stars")
                .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
            if let workout = preview.workout {
                Text(verbatim: workout.name).font(Typo.sentence(22)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                if let blocks = workout.steps, !WorkoutProfile.segments(blocks).isEmpty {
                    WorkoutProfile(blocks: blocks, sport: action.sport ?? "ride", compact: true)
                }
                Text(verbatim: numbers(workout)).font(Typo.caption).foregroundStyle(Palette.secondary)
            } else if let plan = preview.plan {
                let exercises = GymProposal(draftId: nil, planName: plan.planName ?? "", rationale: nil, rows: plan.rows, muscles: [:]).exercises
                Text(verbatim: plan.planName.flatMap { $0.isEmpty ? nil : $0 } ?? L10n.tr("Posilovna")).font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                VStack(spacing: 0) {
                    ForEach(Array(exercises.prefix(5).enumerated()), id: \.offset) { _, e in
                        HStack {
                            Text(verbatim: e.name).foregroundStyle(Palette.ink)
                            Spacer(minLength: 8)
                            Text(verbatim: "\(max(1, e.sets))×\(e.reps)" + (e.kg.isEmpty ? "" : " · \(e.kg) kg")).foregroundStyle(Palette.secondary).monospacedDigit()
                        }
                        .font(Typo.caption)
                        .padding(.vertical, 7)
                        .overlay(alignment: .top) { Rectangle().fill(Palette.ink.opacity(0.1)).frame(height: 1) }
                    }
                }
                if exercises.count > 5 {
                    Text(L10n.f("+%@ další", String(exercises.count - 5))).font(Typo.caption).foregroundStyle(Palette.muted)
                }
                if let minutes = action.minutes, minutes > 0 {
                    Text(verbatim: Fmt.duration(Int(minutes))).font(Typo.caption).foregroundStyle(Palette.secondary)
                }
            }
        }
    }

    /// "1 h · 62 TSS · 88–93 % FTP": the length, the load and the hardest step.
    private func numbers(_ w: LibraryWorkout) -> String {
        var parts: [String] = []
        if let m = w.duration_minutes ?? action.minutes, m > 0 { parts.append(Fmt.duration(Int(m.rounded()))) }
        if let tss = w.target_load, tss > 0 { parts.append("\(Int(tss.rounded())) TSS") }
        if (action.sport ?? "ride") == "ride", let top = WorkoutProfile.segments(w.steps ?? []).max(by: { $0.percent < $1.percent })?.step,
           let hi = top.percentHigh ?? top.percentLow {
            let lo = top.percentLow ?? hi
            parts.append((lo == hi ? "\(Int(hi))" : "\(Int(lo))–\(Int(hi))") + " % FTP")
        }
        return parts.joined(separator: " · ")
    }
}

struct ChatsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var open: (Int) -> Void
    @State private var chats: [ChatSummary] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            List {
                ForEach(chats) { chat in
                    Button {
                        open(chat.id)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chat.title ?? "Konverzace").font(.body).foregroundStyle(Palette.ink).lineLimit(2)
                            if let n = chat.messages { Text("\(n) " + Fmt.plural(n, "zpráva", "zprávy", "zpráv")).font(Typo.caption).foregroundStyle(Palette.muted) }
                        }
                    }
                }
                .onDelete { offsets in
                    let ids = offsets.map { chats[$0].id }
                    chats.remove(atOffsets: offsets)
                    Task { for id in ids { try? await model.api.deleteChat(id: id) } }
                }
                if !loading && chats.isEmpty {
                    Text("Zatím žádné konverzace.").foregroundStyle(Palette.muted)
                }
            }
            .navigationTitle("Konverzace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Zavřít") { dismiss() } } }
            .task {
                defer { loading = false }
                guard !model.demo else { return }
                chats = (try? await model.api.chats()) ?? []
            }
        }
        .presentationDetents([.medium, .large])
    }
}
