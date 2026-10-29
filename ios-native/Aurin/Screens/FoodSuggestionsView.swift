import SwiftUI

/// Nastavení → Správa → Návrhy oprav potravin (the owner only): users'
/// corrections of catalogue foods, waiting, approved or rejected. Approving
/// puts the corrected food in the common catalogue (src/food-suggestions.js).
struct FoodSuggestionsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var status = "pending"
    /// "correction" (Opravy) or "report" (Hlášení).
    @State private var kind = "correction"
    @State private var list: FoodSuggestionList?
    @State private var error: String?

    var body: some View {
        SettingsPage(title: "Návrhy oprav") {
            Picker("Druh", selection: $kind) {
                Text(L10n.f("Opravy · %d", list?.pending?["correction"] ?? 0)).tag("correction")
                Text(L10n.f("Hlášení · %d", list?.pending?["report"] ?? 0)).tag("report")
            }
            .pickerStyle(.segmented)
            Picker("Stav", selection: $status) {
                Text(pendingTitle).tag("pending")
                Text("Schválené").tag("approved")
                Text("Zamítnuté").tag("rejected")
            }
            .pickerStyle(.segmented)
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if let list {
                if list.suggestions.isEmpty {
                    Text(status == "pending" ? "Nic nečeká." : "Zatím nic.").font(Typo.sentence(20)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).padding(.top, 24)
                } else {
                    SettingsGroup {
                        ForEach(Array(list.suggestions.enumerated()), id: \.element.id) { index, suggestion in
                            if index > 0 { SettingsDivider() }
                            NavigationLink {
                                if suggestion.kind == "report" {
                                    FoodReportDetail(report: suggestion) { Task { await load() } }
                                } else {
                                    FoodSuggestionDetail(suggestion: suggestion) { Task { await load() } }
                                }
                            } label: {
                                SettingsRow(title: suggestion.name,
                                            subtitle: suggestion.kind == "report" ? FoodReportDetail.summary(suggestion) : FoodSuggestionDetail.summary(suggestion),
                                            value: FoodSuggestionDetail.when(suggestion.createdAt))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else if error == nil {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 24)
            }
        }
        .task(id: status + kind) { await load() }
    }

    private var pendingTitle: String {
        let n = list?.counts?["pending"] ?? store.pendingFoodSuggestions
        return L10n.f("Čeká %d", n)
    }

    private func load() async {
        do {
            let loaded = try await model.api.foodSuggestions(status: status, kind: kind)
            list = loaded
            store.pendingFoodSuggestions = loaded.pending.map { $0.values.reduce(0, +) } ?? loaded.counts?["pending"] ?? store.pendingFoodSuggestions
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One suggestion: what changes and what stays, who sent it, Schválit or Zamítnout.
struct FoodSuggestionDetail: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let suggestion: FoodSuggestion
    let decided: () -> Void
    @State private var working = false
    @State private var error: String?

    static let fields: [(key: String, title: String, unit: String)] = [
        ("name", "Název", ""), ("brand", "Výrobce, značka", ""), ("serving_name", "Název porce", ""), ("serving_size", "Váha jedné porce", ""),
        ("quantity", "Balení", ""), ("calories_100g", "Energie", "kcal"), ("protein_100g", "Bílkoviny", "g"), ("carbs_100g", "Sacharidy", "g"),
        ("sugars_100g", "z toho cukry", "g"), ("fat_100g", "Tuky", "g"), ("fiber_100g", "Vláknina", "g"), ("salt_100g", "Sůl", "g")
    ]

    var body: some View {
        SettingsPage(title: suggestion.name) {
            Text(([suggestion.after["brand"]?.string, suggestion.barcode.map { "EAN " + $0 }].compactMap { $0 }).joined(separator: " · "))
                .font(Typo.caption).foregroundStyle(Palette.muted).frame(maxWidth: .infinity)
            SettingsGroup(title: "Změny") {
                ForEach(Array(changed.enumerated()), id: \.offset) { index, field in
                    if index > 0 { SettingsDivider() }
                    HStack(spacing: 8) {
                        Text(LocalizedStringKey(field.title)).font(.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Text(verbatim: Self.text(suggestion.before[field.key], field.unit) ?? "–").strikethrough().foregroundStyle(Palette.faint)
                        Image(systemName: "arrow.right").font(.caption).foregroundStyle(Palette.faint)
                        Text(verbatim: Self.text(suggestion.after[field.key], field.unit) ?? "–").fontWeight(.semibold).foregroundStyle(Palette.green)
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16).frame(minHeight: 50)
                }
            }
            if !kept.isEmpty {
                SettingsGroup(title: "Beze změny") {
                    ForEach(Array(kept.enumerated()), id: \.offset) { index, field in
                        if index > 0 { SettingsDivider() }
                        SettingsRow(title: field.title, value: Self.text(suggestion.after[field.key], field.unit), chevron: false)
                    }
                }
            }
            SettingsGroup(title: "Od") {
                SettingsRow(title: L10n.f("Uživatel %d", suggestion.userId),
                            value: suggestion.fromUser.map { L10n.f("návrhy %d, schválené %d", $0.sent, $0.approved) }, chevron: false)
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if suggestion.status == "pending" {
                HStack(spacing: 10) {
                    Button { Task { await decide("reject") } } label: {
                        Text("Zamítnout").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                            .frame(maxWidth: .infinity).frame(height: 50)
                            .overlay { Capsule().stroke(Palette.rust.opacity(0.5), lineWidth: 1) }
                    }
                    Button { Task { await decide("approve") } } label: {
                        Text("Schválit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                    }
                }
                .buttonStyle(.plain)
                .disabled(working)
            }
        }
    }

    private var changed: [(key: String, title: String, unit: String)] { Self.fields.filter { suggestion.changes.contains($0.key) } }
    private var kept: [(key: String, title: String, unit: String)] {
        Self.fields.filter { !suggestion.changes.contains($0.key) && Self.text(suggestion.after[$0.key], $0.unit) != nil && $0.key != "name" && $0.key != "brand" }
    }

    static func text(_ value: JSONValue?, _ unit: String) -> String? {
        if case .number(let n)? = value { return Fmt.decimal(n, digits: n.rounded() == n ? 0 : 1) + (unit.isEmpty ? "" : " " + unit) }
        return value?.string
    }

    /// "Porce 1 g → 19 g" for the list: the first change.
    static func summary(_ s: FoodSuggestion) -> String {
        guard let key = s.changes.first, let field = fields.first(where: { $0.key == key }) else { return "" }
        let more = s.changes.count > 1 ? " +\(s.changes.count - 1)" : ""
        return L10n.tr(field.title) + " " + (text(s.before[key], field.unit) ?? "–") + " → " + (text(s.after[key], field.unit) ?? "–") + more
    }

    /// The day it came: "18. 10." (UTC from the server is close enough for a list).
    static func when(_ created: String?) -> String? {
        guard let created, created.count >= 10 else { return nil }
        let parts = created.prefix(10).split(separator: "-")
        guard parts.count == 3, let d = Int(parts[2]), let m = Int(parts[1]) else { return nil }
        return "\(d). \(m)."
    }

    private func decide(_ decision: String) async {
        working = true
        defer { working = false }
        do {
            try await model.api.decideFoodSuggestion(id: suggestion.id, decision: decision)
            decided()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One report ("Hodnoty nesedí"): what is wrong, the note, the food's values;
/// Opravit opens the editor and the fixed food goes to the common catalogue,
/// settling every report of it; Zamítnout drops this one.
struct FoodReportDetail: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let report: FoodSuggestion
    let decided: () -> Void
    @State private var working = false
    @State private var fixing = false
    @State private var error: String?

    var body: some View {
        SettingsPage(title: report.name) {
            Text(([report.before["brand"]?.string, report.barcode.map { "EAN " + $0 }].compactMap { $0 }).joined(separator: " · "))
                .font(Typo.caption).foregroundStyle(Palette.muted).frame(maxWidth: .infinity)
            SettingsGroup(title: "Hlášení") {
                SettingsRow(title: "Co nesedí", value: Self.reason(report.reason), chevron: false)
                if let note = report.note {
                    SettingsDivider()
                    Text(verbatim: "„" + note + "“").font(.subheadline).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 14)
                }
                SettingsDivider()
                SettingsRow(title: "Nahlášeno", value: L10n.f("%d×", report.reports ?? 1), chevron: false)
                SettingsDivider()
                SettingsRow(title: L10n.f("Uživatel %d", report.userId),
                            value: report.fromUser.map { L10n.f("návrhy %d, schválené %d", $0.sent, $0.approved) }, chevron: false)
            }
            SettingsGroup(title: "Teď v katalogu") {
                ForEach(Array(shown.enumerated()), id: \.offset) { index, field in
                    if index > 0 { SettingsDivider() }
                    SettingsRow(title: field.title, value: FoodSuggestionDetail.text(report.before[field.key], field.unit), chevron: false)
                }
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            if report.status == "pending" {
                HStack(spacing: 10) {
                    Button { Task { await reject() } } label: {
                        Text("Zamítnout").font(Typo.bodyStrong).foregroundStyle(Palette.rust)
                            .frame(maxWidth: .infinity).frame(height: 50)
                            .overlay { Capsule().stroke(Palette.rust.opacity(0.5), lineWidth: 1) }
                    }
                    Button { fixing = true } label: {
                        Text("Opravit").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                    }
                }
                .buttonStyle(.plain)
                .disabled(working || product == nil)
            }
        }
        .navigationDestination(isPresented: $fixing) {
            if let product {
                FoodProductEditor(product: product, saved: { _ in decided(); dismiss() },
                                  save: { fixed in try await model.api.fixReportedFood(id: report.id, after: fixed) })
            }
        }
    }

    private var shown: [(key: String, title: String, unit: String)] {
        FoodSuggestionDetail.fields.filter { FoodSuggestionDetail.text(report.before[$0.key], $0.unit) != nil && $0.key != "name" && $0.key != "brand" }
    }

    /// The reported food as the editor's starting point.
    private var product: FoodProduct? {
        guard let data = try? JSONEncoder().encode(JSONValue.object(report.before)) else { return nil }
        return try? JSONDecoder().decode(FoodProduct.self, from: data)
    }

    static func reason(_ code: String?) -> String {
        L10n.tr(FoodReportSheet.reasons.first { $0.code == code }?.title ?? "Něco jiného")
    }

    /// "Energie nebo živiny · 2×" for the list.
    static func summary(_ r: FoodSuggestion) -> String {
        reason(r.reason) + ((r.reports ?? 1) > 1 ? " · \(r.reports ?? 1)×" : "")
    }

    private func reject() async {
        working = true
        defer { working = false }
        do {
            try await model.api.decideFoodSuggestion(id: report.id, decision: "reject")
            decided()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
