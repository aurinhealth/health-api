// Deník (the habit journal): the catalogue of behaviours the athlete can pin,
// in Czech and English. Our own neutral names, no explanations. The choice
// follows what sleep, recovery and training research looks at: evening light
// and screens, sleep timing and place, alcohol, caffeine and late meals,
// heat and cold, breathing and relaxation, illness, travel, medication and
// common supplements.
//
// Item fields:
// - type: "yesno" (✕ / ✓), "amount" (a number with a unit), "time" (a clock
//   time) or "scale" (1–5);
// - unit: a text ("mg") or plural forms ({ cs: [1, 2–4, 5+], en: [1, 2+],
//   from: the Czech after "od": [1, 2+] });
// - step, usual, max: the amount sheet's stepper;
// - withTime: the amount also has the time of the last one (alcohol, caffeine);
// - late: a time item counts as ✓ from this time on (late meal, evening training);
// - auto: filled in from the day's data (journal-store.js autoDays);
// - follow: follow-up questions a ✓ opens inline (Sauna: minutes, temperature);
// - when: "morning" asks the next morning about the day, "evening" the same evening.
import { L } from "./lang.js";

export const CATEGORIES = ["sleep", "food", "recovery", "health", "meds", "supplements"];

const CATEGORY_TEXT = {
  sleep: ["Spánek", "Sleep", "Večer a noc", "Evening and night"],
  food: ["Jídlo a pití", "Food and drink", "Jídlo a pití", "Food and drink"],
  recovery: ["Regenerace", "Recovery", "Regenerace", "Recovery"],
  health: ["Zdraví", "Health", "Zdraví", "Health"],
  meds: ["Léky", "Medication", "Léky", "Medication"],
  supplements: ["Doplňky", "Supplements", "Doplňky", "Supplements"]
};
// The tab of the catalogue and the section of the journal.
export const categoryTitle = cat => { const t = CATEGORY_TEXT[cat] || CATEGORY_TEXT.supplements; return L(t[0], t[1]); };
export const sectionTitle = cat => { const t = CATEGORY_TEXT[cat] || CATEGORY_TEXT.supplements; return L(t[2], t[3]); };

const CATEGORY_ICON = { sleep: "moon.zzz", food: "fork.knife", recovery: "leaf.fill", health: "heart", meds: "pills.fill", supplements: "capsule.portrait" };

const DRINKS = { cs: ["nápoj", "nápoje", "nápojů"], en: ["drink", "drinks"], from: ["nápoje", "nápojů"] };
const CIGARETTES = { cs: ["cigareta", "cigarety", "cigaret"], en: ["cigarette", "cigarettes"], from: ["cigarety", "cigaret"] };
const CUPS = { cs: ["šálek", "šálky", "šálků"], en: ["cup", "cups"], from: ["šálku", "šálků"] };
const MIN = { key: "minutes", cs: "Kolik minut", en: "Minutes", kind: "stepper", unit: "min" };
const minutes = (value, step, max) => ({ ...MIN, min: step, max, step, default: value });

const y = (key, cs, en, cat, icon, extra = {}) => ({ key, cs, en, cat, type: "yesno", icon, ...extra });
const amount = (key, cs, en, cat, icon, unit, step, usual, max, extra = {}) => ({ key, cs, en, cat, type: "amount", icon, unit, step, usual, max, ...extra });

