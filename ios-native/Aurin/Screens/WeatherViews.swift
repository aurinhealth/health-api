import SwiftUI
import CoreLocation
import MapKit

// Weather on Today: the forecast for the place of the week plan
// (GET /app/api/today → weather, src/app-today.js todayWeather; Apple Weather
// through src/weatherkit.js) with the coach's advice where to train, and
// "Poloha pro počasí" to choose the place (Apple Maps search, saved as
// prefs.location of the usual week plan).

/// Apple Weather's credit: the " Weather" mark and the link to its other
/// data sources, in the weather's detail one tap from Today's card (Petr,
/// 2026-10-26: no mark on Today).
enum AppleWeather {
    static let legalPage = URL(string: "https://weatherkit.apple.com/legal-attribution.html")!

    static func credited(_ weather: TodaySnapshot.Weather?) -> Bool { weather?.source == "apple" }
}

/// " Weather", the mark beside Apple Weather's forecast.
struct AppleWeatherMark: View {
    var size: CGFloat = 11

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "apple.logo").font(.system(size: size, weight: .medium))
            Text(verbatim: "Weather").font(.system(size: size, weight: .medium))
        }
        .foregroundStyle(Palette.faint)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "Apple Weather"))
    }
}

/// Texts and symbols for the forecast (WMO weather codes; the server turns Apple's conditions into them).
enum WeatherText {
    static func symbol(_ code: Double?) -> String {
        guard let code else { return "cloud.sun.fill" }
        switch Int(code) {
        case 0: return "sun.max.fill"
        case 1, 2: return "cloud.sun.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...57: return "cloud.drizzle.fill"
        case 65, 67, 82: return "cloud.heavyrain.fill"
        case 61...67, 80...82: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.sun.fill"
        }
    }

    static func description(_ code: Double?) -> String? {
        guard let code else { return nil }
        let text: String
        switch Int(code) {
        case 0: text = "jasno"
        case 1: text = "skoro jasno"
        case 2: text = "polojasno"
        case 3: text = "zataženo"
        case 45, 48: text = "mlha"
        case 51...57: text = "mrholení"
        case 61...67: text = "déšť"
        case 71...77: text = "sněžení"
        case 80...82: text = "přeháňky"
        case 85, 86: text = "sněhové přeháňky"
        case 95...99: text = "bouřky"
        default: return nil
        }
        return L10n.tr(text)
    }

    /// "14°" in the user's units.
    static func degrees(_ celsius: Double?) -> String {
        guard let celsius else { return "–" }
        return Fmt.int(Units.temperature(celsius)) + "°"
    }

    /// "14° / 6°": the day's highest and lowest.
    static func range(_ w: TodaySnapshot.Weather) -> String {
        guard w.min != nil else { return degrees(w.max) }
        return degrees(w.max) + " / " + degrees(w.min)
    }

    /// "18 km/h" or "11 mph".
    static func wind(_ kmh: Double?) -> String {
        guard let kmh else { return "–" }
        return Units.imperial ? Fmt.int(Units.distance(kmh)) + " mph" : Fmt.int(kmh) + " km/h"
    }

    /// "0,4 mm" or "0.02 in".
    static func rain(_ mm: Double?) -> String {
        guard let mm else { return "–" }
        return Units.imperial ? Fmt.decimal(Units.length(mm / 10), digits: 2) + " in" : Fmt.decimal(mm, digits: 1) + " mm"
    }

    /// "18" and "km/h" (or mph) apart, for the detail's numbers.
    static func windNumber(_ kmh: Double?) -> String {
        guard let kmh else { return "–" }
        return Fmt.int(Units.imperial ? Units.distance(kmh) : kmh)
    }

    static var windUnit: String { Units.imperial ? "mph" : "km/h" }

    /// How it blows: calm under 5 km/h, light to 19, breezy to 29, windy to 49, strong above.
    static func windWord(_ kmh: Double?) -> String? {
        guard let kmh else { return nil }
        let level = kmh < 5 ? 0 : kmh < 20 ? 1 : kmh < 30 ? 2 : kmh < 50 ? 3 : 4
        let words = L10n.isEnglish ? ["Calm", "Light", "Breezy", "Windy", "Strong"] : ["Bezvětří", "Slabý", "Mírný", "Větrno", "Silný"]
        return words[level]
    }

