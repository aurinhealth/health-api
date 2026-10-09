import SwiftUI

enum AppTab: Hashable {
    case today, training, food, health
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var showAdd = false
    @State private var showSettings = false
    @State private var showCoach = false

    var body: some View {
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
                if model.offline {
                    OfflineBanner()
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
        }
    }

    /// The tab again: back to its first screen.
    private func select(_ tab: AppTab) {
        if model.tab == tab { model.paths[tab] = [] }
        model.tab = tab
    }
}

/// "Bez připojení": the screens show what was saved on the phone.
struct OfflineBanner: View {
    var body: some View {
        Label("Bez připojení · uložená data", systemImage: "wifi.slash")
            .font(.footnote.weight(.medium))
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 14).frame(height: 32)
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(Capsule().stroke(Palette.hairline, lineWidth: 1))
            .allowsHitTesting(false)
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
        .accessibilityLabel(label)
        .accessibilityAddTraits(tab == value ? .isSelected : [])
    }
}

