import StoreKit
import SwiftUI

// Settings → Aurin Pro in night violet (approved mockups
// podle-paywallu/1c-nastaveni-pro-nocni and balicky-zprav/5-cesta-k-balickum):
// the mark, the plan's state (the free week as a calendar, the year paid
// monthly as a line of 12 dots), the extra coach messages and the way to buy
// more, what Aurin has for free and what Pro adds (approved mockup
// pro-bez-predplatneho/1-stranka-pro-v2, 3 Nov 2026: a list like Bevel's, the
// promo code and restore in the ⋯ menu), and Apple's sheet to manage it. The packs page lists
// the two packs and what this account bought. Pure views here; SubscriptionView
// and CoachPacksView load what they show.

/// Where the account is with Pro, for ProPage.
struct ProPageState: Equatable {
    var hasPro = false
    /// Everyone has AI during the pilot: the tiles are unlocked.
    var unlocked = false
    var pilot = false
    /// "Obnoví se 5. listopadu 2027", "Platí do …".
    var renewal: String?
    var freeWeek: DateInterval?
    /// "Čt 5. 11. · 149 Kč": the first payment after the free week.
    var firstPayment: String?
    var payments: ProStore.Payments?
    var allowance: CoachAllowance?
    /// Packs can be bought (the App Store is set up on the server).
    var packsOnSale = false
    /// The server answered: the way to Pro can be shown.
    var loaded = false
    /// The App Store gives this Apple Account the free week on the 12-month plans.
    var trial = false
}

/// The page itself, without loading: SubscriptionView feeds it, the snapshot tests too.
struct ProPage: View {
    let state: ProPageState
    var now = Date()
    var calendar: Calendar = .current
    var error: String?
    var morePacks: () -> Void = {}
    var goPro: () -> Void = {}
    var manage: () -> Void = {}

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                if let week = state.freeWeek, state.hasPro {
                    FreeWeekProgress(week: week, firstPayment: state.firstPayment, now: now, calendar: calendar)
                } else if let payments = state.payments, state.hasPro {
                    PaymentDots(payments: payments, calendar: calendar)
                }
                if let allowance = state.allowance, (allowance.extra ?? 0) > 0 || allowance.near {
                    ExtraMessagesCard(allowance: allowance, onSale: state.packsOnSale, more: morePacks)
                }
                contents
                actions
                if let error { Text(error).font(Typo.small).foregroundStyle(Night.amber) }
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 48)
        }
        .background { Night.background }
        .environment(\.colorScheme, .dark)
    }

    private var header: some View {
        VStack(spacing: 12) {
            AurinMark(size: 82, gold: state.hasPro, glow: true)
            AurinProTitle(size: 44, gold: state.hasPro)
            if let badge {
                Text(badge).font(.footnote.weight(.semibold))
                    .foregroundStyle(AurinMark.goldTop)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Color.white.opacity(0.1), in: Capsule())
            }
            if state.hasPro, state.freeWeek == nil, state.payments == nil, let renewal = state.renewal {
                Text(renewal).font(Typo.small).foregroundStyle(Night.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8).padding(.bottom, 6)
    }

    private var badge: String? {
        if state.hasPro { return L10n.tr(state.freeWeek == nil ? "Aktivní" : "Týden zdarma") }
        if state.pilot { return L10n.tr("Pilot · vše zdarma") }
        return nil
    }

    /// What Aurin has for everyone, then what Pro adds: with a sparkle while it is
    /// locked, ticked once the account has it (Pro, or everything during the pilot).
    private var contents: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: state.unlocked ? "Aurin Pro" : "Aurin Free").font(Typo.sentence(28)).foregroundStyle(Night.ink)
            Text(verbatim: cardLine).font(.subheadline).foregroundStyle(Night.muted).padding(.top, 2).padding(.bottom, 10)
            ForEach(ProContents.free, id: \.self) { row($0, sub: false) }
            Text(verbatim: L10n.tr(state.unlocked ? "TAKÉ V CENĚ" : "S AURIN PRO"))
                .scaledFont(11, weight: .semibold, cap: .denseCap).tracking(0.7).foregroundStyle(Night.lilac)
                .padding(.top, 12).padding(.bottom, 2)
            ForEach(ProContents.pro) { group in
                row(group.title, sub: false, pro: true)
                ForEach(group.items, id: \.self) { row($0, sub: true, pro: true) }
            }
        }
        .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Night.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var cardLine: String {
        if !state.unlocked { return L10n.tr("Zatím nemáš Pro.") }
        return L10n.tr(state.pilot && !state.hasPro ? "Během pilotu je všechno zdarma." : "Všechno je odemčené.")
    }

    private func row(_ title: String, sub: Bool, pro: Bool = false) -> some View {
        let locked = pro && !state.unlocked
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: locked ? "sparkle" : "checkmark")
                .scaledFont(sub ? 11 : 13, weight: .bold)
                .foregroundStyle(locked ? Night.lilac : Night.mint)
                .frame(width: 18)
            Text(verbatim: L10n.tr(title))
                .font(sub ? .subheadline : .body)
                .foregroundStyle(sub ? Night.muted : Night.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, sub ? 30 : 0)
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(L10n.tr(title) + (locked ? ", " + L10n.tr("v Aurin Pro") : ""))
    }

    @ViewBuilder private var actions: some View {
        if state.hasPro {
            Button(action: manage) {
                Text("Spravovat předplatné").font(Typo.bodyStrong).foregroundStyle(Night.ink)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Night.card, in: Capsule())
                    .overlay(Capsule().stroke(Night.line))
            }
            .buttonStyle(.plain)
        } else if !state.unlocked, state.loaded {
            Button(action: goPro) {
                Text("Přejít na Aurin Pro").font(Typo.bodyStrong).foregroundStyle(Night.violet)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Night.lavender, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
            if state.trial {
                Text("7 dní zdarma na 12měsíčním tarifu").font(.footnote).foregroundStyle(Night.muted)
            }
        } else if !state.loaded, error == nil {
            ProgressView().tint(Night.ink).frame(maxWidth: .infinity)
        }
        Link(destination: URL(string: "https://aurin.health/terms")!) {
            Text("Podmínky a ceny").font(Typo.caption).foregroundStyle(Night.muted).underline()
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }
}

