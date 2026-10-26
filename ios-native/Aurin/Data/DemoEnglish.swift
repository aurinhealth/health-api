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
        "Jak dnes začít": "How to start today",
        "Spánek 7 h 12 min (40 min více než obvykle). HRV je třetí den nad normou.":
            "Sleep 7 h 12 min (40 min more than usual). HRV is above normal for the third day.",
        "Silový trénink dej naplno, hodinu a půl před ním si dej svačinu se sacharidy.":
            "Go all in on strength today, with a carb snack an hour and a half before.",
        "Silový trénink": "Strength training",
        "45 min · celé tělo": "45 min · full body",
        "Do postele": "Bedtime",
        "Ranní běh": "Morning run",
        "Kolo · tempo": "Ride · tempo",
        "potřeba spánku 8 h 05 min": "sleep need 8 h 05 min",
        "Praha": "Prague",
        "Podle dostupné předpovědi.": "Based on the available forecast.",
        // Training
        "Silový trénink, celé tělo": "Strength, full body",
        "Proč dnes: vysoká připravenost, nohy od pondělí v klidu, v sobotu delší běh.":
            "Why today: high readiness, legs rested since Monday, a longer run on Saturday.",
        "Dřep": "Squat",
        "Tlak na lavici": "Bench press",
        "Přítahy": "Rows",
        "Přítahy v předklonu": "Bent-over rows",
        "Rumunský mrtvý tah": "Romanian deadlift",
        "Výpady": "Lunges",
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
        "Lehký běh": "Easy run",
        "Dlouhá jízda": "Long ride",
        "Chůze": "Walk",
        "Procházka": "Walk",
        // Gym
        "Celé tělo": "Full body",
        "Celé tělo  •  08. 10. 2026": "Full body  •  Oct 8, 2026",
        "Nohy od pondělí v klidu, v sobotu delší běh: dřep ve střední zátěži.":
            "Legs rested since Monday, a longer run on Saturday: squats at a moderate load.",
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
        "Aktivity a plán": "Activities and plan",
        "Fitness / únava / forma": "Fitness / fatigue / form"
    ]
}
