import SwiftUI

/// Nastavení → Testování → Zájemci (the owner only): who signed up on the
/// website, Schválit adds them to the TestFlight group and Apple invites them
/// (src/testflight-waitlist.js). Holding a row offers Smazat.
struct WaitlistView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var list: Waitlist?
    @State private var error: String?
    @State private var working: Int?

    var body: some View {
        SettingsPage(title: "Zájemci") {
            if let list {
                SettingsGroup {
                    SettingsRow(title: "Testeři", value: list.testers.map { "\($0) / \(list.limit)" } ?? "–", chevron: false)
                }
                if let error = error ?? list.error { Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust) }
                if list.pending.isEmpty && list.invited.isEmpty {
                    Text("Nic nečeká.").font(Typo.sentence(20)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).padding(.top, 24)
                }
                if !list.pending.isEmpty {
                    SettingsGroup(title: "Čekají") {
                        ForEach(Array(list.pending.enumerated()), id: \.element.id) { index, person in
                            if index > 0 { SettingsDivider() }
                            row(person, subtitle: FoodSuggestionDetail.when(person.createdAt)) {
                                Button { Task { await decide(person, "approve") } } label: {
                                    Group {
                                        if working == person.id { ProgressView().tint(Palette.onButton) } else { Text("Schválit") }
                                    }
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                                    .padding(.horizontal, 14).frame(height: 32).background(Palette.green, in: Capsule())
                                }
                                .buttonStyle(.plain)
                                .disabled(working != nil || full)
                            }
                        }
                    }
                }
                if !list.invited.isEmpty {
                    SettingsGroup(title: "Pozvaní") {
                        ForEach(Array(list.invited.enumerated()), id: \.element.id) { index, person in
                            if index > 0 { SettingsDivider() }
                            row(person, subtitle: FoodSuggestionDetail.when(person.invitedAt).map { L10n.f("Pozván %@", $0) }) { EmptyView() }
                        }
                    }
                }
            } else if let error {
                Text(verbatim: error).font(Typo.small).foregroundStyle(Palette.rust)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 24)
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    /// The group is full: Schválit waits until someone leaves it.
    private var full: Bool {
        guard let list, let testers = list.testers else { return false }
        return testers >= list.limit
    }

    private func row<Trailing: View>(_ person: WaitlistPerson, subtitle: String?, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: person.email).font(.body).foregroundStyle(Palette.ink).lineLimit(1).truncationMode(.middle)
                if let subtitle { Text(verbatim: subtitle).font(.footnote).foregroundStyle(Palette.muted) }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .contentShape(Rectangle())
        .contextMenu {
            Button(role: .destructive) { Task { await decide(person, "delete") } } label: { Label("Smazat", systemImage: "trash") }
        }
    }

    private func load() async {
        do {
            let loaded = try await model.api.waitlist()
            list = loaded
            store.pendingWaitlist = loaded.pending.count
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func decide(_ person: WaitlistPerson, _ decision: String) async {
        working = person.id
        defer { working = nil }
        do {
            try await model.api.decideWaitlist(id: person.id, decision: decision)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
