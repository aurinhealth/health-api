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

    /// A legal page on aurin.health ("terms", "privacy"), in Czech while the app speaks Czech.
    static func legalURL(_ page: String) -> URL {
        URL(string: language == "cs" ? "https://aurin.health/cs/\(page)" : "https://aurin.health/\(page)")!
    }

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
    static func tr(_ text: String) -> String { tr(text, in: language) }

    /// The text in another language than the app's, "cs" or "en": the coach's
    /// questions follow the language the athlete writes to the coach in.
    static func tr(_ text: String, in language: String) -> String {
        guard language == "en", let english, !text.isEmpty else { return text }
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

    static func f(_ format: String, in language: String, _ args: CVarArg...) -> String {
        String(format: tr(format, in: language), locale: language == "en" ? englishLocale : czechLocale, arguments: args)
    }

    /// The language a message is written in, "cs" or "en", nil when it can't be
    /// told (a number, a name). Czech letters say Czech; otherwise the common
    /// words of each language, as people write to the coach without diacritics too.
    static func written(_ text: String) -> String? {
        let t = text.lowercased()
        if t.range(of: "[ěščřžýáíéůúňťď]", options: .regularExpression) != nil { return "cs" }
        let words = t.split { !$0.isLetter }.map(String.init)
        let cs = words.filter(czechWords.contains).count, en = words.filter(englishWords.contains).count
        return cs == en ? nil : cs > en ? "cs" : "en"
    }
    private static let czechWords: Set<String> = ["jak", "mam", "co", "proc", "dnes", "zitra", "jsem", "muzu", "je", "se", "na", "mi", "ale", "uz", "bych", "nebo", "kdy", "kolik", "trenink", "vcera", "jo", "ne", "dobre", "dik", "diky"]
    private static let englishWords: Set<String> = ["the", "what", "how", "should", "i", "my", "can", "today", "is", "do", "why", "and", "it", "me", "you", "tomorrow", "yesterday", "workout", "when", "feel", "thanks", "yes", "no", "ok"]

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
