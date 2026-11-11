// Every AI feature, the `feature` a caller gives callOpenAI (coach-assistant.js),
// in one place: its Czech name in the owner's daily report (ops-report.js),
// whether it is food (the nutrition safety line, no language note) and whether
// it runs without Aurin Pro once the paywall is on (subscription.js). The coach
// chat is the one feature the daily guard leaves out (ai-usage.js).
// Settings → Aurin Pro in the app lists technique as free (Petr, 7 Nov 2026).
export const COACH_CHAT_FEATURE = "assistant";
export const AI_FEATURES = {
  [COACH_CHAT_FEATURE]: { name: "chat s koučem" },
  "screen-text": { name: "věty kouče na obrazovkách" },
  "coach-check": { name: "kontrola odpovědi kouče" },
  reflection: { name: "poznámka po tréninku" },
  "coach-notes": { name: "poznámky kouče" },
  "week-revision": { name: "revize týdne" },
  "week-plan": { name: "plán týdne" },
  "day-review": { name: "revize dne" },
  "workout-pick": { name: "výběr tréninku dne" },
  "workout-compose": { name: "sestavení tréninku dne" },
  "workout-describe": { name: "popis vlastního tréninku" },
  "session-change": { name: "úprava tréninku slovy" },
  "gym-adjust": { name: "úprava posilovny slovy" },
  "gym-equipment": { name: "vybavení posilovny" },
  technique: { name: "technika cviku", free: true },
  "food-photo": { name: "jídlo z fotky", food: true },
  "food-lookup": { name: "dohledání potraviny", food: true },
  "food-sentence": { name: "jídlo větou", food: true },
  barcode: { name: "čárový kód", food: true }
};
export const isFoodFeature = feature => AI_FEATURES[feature]?.food === true;
export const isFreeFeature = feature => AI_FEATURES[feature]?.free === true;
export const featureName = feature => AI_FEATURES[feature]?.name || feature;
