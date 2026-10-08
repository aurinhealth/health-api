import SwiftUI

@main
struct LoadwiseApp: App {
    // "-demo" (Xcode scheme or `simctl launch … -demo`) starts with sample data.
    @State private var model = AppModel(demo: ProcessInfo.processInfo.arguments.contains("-demo"))

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Palette.ink)
        }
    }
}
