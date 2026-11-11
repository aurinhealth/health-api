import SwiftUI
import PhotosUI
import TipKit

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
    /// Told the conversation's id once the server has one, so the caller can open it again.
    var keepChat: (Int) -> Void = { _ in }
    @State private var messages: [Bubble] = []
    @State private var chatId: Int?
    /// Dočasný chat (Petr 2026-11-07): the coach reads what he knows but keeps
    /// nothing of it; not listed, and deleted when the athlete leaves it.
    @State private var ghost = false
    @State private var input = ""
    @State private var sending = false
    /// Proposals whose Potvrdit or Odmítnout is on its way: a second tap does nothing.
    @State private var deciding: Set<Int> = []
    @State private var progress: String?
    /// When the question went: the seconds under it and "Odpověď za 8 s".
    @State private var askedAt: Date?
    @State private var error: String?
    /// The connection dropped while the server went on with the answer: the
    /// chat it is saved in and the newest stored message before it (audit 23.1).
    @State private var unfinished: (chat: Int, after: Int)?
    @State private var loadingAnswer = false
    @State private var needsConsent = false
    /// The coach needs Aurin Pro (402): the offer instead of an error.
    @State private var needsSubscription = false
    /// The question that asked for the AI consent: sent again once it is given.
    @State private var unsent: (bubble: UUID, text: String, photo: UIImage?)?
    /// One photo for the next message, taken or picked next to the field.
    @State private var photo: UIImage?
    @State private var cameraOpen = false
    @State private var galleryOpen = false
    @State private var galleryItem: PhotosPickerItem?
    @State private var home: CoachesSnapshot?
    /// The side panel with the conversations, from ☰.
    @State private var showChats = false
    /// False once another conversation is opened from the panel: it is not about `subject`.
    @State private var aboutSubject = true
    @State private var showMemory = false
    /// The message a search result opened the chat at: scrolled to and ringed for a moment.
    @State private var found: UUID?
    /// This week's messages to the coach (src/coach-allowance.js); nil for the owner.
    @State private var allowance: CoachAllowance?
    /// Used up and this conversation can't go on: the card and a dimmed field.
    @State private var usedUp = false
    /// Packs of extra messages can be bought (the App Store is set up on the server).
    @State private var packsOnSale = false
    @State private var morePacks = false
    /// The answer whose thumb went down: the short panel with the reasons.
    @State private var dislikedAnswer: Bubble?
    /// The thumb down waiting in that panel: saved with the reason on Send, or
    /// without one when the panel is closed (one request, so no reason is lost).
    @State private var pendingDown: (bubble: UUID, before: String?)?
    /// "Report this answer…" in that panel: Nahlásit problém with the answer, once the panel is closed.
    @State private var reportAfterPanel: String?
    @State private var reporting: ReportedAnswer?
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
        /// The quick change a workout card is waiting for (Kratší, Lehčí…).
        var adjusting: [Int: String] = [:]
        var visuals: [String] = []
        var memory: [CoachMemoryChip] = []
        /// Food read from a sentence, waiting for "Zapsat"; `logged` once decided.
        var food: FoodDraft? = nil
        var logged: String? = nil
        var loggedOK = false
        /// A quiet line from the app (how many messages are left), not the coach.
        var note = false
        /// The photo sent with this question; a reopened chat has only `photoMark`.
        var photo: UIImage? = nil
        var photoMark = false
        /// The seconds the answer took, for one given while the chat was open.
        var answeredIn: Int? = nil
        /// The coach's thinking steps for an answer given while the chat was open.
        var steps: [CoachStep] = []
        /// The stored answer on the server, which its thumb points to.
        var serverId: Int? = nil
        /// When the answer came: the time under the last one.
        var at: Date? = nil
        /// "up" or "down".
        var rating: String? = nil
    }

    /// The answer sent to Nahlásit problém.
    struct ReportedAnswer: Hashable { let text: String }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        // Lazy: a long chat lays out only the bubbles on screen.
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if ghost { ghostCard }
                            if messages.isEmpty { welcome }
                            else if let subject = current { CoachSubjectCard(subject: subject) }
                            ForEach(messages) { bubble in
                                BubbleView(bubble: bubble,
                                           last: bubble.id == lastAnswer?.id && !sending,
                                           rate: canRate(bubble) ? { rating in rateTapped(bubble.id, rating) } : nil,
                                           decide: { action, confirm in Task { await decide(action, confirm: confirm, in: bubble.id) } },
                                           undoMemory: { chip in Task { await undo(chip, in: bubble.id) } },
                                           decideMemory: { chip, yes in Task { await decide(chip, yes, in: bubble.id) } },
                                           undoAction: { action in Task { await undo(action, in: bubble.id) } },
                                           adjust: { action, chip, date in Task { await adjust(action, chip: chip, date: date, in: bubble.id) } },
                                           logFood: { items, meal in Task { await logFood(items, meal: meal, in: bubble.id) } },
                                           openPlan: openPlan,
                                           more: (bubble.note && packsOnSale) ? { morePacks = true } : nil,
                                           found: bubble.id == found)
                                    .id(bubble.id)
                            }
                            // Questions the app already has, under the last answer; gone once typing starts.
                            if !followUps.isEmpty { followUpList }
                            // Until the first words arrive: the coach's bubble with dots and what he is doing;
                            // then the same row under the words while the answer is finished (proposals, preview).
                            if let progress, sending, !stepsShown {
                                if waiting {
                                    CoachThinking(text: progress, since: askedAt).id("thinking")
                                } else {
                                    CoachThinkingLine(text: progress, since: askedAt).padding(.leading, 4).id("thinking")
                                }
                            }
                            if needsConsent { consentCard }
                            if needsSubscription { AISubscriptionCard { Paywall.present(model) } }
                            if usedUp { usedUpCard }
                            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                            if unfinished != nil, !sending { loadAnswerButton }
                            Color.clear.frame(height: 1).id("end")
                        }
                        .padding(20)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: messages) {
                        if let found { proxy.scrollTo(found, anchor: .center) } else { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                    }
                    .onChange(of: sending) { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                }
                inputBar
            }
            .background { ScreenBackground(glow: ghost ? Palette.Glow.ghost : Palette.Glow.today) }
            .navigationTitle(ghost ? L10n.tr("Dočasný chat") : L10n.tr("Kouč"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { withAnimation(.easeOut(duration: 0.25)) { showChats = true } } label: {
                        Image(systemName: "line.3.horizontal").scaledFont(16, weight: .semibold)
                    }
                    // Not while an answer streams in: it writes into the current conversation.
                    .disabled(sending)
                    .accessibilityLabel("Konverzace")
                }
                // On an empty new chat only; once it has a message it stays what it is.
                if ghost || messages.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            ghost.toggle()
                            GhostChatTip().invalidate(reason: .actionPerformed)
                        } label: {
                            GhostGlyph(filled: ghost).frame(width: 19, height: 21)
                        }
                        .disabled(sending || !messages.isEmpty)
                        .popoverTip(GhostChatTip())
                        .accessibilityLabel("Dočasný chat")
                        .accessibilityValue(ghost ? L10n.tr("Zapnuto") : L10n.tr("Vypnuto"))
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark").scaledFont(14, weight: .semibold) }
                        .accessibilityLabel("Zavřít")
                }
            }
            .fullScreenCover(isPresented: $cameraOpen) {
                CameraPicker { image in
                    cameraOpen = false
                    if let image { photo = image }
                }
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $galleryOpen, selection: $galleryItem, matching: .images)
            .onChange(of: galleryItem) {
                guard let item = galleryItem else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { photo = image }
                    galleryItem = nil
                }
            }
            .navigationDestination(isPresented: $showMemory) { CoachMemoryView() }
            .navigationDestination(isPresented: $morePacks) { CoachPacksView() }
            .navigationDestination(item: $reporting) { CoachAnswerReport(answer: $0.text) }
            .sheet(item: $dislikedAnswer, onDismiss: {
                if let down = pendingDown {
                    pendingDown = nil
                    Task { await rate(down.bubble, "down", before: down.before) }
                }
                if let text = reportAfterPanel { reportAfterPanel = nil; reporting = ReportedAnswer(text: text) }
            }) { bubble in
                AnswerFeedbackSheet(send: { reason in
                    let before = pendingDown?.before
                    pendingDown = nil
                    dislikedAnswer = nil
                    Task { await rate(bubble.id, "down", reason: reason, before: before) }
                }, report: {
                    reportAfterPanel = bubble.text
                    dislikedAnswer = nil
                })
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
        }
        .overlay {
            if showChats {
                ChatsPanel(current: chatId, close: { withAnimation(.easeOut(duration: 0.25)) { showChats = false } },
                           newChat: { newChat() }, open: { id, message in
                               aboutSubject = id == chatId && aboutSubject
                               leaveGhost()
                               Task { await open(id, at: message) }
                           }, memory: { showMemory = true })
                .transition(.move(edge: .leading))
            }
        }
        .tint(Palette.ink)
        .task {
            guard !model.demo, home == nil else { return }
            if let openChat, chatId == nil { await open(openChat) }
            home = try? await model.api.coaches(date: AppModel.localDate(Date()))
            let status = try? await model.api.subscription()
            allowance = status?.coachAllowance
            packsOnSale = status?.packsBuyable == true
            if allowance?.usedUp == true { usedUp = true }
        }
        // Closing the coach leaves a temporary chat too.
        .onDisappear { leaveGhost() }
    }

    /// What holds in a temporary chat, above its messages.
    private var ghostCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 7) {
                GhostGlyph(filled: false).frame(width: 15, height: 17)
                Text("Kouč si tenhle chat nezapamatuje").font(Typo.bodyStrong)
            }
            Text("Dál vidí tvoje data a to, co už ví. Nic odtud se mu neuloží do paměti a Aurin chat smaže, až odejdeš. Potvrzené tréninky a jídlo zůstanou.")
                .font(Typo.small).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Palette.ink)
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card.opacity(0.75), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.ink.opacity(0.3), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3])))
        .accessibilityElement(children: .combine)
    }

    /// Leaving a temporary chat (another chat, a new one, or closing the coach)
    /// deletes it; the server removes one the app never left the night after.
    private func leaveGhost() {
        guard ghost else { return }
        ghost = false
        guard let id = chatId, !model.demo else { return }
        let api = model.api
        Task { try? await api.deleteChat(id: id) }
    }

    // MARK: Parts

    @ViewBuilder private var welcome: some View {
        if let subject = current {
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

    /// Up to three questions the app already has for this topic or day, not yet
    /// asked in this chat; no AI is asked for them. A tap sends one as the
    /// athlete's message (it counts like a typed one).
    private var followUps: [String] {
        guard !sending, !usedUp, !needsConsent, !needsSubscription, photo == nil,
              input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let last = lastAnswer, last.food == nil else { return [] }
        let asked = Set(messages.filter(\.mine).map { $0.text.lowercased() })
        let pool = (current?.questions.map(L10n.tr) ?? [])
            + CoachSuggestions.forDay(today: model.today, sessions: model.training?.sessions ?? [], date: AppModel.localDate(Date()), limit: 8)
        var seen = Set<String>()
        return Array(pool.filter { !asked.contains($0.lowercased()) && seen.insert($0.lowercased()).inserted }.prefix(3))
    }

    private var followUpList: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(followUps, id: \.self) { q in
                Button { input = q; Task { await send() } } label: {
                    Text(q).font(.subheadline).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Palette.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(Palette.hairline, lineWidth: 0.5))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.trailing, 40)
        .transition(.opacity)
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
            Text("Aby mohl odpovídat a pamatovat si vaše rozhovory, pošle Aurin potřebné údaje o zdraví, včetně dat z připojených hodinek a prstenů, a fotky, které mu pošleš, společnosti OpenAI v USA. Jde to kdykoli vypnout v Nastavení → Soukromí a data.")
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
                            photo = question.photo
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
            if packsOnSale {
                Button { morePacks = true } label: {
                    Text("Získat další zprávy").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// The answer being prepared has no words yet (nor a food card).
    /// The answer's thinking steps stand in for the waiting row: the bubble
    /// shows them while the coach works; the row comes back under the words
    /// for what follows them (the proposals, the workout preview).
    private var stepsShown: Bool {
        guard let last = messages.last, !last.mine, !last.steps.isEmpty else { return false }
        return waiting || last.steps.contains(where: \.running)
    }

    private var waiting: Bool {
        guard let last = messages.last, !last.mine else { return true }
        return last.text.isEmpty && last.food == nil
    }

    private var inputBar: some View {
        ChromeGlassGroup {
            HStack(alignment: .bottom, spacing: 10) {
                photoMenu
                HStack(alignment: .bottom, spacing: 8) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let photo { photoThumb(photo) }
                        TextField(usedUp ? CoachAllowance.placeholder : L10n.tr("Napiš kouči…"), text: $input, axis: .vertical)
                            .lineLimit(1...5)
                            .focused($focused)
                    }
                    // From 75 % on: how many are left, until the new week.
                    if let allowance, allowance.near, !allowance.usedUp, !usedUp {
                        Text(allowance.counter).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).fixedSize()
                            .padding(.bottom, 2)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .chromeGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .chromeShadow(0.08, radius: 6, y: 2)
                Button { Task { await send() } } label: {
                    Image(systemName: "arrow.up").scaledFont(16, weight: .bold, cap: .denseCap).foregroundStyle(Palette.onButton)
                        .frame(width: 40, height: 40).background(Palette.button, in: Circle())
                }
                .disabled(sending || usedUp || (input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && photo == nil))
                .accessibilityLabel("Odeslat")
            }
        }
        .disabled(usedUp)
        .opacity(usedUp ? 0.55 : 1)
        .padding(.horizontal, 16).padding(.vertical, 10)
    }

    /// The camera next to the field: take a photo or pick one. One photo a message.
    private var photoMenu: some View {
        Menu {
            Button { cameraOpen = true } label: { Label(L10n.tr("Vyfotit"), systemImage: "camera") }
            Button { galleryOpen = true } label: { Label(L10n.tr("Vybrat z Fotek"), systemImage: "photo") }
        } label: {
            Image(systemName: "camera").scaledFont(16, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.ink)
                .frame(width: 40, height: 40).contentShape(Circle())
        }
        .chromeGlass(in: Circle())
        .chromeShadow(0.08, radius: 6, y: 2)
        .disabled(photo != nil || sending || model.demo)
        .opacity(photo != nil ? 0.35 : 1)
        .accessibilityLabel(L10n.tr("Přidat fotku"))
    }

    /// The photo waiting above the text, with × to take it away.
    private func photoThumb(_ image: UIImage) -> some View {
        Image(uiImage: image).resizable().scaledToFill()
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button { photo = nil } label: {
                    Image(systemName: "xmark").scaledFont(9, weight: .bold, cap: .denseCap).foregroundStyle(.white)
                        .frame(width: 20, height: 20).background(Color.black.opacity(0.65), in: Circle())
                        // The small × in a 44 pt target, centred where it was.
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .offset(x: 8, y: -8)
                .accessibilityLabel(L10n.tr("Odebrat fotku"))
            }
    }

    // MARK: Actions

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let picture = photo
        // The demo has no account to ask with: a ready answer from the sample day.
        if model.demo {
            guard !text.isEmpty, !sending else { return }
            await demoAnswer(text)
            return
        }
        guard !text.isEmpty || picture != nil, !sending, !usedUp else { return }
        input = ""
        photo = nil
        error = nil
        unfinished = nil
        // A stored answer has a higher id than any before it: how "Načíst odpověď" knows it came.
        let newestStored = messages.compactMap(\.serverId).max() ?? 0
        let mine = Bubble(mine: true, text: text, photo: picture)
        messages.append(mine)
        let reply = Bubble(mine: false, text: "")
        messages.append(reply)
        // By id, not index: the list may change while the answer streams in.
        let id = reply.id
        sending = true
        progress = L10n.tr("Kouč přemýšlí…")
        let asked = Date()
        askedAt = asked
        defer { sending = false; progress = nil }
        // An answer that failed or was cut keeps no steps: they would spin on without an end.
        defer { edit(id) { if $0.answeredIn == nil { $0.steps = [] } } }
        // A switch to another app mid-answer: iOS gives about half a minute
        // more before the connection is frozen and lost.
        let background = FinishInBackground("Coach answer")
        defer { background.end() }
        // The chat the server saves the answer in (the "chat" event).
        var savedIn: Int?
        // Made smaller first: the server takes one JPEG up to about 1.8 MB.
        var image: String?
        if let picture {
            guard let jpeg = await picture.jpegForUpload(side: 1600) else {
                messages.removeAll { $0.id == id || $0.id == mine.id }
                input = text
                error = L10n.tr("Fotku se nepodařilo připravit. Zkus jinou.")
                return
            }
            image = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        }
        // The answer streams in a few words at a time; the bubble shows it at
        // most ten times a second, so a long answer does not re-lay the chat
        // with every word. The last text always shows.
        var unshown: String?
        var shownAt = Date.distantPast
        do {
            for try await event in model.api.askCoach(text, chatId: chatId, view: view, date: date, image: image, appContext: current?.appContext, ghost: ghost) {
                switch event {
                case .progress(let p): progress = p
                case .chat(let chat): savedIn = chat
                case .step(let step): edit(id) { $0.steps = CoachStep.merged($0.steps, step) }
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
                        $0.answeredIn = max(1, Int(Date().timeIntervalSince(asked).rounded()))
                        $0.steps = CoachStep.shown(result.steps ?? $0.steps, check: result.check?.status)
                        $0.serverId = result.messageId
                        $0.at = Date()
                        $0.actions = result.actions ?? []
                        $0.visuals = result.visuals ?? []
                        $0.memory = (result.sportChanges?.chips ?? []) + (result.memoryChanges?.chips ?? []) + (result.memoryProposals?.proposals ?? [])
                        // A food sentence: the card says it all, the summary text is not shown.
                        if result.kind == "food_draft", let draft = result.draft, draft.items.contains(where: { $0.product != nil }) {
                            $0.food = draft
                            $0.text = ""
                        }
                    }
                    // A sport turned off: Training and Aktivita dne without it.
                    if result.sportChanges?.removed?.isEmpty == false { Task { await model.refreshTraining(); await model.reloadToday() } }
                    if let chat = result.chatId {
                        chatId = chat
                        // A temporary chat is never opened again.
                        if aboutSubject && !ghost { keepChat(chat) }
                    }
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
            unsent = (mine.id, text, picture)
            needsConsent = true
        } catch APIError.subscriptionRequired {
            messages.removeAll { $0.id == id }
            needsSubscription = true
        } catch APIError.coachAllowanceUsed(_, let a) {
            // The question stays in the field for next week.
            messages.removeAll { $0.id == id || $0.id == mine.id }
            input = text
            photo = picture
            if let a { allowance = a }
            usedUp = true
        } catch {
            let answered = !(messages.first { $0.id == id }?.text.isEmpty ?? true)
            if let savedIn, error is URLError || (error as? APIError) == .interrupted {
                // The server finishes the answer and saves it in the chat: load it, don't ask (and count) again.
                messages.removeAll { $0.id == id && $0.text.isEmpty }
                chatId = savedIn
                if aboutSubject && !ghost { keepChat(savedIn) }
                unfinished = (savedIn, newestStored)
                self.error = L10n.tr("Spojení se přerušilo. Kouč odpověď dopíše a uloží ji do chatu.")
            } else if !answered {
                // Nothing came: the question goes back to the field to send again.
                messages.removeAll { $0.id == id || $0.id == mine.id }
                input = text
                photo = picture
                self.error = error.localizedDescription
            } else {
                self.error = error.localizedDescription
            }
        }
    }

    /// Under the line about the lost connection: the answer from the chat once the server saved it.
    private var loadAnswerButton: some View {
        Button {
            Task { await loadAnswer() }
        } label: {
            HStack(spacing: 8) {
                Text("Načíst odpověď").font(Typo.bodyStrong)
                if loadingAnswer { ProgressView().controlSize(.small) }
            }
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Palette.ink)
        .disabled(loadingAnswer)
    }

    private func loadAnswer() async {
        guard let wait = unfinished, !loadingAnswer else { return }
        loadingAnswer = true
        defer { loadingAnswer = false }
        do {
            let chat = try await model.api.chat(id: wait.chat)
            guard chat.messages.contains(where: { $0.role == "assistant" && ($0.serverId ?? 0) > wait.after }) else {
                error = L10n.tr("Kouč odpověď ještě píše. Zkus to za chvíli.")
                return
            }
            unfinished = nil
            error = nil
            show(chat)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The coach's answer at the end of the chat (the line about the week's
    /// messages may follow it); nil while the athlete's question waits for one.
    private var lastAnswer: Bubble? {
        guard let last = messages.last(where: { !$0.note }), !last.mine, !last.text.isEmpty else { return nil }
        return last
    }

    /// Thumbs need the stored answer; the demo's sample answers keep them on the phone.
    private func canRate(_ bubble: Bubble) -> Bool {
        !bubble.mine && !bubble.note && !bubble.text.isEmpty && (bubble.serverId != nil || model.demo)
    }

    /// Up toggles; down fills at once and opens the panel with the reasons,
    /// which saves it (CoachView.pendingDown); a second tap on either takes it back.
    private func rateTapped(_ bubble: UUID, _ rating: String?) {
        if rating == "down", let b = messages.first(where: { $0.id == bubble }) {
            pendingDown = (bubble, b.rating)
            edit(bubble) { $0.rating = "down" }
            dislikedAnswer = b
            return
        }
        Task { await rate(bubble, rating) }
    }

    /// Only the answer's id, the thumb and the reason go to the server, never
    /// the text. `before`: the thumb to go back to when saving fails.
    private func rate(_ bubble: UUID, _ rating: String?, reason: String? = nil, before: String?? = nil) async {
        guard let b = messages.first(where: { $0.id == bubble }) else { return }
        let before = before ?? b.rating
        edit(bubble) { $0.rating = rating }
        guard !model.demo, let serverId = b.serverId else { return }
        do {
            try await model.api.rateAnswer(messageId: serverId, rating: rating, reason: reason)
        } catch {
            edit(bubble) { $0.rating = before }
            self.error = error.localizedDescription
        }
    }

    /// "Otevřít plán" under a started plan: the chat closes on the plan in Training.
    private func openPlan() {
        dismiss()
        model.open(.trainingPlan)
    }

    /// The demo's answer, written out a few words at a time as the server's would be.
    private func demoAnswer(_ text: String) async {
        input = ""
        messages.append(Bubble(mine: true, text: text))
        let reply = Bubble(mine: false, text: "")
        messages.append(reply)
        sending = true
        let asked = Date()
        askedAt = asked
        // The server's steps, as a real question shows them.
        progress = L10n.tr("Kouč čte tvoje data…")
        defer { sending = false; progress = nil }
        try? await Task.sleep(for: .seconds(0.7))
        progress = L10n.tr("Kouč píše…")
        try? await Task.sleep(for: .seconds(0.5))
        let words = DemoData.coachAnswer(text).split(separator: " ")
        for i in words.indices {
            try? await Task.sleep(for: .milliseconds(60))
            edit(reply.id) { $0.text = words[...i].joined(separator: " ") }
        }
        edit(reply.id) { $0.answeredIn = max(1, Int(Date().timeIntervalSince(asked).rounded())) }
    }

    private func edit(_ id: UUID, _ change: (inout Bubble) -> Void) {
        guard let i = messages.firstIndex(where: { $0.id == id }) else { return }
        change(&messages[i])
    }

    private func decide(_ action: CoachAction, confirm: Bool, in bubble: UUID) async {
        guard let draftId = action.draftId, !deciding.contains(draftId) else { return }
        deciding.insert(draftId)
        defer { deciding.remove(draftId) }
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

    /// Kratší, Delší, Lehčí, Těžší, Jiný den or Vrátit on a workout card: the
    /// server changes it by rules, no AI and no message counted.
    private func adjust(_ action: CoachAction, chip: String, date: String?, in bubble: UUID) async {
        guard let draftId = action.draftId, messages.first(where: { $0.id == bubble })?.adjusting[draftId] == nil else { return }
        edit(bubble) { $0.failed[draftId] = nil; $0.adjusting[draftId] = chip }
        do {
            let answer = try await model.api.adjustCoachAction(draftId: draftId, chip: chip, date: date)
            edit(bubble) { b in
                b.adjusting[draftId] = nil
                if let i = b.actions.firstIndex(where: { $0.draftId == draftId }) { b.actions[i] = answer.action }
                if let saved = answer.memory?.saved { b.memory.append(CoachMemoryChip(kind: .saved, text: saved, showsText: true)) }
            }
        } catch {
            edit(bubble) { $0.adjusting[draftId] = nil; $0.failed[draftId] = error.localizedDescription }
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
            // The sport is suggested again (Sporty k navrhování).
            case .sportOff: try await model.api.setSportSuggested(chip.text, true); await model.refreshTraining(); await model.reloadToday()
            }
            edit(bubble) { b in
                if let i = b.memory.firstIndex(where: { $0.id == chip.id }) { b.memory[i].undone = true }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// "Zapomenout" or "Přepsat" under an answer changes the memory as the coach
    /// proposed and leaves the usual line with "Zpět"; "Nechat" keeps it as it is.
    private func decide(_ chip: CoachMemoryChip, _ yes: Bool, in bubble: UUID) async {
        do {
            if yes {
                switch chip.kind {
                // A pain the athlete says has passed stays under Past.
                case .forgotten: try await model.api.forgetMemory(chip.text, toPast: true)
                case .updated: try await model.api.editMemory(from: chip.from ?? chip.text, to: chip.text)
                case .saved: try await model.api.addMemory(chip.text)
                case .sportOff: break
                }
            }
            edit(bubble) { b in
                if let i = b.memory.firstIndex(where: { $0.id == chip.id }) { b.memory[i].proposed = false; b.memory[i].kept = !yes }
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

    /// What the open conversation is about: nil for one opened from the panel.
    private var current: CoachSubject? { aboutSubject ? subject : nil }

    private func newChat() {
        leaveGhost()
        messages = []
        chatId = nil
        error = nil
        unfinished = nil
        aboutSubject = true
        // A new conversation gets no extra messages.
        usedUp = allowance?.usedUp == true
    }

    /// The server keeps a one-line "[Návrhy: …]" with each answer, so later
    /// turns know what was proposed; a reopened chat shows the answer only.
    static func withoutProposalNote(_ text: String) -> String {
        text.replacingOccurrences(of: #"\s*\[(?:Návrhy|Proposals): [^\]]*\]\s*$"#, with: "", options: .regularExpression)
    }

    /// The server keeps "[Fotka] " where a photo was sent; the photo itself is not kept.
    static func withoutPhotoMark(_ text: String) -> (text: String, marked: Bool) {
        for mark in ["[Fotka] ", "[Photo] "] where text.hasPrefix(mark) { return (String(text.dropFirst(mark.count)), true) }
        return (text, false)
    }

    private func open(_ id: Int, at message: Int? = nil) async {
        do {
            unfinished = nil
            let chat = try await model.api.chat(id: id)
            // The bubbles follow the chat's messages one to one (show), so the found one is at its index.
            let index = message.flatMap { m in chat.messages.firstIndex { $0.serverId == m } }
            found = nil
            show(chat)
            guard let index, messages.indices.contains(index) else { return }
            let bubble = messages[index].id
            found = bubble
            try? await Task.sleep(for: .seconds(2.5))
            if found == bubble { withAnimation(.easeOut(duration: 0.4)) { found = nil } }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func show(_ chat: ChatDetail) {
        chatId = chat.id
        if aboutSubject { keepChat(chat.id) }
        usedUp = allowance?.usedUp == true
        // The proposals stay under the answer they came with, decided or still open.
        let actions = chat.actions ?? []
        messages = chat.messages.map { m in
            guard m.role == "user" else {
                var bubble = Bubble(mine: false, text: Self.withoutProposalNote(m.content), serverId: m.serverId,
                                    at: ChatsPanel.date(m.createdAt), rating: m.rating)
                if let id = m.serverId {
                    bubble.actions = actions.filter { $0.messageId == id }
                    for a in bubble.actions {
                        guard let draft = a.draftId, let state = a.draftStatus, state != "draft" else { continue }
                        bubble.decided[draft] = state == "confirmed" ? L10n.tr("Potvrzeno.") : state == "rejected" ? L10n.tr("Zamítnuto.") : L10n.tr("Návrh už neplatí.")
                    }
                }
                return bubble
            }
            let photo = Self.withoutPhotoMark(m.content)
            return Bubble(mine: true, text: photo.text, photoMark: photo.marked)
        }
    }
}

struct BubbleView: View {
    let bubble: CoachView.Bubble
    /// The last answer: copy, the thumbs and its time under it. Older answers have them on a long press.
    var last = false
    /// "up", "down" or nil (taken back); nil when the answer can't be rated.
    var rate: ((String?) -> Void)? = nil
    var decide: (CoachAction, Bool) -> Void
    var undoMemory: (CoachMemoryChip) -> Void = { _ in }
    var decideMemory: (CoachMemoryChip, Bool) -> Void = { _, _ in }
    var undoAction: (CoachAction) -> Void = { _ in }
    var adjust: (CoachAction, String, String?) -> Void = { _, _, _ in }
    var logFood: ([(product: FoodProduct, amount: Double, meal: String)]?, String) -> Void = { _, _ in }
    var openPlan: () -> Void = {}
    /// On the line about the week's messages: "Získat další" opens the packs.
    var more: (() -> Void)? = nil
    /// The message a chat search opened: ringed for a moment.
    var found = false
    /// The messages are long text: they follow the iPhone's text size past the
    /// screens' cap, the cards around them stay capped (audit 20.b1).
    @Environment(\.fullTypeSize) private var fullTypeSize
    @Environment(\.dynamicTypeSize) private var typeSize

    private var messageTypeSize: DynamicTypeSize { max(fullTypeSize ?? typeSize, typeSize) }

    @ViewBuilder private var foundRing: some View {
        if found {
            RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.amberBar, lineWidth: 2.5)
                .padding(-3)
                .transition(.opacity)
                .allowsHitTesting(false)
        }
    }

    var body: some View {
        VStack(alignment: bubble.mine ? .trailing : .leading, spacing: 8) {
            if !bubble.mine, !bubble.note {
                if !bubble.steps.isEmpty { CoachSteps(steps: bubble.steps, answeredIn: bubble.answeredIn) }
                else if let seconds = bubble.answeredIn { CoachAnsweredIn(seconds: seconds) }
            }
            if let photo = bubble.photo {
                Image(uiImage: photo).resizable().scaledToFill()
                    .frame(width: 210, height: 210)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .accessibilityLabel(L10n.tr("Fotka"))
            } else if bubble.photoMark {
                Label(L10n.tr("Fotka"), systemImage: "photo")
                    .font(Typo.caption).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Palette.card, in: Capsule())
            }
            if bubble.note {
                HStack(spacing: 6) {
                    Text(bubble.text).font(Typo.caption).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                    if let more {
                        Button("Získat další", action: more).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.green)
                    }
                }
                .frame(maxWidth: .infinity)
            } else if !bubble.text.isEmpty {
                if bubble.mine {
                    Text(bubble.text)
                        .font(.body)
                        .dynamicTypeSize(messageTypeSize)
                        .foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Palette.button, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay { foundRing }
                        .textSelection(.enabled)
                } else {
                    CoachMarkdown(text: bubble.text)
                        .equatable()
                        .dynamicTypeSize(messageTypeSize)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .cardSurface(cornerRadius: 18)
                        .overlay { foundRing }
                        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .contextMenu { AnswerActions.menu(text: bubble.text, rating: bubble.rating, rate: rate) }
                }
            }
            ForEach(bubble.visuals, id: \.self) { kind in
                CoachVisual(kind: kind)
            }
            ForEach(bubble.memory) { chip in
                if chip.proposed {
                    MemoryProposalCard(chip: chip) { decideMemory(chip, $0) }
                } else {
                    MemoryChipView(chip: chip) { undoMemory(chip) }
                }
            }
            ForEach(bubble.actions) { action in
                ActionCard(action: action, result: action.draftId.flatMap { bubble.decided[$0] },
                           failure: action.draftId.flatMap { bubble.failed[$0] },
                           canUndo: action.draftId.map { bubble.undo[$0] != nil } ?? false,
                           adjusting: action.draftId.flatMap { bubble.adjusting[$0] },
                           decide: { decide(action, $0) }, undo: { undoAction(action) },
                           adjust: { adjust(action, $0, $1) }, openPlan: openPlan)
            }
            if let food = bubble.food {
                FoodDraftCard(draft: food, logged: bubble.logged, ok: bubble.loggedOK, log: logFood)
            }
            // Under everything the answer brought (cards, memory lines), as at Bevel.
            if last, !bubble.mine, !bubble.note, !bubble.text.isEmpty {
                AnswerActions(text: bubble.text, rating: bubble.rating, at: bubble.at, rate: rate)
            }
        }
        .frame(maxWidth: .infinity, alignment: bubble.mine ? .trailing : .leading)
        .padding(bubble.mine ? .leading : .trailing, bubble.note ? 0 : 40)
    }
}

/// A proposed change with "Potvrdit" and "Ne"; a workout also with Kratší,
/// Delší, Lehčí, Těžší and Jiný den under them.
struct ActionCard: View {
    let action: CoachAction
    let result: String?
    var failure: String? = nil
    var canUndo = false
    /// The quick change on its way, the chip greys out the others meanwhile.
    var adjusting: String? = nil
    var decide: (Bool) -> Void
    var undo: () -> Void = {}
    var adjust: (String, String?) -> Void = { _, _ in }
    var openPlan: () -> Void = {}
    @State private var pickingDay = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let preview = action.preview, action.type == "workout", preview.workout != nil || preview.plan != nil {
                WorkoutPreviewBlock(action: action, preview: preview)
            } else if action.type == "plan" {
                PlanProposalBlock(action: action, decided: result != nil)
            } else {
                Label(action.title, systemImage: "wand.and.stars").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
            }
            if let detail = action.detail, !detail.isEmpty {
                Text(detail).font(Typo.caption).foregroundStyle(Palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
            if let reason = action.reason, action.type != "plan" { Text(reason).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
            if result == nil, let change = action.quickChange {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark").font(.caption.weight(.bold))
                    Text(verbatim: change).font(Typo.caption.weight(.medium))
                    Text("·")
                    Button { adjust("undo", nil) } label: { Text("Vrátit").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted) }
                        .buttonStyle(.plain)
                }
                .foregroundStyle(Palette.green)
                .disabled(adjusting != nil)
            }
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
                if action.type == "plan", failure == nil {
                    Button(action: openPlan) {
                        HStack(spacing: 4) {
                            Text("Otevřít plán")
                            Image(systemName: "chevron.right").font(.caption2.weight(.bold))
                        }
                        .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                    }
                    .buttonStyle(.plain)
                }
            } else if action.draftId != nil {
                HStack(spacing: 8) {
                    Button { decide(true) } label: {
                        Text("Potvrdit").font(.footnote.weight(.semibold)).foregroundStyle(Palette.onButton)
                            .padding(.horizontal, 16).frame(height: 34).background(Palette.button, in: Capsule())
                    }
                    Button { decide(false) } label: {
                        Text("Ne").font(.footnote.weight(.semibold)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 16).frame(height: 34).overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                    }
                }
                .buttonStyle(.plain)
                .disabled(adjusting != nil)
                if let quick = action.quick { quickChoices(quick) }
                if adjusting != nil { CoachThinkingLine(text: L10n.tr("Kouč upravuje trénink…")).padding(.top, 2) }
                if let failure {
                    Text(failure).font(Typo.caption).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// Kratší · Delší · Lehčí · Těžší, then Jiný den with the days ahead; a
    /// choice that doesn't fit the day is grey.
    @ViewBuilder private func quickChoices(_ quick: CoachAction.Quick) -> some View {
        HStack(spacing: 6) {
            chip("shorter", "Kratší", quick.shorter)
            chip("longer", "Delší", quick.longer)
            chip("easier", "Lehčí", quick.easier)
            chip("harder", "Těžší", quick.harder)
        }
        chip("day", "Jiný den", quick.day, on: pickingDay) { pickingDay.toggle() }
        if pickingDay {
            ScrollView(.horizontal) {
                HStack(spacing: 5) {
                    ForEach(quick.days, id: \.self) { day in
                        Button {
                            pickingDay = false
                            adjust("day", day.date)
                        } label: {
                            VStack(spacing: 1) {
                                Text(verbatim: Fmt.weekdayShort(day.date)).font(Typo.caption.weight(.medium))
                                Text(verbatim: Fmt.dayMonth(day.date)).scaledFont(10.5, cap: .denseCap).foregroundStyle(day.fits ? Palette.muted : Palette.ink.opacity(0.25))
                            }
                            .foregroundStyle(day.fits ? Palette.ink : Palette.ink.opacity(0.3))
                            .frame(width: 52, height: 44)
                            .background(day.fits ? Palette.card : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Palette.ink.opacity(0.1), lineWidth: 1) }
                        }
                        .buttonStyle(.plain)
                        .disabled(!day.fits || adjusting != nil)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private func chip(_ id: String, _ title: String, _ enabled: Bool, on: Bool = false, action: (() -> Void)? = nil) -> some View {
        Button { if let action { action() } else { adjust(id, nil) } } label: {
            HStack(spacing: 5) {
                if adjusting == id { ProgressView().controlSize(.mini) }
                Text(L10n.tr(title)).font(.footnote.weight(.medium))
            }
            .foregroundStyle(on ? Palette.onButton : enabled ? Palette.ink : Palette.ink.opacity(0.3))
            .padding(.horizontal, 12).frame(height: 30)
            .background(on ? Palette.button : enabled ? Palette.card : Color.clear, in: Capsule())
            .overlay { Capsule().stroke(on ? Color.clear : Palette.ink.opacity(0.1), lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .disabled(!enabled || adjusting != nil)
    }
}

/// The plan the coach proposes: its name, the weeks as bars, the race or the
/// start, the length, the sessions and time a week, the days, and the running
/// plan it would end (mockups/kouc-plan).
struct PlanProposalBlock: View {
    let action: CoachAction
    var decided = false

    private var dayNames: [String] { Fmt.weekdaysFromMonday.map { L10n.isEnglish ? $0 : $0.lowercased(with: Fmt.locale) } }

    var body: some View {
        let card = action.trainingPlan
        VStack(alignment: .leading, spacing: 8) {
            Label(L10n.tr("Tréninkový plán"), systemImage: "calendar").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
            Text(verbatim: action.planName ?? "").font(Typo.sentence(22)).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            if let weeks = card?.weeks, !weeks.isEmpty {
                PlanWeeksChart(bars: weeks.map { PlanWeeksChart.Bar(week: $0.week, phase: $0.race == true ? "race" : $0.phase, value: Double(max($0.minutes, 1)), minutes: $0.minutes, done: nil) }, compact: true)
            }
            VStack(spacing: 0) {
                ForEach(rows, id: \.0) { row in
                    HStack {
                        Text(verbatim: row.0).foregroundStyle(Palette.secondary)
                        Spacer(minLength: 8)
                        Text(verbatim: row.1).foregroundStyle(Palette.ink).fontWeight(.medium).monospacedDigit()
                    }
                    .font(Typo.caption)
                    .padding(.vertical, 7)
                    .overlay(alignment: .top) { Rectangle().fill(Palette.ink.opacity(0.1)).frame(height: 1) }
                }
            }
            if let days = card?.days, !days.isEmpty {
                HStack(spacing: 5) {
                    ForEach(0..<7, id: \.self) { i in
                        let on = days.contains(i)
                        Text(verbatim: dayNames[i])
                            .font(.caption.weight(.medium))
                            .foregroundStyle(on ? Palette.onButton : Palette.faint)
                            .frame(width: 30, height: 26)
                            .background(on ? Palette.button : Palette.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(days.map { dayNames[$0] }.joined(separator: ", "))
            }
            if !decided, let old = card?.replaces {
                Label(L10n.f("Ukončí plán %@", old.name) + (old.started == true ? (old.week.map { w in " (\(w)/\(old.weeksCount ?? w))" } ?? "") : ""), systemImage: "exclamationmark.triangle")
                    .font(Typo.caption.weight(.medium)).foregroundStyle(Palette.amber)
                    .padding(.horizontal, 10).padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.amber.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }

    /// "Závod: ne 21. 3. · 21,1 km", "Délka: 12 týdnů od 28. 12.", "Týdně: 4 běhy · 3–6 h".
    private var rows: [(String, String)] {
        var out: [(String, String)] = []
        let day = { (d: String) in Fmt.weekdayShort(d) + " " + Fmt.dayMonth(d) }
        let weeks = action.weeksCount ?? action.trainingPlan?.weeks.count ?? 0
        let length = L10n.plural("%lld týdnů", weeks)
        if let race = action.raceDate {
            out.append((L10n.tr("Závod"), day(race) + (action.raceKm.map { " · " + raceDistance($0) } ?? "")))
            out.append((L10n.tr("Délka"), action.startDate.map { L10n.plural("%lld týdnů od %@", weeks, Fmt.dayMonth(action.firstDay ?? $0)) } ?? length))
        } else {
            if let start = action.firstDay ?? action.startDate { out.append((L10n.tr("Začátek"), day(start))) }
            out.append((L10n.tr("Délka"), length))
        }
        if let card = action.trainingPlan, let n = card.sessions, n > 0 {
            var text: String = switch action.sport {
            case "run": L10n.plural("%lld běhů", n)
            case "ride": L10n.plural("%lld jízd", n)
            default: L10n.plural("%lld tréninků", n)
            }
            if let m = card.minutes, let lo = m.first, let hi = m.last, hi > 0 {
                let h = { (x: Int) in String(format: "%.0f", (Double(x) / 60).rounded()) }
                text += " · " + (h(lo) == h(hi) ? h(hi) : h(lo) + "–" + h(hi)) + " h"
            }
            out.append((L10n.tr("Týdně"), text))
        }
        return out
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
                if action.openWater == true {
                    Text("Nikdy neplav sám, výrazná čepice a bójka.").font(Typo.caption).foregroundStyle(Palette.amber)
                }
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
    /// A swim: "45 min · 1 900 m · 1:48 /100 m" in the pool, "1 h · ≈ 2 000 m · by time outside" in open water.
    private func numbers(_ w: LibraryWorkout) -> String {
        var parts: [String] = []
        if let m = w.duration_minutes ?? action.minutes, m > 0 { parts.append(Fmt.duration(Int(m.rounded()))) }
        if action.sport == "swim" {
            let open = action.openWater == true
            if let meters = w.distance_meters, meters > 0 { parts.append((open ? "≈ " : "") + Fmt.int(meters) + " m") }
            if open { parts.append(L10n.tr("venku podle času")) }
            else if let top = WorkoutProfile.segments(w.steps ?? []).filter({ $0.step.rest != true }).max(by: { $0.percent < $1.percent })?.step,
                    let slow = top.paceSlow, let fast = top.paceFast {
                parts.append(ZonesSettingsView.pace((slow + fast) / 2) + " /100 m")
            }
            return parts.joined(separator: " · ")
        }
        if let tss = w.target_load, tss > 0 { parts.append("\(Int(tss.rounded())) TSS") }
        if (action.sport ?? "ride") == "ride", let top = WorkoutProfile.segments(w.steps ?? []).max(by: { $0.percent < $1.percent })?.step,
           let hi = top.percentHigh ?? top.percentLow {
            let lo = top.percentLow ?? hi
            parts.append((lo == hi ? "\(Int(hi))" : "\(Int(lo))–\(Int(hi))") + " % FTP")
        }
        return parts.joined(separator: " · ")
    }
}

/// ☰ in the coach: every conversation by the day it was last written in,
/// a new one on top and what the coach remembers at the bottom. A word in the
/// search field lists the chats it was written in instead.
struct ChatsPanel: View {
    @Environment(AppModel.self) private var model
    /// The conversation on screen, marked in the list.
    var current: Int?
    var close: () -> Void
    var newChat: () -> Void
    /// The chat, and with a search result the message to show.
    var open: (Int, Int?) -> Void
    var memory: () -> Void
    @State private var chats: [ChatSummary] = []
    @State private var loading = true
    @State private var query = ""
    /// nil while nothing is searched (fewer than 2 letters) or the search is on its way.
    @State private var results: [ChatSearchResult]?

    private var searchText: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Color.black.opacity(0.35).ignoresSafeArea()
                    .onTapGesture(perform: close)
                    .accessibilityLabel(L10n.tr("Zavřít"))
                    .accessibilityAddTraits(.isButton)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Konverzace").font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 18).padding(.top, 18)
                    if !chats.isEmpty || !query.isEmpty { searchField }
                    Button { newChat(); close() } label: {
                        Label("Nová konverzace", systemImage: "square.and.pencil")
                            .font(Typo.bodyStrong).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 14).frame(height: 46)
                            .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 12).padding(.top, 14)
                    List {
                        if searchText.count >= 2 {
                            found
                        } else {
                            ForEach(Self.days(chats)) { group in
                                Section {
                                    ForEach(group.chats) { chat in row(chat) }
                                        .onDelete { offsets in
                                            let ids = offsets.map { group.chats[$0].id }
                                            chats.removeAll { ids.contains($0.id) }
                                            Task { for id in ids { try? await model.api.deleteChat(id: id) } }
                                        }
                                } header: {
                                    SectionLabel(text: Self.title(group.day))
                                }
                            }
                            if !loading && chats.isEmpty {
                                Text("Zatím žádné konverzace.").font(Typo.small).foregroundStyle(Palette.muted)
                                    .listRowBackground(Color.clear)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollDismissesKeyboard(.immediately)
                    .scrollContentBackground(.hidden)
                    Divider().overlay(Palette.ink.opacity(0.08))
                    Button { close(); memory() } label: {
                        Label("Co si kouč pamatuje", systemImage: "sparkles")
                            .font(Typo.body).foregroundStyle(Palette.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).frame(height: 52)
                    }
                    .buttonStyle(.plain)
                }
                .frame(width: min(320, geo.size.width * 0.82))
                .frame(maxHeight: .infinity)
                .background { Palette.background.ignoresSafeArea() }
                .shadow(color: .black.opacity(0.25), radius: 20, x: 6)
            }
        }
        .task {
            defer { loading = false }
            guard !model.demo else { return }
            chats = (try? await model.api.chats()) ?? []
        }
        // Searched once the typing stops for a moment, so not every letter reads the chats.
        .task(id: searchText) {
            results = nil
            let text = searchText
            guard text.count >= 2, !model.demo else { return }
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled, let found = try? await model.api.searchChats(text), !Task.isCancelled else { return }
            results = found
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
            TextField("Hledat v konverzacích", text: $query)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !query.isEmpty {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint) }
                    .accessibilityLabel("Smazat hledání")
            }
        }
        .font(Typo.body)
        .padding(.horizontal, 12).frame(height: 40)
        .background(Palette.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 12).padding(.top, 14)
    }

    /// The chats with the word: the title, the day and the sentence it is in.
    @ViewBuilder private var found: some View {
        if let results {
            Section {
                ForEach(results) { result in
                    Button { open(result.chatId, result.messageId); close() } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text(result.title ?? L10n.tr("Konverzace")).font(Typo.bodyStrong).foregroundStyle(Palette.ink).lineLimit(1)
                                Spacer(minLength: 0)
                                if let date = Self.date(result.createdAt) {
                                    Text(Self.title(AppModel.localDate(date))).font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                            }
                            (Text(L10n.tr(result.role == "user" ? "Ty" : "Kouč") + ": ").foregroundColor(Palette.muted)
                                + Text(Self.marked(result.snippet, searchText)).foregroundColor(Palette.secondary))
                                .font(Typo.small).lineLimit(2)
                        }
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                }
                if results.isEmpty {
                    Text("Nic jsme nenašli.").font(Typo.small).foregroundStyle(Palette.muted)
                        .listRowBackground(Color.clear)
                }
            } header: {
                if !results.isEmpty { SectionLabel(text: L10n.plural("%lld konverzací", results.count)) }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
        }
    }

    /// The searched word marked wherever it is in the text, whatever its case and accents.
    static func marked(_ text: String, _ word: String) -> AttributedString {
        var out = AttributedString(text)
        guard !word.isEmpty else { return out }
        var from = text.startIndex
        while let range = text.range(of: word, options: [.caseInsensitive, .diacriticInsensitive], range: from..<text.endIndex) {
            if let marked = Range(range, in: out) {
                // The SwiftUI keys by name: UIKit has attributes of the same names.
                out[marked][AttributeScopes.SwiftUIAttributes.BackgroundColorAttribute.self] = Palette.amberSoft
                out[marked][AttributeScopes.SwiftUIAttributes.ForegroundColorAttribute.self] = Palette.ink
            }
            from = range.upperBound
        }
        return out
    }

    private func row(_ chat: ChatSummary) -> some View {
        Button { open(chat.id, nil); close() } label: {
            HStack(spacing: 10) {
                Text(chat.title ?? L10n.tr("Konverzace")).font(Typo.body).foregroundStyle(Palette.ink).lineLimit(1)
                Spacer(minLength: 0)
                if let date = Self.date(chat.updatedAt) {
                    Text(ClockText.format(date)).font(Typo.caption).foregroundStyle(Palette.muted)
                }
            }
        }
        .buttonStyle(.plain)
        .listRowBackground(chat.id == current ? Palette.card : Color.clear)
    }

    /// The server's "2026-10-28 18:32:10" is UTC.
    static func date(_ text: String?) -> Date? {
        guard let text else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.date(from: text)
    }

    /// The chats by the phone's day they were last written in, newest first (the server's order).
    struct Day: Identifiable {
        let day: String
        var chats: [ChatSummary]
        var id: String { day }
    }

    static func days(_ chats: [ChatSummary]) -> [Day] {
        var out: [Day] = []
        for chat in chats {
            let day = date(chat.updatedAt).map { AppModel.localDate($0) } ?? ""
            if let i = out.firstIndex(where: { $0.day == day }) { out[i].chats.append(chat) } else { out.append(Day(day: day, chats: [chat])) }
        }
        return out
    }

    /// "Dnes", "Včera" or "Po 26. října".
    static func title(_ day: String) -> String {
        let today = AppModel.localDate(Date())
        if day == today { return "Dnes" }
        if day == AppModel.shift(today, by: -1) { return "Včera" }
        guard !day.isEmpty else { return "Konverzace" }
        return Fmt.capitalized(Fmt.weekdayShort(day)) + " " + Fmt.dayMonth(day)
    }
}

/// The coach's bubble while he prepares an answer: the dots, what he is doing
/// ("Kouč čte tvoje data…", then the server's next steps) and, from 3 s, the
/// seconds, so a long wait never looks stuck.
struct CoachThinking: View {
    let text: String
    /// When the wait began; nil: when the bubble appeared.
    var since: Date? = nil

    var body: some View {
        CoachWaitRow(text: text, since: since)
            .padding(.horizontal, 16).padding(.vertical, 14)
            .cardSurface(cornerRadius: 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 40)
    }
}

/// The same inside a card that has its own background (or under an answer
/// still being finished): the row, no bubble.
struct CoachThinkingLine: View {
    let text: String
    var since: Date? = nil

    var body: some View {
        CoachWaitRow(text: text, since: since)
    }
}

/// One row wherever the app waits for AI: the dots, the step and "· 4 s" from
/// 3 s. VoiceOver reads the step only, not the seconds.
struct CoachWaitRow: View {
    let text: String
    var since: Date? = nil
    @State private var appeared = Date()

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            CoachDots(size: 6, spacing: 4)
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let seconds = Int(context.date.timeIntervalSince(since ?? appeared))
                (Text(verbatim: text).foregroundColor(Palette.muted)
                    + Text(verbatim: seconds >= 3 ? " · " + L10n.f("%lld s", seconds) : "").foregroundColor(Palette.faint))
                    .font(Typo.small)
                    .contentTransition(.opacity)
                    .animation(.easeInOut(duration: 0.25), value: text)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// "Answered in 8 s" above an answer given while the chat was open: the whole
/// wait, most of it reading the data, so not "Thought for".
struct CoachAnsweredIn: View {
    let seconds: Int

    var body: some View {
        Text(verbatim: L10n.f("Odpověď za %lld s", seconds))
            .font(Typo.caption).foregroundStyle(Palette.faint)
            .padding(.leading, 4)
    }
}

/// Dots that light up one after another (every AI wait, the welcome's demo);
/// still with Reduce Motion and in Low Power Mode.
struct CoachDots: View {
    var count = 3
    var size: CGFloat = 7
    var spacing: CGFloat = 5
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let still = reduceMotion || LowPower.shared.on
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: still)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: spacing) {
                ForEach(0..<count, id: \.self) { i in
                    Circle().fill(Palette.ink)
                        .frame(width: size, height: size)
                        .opacity(still ? 0.55 : opacity(t, i))
                }
            }
        }
        .accessibilityHidden(true)
    }

    /// Each dot brightens in turn, once a second.
    private func opacity(_ t: TimeInterval, _ i: Int) -> Double {
        let phase = (t - Double(i) * 0.18).truncatingRemainder(dividingBy: 1.0)
        return 0.25 + 0.75 * max(0, sin(phase * .pi))
    }
}

/// The temporary chat's sign: a small ghost, outlined, or filled while it is on.
struct GhostGlyph: View {
    var filled: Bool

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                if filled {
                    GhostShape().fill(Palette.ink)
                    eyes(w, h).fill(Palette.background)
                } else {
                    GhostShape().stroke(Palette.ink, style: StrokeStyle(lineWidth: max(1.5, w * 0.11), lineJoin: .round))
                    eyes(w, h).fill(Palette.ink)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func eyes(_ w: CGFloat, _ h: CGFloat) -> Path {
        let r = w * 0.085
        var path = Path()
        for x: CGFloat in [0.35, 0.65] { path.addEllipse(in: CGRect(x: w * x - r, y: h * 0.42 - r, width: r * 2, height: r * 2)) }
        return path
    }
}

/// A rounded head and a wavy hem, in its frame.
struct GhostShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height, x = rect.minX, y = rect.minY
        let inset = w * 0.06, left = x + inset, right = x + w - inset, radius = (right - left) / 2
        var p = Path()
        p.move(to: CGPoint(x: left, y: y + h * 0.94))
        p.addLine(to: CGPoint(x: left, y: y + inset + radius))
        p.addArc(center: CGPoint(x: left + radius, y: y + inset + radius), radius: radius, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: right, y: y + h * 0.94))
        // Three waves back along the hem.
        let step = (right - left) / 3
        for i in 0..<3 {
            let from = right - step * CGFloat(i)
            p.addQuadCurve(to: CGPoint(x: from - step, y: y + h * 0.94), control: CGPoint(x: from - step / 2, y: y + h * 0.80))
        }
        p.closeSubpath()
        return p
    }
}
