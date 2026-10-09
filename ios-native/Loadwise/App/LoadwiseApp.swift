import SwiftUI

@main
struct LoadwiseApp: App {
    // "-demo" (Xcode scheme or `simctl launch … -demo`) starts with sample data.
    @State private var model = AppModel(demo: ProcessInfo.processInfo.arguments.contains("-demo"))
    /// Settings → Vzhled: "system", "light" or "dark".
    @AppStorage("appearance") private var appearance = "system"
    /// Settings → Jazyk: "cs" or "en".
    @AppStorage(L10n.key) private var language = "cs"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                // loadwise://open/sleep from the home-screen widgets.
                .onOpenURL { model.handle($0) }
                .tint(Palette.ink)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
                .environment(\.locale, L10n.locale)
                // Texts from variables are translated when drawn, so a new language redraws everything.
                .id(language)
        }
    }
}
