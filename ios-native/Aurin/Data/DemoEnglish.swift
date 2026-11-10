import Foundation

// The sample day in English: an English phone (and the website's screenshots) sees English
// names and sentences, not the Czech made-up data.
extension DemoData {
    /// A sample text in the app's language.
    static func local(_ text: String) -> String {
        L10n.isEnglish ? english[text] ?? text : text
    }

    static func decode<T: Decodable>(_ json: String) -> T {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// The sample JSON with every whole Czech text value swapped for its English one.
    static func inEnglish(_ json: String) -> String {
        english.keys.sorted { $0.count > $1.count }.reduce(json) { text, key in
            text.replacingOccurrences(of: "\"\(key)\"", with: "\"\(english[key] ?? key)\"")
        }
    }

    static let english: [String: String] = [
        // Today
        "Déšť na 80 %.": "80% chance of rain.",
        "Nejvýš 14°, déšť na 30 %.": "High of 14°, 30% chance of rain.",
        "Nejvýš 8°, déšť na 60 %.": "High of 8°, 60% chance of rain.",
        "Sucho, nejvýš 11°.": "Dry, high of 11°.",
        "Sucho, nejvýš 12°.": "Dry, high of 12°.",
        "Sucho, nejvýš 13°.": "Dry, high of 13°.",
        "Sucho, nejvýš 9°.": "Dry, high of 9°.",
        "Jak dnes začít": "How to start today",
        "Spánek 7 h 12 min, kousek pod potřebou. HRV je třetí den nad obvyklým rozmezím.":
            "Sleep 7 h 12 min, a little under your need. HRV is above your usual range for the third day.",
        "Silový trénink dej naplno, hodinu a půl před ním si dej svačinu se sacharidy.":
            "Go all in on strength today, with a carb snack an hour and a half before.",
        "Silový trénink": "Strength training",
        "45 min · celé tělo": "45 min · full body",
        "Do postele": "Bedtime",
        "Ranní běh": "Morning run",
        "Kolo · tempo": "Ride · tempo",
        "potřeba spánku 8 h 30 min": "sleep need 8 h 30 min",
        "Praha": "Prague",
        "Podle dostupné předpovědi.": "Based on the available forecast.",
        // Training
        "Silový trénink, celé tělo": "Strength, full body",
        "Proč dnes: vysoká připravenost a odpočatá horní polovina těla. Nohy jen lehký dřep po ranním běhu, ať jsou v sobotu čerstvé na dlouhý běh.":
            "Why today: high readiness and a rested upper body. Legs get only light squats after this morning's run, to stay fresh for Saturday's long run.",
        "Dřep": "Squat",
        "Tlak na lavici": "Bench press",
        "Přítahy": "Rows",
        "Přítahy v předklonu": "Bent-over rows",
        "Rumunský mrtvý tah": "Romanian deadlift",
        "Výpady": "Lunges",
        "Tlaky s jednoručkami nad hlavu": "DB shoulder press",
        "Ramena": "Shoulders",
        "Přední stehna": "Quads",
        "Hrudník": "Chest",
        "Záda": "Back",
        "Pražský půlmaraton": "Prague Half Marathon",
        "Půlmaraton pod 1:40": "Half marathon under 1:40",
        "Základ": "Base",
        "Rozvoj": "Build",
        "Ladění": "Taper",
        "budování": "building",
        "Únava je nad kondicí, přesně jak má při budování být. Kondice roste.":
            "Fatigue is above fitness, just as it should be while building. Fitness is rising.",
        "Intervaly 4×8": "Intervals 4×8",
        "Lehká jízda Z2": "Easy ride Z2",
        "Dlouhý běh": "Long run",
        "Regenerace": "Recovery",
        "vyšší intenzita než plán": "harder than planned",
        "Posilovna · horní tělo": "Gym · upper body",
        "Posilovna · dolní tělo": "Gym · lower body",
        "Posilovna · celé tělo": "Gym · full body",
        "Běh 14 km": "Run 14 km",
        "Lehký běh": "Easy run",
        "Dlouhá jízda": "Long ride",
        "Chůze": "Walk",
        "Procházka": "Walk",
        // Gym
        "Celé tělo": "Full body",
        "Celé tělo  •  08. 10. 2026": "Full body  •  Oct 8, 2026",
        "Ráno běh, v sobotu dlouhý běh: dřep jen lehce, 4×3.":
            "Run this morning, long run on Saturday: squats light only, 4×3.",
        // Food
        "Tréninkový den: o 350 kcal víc. Zbývá 1270 kcal, odpolední svačina kolem 360 kcal.":
            "Training day: 350 kcal more. 1,270 kcal left, an afternoon snack of about 360 kcal.",
        "Snídaně": "Breakfast",
        "Dopolední svačina": "Morning snack",
        "Oběd": "Lunch",
        "Odpolední svačina": "Afternoon snack",
        "Večeře": "Dinner",
        "Ovesná kaše s jogurtem": "Oatmeal with yogurt",
        "Banán": "Banana",
        "Rýže s kuřecím masem": "Chicken with rice",
        "Řecký jogurt bílý": "Plain Greek yogurt",
        "1 porce": "1 serving",
        // Settings
        "Spánek a fáze": "Sleep and stages",
        "Aktivity": "Activities",
        "Hmotnost": "Weight",
        "Jídlo": "Food",
        "Tréninky a plán": "Workouts and plan",
        "Fitness / únava / forma": "Fitness / fatigue / form",
        "Prahy, zóny a váha": "Thresholds, zones and weight",
        "Spánek, HRV a klidový tep": "Sleep, HRV and resting heart rate"
    ]
}
