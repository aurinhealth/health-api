import SwiftUI

enum AppTab: Hashable {
    case today, training, food, health
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var showAdd = false
    @State private var showSettings = false
    @State private var showCoach = false
    @State private var showSyncStatus = false
    /// Scrolled down: the tab bar is only the open section's icon and "+".
    @State private var compactBar = false
    @State private var tabTaps = 0
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        if model.updateRequired {
            UpdateRequiredView()
        } else {
            screens
        }
    }

    /// The tabs, the tab bar and the sheets grow with the text size up to a cap.
    private static let textSizes: PartialRangeThrough<DynamicTypeSize> = ...DynamicTypeSize.screenCap

    @ViewBuilder private var screens: some View {
        switch model.phase {
        case .signedOut:
            LoginView().dynamicTypeSize(Self.textSizes)
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
                .dynamicTypeSize(Self.textSizes)
                .environment(\.scrollReport, { (offset: CGFloat) in
                    let compact = offset > 60
                    if compact != compactBar { withAnimation(.snappy) { compactBar = compact } }
                })
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
                // A done activity sent to the apps from Synchronizace (SyncViews.swift).
                if let report = model.syncReport, !showSyncStatus {
                    SyncToastView(report: report) { showSyncStatus = true }
                        .padding(.horizontal, 16)
                        .padding(.bottom, model.immersive ? 16 : 88)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .zIndex(1)
                }
                if !model.immersive {
                    TabBar(tab: Binding(get: { model.tab }, set: { select($0) }), compact: compactBar,
                           onExpand: { withAnimation(.snappy) { compactBar = false } }, onAdd: { showAdd = true })
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                        .dynamicTypeSize(Self.textSizes)
                        .sensoryFeedback(.impact(weight: .light), trigger: tabTaps)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .sheet(isPresented: $showAdd) {
                AddSheet(openCoach: {
                    showAdd = false
                    // One sheet at a time: the coach opens once "+" has closed.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { showCoach = true }
                })
                .dynamicTypeSize(Self.textSizes)
            }
            .sheet(isPresented: $showSettings) { SettingsView().dynamicTypeSize(Self.textSizes) }
            .sheet(isPresented: $showCoach) { CoachView().dynamicTypeSize(Self.textSizes) }
            .sheet(isPresented: $showSyncStatus, onDismiss: { model.syncReport = nil }) { SyncStatusSheet().dynamicTypeSize(Self.textSizes) }
            .animation(.snappy, value: model.syncReport?.id)
            // The toast goes away on its own unless its sheet is open.
            .task(id: model.syncReport?.id) {
                guard let shown = model.syncReport?.id else { return }
                try? await Task.sleep(for: .seconds(7))
                if !showSyncStatus && model.syncReport?.id == shown { model.syncReport = nil }
            }
            // After the first e-mail sign-in: a passkey for next time, then the setup.
            .sheet(isPresented: Binding(get: { model.passkeyOffer }, set: { model.passkeyOffer = $0 })) { PasskeyOfferSheet().dynamicTypeSize(Self.textSizes) }
            .fullScreenCover(isPresented: Binding(get: { model.needsSetup && !model.passkeyOffer }, set: { model.needsSetup = $0 })) { SetupFlowView().dynamicTypeSize(Self.textSizes) }
            .task {
                if !model.demo { AppleHealth.shared.start(api: model.api) }
                await model.checkSetup(); await model.loadAccountInitial()
            }
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
        withAnimation(.snappy) { compactBar = false }
        if model.tab == tab { model.paths[tab] = [] } else { tabTaps += 1 }
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

/// The floating pill at the bottom with the "+" in the middle. Scrolled down
/// it shrinks to the open section's icon on the left and "+" on the right;
/// a tap on the icon brings the whole bar back.
struct TabBar: View {
    @Binding var tab: AppTab
    var compact: Bool = false
    var onExpand: () -> Void = {}
    var onAdd: () -> Void

    var body: some View {
        if compact {
            HStack {
                Button(action: onExpand) {
                    Image(systemName: Self.symbol(tab))
                        .font(.system(size: 20, weight: .regular))
                        .foregroundStyle(Palette.ink)
                        .frame(width: 52, height: 52)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .chromeGlass(in: Circle())
                .shadow(color: .black.opacity(0.1), radius: 12, y: 6)
                .accessibilityLabel(L10n.tr("Rozbalit menu"))
                Spacer()
                plus(size: 52)
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 6)
            }
            .transition(.opacity)
        } else {
            HStack(spacing: 0) {
                item(.today, "Dnes")
                item(.training, "Trénink")
                plus(size: 44).frame(maxWidth: .infinity)
                item(.food, "Jídlo")
                item(.health, "Zdraví")
            }
            .frame(height: 60)
            .chromeGlass(in: Capsule())
            .shadow(color: .black.opacity(0.1), radius: 15, y: 10)
            .transition(.opacity)
        }
    }

    static func symbol(_ tab: AppTab) -> String {
        switch tab {
        case .today: return "sun.max"
        case .training: return "waveform.path.ecg"
        case .food: return "fork.knife"
        case .health: return "heart"
        }
    }

    private func plus(size: CGFloat) -> some View {
        Button(action: onAdd) {
            Image(systemName: "plus")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(Palette.onButton)
                .frame(width: size, height: size)
                .background(Palette.button, in: Circle())
        }
        .accessibilityLabel("Přidat záznam")
    }

    private func item(_ value: AppTab, _ label: String) -> some View {
        Button { tab = value } label: {
            Image(systemName: Self.symbol(value))
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(tab == value ? Palette.ink : Palette.faint)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(L10n.tr(label))
        .accessibilityAddTraits(tab == value ? .isSelected : [])
    }
}