export const CATALOG = [
  // Večer a noc
  y("phone_in_bed", "Mobil v posteli", "Phone in bed", "sleep", "iphone"),
  y("late_bed", "Pozdě spát", "Late to bed", "sleep", "moon.fill", { auto: "late_bed" }),
  y("sleep_away", "Spánek mimo domov", "Slept away from home", "sleep", "bed.double"),
  y("early_wake", "Brzké vstávání", "Early alarm", "sleep", "alarm"),
  y("reading_bed", "Čtení v posteli", "Reading in bed", "sleep", "books.vertical"),
  y("pet_bedroom", "Domácí mazlíček v ložnici", "Pet in the bedroom", "sleep", "heart"),
  y("partner_bed", "Partner v posteli", "Partner in bed", "sleep", "person.2"),
  y("nap", "Spánek přes den", "Daytime nap", "sleep", "bed.double.fill", { follow: [minutes(20, 5, 120)], auto: "nap" }),
  y("screen_late", "Obrazovka po 22:00", "Screen after 10 pm", "sleep", "iphone"),
  y("series_before_bed", "Seriál před spaním", "Series before bed", "sleep", "play.rectangle"),
  y("blackout_room", "Zatemněná ložnice", "Blackout bedroom", "sleep", "moon.zzz"),
  y("earplugs", "Špunty do uší", "Earplugs", "sleep", "moon.zzz"),
  y("sleep_mask", "Maska na oči", "Sleep mask", "sleep", "moon.zzz"),
  y("cool_bedroom", "Chladná ložnice", "Cool bedroom", "sleep", "wind"),
  y("night_noise", "Hluk v noci", "Noise at night", "sleep", "waveform.path"),
  y("woken_kids", "Vzbudily mě děti", "Woken by the children", "sleep", "person.2"),
  y("wind_down", "Večerní rituál", "Wind-down routine", "sleep", "sparkles"),
  y("work_late", "Práce do večera", "Working late", "sleep", "square.and.pencil"),
  y("regular_bedtime", "Spát ve stejnou dobu", "Same bedtime as usual", "sleep", "clock", { auto: "regular_bedtime" }),
  y("night_shift", "Noční směna", "Night shift", "sleep", "moon.fill"),
  y("mouth_tape", "Páska na ústa", "Mouth tape", "sleep", "bandage.fill"),
  y("white_noise", "Bílý šum", "White noise", "sleep", "waveform.path"),
  y("weighted_blanket", "Zátěžová deka", "Weighted blanket", "sleep", "bed.double"),
  y("bedroom_tv", "Televize v ložnici", "TV in the bedroom", "sleep", "play.rectangle"),

  // Jídlo a pití
  amount("alcohol", "Alkohol", "Alcohol", "food", "wineglass.fill", DRINKS, 1, 1, 15, { withTime: true, auto: "alcohol" }),
  amount("caffeine", "Kofein", "Caffeine", "food", "cup.and.saucer.fill", "mg", 20, 100, 1000, { withTime: true, auto: "caffeine" }),
  { key: "late_meal", cs: "Pozdní jídlo", en: "Late meal", cat: "food", type: "time", icon: "fork.knife", late: "20:00", auto: "late_meal" },
  y("late_caffeine", "Kofein po 14:00", "Caffeine after 2 pm", "food", "cup.and.saucer", { auto: "late_caffeine" }),
  y("extra_sugar", "Cukr navíc", "Extra sugar", "food", "takeoutbag.and.cup.and.straw.fill"),
  y("heavy_dinner", "Vydatná večeře", "Big dinner", "food", "fork.knife", { auto: "heavy_dinner" }),
  y("spicy_food", "Pálivé jídlo", "Spicy food", "food", "flame.fill"),
  y("little_water", "Málo vody", "Too little water", "food", "drop.fill", { auto: "little_water" }),
  y("fast_food", "Rychlé občerstvení", "Fast food", "food", "takeoutbag.and.cup.and.straw.fill"),
  y("fasting", "Půst", "Fasting", "food", "timer"),
  y("energy_drink", "Energetický nápoj", "Energy drink", "food", "bolt.fill", { auto: "energy_drink" }),
  y("dairy", "Mléčné výrobky", "Dairy", "food", "drop.fill"),
  y("gluten", "Lepek", "Gluten", "food", "fork.knife"),
  y("red_meat", "Červené maso", "Red meat", "food", "fork.knife"),
  y("plant_day", "Jen rostlinná strava", "Plant-based day", "food", "leaf.fill"),
  y("processed_food", "Průmyslově zpracované jídlo", "Ultra-processed food", "food", "carton.fill"),
  y("five_veg", "Pět porcí ovoce a zeleniny", "Five portions of fruit and veg", "food", "leaf.fill"),
  y("salty_food", "Slané jídlo", "Salty food", "food", "fork.knife"),
  y("sweets_evening", "Sladké večer", "Sweets in the evening", "food", "takeoutbag.and.cup.and.straw.fill"),
  y("high_protein", "Hodně bílkovin", "High-protein day", "food", "fork.knife"),
  y("carbs_dinner", "Sacharidy k večeři", "Carbs at dinner", "food", "fork.knife"),
  y("herbal_tea", "Bylinný čaj večer", "Herbal tea in the evening", "food", "mug.fill"),
  y("fermented_food", "Fermentované potraviny", "Fermented foods", "food", "leaf.fill"),
  y("drink_before_bed", "Pití před spaním", "Drinking before bed", "food", "drop.fill", { auto: "drink_before_bed" }),
  amount("coffee_cups", "Káva", "Coffee", "food", "cup.and.saucer.fill", CUPS, 1, 2, 10, { withTime: true, auto: "coffee_cups" }),
  y("eating_out", "Jídlo v restauraci", "Eating out", "food", "fork.knife"),
  y("skipped_meal", "Vynechané jídlo", "Skipped meal", "food", "timer"),

  // Regenerace
  y("sauna", "Sauna", "Sauna", "recovery", "flame", { follow: [minutes(15, 5, 90), { key: "temp", cs: "Teplota", en: "Temperature", kind: "chips", unit: "°C", options: [70, 80, 90], default: 80 }] }),
  y("cold_exposure", "Otužování", "Cold exposure", "recovery", "drop.fill", { follow: [minutes(3, 1, 30)] }),
  y("outdoors", "Venku 30+ min", "Outdoors 30+ min", "recovery", "sun.max.fill", { auto: "outdoors" }),
  y("breathing", "Dechová cvičení", "Breathing exercises", "recovery", "wind", { follow: [minutes(10, 5, 60)] }),
  y("meditation", "Meditace", "Meditation", "recovery", "sparkle", { follow: [minutes(10, 5, 90)] }),
  y("massage", "Masáž", "Massage", "recovery", "figure.cooldown"),
  y("stretching", "Protahování", "Stretching", "recovery", "figure.flexibility", { follow: [minutes(15, 5, 90)] }),
  y("yoga", "Jóga", "Yoga", "recovery", "figure.cooldown", { auto: "yoga" }),
  y("foam_rolling", "Válec", "Foam rolling", "recovery", "figure.flexibility"),
  y("walk_after_meal", "Procházka po jídle", "Walk after a meal", "recovery", "figure.walk"),
  y("morning_light", "Ranní světlo", "Morning daylight", "recovery", "sun.max"),
  y("hot_bath", "Horká koupel", "Hot bath", "recovery", "drop.fill"),
  y("compression", "Kompresní návleky", "Compression garments", "recovery", "figure.cooldown"),
  { key: "evening_training", cs: "Večerní trénink", en: "Evening training", cat: "recovery", type: "time", icon: "figure.run", late: "18:00", auto: "evening_training" },
  y("hard_training", "Tvrdý trénink", "Hard workout", "recovery", "flame.fill", { auto: "hard_training" }),
  y("rest_day", "Den bez tréninku", "Day without training", "recovery", "beach.umbrella.fill", { auto: "rest_day" }),
  y("long_sitting", "Dlouhé sezení", "Long sitting", "recovery", "clock"),
  y("nature", "Čas v přírodě", "Time in nature", "recovery", "leaf.fill"),
  y("gratitude", "Vděčnost na papíře", "Gratitude written down", "recovery", "square.and.pencil"),
  y("friends", "Čas s přáteli", "Time with friends", "recovery", "person.2.fill"),
  y("sex", "Sex", "Sex", "recovery", "heart.fill"),
  y("calm_music", "Klidná hudba", "Calm music", "recovery", "waveform.path"),
  y("no_social", "Den bez sociálních sítí", "Day off social media", "recovery", "iphone"),
  y("physio", "Fyzioterapie", "Physiotherapy", "recovery", "figure.flexibility"),
  y("acupuncture", "Akupunktura", "Acupuncture", "recovery", "sparkle"),
  y("red_light", "Červené světlo", "Red-light therapy", "recovery", "sun.max"),
  y("long_walk", "Dlouhá procházka", "Long walk", "recovery", "figure.walk", { auto: "long_walk" }),

  // Zdraví
  y("sick", "Nemoc", "Illness", "health", "bandage.fill"),
  y("runny_nose", "Rýma", "Runny nose", "health", "drop.fill"),
  y("allergy", "Alergie", "Allergy", "health", "leaf.fill"),
  y("headache", "Bolest hlavy", "Headache", "health", "brain.head.profile"),
  y("sore_muscles", "Bolest svalů", "Sore muscles", "health", "figure.strengthtraining.traditional"),
  y("injury", "Zranění", "Injury", "health", "bandage.fill"),
  { key: "stress", cs: "Stres", en: "Stress", cat: "health", type: "scale", icon: "brain.head.profile" },
  y("air_travel", "Cestování letadlem", "Air travel", "health", "paperplane"),
  y("time_zone", "Změna časového pásma", "Time-zone change", "health", "globe"),
  y("long_drive", "Dlouhá cesta autem", "Long drive", "health", "clock"),
  y("anxiety", "Úzkost", "Anxiety", "health", "brain.head.profile"),
  y("busy_workday", "Náročný den v práci", "Demanding workday", "health", "square.and.pencil"),
  y("argument", "Hádka", "Argument", "health", "text.bubble"),
  y("vaccination", "Očkování", "Vaccination", "health", "bandage.fill"),
  amount("smoking", "Kouření", "Smoking", "health", "flame", CIGARETTES, 1, 5, 60),
  y("nicotine", "Nikotin bez kouře", "Smoke-free nicotine", "health", "flame"),
  y("cannabis", "Konopí", "Cannabis", "health", "leaf.fill"),
  y("altitude", "Pobyt na horách", "Time at altitude", "health", "mappin.and.ellipse"),
  y("hot_weather", "Horko", "Hot weather", "health", "sun.max.fill"),
  y("hangover", "Kocovina", "Hangover", "health", "wineglass.fill"),
  y("stomach", "Potíže se žaludkem", "Stomach trouble", "health", "exclamationmark.circle"),

  // Léky
  y("antibiotics", "Antibiotika", "Antibiotics", "meds", "pills.fill"),
  y("painkillers", "Léky na bolest", "Painkillers", "meds", "pills.fill"),
  y("antihistamines", "Antihistaminika", "Antihistamines", "meds", "pills.fill"),
  y("sleeping_pill", "Lék na spaní", "Sleeping pill", "meds", "pills.fill"),
  y("blood_pressure_meds", "Léky na tlak", "Blood-pressure medication", "meds", "pills.fill"),
  y("antidepressants", "Antidepresiva", "Antidepressants", "meds", "pills.fill"),
  y("cold_medicine", "Lék na nachlazení", "Cold medicine", "meds", "pills.fill"),
  y("inhaler", "Inhalátor", "Inhaler", "meds", "wind"),
  y("thyroid_meds", "Léky na štítnou žlázu", "Thyroid medication", "meds", "pills.fill"),
  y("nasal_spray", "Nosní sprej", "Nasal spray", "meds", "drop.fill"),

  // Doplňky
  amount("magnesium", "Hořčík", "Magnesium", "supplements", "capsule.portrait", "mg", 50, 300, 1000),
  amount("creatine", "Kreatin", "Creatine", "supplements", "capsule.portrait", "g", 1, 5, 20),
  amount("ashwagandha", "Ashwagandha", "Ashwagandha", "supplements", "capsule.portrait", "mg", 100, 600, 2000),
  y("electrolytes", "Elektrolyty", "Electrolytes", "supplements", "drop.fill"),
  amount("melatonin", "Melatonin", "Melatonin", "supplements", "capsule.portrait", "mg", 0.5, 1, 10),
  y("vitamin_d", "Vitamín D", "Vitamin D", "supplements", "sun.max"),
  y("omega3", "Omega-3", "Omega-3", "supplements", "capsule.portrait"),
  y("zinc", "Zinek", "Zinc", "supplements", "capsule.portrait"),
  y("iron", "Železo", "Iron", "supplements", "capsule.portrait"),
  y("protein_shake", "Proteinový nápoj", "Protein shake", "supplements", "waterbottle.fill"),
  amount("glycine", "Glycin", "Glycine", "supplements", "capsule.portrait", "g", 1, 3, 15),
  amount("theanine", "L-theanin", "L-theanine", "supplements", "capsule.portrait", "mg", 50, 200, 800),
  y("tart_cherry", "Višňová šťáva", "Tart cherry juice", "supplements", "drop.fill"),
  y("probiotics", "Probiotika", "Probiotics", "supplements", "capsule.portrait"),
  y("collagen", "Kolagen", "Collagen", "supplements", "capsule.portrait"),
  y("multivitamin", "Multivitamín", "Multivitamin", "supplements", "capsule.portrait"),
  y("vitamin_c", "Vitamín C", "Vitamin C", "supplements", "capsule.portrait"),
  y("beta_alanine", "Beta-alanin", "Beta-alanine", "supplements", "capsule.portrait"),
  y("cbd", "CBD", "CBD", "supplements", "leaf.fill"),
  y("b_vitamins", "Vitamíny B", "B vitamins", "supplements", "capsule.portrait"),
  y("caffeine_pill", "Kofein v tabletě", "Caffeine tablet", "supplements", "capsule.portrait")
];

