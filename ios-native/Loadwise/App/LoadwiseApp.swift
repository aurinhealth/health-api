import SwiftUI

@main
struct LoadwiseApp: App {
    // "-demo" (Xcode scheme or `simctl launch … -demo`) starts with sample data.
    @State private var model = AppModel(demo: ProcessInfo.processInfo.arguments.contains("-demo"))
    /// Settings → Vzhled: "system", "light" or "dark".
    @AppStorage("appearance") private var appearance = "system"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Palette.ink)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
        }
    }
}