/// The free week running: its seven days from the purchase (done ones ticked,
/// today lit, the reminder's bell on day 5), how much is left and the first payment.
struct FreeWeekProgress: View {
    let week: DateInterval
    let firstPayment: String?
    var now = Date()
    var calendar: Calendar = .current

    var body: some View {
        let start = calendar.startOfDay(for: week.start)
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
        let today = calendar.dateComponents([.day], from: start, to: calendar.startOfDay(for: now)).day ?? 0
        let left = max(0, calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: week.end)).day ?? 0)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 0) {
                ForEach(days.indices, id: \.self) { i in
                    VStack(spacing: 6) {
                        Text(verbatim: i == today ? L10n.tr("DNES") : days[i].formatted(.dateTime.weekday(.abbreviated).locale(L10n.locale)).uppercased())
                            .scaledFont(10, weight: .semibold, cap: .denseCap)
                            .foregroundStyle(i == today ? Night.mint : i == 4 ? Night.amber : Night.faint)
                        ZStack {
                            Circle().fill(i == today ? Night.mint : Night.card)
                            if i < today {
                                Image(systemName: "checkmark").scaledFont(12, weight: .bold, cap: .denseCap).foregroundStyle(Night.mint)
                            } else if i == 4 && i != today {
                                Circle().stroke(Night.amber, lineWidth: 1.5)
                                Image(systemName: "bell").scaledFont(13, cap: .denseCap).foregroundStyle(Night.amber)
                            } else {
                                Text(verbatim: "\(calendar.component(.day, from: days[i]))").font(.subheadline.weight(.medium))
                                    .foregroundStyle(i == today ? Night.bottom : Night.ink)
                            }
                        }
                        .frame(width: 34, height: 34)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: [Night.mint, Night.lavender, Night.amber], startPoint: .leading, endPoint: .trailing)).opacity(0.35)
                    Capsule().fill(Night.mint).frame(width: geo.size.width * min(1, Double(today + 1) / 7))
                }
            }
            .frame(height: 4).padding(.horizontal, 6)
            HStack {
                Text(verbatim: L10n.f("Zdarma ještě %@", L10n.plural("%lld dní", left))).foregroundStyle(Night.muted)
                Spacer()
                if let firstPayment { Text(verbatim: firstPayment).foregroundStyle(Night.lavender) }
            }
            .font(.caption.weight(.medium)).padding(.horizontal, 6)
        }
        .padding(16)
        .background(Night.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Night.line))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Zdarma ještě %@", L10n.plural("%lld dní", left)) + (firstPayment.map { ", " + $0 } ?? ""))
    }
}

/// The year paid monthly: "Platba 3 z 12" and a line of 12 dots, the paid ones
/// filled, this month's larger, with the first month, the next payment and the last.
struct PaymentDots: View {
    let payments: ProStore.Payments
    var calendar: Calendar = .current

