import SwiftUI
import UIKit

// Loadwise Pro, laid out like Bevel Pro: a row at the top of Settings, the
// subscription page (what Free has ✓ and lacks ✗, "Přejít na Loadwise Pro"),
// and the offer over the whole screen: the app in a phone, then what Pro
// brings and the plans. During the invitation-only pilot everything is free
// and nothing can be bought; the purchase (App Store) comes with the Apple
// Developer Program. The server decides who has AI (src/subscription.js).

/// The plans of the offer, prices with VAT in Czech crowns (App Store).
enum ProPlans {
    struct Plan: Identifiable, Equatable {
        let id: String
        let title: String
        let price: String?
        let note: String?
        var best = false
    }

    static let main: [Plan] = [
        Plan(id: "annual", title: "Ročně", price: "2 190 Kč / rok", note: "182,50 Kč měsíčně", best: true),
        Plan(id: "monthly", title: "Měsíčně", price: "249 Kč / měsíc", note: "placeno měsíčně")
    ]
    static let all: [Plan] = main
}

/// One thing Pro adds, with its icon.
struct ProFeature: Identifiable {
    let symbol: String
    let color: Color
    let title: String
    let subtitle: String
    var id: String { title }

    static let pro: [ProFeature] = [
        ProFeature(symbol: "bubble.left.and.text.bubble.right.fill", color: Palette.indigo, title: "AI kouč", subtitle: "Ptej se kdykoli, odpoví z tvých dat."),
        ProFeature(symbol: "calendar.badge.clock", color: Palette.rust, title: "Plán vlastními slovy", subtitle: "Řekni, co se změnilo, a týden se přizpůsobí."),
        ProFeature(symbol: "chart.line.uptrend.xyaxis", color: Palette.green, title: "Hodnocení tréninků a dne", subtitle: "Co se povedlo a co příště jinak."),
        ProFeature(symbol: "camera.fill", color: Palette.amberBar, title: "Jídlo z fotky", subtitle: "Vyfoť talíř nebo etiketu, hodnoty doplní AI."),
        ProFeature(symbol: "text.bubble.fill", color: Palette.blue, title: "Jídlo vlastními slovy", subtitle: "Napiš, co jsi snědl, a najde se i to, co katalog nezná."),
        ProFeature(symbol: "figure.strengthtraining.traditional", color: Palette.brown, title: "Technika každého cviku", subtitle: "Popis provedení i pro cviky mimo katalog.")
    ]
    static let included: [ProFeature] = [
        ProFeature(symbol: "heart.fill", color: Palette.rust, title: "Regenerace a spánek", subtitle: "Připravenost, HRV a potřeba spánku každý den."),
        ProFeature(symbol: "flame.fill", color: Palette.amberBar, title: "Kalorický cíl a makra", subtitle: "Cíl, který roste s tím, jak se hýbeš."),
        ProFeature(symbol: "dumbbell.fill", color: Palette.brown, title: "Plán posilovny a tréninků", subtitle: "Týden podle času, který máš."),
        ProFeature(symbol: "arrow.triangle.2.circlepath", color: Palette.indigo, title: "Google Health a Intervals.icu", subtitle: "Data z hodinek bez přepisování.")
    ]
}