const BY_KEY = new Map(CATALOG.map(item => [item.key, item]));
export const catalogItem = key => BY_KEY.get(key) || null;

// What a new journal starts with: the four filled in from the data and five
// common questions (the "Dnes" card's "4 z 9").
export const DEFAULT_PINNED = ["alcohol", "caffeine", "late_meal", "evening_training", "phone_in_bed", "late_bed", "sleep_away", "sauna", "outdoors"];

// Items the impact screen never ranks: illness takes days out of every other
// item's comparison instead (journal-impact.js).
export const NOT_RANKED = new Set(["sick"]);

// The part of the day an item belongs to in the journal's list ("Ráno",
// "Přes den", "Večer", "Noc"): from its time when the day has one, else from
// when it usually happens.
// "Dnešní noc" is what happened in the night the day ends with, up to the
// wake-up: the morning sheet asks it right away, while the rest of the day
// can be filled in later.
export const PARTS = ["morning", "day", "evening", "night", "last_night"];
const PART_TEXT = { morning: ["Ráno", "Morning"], day: ["Přes den", "Daytime"], evening: ["Večer", "Evening"], night: ["Noc", "Night"], last_night: ["Dnešní noc", "Last night"] };
export const partTitle = part => L(...(PART_TEXT[part] || PART_TEXT.day));
const MORNING = new Set(["morning_light", "caffeine", "coffee_cups"]);
const EVENING = new Set(["alcohol", "late_meal", "evening_training", "heavy_dinner", "sweets_evening", "carbs_dinner", "herbal_tea", "drink_before_bed",
  "sauna", "hot_bath", "screen_late", "series_before_bed", "work_late", "wind_down", "reading_bed", "gratitude", "calm_music", "sex",
  "melatonin", "glycine", "theanine", "magnesium", "tart_cherry", "sleeping_pill"]);