    var body: some View {
        let total = max(1, payments.total), number = min(max(1, payments.number), total)
        let first = calendar.date(byAdding: .month, value: -total, to: payments.ends) ?? payments.ends
        let last = calendar.date(byAdding: .month, value: -1, to: payments.ends) ?? payments.ends
        VStack(alignment: .leading, spacing: 14) {
            Text(verbatim: L10n.f("Platba %lld z %lld", number, total)).font(Typo.sentence(24)).foregroundStyle(Night.ink)
            HStack(spacing: 0) {
                ForEach(1...total, id: \.self) { i in
                    if i > 1 {
                        Rectangle().fill(i <= number ? Night.lavender : Night.line).frame(height: 2)
                    }
                    Circle().fill(i <= number ? Night.lavender : Night.line)
                        .frame(width: i == number ? 16 : 8, height: i == number ? 16 : 8)
                        .overlay { if i == number { Circle().stroke(Night.lavender.opacity(0.35), lineWidth: 4) } }
                }
            }
            .frame(height: 18)
            HStack {
                Text(verbatim: Self.month(first)).foregroundStyle(Night.muted)
                Spacer()
                if let next = payments.next {
                    Text(verbatim: L10n.f("Další · %@", PaywallView.dayMonth(next))).foregroundStyle(Night.lavender)
                }
                Spacer()
                Text(verbatim: Self.month(last)).foregroundStyle(Night.muted)
            }
            .font(.caption.weight(.medium))
        }
        .padding(18)
        .background(Night.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Night.line))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.f("Platba %lld z %lld", number, total) + (payments.next.map { ", " + L10n.f("Další · %@", PaywallView.dayMonth($0)) } ?? ""))
    }

    /// "Nov 2026" / "lis 2026".
    static func month(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).year().locale(L10n.locale))
    }
}

/// The extra coach messages: how many are left (they never expire), the week
/// running low above them, and the way to more.
struct ExtraMessagesCard: View {
    let allowance: CoachAllowance
    let onSale: Bool
    let more: () -> Void

    var body: some View {
        let extra = allowance.extra ?? 0
        VStack(alignment: .leading, spacing: 10) {
            if allowance.near, let line = allowance.settingsLine {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Circle().fill(Night.amber).frame(width: 7, height: 7)
                    Text(verbatim: line.replacingOccurrences(of: "\n", with: " ")).font(.footnote).foregroundStyle(Night.amber)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Rectangle().fill(Night.line).frame(height: 1)
            }
            Text("ZPRÁVY KOUČOVI NAVÍC").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Night.faint)
            if extra > 0 {
                (Text(verbatim: "\(extra) ").font(Typo.number(36)).foregroundColor(Night.ink)
                 + Text("zbývá · nepropadnou").font(.subheadline).foregroundColor(Night.muted))
            } else {
                Text("Zatím žádné").font(Typo.sentence(28)).foregroundStyle(Night.ink)
            }
            Text("Použijí se, až dojdou zprávy na tento týden.").font(.footnote).foregroundStyle(Night.muted)
                .fixedSize(horizontal: false, vertical: true)
            if onSale {
                Button(action: more) {
                    Text("Získat další zprávy").font(Typo.bodyStrong).foregroundStyle(Night.violet)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Night.lavender, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Night.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Night.lavender.opacity(0.35)))
    }
}

// MARK: - More coach messages

