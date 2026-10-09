import Foundation
import SwiftUI

/// The app's language (Settings → Jazyk). Czech is the source language: every
/// Czech text is its own key, and en.lproj/Localizable.strings holds the
/// hand-written English for it. Server-made texts follow X-Interface-Language.
enum L10n {
    static let key = "language"

    /// "cs" or "en". Kept in the App Group too, so the widgets speak the same language.
    static var language: String {
        UserDefaults(suiteName: WidgetSnapshot.group)?.string(forKey: key)
            ?? UserDefaults.standard.string(forKey: key) ?? "cs"
    }

    static var isEnglish: Bool { language == "en" }

    static var locale: Locale { Locale(identifier: isEnglish ? "en_US" : "cs_CZ") }

    static func setLanguage(_ value: String) {
        UserDefaults.standard.set(value, forKey: key)
        UserDefaults(suiteName: WidgetSnapshot.group)?.set(value, forKey: key)
        // The next launch also loads system texts (buttons, dialogs) in this language.
        UserDefaults.standard.set([value], forKey: "AppleLanguages")
    }

    private static let english: Bundle? = Bundle.main.path(forResource: "en", ofType: "lproj").flatMap(Bundle.init(path:))
        ?? Bundle(for: Marker.self).path(forResource: "en", ofType: "lproj").flatMap(Bundle.init(path:))
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
}

extension Text {
    /// Text(title) with a String in a variable shows it in the app's language.
    /// Literals keep using LocalizedStringKey (the environment's locale).
    @_disfavoredOverload
    init(_ content: String) {
        self.init(verbatim: L10n.tr(content))
    }
}
