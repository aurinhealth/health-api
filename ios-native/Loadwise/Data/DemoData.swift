import Foundation

/// Sample day in the shape of /app/api/today, for previews, the screenshot
/// tests and "Prohlédnout ukázku" on the sign-in screen.
enum DemoData {
    static let today: TodaySnapshot = {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(TodaySnapshot.self, from: Data(json.utf8))
    }()

    private static let json = """
    {
      "status": "ok",
      "date": "2026-10-08",
      "readiness": { "score": 78, "zone": "green" },
      "sleep": { "minutes": 432, "inBedMinutes": 458, "index": 86, "need": 485, "start": "23:48", "end": "07:02" },
      "strain": { "score": 8.4, "planned": 13.1 },
      "hrv": { "value": 64, "baseline": 58, "low": 52, "high": 65, "trend": "up", "series": [
        {"date":"2026-09-09","value":56},{"date":"2026-09-10","value":58},{"date":"2026-09-11","value":55},{"date":"2026-09-12","value":60},
        {"date":"2026-09-13","value":57},{"date":"2026-09-14","value":61},{"date":"2026-09-15","value":52},{"date":"2026-09-16","value":54},
        {"date":"2026-09-17","value":59},{"date":"2026-09-18","value":62},{"date":"2026-09-19","value":57},{"date":"2026-09-20","value":53},
        {"date":"2026-09-21","value":48},{"date":"2026-09-22","value":50},{"date":"2026-09-23","value":56},{"date":"2026-09-24","value":60},
        {"date":"2026-09-25","value":62},{"date":"2026-09-26","value":58},{"date":"2026-09-27","value":63},{"date":"2026-09-28","value":61},
        {"date":"2026-09-29","value":56},{"date":"2026-09-30","value":59},{"date":"2026-10-01","value":62},{"date":"2026-10-02","value":60},
        {"date":"2026-10-03","value":64},{"date":"2026-10-04","value":61},{"date":"2026-10-05","value":65},{"date":"2026-10-06","value":66},
        {"date":"2026-10-07","value":63},{"date":"2026-10-08","value":64}] },
      "restingHR": { "value": 48, "baseline": 50.2, "series": [
        {"date":"2026-09-25","value":50},{"date":"2026-09-26","value":50},{"date":"2026-09-27","value":51},{"date":"2026-09-28","value":49},
        {"date":"2026-09-29","value":50},{"date":"2026-09-30","value":52},{"date":"2026-10-01","value":53},{"date":"2026-10-02","value":51},
        {"date":"2026-10-03","value":50},{"date":"2026-10-04","value":49},{"date":"2026-10-05","value":49},{"date":"2026-10-06","value":48},
        {"date":"2026-10-07","value":48},{"date":"2026-10-08","value":48}] },
      "summary": {
        "headline": "Jak dnes začít",
        "text": "Spánek 7 h 12 min (40 min více než obvykle). HRV je třetí den nad normou.",
        "recommendation": "Silový trénink dej naplno, hodinu a půl před ním si dej svačinu se sacharidy."
      },
      "nutrition": {
        "kcal": 1380, "target": 2650, "trainingBonus": 350,
        "protein": { "eaten": 112, "target": 150 },
        "carbs": { "eaten": 205, "target": 330 },
        "fat": { "eaten": 37, "target": 80 },
        "water": { "ml": 1800, "target": 2500 }
      },
      "plan": [
        { "kind": "workout", "time": "17:30", "title": "Silový trénink", "detail": "45 min · celé tělo", "done": false },
        { "kind": "bedtime", "time": "22:45", "title": "Do postele", "detail": "potřeba spánku 8 h 05 min", "done": false }
      ],
      "tonight": { "bedtime": "22:45", "wake": "07:00", "need": 485 },
      "steps": { "today": 6420, "goal": 10000, "hour": 15,
        "hourly": [0,0,0,0,0,0,60,460,460,270,210,340,550,210,3540,320,0,0,0,0,0,0,0,0],
        "usual": [0,0,0,0,0,0,80,600,1300,1900,2500,3100,4000,4700,5400,6100,6900,7700,8500,9100,9500,9700,9800,9800],
        "week": [
        {"date":"2026-10-02","value":11200},{"date":"2026-10-03","value":8100},{"date":"2026-10-04","value":12600},
        {"date":"2026-10-05","value":9300},{"date":"2026-10-06","value":10400},{"date":"2026-10-07","value":7300},{"date":"2026-10-08","value":6420}] },
      "weight": { "latest": 82.4, "goal": 80, "series": [
        {"date":"2026-09-09","value":83.3},{"date":"2026-09-11","value":83.5},{"date":"2026-09-13","value":83.1},{"date":"2026-09-15","value":83.4},
        {"date":"2026-09-17","value":83.0},{"date":"2026-09-19","value":83.2},{"date":"2026-09-21","value":82.9},{"date":"2026-09-23","value":83.1},
        {"date":"2026-09-25","value":82.7},{"date":"2026-09-27","value":82.9},{"date":"2026-09-29","value":82.6},{"date":"2026-10-01","value":82.8},
        {"date":"2026-10-03","value":82.5},{"date":"2026-10-05","value":82.7},{"date":"2026-10-07","value":82.4}] }
    }
    """
}
