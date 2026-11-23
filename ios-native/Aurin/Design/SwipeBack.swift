import SwiftUI
import UIKit

/// The screens draw their own back button and hide the navigation bar, which
/// also switches off iOS's swipe from the left edge back. Every page that
/// hides the bar (navBarVisibility(.hidden)) carries SwipeBackEnabler, which
/// switches the swipe on again each time the page appears.
///
/// Before build 611 this was an extension of UINavigationController that
/// replaced its viewDidLoad and answered as its gesture delegate: a category
/// over UIKit's own methods, set once per stack, which SwiftUI's stack could
/// take back; the swipe did nothing on Readiness and Resting HR three builds
/// in a row (602, 606, 611). Now the delegate is this object, set again on
/// every appearance (AurinUITests/SwipeBackTests).
@MainActor final class SwipeBack: NSObject, UIGestureRecognizerDelegate {
    static let shared = SwipeBack()

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let navigation = Self.navigation(of: gestureRecognizer) else { return false }
        // Not while a push or pop still animates: a swipe then left the stack
        // half popped and the screen frozen.
        return navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil
    }

    /// A touch at the left edge goes back before a chart's scrub or a row of
    /// cells takes it (the Resting HR chart reaches the edge). Off the edge
    /// the swipe fails at once and they go on.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        true
    }

    /// The swipe sits on the navigation controller's own view.
    private static func navigation(of recognizer: UIGestureRecognizer) -> UINavigationController? {
        var responder: UIResponder? = recognizer.view
        while let next = responder {
            if let navigation = next as? UINavigationController { return navigation }
            responder = next.next
        }
        return nil
    }

    /// Switches the swipe on for the stack that shows `controller`.
    func enable(for controller: UIViewController) {
        guard let pop = controller.navigationController?.interactivePopGestureRecognizer else { return }
        if pop.delegate !== self { pop.delegate = self }
        pop.isEnabled = true
    }
}

/// Invisible, behind a page that hides the navigation bar: on every
/// appearance it gives the stack's edge swipe back to SwipeBack.
struct SwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController {
        override func loadView() {
            view = UIView()
            view.isUserInteractionEnabled = false
            view.isAccessibilityElement = false
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            SwipeBack.shared.enable(for: self)
        }
    }
}