    /// "NW" (or "SZ"): where the wind blows from.
    static func compass(_ degrees: Double?) -> String? {
        guard let degrees, degrees.isFinite else { return nil }
        let names = L10n.isEnglish ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] : ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"]
        let index = Int(((degrees.truncatingRemainder(dividingBy: 360) + 360 + 22.5) / 45).rounded(.down)) % 8
        return names[index]
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return "–" }
        return Fmt.int(value) + Fmt.percentSign
    }

    static func indoor(_ advice: TodaySnapshot.Advice?) -> Bool { advice?.environment == "indoor" }

    /// "Tue" or "Út" for "2026-10-27".
    static func weekday(_ isoDate: String) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let parts = isoDate.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return isoDate }
        let i = calendar.component(.weekday, from: date) - 1
        // "Mon" in English as weather apps write it, "Po" in Czech.
        guard L10n.isEnglish else { return Fmt.weekdays.indices.contains(i) ? Fmt.weekdays[i] : isoDate }
        calendar.locale = Fmt.locale
        let names = calendar.shortStandaloneWeekdaySymbols
        return names.indices.contains(i) ? names[i] : isoDate
    }
}

/// Today's card above the key numbers: the athlete's status as its first
/// row, then the place with the location arrow and the day's temperatures
/// and a few hours of the forecast.
struct TodayWeatherCard: View {
    let weather: TodaySnapshot.Weather?
    @State private var open = false