/// The packs page without loading: what is left, the two packs, the purchases.
struct CoachPacksPage: View {
    let left: Int
    let purchases: [CoachPacks.Purchase]
    /// "€3.99" by product id; nil while the App Store has not answered.
    let price: (String) -> String?
    @Binding var chosen: String
    var buying = false
    /// "100 messages added" after a purchase.
    var added: Int?
    var error: String?
    var buy: () -> Void = {}

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Další zprávy koučovi").font(Typo.sentence(30)).foregroundStyle(Night.ink)
                Text(verbatim: L10n.f("Máš %lld navíc. Nepropadnou.", left)).font(.subheadline).foregroundStyle(Night.muted)
                    .padding(.bottom, 6)
                ForEach(ProStore.packIDs, id: \.self) { id in pack(id) }
                Button(action: buy) {
                    Group {
                        if buying { ProgressView().tint(Night.violet) } else {
                            Text(verbatim: L10n.f("Koupit %lld zpráv", ProStore.packs[chosen] ?? 0))
                        }
                    }
                    .font(Typo.bodyStrong).foregroundStyle(Night.violet)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Night.lavender, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(buying || price(chosen) == nil)
                .padding(.top, 4)
                if let error { Text(error).font(Typo.small).foregroundStyle(Night.amber) }
                if !purchases.isEmpty {
                    Text("TVOJE NÁKUPY").scaledFont(11, weight: .semibold, cap: .denseCap).foregroundStyle(Night.faint)
                        .padding(.top, 14)
                    VStack(spacing: 0) {
                        ForEach(Array(purchases.enumerated()), id: \.offset) { i, purchase in
                            if i > 0 { Rectangle().fill(Night.line).frame(height: 1) }
                            row(purchase)
                        }
                    }
                }
                Text("Jednorázové nákupy přes Apple. Zprávy navíc patří tomuto účtu a nejdou převést na nový.")
                    .font(.caption).foregroundStyle(Night.faint)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                Link(destination: URL(string: "https://aurin.health/terms")!) {
                    Text("Podmínky").font(.caption).foregroundStyle(Night.muted).underline()
                }
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 80)
        }
        .overlay(alignment: .bottom) {
            if let added {
                Label(L10n.f("Přidáno %lld zpráv", added), systemImage: "checkmark")
                    .font(.footnote.weight(.semibold)).foregroundStyle(Night.mint)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Night.mint.opacity(0.16), in: Capsule())
                    .overlay(Capsule().stroke(Night.mint.opacity(0.4)))
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background { Night.background }
        .environment(\.colorScheme, .dark)
    }

    private func pack(_ id: String) -> some View {
        let selected = chosen == id, best = (ProStore.packs[id] ?? 0) >= 100
        return Button { chosen = id } label: {
            HStack(alignment: .firstTextBaseline) {
                (Text(verbatim: "\(ProStore.packs[id] ?? 0) ").font(Typo.number(30)) + Text("zpráv").font(.subheadline))
                Spacer()
                if let price = price(id) { Text(verbatim: price).font(.headline) }
            }
            .foregroundStyle(selected ? Night.violet : Night.ink)
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(selected ? Night.lavender : Night.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(selected ? .clear : Night.line))
            .overlay(alignment: .topLeading) {
                if best {
                    Text("NEJVÝHODNĚJŠÍ").scaledFont(10, weight: .bold, cap: .denseCap).foregroundStyle(Night.bottom)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Night.mint, in: Capsule())
                        .offset(x: 10, y: -9)
                }
            }
        }
        .buttonStyle(.plain)
        .padding(.top, best ? 6 : 0)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func row(_ purchase: CoachPacks.Purchase) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: L10n.f("+%lld zpráv", purchase.messages)).font(.subheadline).foregroundStyle(purchase.refunded ? Night.faint : Night.ink)
                    .strikethrough(purchase.refunded)
                Text(verbatim: Self.when(purchase)).font(.caption).foregroundStyle(Night.faint)
            }
            Spacer()
            if let price = purchase.price, let currency = purchase.currency {
                Text(price, format: .currency(code: currency).locale(L10n.locale)).font(.subheadline).foregroundStyle(Night.muted)
            }
        }
        .padding(.vertical, 12)
    }

    nonisolated(unsafe) private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) private static let plainISO = ISO8601DateFormatter()

    /// "12. 10. 2026", "· Testovací nákup", "· Peníze vráceny".
    static func when(_ purchase: CoachPacks.Purchase) -> String {
        let date = (iso.date(from: purchase.purchasedAt) ?? plainISO.date(from: purchase.purchasedAt))
            .map { $0.formatted(.dateTime.day().month(.abbreviated).year().locale(L10n.locale)) } ?? String(purchase.purchasedAt.prefix(10))
        if purchase.refunded { return date + " · " + L10n.tr("Peníze vráceny") }
        if !purchase.counted { return date + " · " + L10n.tr("Testovací nákup") }
        return date
    }
}

/// Settings → Aurin Pro → Získat další zprávy, and the coach's "Získat další":
/// buys a pack through the App Store and shows what the server has.
struct CoachPacksView: View {
    @Environment(AppModel.self) private var model
    @State private var packs: CoachPacks?
    @State private var chosen = ProStore.packIDs.last ?? ""
    @State private var buying = false
    @State private var added: Int?
    @State private var error: String?
    private let store = ProStore.shared

    var body: some View {
        CoachPacksPage(left: packs?.left ?? 0, purchases: packs?.purchases ?? [], price: { store.price($0) },
                       chosen: $chosen, buying: buying, added: added, error: error, buy: { Task { await buy() } })
            .navigationTitle(L10n.tr("Aurin Pro"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .task { await load() }
            .onAppear { ScreenTrail.visit("page/Další zprávy koučovi") }
    }

    private func load() async {
        await store.load()
        guard !model.demo else { return }
        do { packs = try await model.api.coachPacks(); error = nil } catch { self.error = error.localizedDescription }
    }

    private func buy() async {
        buying = true
        defer { buying = false }
        do {
            guard let messages = ProStore.packs[chosen], try await store.buyPack(chosen) != nil else { return }
            if !model.demo { packs = try? await model.api.coachPacks() }
            error = nil
            withAnimation { added = messages }
            try? await Task.sleep(for: .seconds(3))
            withAnimation { added = nil }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