/// Settings → the first row, as "Bevel Pro".
struct ProSettingsRow: View {
    var body: some View {
        NavigationLink { SubscriptionView() } label: {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.onButton)
                    .frame(width: 32, height: 32)
                    .background(Palette.button, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                Text("Loadwise Pro").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(.horizontal, 16).frame(minHeight: 56)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Předplatné (Bevel's Manage Subscription): the current plan with what it has
/// and lacks, and the way to Pro.
struct SubscriptionView: View {
    @Environment(AppModel.self) private var model
    @State private var status: SubscriptionStatus?
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Předplatné") {
            VStack(alignment: .leading, spacing: 10) {
                Text(planTitle).font(.title3.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(planText).font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
                if let features = status?.features {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(features, id: \.self) { feature in
                            let has = !feature.ai || status?.aiAccess == true
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: has ? "checkmark" : "xmark")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(has ? Palette.green : Palette.rust)
                                    .frame(width: 16).padding(.top, 2)
                                Text(verbatim: feature.name).font(.subheadline).foregroundStyle(Palette.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(feature.name + ", " + L10n.tr(has ? "máš" : "není v tarifu"))
                        }
                    }
                    .padding(.top, 4)
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

            if status?.hasAI != true {
                VStack(alignment: .leading, spacing: 0) {
                    Button { Paywall.present(model) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.onButton)
                                .frame(width: 30, height: 30)
                                .background(Palette.button, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            Text("Přejít na Loadwise Pro").font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                        }
                        .padding(16)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(Palette.hairline).frame(height: 1).padding(.horizontal, 16)
                    Link(destination: URL(string: "https://petrfitnessdata.eu/terms")!) {
                        Text("Otázky k předplatnému? Přečti si podmínky a ceny.").font(Typo.caption).foregroundStyle(Palette.muted).underline()
                    }
                    .padding(16)
                }
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .task { await load() }
    }

    private var planTitle: String {
        if status?.hasAI == true { return "Loadwise Pro" }
        if status?.pilot ?? true { return L10n.tr("Loadwise · pilot") }
        return "Loadwise Free"
    }

    private var planText: String {
        if status?.hasAI == true { return L10n.tr("Předplatné je aktivní, všechno je odemčené.") }
        if status?.pilot ?? true { return L10n.tr("Během pilotu pro pozvané máš všechno zdarma, i AI. Později bude AI součástí Loadwise Pro.") }
        return L10n.tr("Nemáš Pro. Klepni na „Přejít na Loadwise Pro“ a vyber tarif.")
    }

    private func load() async {
        if model.demo { status = .demo; return }
        do {
            status = try await model.api.subscription()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The offer over the whole screen, from wherever it is asked for: the page
/// above, the coach, or any AI feature the server turned down with 402. Shown
/// from UIKit on top of what is open, so a sheet does not block it.
@MainActor
enum Paywall {
    private static let tag = 0x10AD

    static func present(_ model: AppModel) {
        guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return }
        var top = root
        while let next = top.presentedViewController { top = next }
        guard top.view.tag != tag else { return }
        let host = UIHostingController(rootView: AnyView(EmptyView()))
        host.rootView = AnyView(PaywallView(close: { [weak host] in host?.dismiss(animated: true) }).environment(model))
        host.view.tag = tag
        host.modalPresentationStyle = .fullScreen
        top.present(host, animated: true)
    }
}

struct PaywallView: View {
    let close: () -> Void
    @State private var demo = AppModel(demo: true)
    /// 0…3 the app in the phone, 4 what Pro brings and the plans.
    @State private var step = 0
    @State private var plan = "annual"
    @State private var allPlans = false
    @State private var notYet: String?

    private static let shots = 4

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            RadialGradient(colors: [Palette.indigo.opacity(0.35), .clear], center: .bottom, startRadius: 10, endRadius: 520).ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button(action: close) {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                    }
                    .accessibilityLabel("Zavřít")
                    Spacer()
                    Menu {
                        Button("Všechny tarify") { allPlans = true }
                        Button("Uplatnit promo kód") { notYet = L10n.tr("Promo kódy půjdou uplatnit, až spustíme předplatné.") }
                        Button("Obnovit nákup") { notYet = L10n.tr("Zatím není co obnovit: předplatné ještě nejde koupit.") }
                    } label: {
                        Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                            .frame(width: 40, height: 40).background(Palette.card, in: Circle())
                    }
                    .accessibilityLabel("Další možnosti")
                }
                .padding(.horizontal, 20).padding(.top, 8)

                Text("Začni naplno s Loadwise Pro")
                    .font(.system(size: 28, weight: .bold)).multilineTextAlignment(.center).foregroundStyle(Palette.ink)
                    .padding(.horizontal, 24).padding(.top, 12)

                if step < Self.shots {
                    TabView(selection: $step) {
                        ForEach(0..<Self.shots, id: \.self) { i in
                            PhoneMockup { screen(i) }.tag(i).padding(.vertical, 20)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .environment(demo)
                } else {
                    features
                }

                VStack(spacing: 10) {
                    if step >= Self.shots {
                        HStack(spacing: 10) {
                            ForEach(ProPlans.main) { p in PlanCard(plan: p, selected: plan == p.id) { plan = p.id } }
                        }
                    }
                    Button {
                        if step < Self.shots { withAnimation(.easeInOut(duration: 0.3)) { step += 1 } }
                        else { notYet = L10n.tr("Během pilotu je všechno zdarma, i AI. Předplatné spustíme později a cenu oznámíme předem.") }
                    } label: {
                        Text("Pokračovat").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 54).background(Palette.button, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20).padding(.bottom, 12)
            }
        }
        .sheet(isPresented: $allPlans) { AllPlansSheet(selected: $plan) }
        .alert(L10n.tr("Loadwise Pro"), isPresented: Binding(get: { notYet != nil }, set: { if !$0 { notYet = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(notYet ?? "") }
    }

    @ViewBuilder
    private func screen(_ i: Int) -> some View {
        switch i {
        case 0: TodayContent(today: DemoData.today)
        case 1: FoodContent(food: DemoData.food)
        case 2: HealthContent(health: DemoData.health)
        default: TrainingContent(training: DemoData.training)
        }
    }

    private var features: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(ProFeature.pro) { FeatureLine(feature: $0) }
                HStack {
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                    Text("také obsahuje").font(Typo.caption).foregroundStyle(Palette.faint).fixedSize()
                    Rectangle().fill(Palette.hairline).frame(height: 1)
                }
                ForEach(ProFeature.included) { FeatureLine(feature: $0) }
            }
            .padding(.horizontal, 24).padding(.vertical, 20)
        }
    }
}

/// A screen of the app in a phone frame, scaled down, not touchable.
struct PhoneMockup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 0).padding(.top, 50)
            .frame(width: 390, height: 780, alignment: .top)
            .background(ScreenBackground(glow: Palette.Glow.today))
            .scaleEffect(0.56, anchor: .top)
            .frame(width: 218, height: 437, alignment: .top)
            .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Palette.ink.opacity(0.25), lineWidth: 5))
            .overlay(alignment: .top) { Capsule().fill(Color.black).frame(width: 64, height: 18).padding(.top, 8) }
            .shadow(color: Palette.indigo.opacity(0.35), radius: 30)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

struct FeatureLine: View {
    let feature: ProFeature

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: feature.symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Palette.onAccent)
                .frame(width: 42, height: 42)
                .background(feature.color, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(feature.title).font(.body.weight(.semibold)).foregroundStyle(Palette.ink)
                Text(feature.subtitle).font(Typo.caption).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct PlanCard: View {
    let plan: ProPlans.Plan
    let selected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(plan.title).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundStyle(selected ? Palette.ink : Palette.faint)
                }
                Text(plan.price ?? L10n.tr("cena bude oznámena")).font(.headline).foregroundStyle(Palette.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let note = plan.note { Text(note).font(.caption2).foregroundStyle(Palette.muted) }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(selected ? Palette.ink.opacity(0.6) : Palette.hairline, lineWidth: selected ? 1.5 : 1))
            .overlay(alignment: .top) {
                if plan.best {
                    Text("Nejvýhodnější").font(.caption2.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Palette.button, in: Capsule())
                        .offset(y: -10)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// "Všechny tarify" from the ⋯ menu.
struct AllPlansSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selected: String

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                        .frame(width: 36, height: 36).background(Palette.card, in: Circle())
                }
                .accessibilityLabel("Zavřít")
                Spacer()
            }
            ForEach(ProPlans.all) { p in PlanCard(plan: p, selected: selected == p.id) { selected = p.id } }
            Button { dismiss() } label: {
                Text("Pokračovat").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 52).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .padding(20)
        .presentationDetents([.medium])
        .presentationBackground(Palette.background)
    }
}

/// In an AI feature without Pro: what it is and the way to it, instead of an error.
struct AISubscriptionCard: View {
    let open: () -> Void

    var body: some View {
        Card {
            Label("AI je součástí Loadwise Pro", systemImage: "sparkles").font(.headline).foregroundStyle(Palette.ink)
            Text("Kouč, jídlo z fotky a hodnocení tréninků patří do Loadwise Pro. Zápisy, přehledy a plány zůstávají zdarma.")
                .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            Button(action: open) {
                Text("Zobrazit Loadwise Pro").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                    .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