    var body: some View {
        Card {
            // The athlete's status first, always visible (Petr, 2026-10-15: no frame).
            AthleteStatusRow()
            Divider().overlay(Palette.hairline)
            Button { open = true } label: {
                HStack(spacing: 5) {
                    Image(systemName: "location.fill").scaledFont(10, weight: .semibold).foregroundStyle(Palette.blue)
                    if let weather {
                        Text(verbatim: (weather.place ?? L10n.tr("Počasí")) + " · " + WeatherText.range(weather))
                            .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                    } else {
                        Text("Nastavit polohu pro počasí").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let hours = weather?.hours, !hours.isEmpty {
                Button { open = true } label: {
                    HStack(spacing: 0) {
                        ForEach(hours, id: \.hour) { h in
                            VStack(spacing: 5) {
                                Text(verbatim: String(h.hour)).font(Typo.tiny).foregroundStyle(Palette.faint)
                                Image(systemName: WeatherText.symbol(h.code)).scaledFont(15, cap: .denseCap).foregroundStyle(Palette.blue)
                                    .symbolRenderingMode(.hierarchical).frame(height: 18)
                                Text(verbatim: WeatherText.degrees(h.temp)).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $open) { WeatherSheet(weather: weather) }
        .accessibilityElement(children: .contain)
    }
}

/// The weather's sheet: today's forecast and where to train, or the choice
/// of the place when none is set.
struct WeatherSheet: View {
    let weather: TodaySnapshot.Weather?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let weather {
                    WeatherDetails(weather: weather, close: { dismiss() })
                } else {
                    WeatherPlaceView(onSave: { dismiss() })
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").scaledFont(14, weight: .semibold) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
    }
}

/// The weather's detail (Petr, 2026-10-26, mockup G): the temperature now, the
/// hours from now, and the week with where a ride and a run belong each day
/// (the coach's rule, src/adaptive-week.js environmentFor); a day opens with
/// its hours and the reason. Without Apple Weather's week only today's advice shows.
struct WeatherDetails: View {
    let weather: TodaySnapshot.Weather
    var close: () -> Void = {}
    @State private var open: String?

    var body: some View {
        SettingsPage(title: "Počasí dnes") {
            hero

            if weather.max == nil {
                Text("Předpověď teď není k dispozici. Doporučení vychází jen z ročního období.")
                    .font(Typo.small).foregroundStyle(Palette.muted).fixedSize(horizontal: false, vertical: true)
            }

            if !hours.isEmpty {
                Card(padding: 14) {
                    Text("Dnes po hodinách").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted)
                    WeatherHourStrip(hours: hours, nowFirst: weather.next != nil)
                }
            }

            if let week = weather.week, !week.isEmpty {
                weekCard(week)
            } else {
                SettingsGroup(title: "Kde dnes trénovat") {
                    advice("bicycle", "Kolo", weather.outdoor)
                    SettingsDivider()
                    advice("figure.run", "Běh", weather.outdoorRun)
                }
            }

            SettingsGroup {
                NavigationLink { WeatherPlaceView(onSave: close) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "location.fill", color: Palette.green), title: "Poloha pro počasí", value: weather.place)
                }
            }
            .buttonStyle(.plain)

            if AppleWeather.credited(weather) {
                HStack {
                    AppleWeatherMark(size: 13)
                    Spacer()
                    Link("Další zdroje dat", destination: AppleWeather.legalPage)
                        .font(Typo.caption).foregroundStyle(Palette.blue)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    /// Today's hours from the one running now (the server's); without the detail, the card's few hours.
    private var hours: [TodaySnapshot.Weather.Hour] { weather.next ?? weather.hours ?? [] }

    private var look: SkyLook { SkyLook(code: weather.now?.code ?? weather.code, daylight: weather.now?.daylight) }

    /// The place, the temperature now with the sun, moon or symbol, and three
    /// numbers like Today's (Petr, 2026-10-27, B): high / low, wind and rain.
    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    if let place = weather.place {
                        // A pin, so the only arrow on the screen is the wind's (Petr, 2026-10-27).
                        HStack(spacing: 5) {
                            PlacePin().fill(Palette.blue, style: FillStyle(eoFill: true)).frame(width: 11, height: 14)
                            Text(verbatim: place).font(Typo.bodyStrong).foregroundStyle(Palette.muted)
                        }
                    }
                    Text(verbatim: WeatherText.degrees(weather.now?.temp ?? weather.max)).font(Typo.number(72)).foregroundStyle(Palette.ink)
                    if let text = WeatherText.description(weather.now?.code ?? weather.code) {
                        Text(verbatim: Fmt.capitalized(text)).font(.headline).foregroundStyle(Palette.ink)
                    }
                }
                Spacer(minLength: 0)
                if look.showsBody {
                    WeatherSkyBody(night: look.night)
                } else {
                    Image(systemName: WeatherText.symbol(weather.now?.code ?? weather.code))
                        .symbolRenderingMode(.multicolor)
                        .scaledFont(54)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityElement(children: .combine)

            HStack(alignment: .top, spacing: 0) {
                stat("Max / min", WeatherText.degrees(weather.max), weather.min.map { " / " + WeatherText.degrees($0) })
                Divider().overlay(Palette.hairline).padding(.horizontal, 12)
                stat("Vítr", WeatherText.windNumber(wind), " " + WeatherText.windUnit, windBeside)
                Divider().overlay(Palette.hairline).padding(.horizontal, 12)
                stat("Déšť", weather.rainProb.map { Fmt.int($0) } ?? "–", weather.rainProb == nil ? nil : Fmt.percentSign)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 12)
            .overlay(alignment: .top) { Divider().overlay(Palette.hairline) }
        }
        .background(alignment: .top) {
            // The sky reaches under the bar above and fades into the page.
            WeatherSky(look: look)
                .frame(height: 460)
                .padding(.horizontal, -20)
                .offset(y: -170)
        }
    }

    /// The wind now, else the day's strongest.
    private var wind: Double? { weather.now?.wind ?? weather.wind }

    /// "↘ SZ" beside the label Vítr (Petr, 2026-10-27: no extra line, not at the edge): the
    /// arrow points where the wind blows, the letters say where it comes from.
    private var windBeside: AnyView? {
        guard let direction = weather.now?.windDirection, let from = WeatherText.compass(direction), (wind ?? 0) >= 5 else { return nil }
        return AnyView(HStack(spacing: 3) {
            Image(systemName: "arrow.up").scaledFont(10, weight: .bold).foregroundStyle(Palette.blue)
                .rotationEffect(.degrees(direction + 180))
            Text(verbatim: from).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: [WeatherText.windWord(wind), from].compactMap { $0 }.joined(separator: ", "))))
    }

    private func stat(_ title: String, _ value: String, _ unit: String?, _ beside: AnyView? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(L10n.tr(title)).font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1)
                if let beside { beside }
            }
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(verbatim: value).font(Typo.number(28)).foregroundStyle(Palette.ink)
                if let unit, value != "–" { Text(verbatim: unit).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func weekCard(_ week: [TodaySnapshot.Weather.Day]) -> some View {
        let low = week.compactMap(\.min).min() ?? 0, high = week.compactMap(\.max).max() ?? 1
        return Card(padding: 14) {
            Text("Tento týden").font(Typo.caption.weight(.medium)).foregroundStyle(Palette.muted)
            VStack(spacing: 0) {
                ForEach(Array(week.enumerated()), id: \.element.date) { index, day in
                    if index > 0 { Divider().overlay(Palette.hairline) }
                    WeatherDayRow(day: day, title: index == 0 ? L10n.tr("Dnes") : WeatherText.weekday(day.date),
                                  low: low, high: high, open: open == day.date) {
                        withAnimation(.snappy) { open = open == day.date ? nil : day.date }
                    }
                }
            }
            HStack(spacing: 14) {
                legend(Palette.green, "venku")
                legend(Palette.amber, "uvnitř")
            }
        }
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(verbatim: L10n.tr(text)).font(Typo.caption).foregroundStyle(Palette.muted)
        }
    }

    private func advice(_ symbol: String, _ sport: String, _ advice: TodaySnapshot.Advice?) -> some View {
        let indoor = WeatherText.indoor(advice)
        return SettingsRow(icon: SettingsIcon(systemImage: symbol, color: indoor ? Palette.amberBar : Palette.green),
                           title: sport, subtitle: advice?.reason, value: L10n.tr(indoor ? "uvnitř" : "venku"), chevron: false)
    }
}

/// A map pin: a drop with a hole, as on Petr's chosen mockup (not the thin SF "mappin").
struct PlacePin: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, r = w / 2, cx = rect.midX, cy = rect.minY + r
        var path = Path()
        path.move(to: CGPoint(x: cx, y: rect.maxY))
        path.addCurve(to: CGPoint(x: rect.minX, y: cy), control1: CGPoint(x: cx - r * 0.35, y: rect.maxY - r * 0.55), control2: CGPoint(x: rect.minX, y: cy + r * 0.75))
        path.addRelativeArc(center: CGPoint(x: cx, y: cy), radius: r, startAngle: .degrees(180), delta: .degrees(180))
        path.addCurve(to: CGPoint(x: cx, y: rect.maxY), control1: CGPoint(x: rect.maxX, y: cy + r * 0.75), control2: CGPoint(x: cx + r * 0.35, y: rect.maxY - r * 0.55))
        path.closeSubpath()
        let hole = r * 0.4
        path.addEllipse(in: CGRect(x: cx - hole, y: cy - hole, width: 2 * hole, height: 2 * hole))
        return path
    }
}

/// A row of hours to swipe: the hour, its symbol, temperature and chance of rain.
struct WeatherHourStrip: View {
    let hours: [TodaySnapshot.Weather.Hour]
    /// The first hour is the one running now ("Teď").
    var nowFirst = false

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 2) {
                ForEach(Array(hours.enumerated()), id: \.element.hour) { index, h in
                    let now = nowFirst && index == 0
                    VStack(spacing: 4) {
                        Text(verbatim: now ? L10n.tr("Teď") : String(h.hour)).font(Typo.tiny).foregroundStyle(now ? Palette.blue : Palette.faint)
                        Image(systemName: WeatherText.symbol(h.code)).scaledFont(15, cap: .denseCap)
                            .symbolRenderingMode(.multicolor).frame(height: 18)
                        Text(verbatim: WeatherText.degrees(h.temp)).font(.subheadline.weight(.semibold)).foregroundStyle(Palette.ink)
                        Text(verbatim: (h.rainProb ?? 0) >= 10 ? WeatherText.percent(h.rainProb) : " ")
                            .font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.blue)
                    }
                    .frame(width: 46).padding(.vertical, 7)
                    .background(now ? Palette.blue.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}

/// One day of the week: the day, its symbol, the range on the week's scale and
/// a ride's and a run's place; tapped, it shows its hours and the reasons.
struct WeatherDayRow: View {
    let day: TodaySnapshot.Weather.Day
    let title: String
    let low: Double
    let high: Double
    let open: Bool
    let toggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: toggle) {
                HStack(spacing: 8) {
                    Text(verbatim: title).font(open ? Typo.bodyStrong : Typo.body).foregroundStyle(Palette.ink).frame(width: 48, alignment: .leading)
                    Image(systemName: WeatherText.symbol(day.code)).symbolRenderingMode(.multicolor).scaledFont(15, cap: .denseCap).frame(width: 24)
                    Text(verbatim: WeatherText.degrees(day.min)).font(Typo.body).foregroundStyle(Palette.muted).frame(width: 30, alignment: .trailing)
                    range.frame(height: 5)
                    Text(verbatim: WeatherText.degrees(day.max)).font(Typo.bodyStrong).foregroundStyle(Palette.ink).frame(width: 32, alignment: .leading)
                    place("bicycle", day.ride)
                    place("figure.run", day.run)
                }
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text("Ukáže hodiny dne"))

            if open {
                if let hours = day.hours, !hours.isEmpty { WeatherHourStrip(hours: hours) }
                // Each on its own line, the verdict in its colour (Petr, 2026-10-27).
                VStack(alignment: .leading, spacing: 4) {
                    reason("Kolo", day.ride)
                    reason("Běh", day.run)
                }
                .padding(.bottom, 8)
            }
        }
    }

    private var range: some View {
        GeometryReader { geo in
            let span = max(high - low, 1)
            let from = ((day.min ?? low) - low) / span, to = ((day.max ?? high) - low) / span
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.track)
                Capsule().fill(Palette.amberBar)
                    .frame(width: max(geo.size.width * (to - from), 5))
                    .offset(x: geo.size.width * from)
            }
        }
    }

    private func place(_ symbol: String, _ advice: TodaySnapshot.Advice?) -> some View {
        let indoor = WeatherText.indoor(advice)
        return Image(systemName: symbol).scaledFont(12, weight: .semibold, cap: .denseCap)
            .foregroundStyle(indoor ? Palette.amber : Palette.green)
            .frame(width: 28, height: 24)
            .background(indoor ? Palette.amberSoft : Palette.greenSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .accessibilityLabel(Text(verbatim: L10n.tr(symbol == "bicycle" ? (indoor ? "Kolo uvnitř" : "Kolo venku") : (indoor ? "Běh uvnitř" : "Běh venku"))))
    }

    /// "Kolo uvnitř: Nejvýš 6°, venku je zima." with "Kolo uvnitř" in amber (or green outdoors).
    @ViewBuilder private func reason(_ sport: String, _ advice: TodaySnapshot.Advice?) -> some View {
        if let advice {
            let indoor = WeatherText.indoor(advice)
            let head = L10n.tr(sport == "Kolo" ? (indoor ? "Kolo uvnitř" : "Kolo venku") : (indoor ? "Běh uvnitř" : "Běh venku"))
            let why = advice.reason.flatMap { $0.isEmpty ? nil : $0 }
            (Text(verbatim: head + (why == nil ? "." : ": ")).fontWeight(.semibold).foregroundColor(indoor ? Palette.amber : Palette.green)
             + Text(verbatim: why ?? "").foregroundColor(Palette.muted))
                .font(Typo.caption).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// A place from the search (Apple Maps) or the iPhone's location.
struct GeoPlace: Identifiable, Hashable {
    let name: String
    let latitude: Double
    let longitude: Double
    let admin1: String?
    let country: String?
    var id: String { name + "|" + String(latitude) + "|" + String(longitude) }

    /// "Jihomoravský kraj, Česko".
    var detail: String? {
        let parts = [admin1, country].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    /// Up to 8 towns and cities for the name, from Apple Maps. Nothing found is
    /// an empty list, not a failure.
    static func search(_ name: String) async throws -> [GeoPlace] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = name
        request.resultTypes = .address
        let items: [MKMapItem]
        do {
            items = try await MKLocalSearch(request: request).start().mapItems
        } catch let error as MKError where error.code == .placemarkNotFound {
            return []
        }
        var places: [GeoPlace] = []
        for item in items {
            let mark = item.placemark
            guard let title = mark.locality ?? item.name, !title.isEmpty else { continue }
            let place = GeoPlace(name: title, latitude: mark.coordinate.latitude, longitude: mark.coordinate.longitude,
                                 admin1: mark.administrativeArea, country: mark.country)
            if !places.contains(where: { $0.name == place.name && $0.detail == place.detail }) { places.append(place) }
        }
        return Array(places.prefix(8))
    }
}

/// "Použít polohu iPhonu": one position from the phone, named by Apple's
/// reverse geocoding. Asked only when the user taps it.
@MainActor
enum DeviceLocation {
    private static let manager = CLLocationManager()

    enum Failure: LocalizedError {
        case denied, unavailable
        var errorDescription: String? {
            switch self {
            case .denied: return L10n.tr("Aurin nemá přístup k poloze. Povol ho v Nastavení iPhonu → Soukromí a zabezpečení → Polohové služby → Aurin.")
            case .unavailable: return L10n.tr("Polohu se nepodařilo zjistit. Zkus to znovu venku nebo vyhledej místo.")
            }
        }
    }

    /// "Aktuální poloha" was chosen: the weather follows the iPhone.
    static let followKey = "weather.followDevice"
    private static let checkedKey = "weather.deviceCheckedAt"
    private static let savedKey = "weather.deviceSaved"

    static var following: Bool { UserDefaults.standard.bool(forKey: followKey) }

    /// While following, at most every two hours and only with access already
    /// granted: a move of more than 10 km saves the new place.
    static func refreshIfFollowing(_ model: AppModel) async {
        guard following, !model.demo else { return }
        let status = manager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }
        let last = UserDefaults.standard.double(forKey: checkedKey)
        guard Date().timeIntervalSince1970 - last > 2 * 3600 else { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: checkedKey)
        guard let place = try? await self.place() else { return }
        let saved = UserDefaults.standard.array(forKey: savedKey) as? [Double] ?? []
        if saved.count == 2 {
            let moved = CLLocation(latitude: saved[0], longitude: saved[1]).distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude))
            if moved < 10_000 { return }
        }
        try? await WeatherPlaceStore.save(place, source: "device", model: model)
    }

    static func remember(_ place: GeoPlace?, following follow: Bool) {
        UserDefaults.standard.set(follow, forKey: followKey)
        if let place, follow {
            UserDefaults.standard.set([place.latitude, place.longitude], forKey: savedKey)
        } else {
            UserDefaults.standard.removeObject(forKey: savedKey)
        }
    }

    static func place() async throws -> GeoPlace {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            // The answer comes from the system dialog.
            for _ in 0..<120 where manager.authorizationStatus == .notDetermined {
                try await Task.sleep(for: .milliseconds(500))
            }
        }
        let status = manager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { throw Failure.denied }
        let found: CLLocation? = try await withThrowingTaskGroup(of: CLLocation?.self) { group in
            group.addTask {
                for try await update in CLLocationUpdate.liveUpdates() {
                    if let location = update.location { return location }
                }
                return nil
            }
            group.addTask {
                try await Task.sleep(for: .seconds(15))
                return nil
            }
            let first = try await group.next() ?? nil
            group.cancelAll()
            return first
        }
        guard let location = found else { throw Failure.unavailable }
        let mark = try? await CLGeocoder().reverseGeocodeLocation(location).first
        // Only the approximate place leaves the phone (the privacy manifest's
        // coarse location): two decimals, about a kilometre, are plenty for a forecast.
        return GeoPlace(name: mark?.locality ?? mark?.name ?? L10n.tr("Moje poloha"),
                        latitude: approximate(location.coordinate.latitude), longitude: approximate(location.coordinate.longitude),
                        admin1: mark?.administrativeArea, country: mark?.country)
    }

    static func approximate(_ degrees: Double) -> Double {
        (degrees * 100).rounded() / 100
    }
}

