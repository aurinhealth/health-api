import Foundation
import SwiftUI

/// The app's language (Settings → Jazyk). Czech is the source language: every
/// Czech text is its own key, and en.lproj/Localizable.strings holds the
/// hand-written English for it. Server-made texts follow X-Interface-Language.
enum L10n {
    static let key = "language"

    /// "cs" or "en". Kept in the App Group too, so the widgets speak the same language.
    /// Until Settings → Jazyk is chosen, the app (and the widgets) follow the phone.
    /// Every translated text asks, so the app reads it once and keeps it
    /// (setLanguage changes it). The widgets run in a process of their own,
    /// where the app's choice comes from outside: they read it each time.
    static var language: String {
        guard keepsLanguage else { return stored }
        lock.lock()
        defer { lock.unlock() }
        if let kept { return kept }
        let value = stored
        kept = value
        return value
    }

    private static var stored: String {
        UserDefaults(suiteName: WidgetSnapshot.group)?.string(forKey: key)
            ?? UserDefaults.standard.string(forKey: key) ?? defaultLanguage
    }

    /// The app itself, not the widget extension.
    private static let keepsLanguage = !Bundle.main.bundlePath.hasSuffix(".appex")
    private static let lock = NSLock()
    // Guarded by lock.
    nonisolated(unsafe) private static var kept: String?

    /// The language before anyone chose one: the phone's. Czech and Slovak phones
    /// get Czech, every other phone English.
    static var defaultLanguage: String { defaultLanguage(for: Locale.preferredLanguages) }

    static func defaultLanguage(for preferred: [String]) -> String {
        let first = preferred.first?.lowercased() ?? ""
        return first.hasPrefix("cs") || first.hasPrefix("sk") ? "cs" : "en"
    }

    static var isEnglish: Bool { language == "en" }

    static var locale: Locale { isEnglish ? englishLocale : czechLocale }
    // The language's texts with the phone region's formats (dates, decimal mark):
    // English in the UK writes "8 October" and in Germany "62,5". No region: the US.
    // Czech shows only on Czech and Slovak phones; elsewhere it keeps Czech formats.
    private static let region = Locale.current.region?.identifier
    private static let englishLocale = Locale(identifier: "en_" + (region ?? "US"))
    private static let czechLocale = Locale(identifier: "cs_" + (region == "SK" ? "SK" : "CZ"))

    static func setLanguage(_ value: String) {
        UserDefaults.standard.set(value, forKey: key)
        UserDefaults(suiteName: WidgetSnapshot.group)?.set(value, forKey: key)
        lock.lock()
        kept = value
        lock.unlock()
        // The next launch also loads system texts (buttons, dialogs) in this language.
        UserDefaults.standard.set([value], forKey: "AppleLanguages")
    }

    private static let english: Bundle? = bundle("en")
    private static let czech: Bundle? = bundle("cs")
    private static func bundle(_ language: String) -> Bundle? {
        Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:))
            ?? Bundle(for: Marker.self).path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:))
    }
    private final class Marker {}

    /// The text in the app's language; a text without a translation stays as it is.
    static func tr(_ text: String) -> String {
        guard isEnglish, let english, !text.isEmpty else { return text }
        let missing = "\u{1}"
        let found = english.localizedString(forKey: text, value: missing, table: nil)
        if found != missing { return found }
        // "Světlý" made from "světlý": the same text with a capital letter.
        if let first = text.first, first.isUppercase {
            let lower = first.lowercased() + text.dropFirst()
            let found = english.localizedString(forKey: lower, value: missing, table: nil)
            if found != missing { return found.prefix(1).uppercased() + found.dropFirst() }
        }
        return text
    }

    /// A translated format with arguments: L10n.f("%@ z %@", a, b).
    static func f(_ format: String, _ args: CVarArg...) -> String {
        String(format: tr(format), locale: locale, arguments: args)
    }

    /// A text with a count, in the form the count asks for: L10n.plural("%lld dní", 5)
    /// is "5 dní" (1 den, 2 dny) and in English "5 days". Each language's forms live
    /// in its Plurals.stringsdict (Czech one, few and other; English one and other),
    /// keyed by the Czech text for five. The arguments go in the key's order.
    static func plural(_ key: String, _ args: CVarArg...) -> String {
        let format = (isEnglish ? english : czech)?.localizedString(forKey: key, value: key, table: "Plurals") ?? key
        return String(format: format, locale: locale, arguments: args)
    }
}

extension Text {
    /// Text(title) with a String in a variable shows it in the app's language.
    /// Literals keep using LocalizedStringKey (the environment's locale).
    @_disfavoredOverload
    init(_ content: String) {
        self.init(verbatim: L10n.tr(content))
    }
}
