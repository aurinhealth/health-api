import SwiftUI
import UIKit

/// An AI lookup or a meal photo from "Co přidáme?" that goes on after the
/// sheet closes. The food waits under its meal in Jídlo (PendingFoodRow)
/// until "Přidat" or ✕, also after the app restarts, until the day ends.
/// Nothing reaches the diary without the amount screen (like Bevel's Food Cart).
struct PendingFood: Identifiable, Codable, Equatable {
    enum State: String, Codable { case looking, found, missing }
    /// One food of a meal photo with several on the plate (PhotoItem).
    struct Item: Codable, Equatable {
        var product: FoodProduct
        var amount: Double
        var mine: Bool
    }
    /// What the work brought back.
    enum Result {
        case product(FoodProduct, note: String?)
        case items([PhotoItem])
        case missing(String)
    }

    var id = UUID()
    /// The meal type ("snack") and the day it goes to.
    let meal: String
    let day: String
    /// The name looked up with AI; nil for a photo.
    let query: String?
    var state = State.looking
    var product: FoodProduct?
    var note: String?
    var items: [Item] = []
    var message: String?
    var created = Date()
    /// "Co přidáme?" that started it is still open and takes the answer itself.
    var watched = true

    /// The row's title: the food found, else what was looked up.
    var title: String {
        if let product { return product.name }
        if items.count >= 2 { return L10n.tr("Jídlo z fotky") }
        return query ?? L10n.tr("Jídlo z fotky")
    }

    static let cacheKey = "pending-foods"

    /// The found ones of today; a lookup the app was closed during is gone.
    static func saved(now: Date = Date()) -> [PendingFood] {
        (SnapshotCache.load([PendingFood].self, key: cacheKey)?.value ?? [])
            .filter { $0.state != .looking && Calendar.current.isDate($0.created, inSameDayAs: now) }
            .map { var item = $0; item.watched = false; return item }
    }
}

/// The few seconds' note when a lookup ends with the sheet closed (RootView).
struct FoodReady: Equatable {
    let id = UUID()
    let text: String
    let found: Bool
}

extension AppModel {
    /// Starts the lookup or the photo read; it goes on when the sheet closes
    /// and gets about half a minute more when the app goes to the background.
    @discardableResult
    func startPendingFood(meal: String, query: String?, photo: UIImage? = nil,
                          work: @escaping @MainActor @Sendable () async throws -> PendingFood.Result) -> UUID {
        let item = PendingFood(meal: meal, day: writeDay, query: query)
        pendingFoods.append(item)
        if let photo { pendingPhotos[item.id] = photo }
        let id = item.id
        scope.task {
            let extra = FinishInBackground("Food lookup")
            defer { extra.end() }
            let result: PendingFood.Result
            do { result = try await work() } catch { result = .missing(error.localizedDescription) }
            self.finishPendingFood(id, result)
        }
        return item.id
    }

    private func finishPendingFood(_ id: UUID, _ result: PendingFood.Result) {
        guard let index = pendingFoods.firstIndex(where: { $0.id == id }) else { return }
        var item = pendingFoods[index]
        switch result {
        case .product(let product, let note):
            item.state = .found
            item.product = product
            item.note = note
        case .items(let items):
            item.state = .found
            item.items = items.map { PendingFood.Item(product: $0.product, amount: $0.amount, mine: $0.mine) }
        case .missing(let message):
            item.state = .missing
            item.message = message
        }
        pendingFoods[index] = item
        savePendingFoods()
        // The sheet is closed: a few seconds' note, unless Jídlo is in sight.
        if !item.watched && (tab != .food || !(paths[.food] ?? []).isEmpty) {
            let found = item.state == .found
            foodReady = FoodReady(text: found ? L10n.f("„%@“ dohledáno · čeká v Jídle", item.title)
                                              : L10n.f("„%@“ se nepodařilo dohledat", item.title),
                                  found: found)
        }
    }

    /// "Co přidáme?" closed: what it started waits in Jídlo.
    func unwatchPendingFoods(_ ids: [UUID]) {
        for index in pendingFoods.indices where ids.contains(pendingFoods[index].id) {
            pendingFoods[index].watched = false
        }
    }

    /// Added to the diary, taken by the open sheet, or ✕.
    func removePendingFood(_ id: UUID) {
        pendingFoods.removeAll { $0.id == id }
        pendingPhotos[id] = nil
        savePendingFoods()
    }

    /// The photo's foods as the list screen takes them.
    func pendingPhotoMeal(_ item: PendingFood) -> PhotoMeal {
        PhotoMeal(photo: pendingPhotos[item.id], items: item.items.map { PhotoItem(product: $0.product, amount: $0.amount, mine: $0.mine) })
    }

    private func savePendingFoods() {
        let kept = pendingFoods.filter { $0.state != .looking }
        if let data = try? JSONEncoder().encode(kept) { SnapshotCache.save(data, key: PendingFood.cacheKey) }
    }
}
