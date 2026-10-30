import CoreSpotlight
import UniformTypeIdentifiers

/// The week's planned sessions in Spotlight ("sweet spot" finds tonight's
/// ride); a tap opens its detail in Training. Readiness, sleep and the coach
/// are there already as App Shortcuts (SiriShortcuts.swift).
enum AurinSpotlight {
    static let domain = "health.aurin.planned"

    static func index(_ sessions: [WeekSession]) {
        let items = sessions.map { session -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = session.title
            attributes.contentDescription = [sport(session.sport), Fmt.capitalized(Fmt.weekdayShort(session.date)) + " " + Fmt.dayMonth(session.date),
                                             session.time.map { ClockText.format($0) }].compactMap { $0 }.joined(separator: " · ")
            attributes.keywords = [L10n.tr("trénink"), sport(session.sport)].compactMap { $0 }
            let item = CSSearchableItem(uniqueIdentifier: session.id, domainIdentifier: domain, attributeSet: attributes)
            // Gone from search once the day is over.
            item.expirationDate = Calendar.current.date(byAdding: .day, value: 1, to: DateFormatters.iso().date(from: session.date) ?? Date())
            return item
        }
        let index = CSSearchableIndex.default()
        index.deleteSearchableItems(withDomainIdentifiers: [domain]) { _ in
            guard !items.isEmpty else { return }
            index.indexSearchableItems(items)
        }
    }

    static func clear() {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domain])
    }

    private static func sport(_ sport: String) -> String? {
        switch sport {
        case "ride": return L10n.tr("Kolo")
        case "run": return L10n.tr("Běh")
        case "strength": return L10n.tr("Posilovna")
        case "swim": return L10n.tr("Plavání")
        default: return nil
        }
    }
}
