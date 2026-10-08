import SwiftUI

enum AppTab: Hashable {
    case today, training, food, health
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var tab: AppTab = .today
    @State private var showAdd = false
    @State private var showSettings = false

    var body: some View {
        switch model.phase {
        case .signedOut:
            LoginView()
        case .signedIn:
            ZStack(alignment: .bottom) {
                Group {
                    switch tab {
                    case .today: TodayView(openSettings: { showSettings = true })
                    case .training: ComingSoonView(title: "Trénink", glow: Palette.Glow.training, text: "Zátěž, forma, plán tréninků a závod přijdou v dalším kroku.")
                    case .food: ComingSoonView(title: "Jídlo", glow: Palette.Glow.food, text: "Jídla dne, přidávání a skener přijdou v dalším kroku.")
                    case .health: ComingSoonView(title: "Zdraví", glow: Palette.Glow.health, text: "Spánek, srdce a tělo přijdou v dalším kroku.")
                    }
                }
                TabBar(tab: $tab, onAdd: { showAdd = true })
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
            }
            .sheet(isPresented: $showAdd) { AddSheet() }
            .sheet(isPresented: $showSettings) { SettingsSheet() }
        }
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

/// Tabs that are not native yet.
struct ComingSoonView: View {
    let title: String
    let glow: Color
    let text: String

    var body: some View {
        ZStack {
            ScreenBackground(glow: glow)
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel(text: title)
                Text("Připravujeme").font(Typo.sentence(40, relativeTo: .largeTitle)).foregroundStyle(Palette.ink)
                Text(text).font(Typo.sentence(20)).foregroundStyle(Palette.secondary)
                Link(destination: URL(string: "https://petrfitnessdata.eu/app")!) {
                    Text("Otevřít webovou aplikaci")
                        .font(Typo.bodyStrong)
                        .foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 18)
                        .frame(height: 44)
                        .background(Palette.button, in: Capsule())
                }
                .padding(.top, 8)
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
        }
    }
}

struct AddSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Co přidáme?").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            Text("Přidávání jídla, vody a váhy přijde v dalším kroku. Zatím ho najdeš ve webové aplikaci.")
                .font(Typo.body).foregroundStyle(Palette.muted)
            Button("Zavřít") { dismiss() }
                .font(Typo.bodyStrong)
            Spacer()
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationBackground(Palette.background)
    }
}

struct SettingsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Nastavení").font(Typo.sentence(30, relativeTo: .title)).foregroundStyle(Palette.ink)
            if model.demo {
                Text("Prohlížíš ukázková data.").font(Typo.body).foregroundStyle(Palette.muted)
            }
            Button(model.demo ? "Ukončit ukázku" : "Odhlásit se", role: .destructive) {
                model.signOut()
                dismiss()
            }
            .font(Typo.bodyStrong)
            Spacer()
            Text("Loadwise \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
                .font(Typo.caption).foregroundStyle(Palette.faint)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .presentationDetents([.medium])
        .presentationBackground(Palette.background)
    }
}