const EVENING_SLEEP = new Set(["nap"]);
const LAST_NIGHT = new Set(["early_wake", "night_noise", "woken_kids", "sleep_away", "partner_bed", "pet_bedroom", "night_shift",
  "blackout_room", "cool_bedroom", "earplugs", "sleep_mask", "mouth_tape", "white_noise", "weighted_blanket"]);
export function usualPart(item) {
  if (LAST_NIGHT.has(item.key)) return "last_night";
  if (MORNING.has(item.key)) return "morning";
  if (EVENING.has(item.key)) return "evening";
  if (item.cat === "sleep") return EVENING_SLEEP.has(item.key) ? "day" : "night";
  if (item.cat === "meds" || item.cat === "supplements") return "morning";
  if (item.custom) return item.when === "evening" ? "evening" : "day";
  return "day";
}
// "HH:MM" → the part; after midnight (until 4:00) is still the night.
export function partOfTime(time) {
  if (!/^\d{2}:\d{2}$/.test(String(time || ""))) return null;
  return time < "04:00" ? "night" : time < "11:00" ? "morning" : time < "17:00" ? "day" : time < "22:00" ? "evening" : "night";
}

const TYPES = ["yesno", "amount", "time", "scale"];
const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const finite = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// A custom item from the "Nová položka" form; throws with a message the app shows.
export function normalizeCustomItem(input, key) {
  const name = clean(input?.name, 40);
  if (!name) throw new Error(L("Napiš název položky.", "Enter the item's name."));
  const type = TYPES.includes(input?.type) ? input.type : "yesno";
  const cat = CATEGORIES.includes(input?.category) ? input.category : "supplements";
  const when = input?.when === "evening" ? "evening" : "morning";
  const item = { key, name, cat, type, when, custom: true };
  if (type === "amount") {
    const usual = finite(input?.usual);
    item.unit = clean(input?.unit, 12);
    item.usual = usual != null && usual > 0 && usual <= 100000 ? usual : 1;
    // A step that makes the usual amount a few taps away: 600 mg in 100s, 5 g in 1s.
    const magnitude = 10 ** Math.floor(Math.log10(item.usual));
    item.step = item.usual < 1 ? 0.5 : magnitude >= 100 ? magnitude : magnitude >= 10 ? magnitude / 2 : 1;
    item.max = Math.max(item.usual * 10, 10);
  }
  return item;
}