/// "Poloha pro počasí": the place whose forecast Today shows and the coach
/// plans by. Saved into the usual week plan (GET/POST /app/api/week-plan,
/// prefs.location), every other key of the plan goes back as it came.
struct WeatherPlaceView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// After saving; without it the page closes itself.
    var onSave: (() -> Void)? = nil

    @State private var query = ""
    @State private var results: [GeoPlace] = []
    @State private var searched = ""
    @State private var searching = false
    @State private var saving = false
    @State private var current: String?
    @State private var error: String?
    @State private var locating = false
    @State private var following = DeviceLocation.following

    var body: some View {
        SettingsPage(title: "Poloha pro počasí") {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField("Město nebo obec", text: $query)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                if searching {
                    ProgressView()
                } else if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.faint) }
                        .accessibilityLabel("Smazat hledání")
                }
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

            SettingsGroup {
                Button { Task { await useDevice() } } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "location.fill")
                            .scaledFont(14, weight: .semibold, cap: .denseCap).foregroundStyle(Palette.onAccent)
                            .frame(width: 32, height: 32).background(Palette.blue, in: Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Aktuální poloha").font(.body.weight(.semibold)).foregroundStyle(Palette.blue)
                            Text(verbatim: following ? (current.map { $0 + " · " } ?? "") + L10n.tr("aktualizuje se samo") : L10n.tr("poloha iPhonu, aktualizuje se sama"))
                                .font(Typo.caption).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        if locating { ProgressView() } else if following { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.blue) }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(saving || locating)
            }

            if let error {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }

            if !results.isEmpty {
                SettingsGroup(title: "Výsledky") {
                    ForEach(Array(results.enumerated()), id: \.element.id) { index, place in
                        if index > 0 { SettingsDivider() }
                        Button { Task { await save(place) } } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "mappin.and.ellipse", color: Palette.green), title: place.name, subtitle: place.detail, chevron: false)
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                    }
                }
            } else if !searching && !searched.isEmpty && searched == query.trimmingCharacters(in: .whitespacesAndNewlines) {
                Text("Nic jsme nenašli. Zkus jiný název.").font(Typo.small).foregroundStyle(Palette.muted)
            }

            if let current {
                SettingsGroup(title: "Teď") {
                    SettingsRow(icon: SettingsIcon(systemImage: "location.fill", color: Palette.blue), title: current, chevron: false)
                    SettingsDivider()
                    Button { Task { await save(nil) } } label: {
                        SettingsRow(title: "Nepoužívat polohu", chevron: false, titleColor: Palette.rust)
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
            }

            if saving {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .task { await loadCurrent() }
        .task(id: query) { await search() }
    }

    // MARK: Data

    private func search() async {
        let name = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else {
            results = []
            searched = ""
            return
        }
        // Wait for the typing to stop; a new letter cancels this search.
        try? await Task.sleep(for: .milliseconds(350))
        if Task.isCancelled { return }
        searching = true
        defer { searching = false }
        do {
            let found = try await GeoPlace.search(name)
            if Task.isCancelled { return }
            results = found
            searched = name
            error = nil
        } catch {
            if Task.isCancelled { return }
            self.error = L10n.tr("Hledání se nepovedlo. Zkontroluj připojení.")
        }
    }

    private func loadCurrent() async {
        if model.demo {
            current = model.today?.weather?.place
            return
        }
        guard let plan = try? await model.api.weekPlan(start: nil) else { return }
        if case .object(let location)? = WeekPlanPrefs.object(plan.prefs)["location"] {
            current = location["name"]?.string
            following = location["source"]?.string == "device"
        } else {
            current = nil
            following = false
        }
        UserDefaults.standard.set(following, forKey: DeviceLocation.followKey)
    }

    private func useDevice() async {
        locating = true
        defer { locating = false }
        do {
            let place = try await DeviceLocation.place()
            await save(place, source: "device")
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Saves the place (nil: none) into the usual week plan and reloads Today.
    private func save(_ place: GeoPlace?, source: String = "search") async {
        guard !model.demo else {
            error = L10n.tr("V ukázce se poloha neukládá.")
            return
        }
        saving = true
        defer { saving = false }
        do {
            try await WeatherPlaceStore.save(place, source: source, model: model)
            current = place?.name
            following = source == "device" && place != nil
            error = nil
            if let onSave { onSave() } else { dismiss() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Writes the weather's place into the usual week plan, every other key of
/// the plan as it came, and reloads Today.
@MainActor
enum WeatherPlaceStore {
    static func save(_ place: GeoPlace?, source: String, model: AppModel) async throws {
        let plan = try await model.api.weekPlan(start: nil)
        var prefs = WeekPlanPrefs.object(plan.prefs)
        prefs["source"] = nil
        // The starting template's count is not the athlete's own: it stays automatic.
        if case .object(let automatic)? = prefs["automatic"], automatic["weeklyActivities"] == prefs["weeklyActivities"] {
            prefs["weeklyActivities"] = .null
        }
        prefs["automatic"] = nil
        if let place {
            prefs["location"] = .object([
                "name": .string(place.name),
                "latitude": .number(place.latitude),
                "longitude": .number(place.longitude),
                "source": .string(source)
            ])
        } else {
            prefs["location"] = .null
        }
        try await model.api.saveWeekPlan(start: nil, prefs: .object(prefs))
        DeviceLocation.remember(place, following: source == "device")
        await model.refresh()
    }
}
