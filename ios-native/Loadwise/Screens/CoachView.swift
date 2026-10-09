import SwiftUI

/// The AI coach: today's summary and what matters, then a chat. Answers stream
/// in as they are written; changes the coach proposes wait for "Potvrdit".
struct CoachView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var view = "today"
    @State private var messages: [Bubble] = []
    @State private var chatId: Int?
    @State private var input = ""
    @State private var sending = false
    @State private var progress: String?
    @State private var error: String?
    @State private var needsConsent = false
    @State private var home: CoachesSnapshot?
    @State private var showChats = false
    @FocusState private var focused: Bool

    struct Bubble: Identifiable, Equatable {
        let id = UUID()
        let mine: Bool
        var text: String
        var actions: [CoachAction] = []
        var decided: [Int: String] = [:]
        var visuals: [String] = []
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            if messages.isEmpty { welcome }
                            ForEach(messages) { bubble in
                                BubbleView(bubble: bubble, decide: { action, confirm in Task { await decide(action, confirm: confirm, in: bubble.id) } })
                                    .id(bubble.id)
                            }
                            if let progress, sending {
                                HStack(spacing: 8) { ProgressView(); Text(progress).font(Typo.caption).foregroundStyle(Palette.muted) }
                            }
                            if needsConsent { consentCard }
                            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
                            Color.clear.frame(height: 1).id("end")
                        }
                        .padding(20)
                    }
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
                    } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("Konverzace")
                }
            }
            .sheet(isPresented: $showChats) { ChatsSheet { id in Task { await open(id) } } }
        }
        .tint(Palette.ink)
        .task {
            guard !model.demo, home == nil else { return }
            home = try? await model.api.coaches(date: AppModel.localDate(Date()))
        }
    }

    // MARK: Parts

    private var welcome: some View {
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
            SectionLabel(text: "Zkus třeba").padding(.top, 6)
            ForEach(["Jak mám dnes trénovat?", "Necítím se dobře, uprav mi týden.", "Co sníst před večerním tréninkem?", "Proč mám nízkou připravenost?"], id: \.self) { q in
                Button { input = q; Task { await send() } } label: {
                    Text(q).font(.subheadline).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var consentCard: some View {
        Card {
            Text("Kouč používá AI").font(.headline)
            Text("Aby mohl odpovídat, potřebuje tvůj souhlas se zpracováním dat pomocí AI. Jde kdykoli vzít zpět v Nastavení → Soukromí a data.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Button {
                Task {
                    do {
                        try await model.api.allowAI()
                        needsConsent = false
                        error = nil
                    } catch { self.error = error.localizedDescription }
                }
            } label: {
                Text("Povolit AI").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
            }
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Napiš kouči…", text: $input, axis: .vertical)
                .lineLimit(1...5)
                .focused($focused)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(Palette.onButton)
                    .frame(width: 40, height: 40).background(Palette.button, in: Circle())
            }
            .disabled(sending || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.demo)
            .accessibilityLabel("Odeslat")
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    // MARK: Actions

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        input = ""
        error = nil
        messages.append(Bubble(mine: true, text: text))
        messages.append(Bubble(mine: false, text: ""))
        let index = messages.count - 1
        sending = true
        progress = "Kouč přemýšlí…"
        defer { sending = false; progress = nil }
        do {
            for try await event in model.api.askCoach(text, chatId: chatId, view: view) {
                switch event {
                case .progress(let p): progress = p
                case .answer(let a): messages[index].text = a
                case .done(let result):
                    if let a = result.answer { messages[index].text = a }
                    messages[index].actions = result.actions ?? []
                    messages[index].visuals = result.visuals ?? []
                    if let id = result.chatId { chatId = id }
                }
            }
            if messages[index].text.isEmpty { messages.remove(at: index) }
        } catch APIError.aiConsentRequired {
            messages.remove(at: index)
            needsConsent = true
        } catch {
            if messages[index].text.isEmpty { messages.remove(at: index) }
            self.error = error.localizedDescription
        }
    }

    private func decide(_ action: CoachAction, confirm: Bool, in bubble: UUID) async {
        guard let draftId = action.draftId, let i = messages.firstIndex(where: { $0.id == bubble }) else { return }
        do {
            let message = try await model.api.decideCoachAction(draftId: draftId, confirm: confirm)
            messages[i].decided[draftId] = message ?? (confirm ? "Hotovo." : "Zamítnuto.")
            if confirm { await model.refreshTraining(); await model.refresh() }
        } catch {
            messages[i].decided[draftId] = error.localizedDescription
        }
    }

    private func newChat() {
        messages = []
        chatId = nil
        error = nil
    }

    private func open(_ id: Int) async {
        do {
            let chat = try await model.api.chat(id: id)
            chatId = chat.id
            messages = chat.messages.map { Bubble(mine: $0.role == "user", text: $0.content) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BubbleView: View {
    let bubble: CoachView.Bubble
    var decide: (CoachAction, Bool) -> Void

    var body: some View {
        VStack(alignment: bubble.mine ? .trailing : .leading, spacing: 8) {
            if !bubble.text.isEmpty {
                if bubble.mine {
                    Text(bubble.text)
                        .font(.body)
                        .foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Palette.button, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .textSelection(.enabled)
                } else {
                    CoachMarkdown(text: bubble.text)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .textSelection(.enabled)
                }
            }
            ForEach(bubble.visuals, id: \.self) { kind in
                CoachVisual(kind: kind)
            }
            ForEach(bubble.actions) { action in
                ActionCard(action: action, result: action.draftId.flatMap { bubble.decided[$0] }, decide: { decide(action, $0) })
            }
        }
        .frame(maxWidth: .infinity, alignment: bubble.mine ? .trailing : .leading)
        .padding(bubble.mine ? .leading : .trailing, 40)
    }
}

/// A proposed change with "Potvrdit" and "Ne".
struct ActionCard: View {
    let action: CoachAction
    let result: String?
    var decide: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(action.title, systemImage: "wand.and.stars").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
            if let reason = action.reason { Text(reason).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true) }
            if let result {
                Text(result).font(Typo.caption.weight(.medium)).foregroundStyle(Palette.green)
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
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.amberSoft.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
