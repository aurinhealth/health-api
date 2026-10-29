import SwiftUI

@main
struct AurinApp: App {
    /// The APNs device token for the morning readiness push (PushRegistration.swift).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    // "-demo" (Xcode scheme or `simctl launch … -demo`) starts with sample data.
    @State private var model = AppModel(demo: ProcessInfo.processInfo.arguments.contains("-demo"))
    /// Settings → Vzhled: "system", "light" or "dark".
    @AppStorage("appearance") private var appearance = "system"
    /// Settings → Jazyk: "cs" or "en"; the phone's language until it is chosen.
    @AppStorage(L10n.key) private var language = L10n.defaultLanguage

    init() {
        // Začít posilovnu in Control Center or on the Lock Screen (Shared/AurinControls.swift).
        ControlInbox.startGym = { QuickActions.shared.pick = QuickActions.Pick(id: "liveGym") }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                // loadwise://open/sleep from the home-screen widgets.
                .onOpenURL { model.handle($0) }
                // A gym Live Activity left from before the app closed has no screen behind it.
                .task {
                    GymLiveActivity.endOrphans()
                    // Read before any sign-in, so the offer waits for the next start.
                    _ = PasskeyOfferLater.due
                }
                // Aurin Pro: renewals and codes redeemed in the App Store reach the server (ProStore.swift).
                .task { ProStore.shared.start(api: model.demo ? nil : model.api) }
                .tint(Palette.ink)
                // Every switch in the app, also the ones without their own style.
                .toggleStyle(AurinToggleStyle())
                .preferredColorScheme(appearance == "light" ? .light : appearance == "dark" ? .dark : nil)
                .environment(\.locale, L10n.locale)
                // Texts from variables are translated when drawn, so a new language redraws everything.
                .id(language)
        }
    }
}
