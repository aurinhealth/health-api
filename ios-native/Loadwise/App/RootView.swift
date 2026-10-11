import SwiftUI

enum AppTab: Hashable {
    case today, training, food, health
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var showAdd = false
    @State private var showSettings = false
    @State private var showCoach = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        if model.updateRequired {
            UpdateRequiredView()
        } else {
            screens
        }
    }

    @ViewBuilder private var screens: some View {
        switch model.phase {
        case .signedOut:
            LoginView()
        case .signedIn:
            ZStack(alignment: .bottom) {
                Group {
                    switch model.tab {
                    case .today: TodayView(openSettings: { showSettings = true }, openCoach: { showCoach = true })
                    case .training: TrainingView()
                    case .food: FoodView()
                    case .health: HealthView()
                    }
                }
                if model.offline || !model.outbox.isEmpty || model.outboxNote != nil || model.notice != nil {
                    VStack(spacing: 6) {
                        if model.offline || !model.outbox.isEmpty {
                            OfflineBanner(offline: model.offline, waiting: model.outbox.count)
                        }
                        if let note = model.outboxNote {
                            OutboxNote(text: note) { model.outboxNote = nil }
                        }
                        if let notice = model.notice {
                            OutboxNote(text: notice) { model.notice = nil }
                        }
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 4)
                }
                if !model.immersive {
                    TabBar(tab: Binding(get: { model.tab }, set: { select($0) }), onAdd: { showAdd = true })
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .sheet(isPresented: $showAdd) {
                AddSheet(openCoach: {
                    showAdd = false
                    // One sheet at a time: the coach opens once "+" has closed.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { showCoach = true }
                })
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .sheet(isPresented: $showCoach) { CoachView() }
            .fullScreenCover(isPresented: Binding(get: { model.needsSetup }, set: { model.needsSetup = $0 })) { SetupFlowView() }
            .task { await model.checkSetup(); await model.loadAccountInitial() }
            // Back in the app: new data, and what waited for signal (and water
            // added from the widget) goes out.
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task {
                    if model.today != nil || !model.outbox.isEmpty { await model.refresh() }
                    // The open tab too, so Health or Food are not a day behind Today.
                    if model.tab != .today { await model.refreshIfStale(model.tab) }
                }
            }
        }
    }

    /// The tab again: back to its first screen.
    private func select(_ tab: AppTab) {
        if model.tab == tab { model.paths[tab] = [] }
        model.tab = tab
    }
}

/// The server no longer serves this build: data would not load or would come
/// out wrong, so the app asks for the new version instead of the screens.
struct UpdateRequiredView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.down.app")
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(Palette.ink)
            Text(L10n.tr("Je potřeba nová verze")).font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            Text(L10n.tr("Server se změnil a tahle verze aplikace už jeho data nepřečte správně. Nainstaluj novou verzi přes Sideloadly. Data zůstávají uložená na serveru."))
                .font(.subheadline)
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.background)
    }
}

/// "Bez připojení": the screens show what was saved on the phone, and how
/// many writes wait for signal (Outbox).
struct OfflineBanner: View {
    var offline = true
    var waiting = 0

    private var text: String {
        let parts = [offline ? L10n.tr("Bez připojení · uložená data") : nil, waiting > 0 ? Self.waitingText(waiting) : nil]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    static func waitingText(_ n: Int) -> String {
        if n == 1 { return L10n.f("%@ zápis čeká na signál", String(n)) }
        if (2...4).contains(n) { return L10n.f("%@ zápisy čekají na signál", String(n)) }
        return L10n.f("%@ zápisů čeká na signál", String(n))
    }

    var body: some View {
        Label(text, systemImage: offline ? "wifi.slash" : "arrow.triangle.2.circlepath")
            .font(.footnote.weight(.medium))
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 14).frame(height: 32)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
            .allowsHitTesting(false)
    }
}

/// A waiting write the server turned down; a tap puts it away.
struct OutboxNote: View {
    let text: String
    let dismiss: () -> Void

    var body: some View {
        Button(action: dismiss) {
            Label(text, systemImage: "exclamationmark.circle")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Palette.rust)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
    }
}

/// The floating pill at the bottom with the "+" in the middle.
struct TabBar: View {
    @Binding var tab: AppTab
    var onAdd: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            item(.today, "sun.max", "Dnes")
            item(.training, "waveform.path.ecg", "Trénink")
            Button(action: onAdd) {
                Image(systemName: "plus")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Palette.onButton)
                    .frame(width: 44, height: 44)
                    .background(Palette.button, in: Circle())
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Přidat záznam")
            item(.food, "fork.knife", "Jídlo")
            item(.health, "heart", "Zdraví")
        }
        .frame(height: 60)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Palette.card.opacity(0.6), in: Capsule())
        .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
        .shadow(color: .black.opacity(0.1), radius: 15, y: 10)
    }

    private func item(_ value: AppTab, _ symbol: String, _ label: String) -> some View {
        Button { tab = value } label: {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(tab == value ? Palette.ink : Palette.faint)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.tr(label))
        .accessibilityAddTraits(tab == value ? .isSelected : [])
    }
}