// One item as the app shows it, in the request's language.
export function itemView(item) {
  if (!item) return null;
  const name = item.custom ? item.name : L(item.cs, item.en);
  const out = { key: item.key, name, category: item.cat, type: item.type, icon: item.icon || CATEGORY_ICON[item.cat] || "circle.dotted", when: item.when || "morning" };
  if (item.custom) out.custom = true;
  if (item.auto) out.auto = true;
  // "limit", "low", "high" and "initial" rather than max, min and default: names Swift keeps for itself.
  if (item.type === "amount") Object.assign(out, { unit: unitText(item.unit, 5), units: unitForms(item.unit), step: item.step, usual: item.usual, limit: item.max, ...(item.withTime ? { withTime: true } : {}) });
  if (item.type === "time" && item.late) out.late = item.late;
  if (item.follow) out.follow = item.follow.map(f => ({ key: f.key, label: L(f.cs, f.en), kind: f.kind, unit: f.unit, ...(f.options ? { options: f.options } : {}), ...(f.min != null ? { low: f.min, high: f.max, step: f.step } : {}), initial: f.default }));
  return out;
}

// The unit's forms for the app's stepper: [1, 2–4, 5+] in Czech, [1, 2+] in English.
function unitForms(unit) {
  if (!unit) return null;
  if (typeof unit === "string") return [unit, unit, unit];
  return L("cs", "en") === "en" ? [unit.en[0], unit.en[1], unit.en[1]] : unit.cs;
}

// The unit after an amount: "mg", "2 nápoje", "5 drinks".
export function unitText(unit, count) {
  if (!unit) return "";
  if (typeof unit === "string") return unit;
  const n = Math.abs(Number(count) || 0);
  if (L("cs", "en") === "en") return n === 1 ? unit.en[0] : unit.en[1];
  return n === 1 ? unit.cs[0] : Number.isInteger(n) && n >= 2 && n <= 4 ? unit.cs[1] : unit.cs[2];
}
