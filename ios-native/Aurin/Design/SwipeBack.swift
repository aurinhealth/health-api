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
        guard let navigation = Self.navigation(of: gestureRecognizer) else {
            Self.log("shouldBegin: no navigation controller")
            return false
        }
        // Not while a push or pop still animates: a swipe then left the stack
        // half popped and the screen frozen.
        let begin = navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil
        Self.log("shouldBegin \(begin): \(navigation.viewControllers.count) pages, animating \(navigation.transitionCoordinator != nil), at \(gestureRecognizer.location(in: gestureRecognizer.view))")
        return begin
    }

    /// The UI test's "-swipeBackLog": what the swipe was asked and answered,
    /// to find why a first swipe now and then did nothing. The app's own log
    /// does not reach the test's, so the last lines also sit on an invisible
    /// element "swipeBackLog" that the test reads when a swipe fails.
    static let logging = ProcessInfo.processInfo.arguments.contains("-swipeBackLog")
    private static var lines: [String] = []
    private static var board: UIView?

    static func log(_ message: @autoclosure () -> String) {
        guard logging else { return }
        let line = message()
        NSLog("SwipeBack: %@", line)
        lines = Array((lines + [line]).suffix(12))
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { return }
        let view = board ?? UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        if view.superview !== window {
            view.isUserInteractionEnabled = false
            view.isAccessibilityElement = true
            view.accessibilityIdentifier = "swipeBackLog"
            window.addSubview(view)
            board = view
        }
        view.accessibilityLabel = lines.joined(separator: " | ")
    }

    /// A touch at the left edge goes back before a chart's scrub or a row of
    /// cells takes it (the Resting HR chart reaches the edge). Off the edge
    /// the swipe fails at once and they go on.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        // At the root there is nothing to go back to: nothing waits for the swipe.
        Self.navigation(of: gestureRecognizer).map { $0.viewControllers.count > 1 } ?? false
    }

    /// Only for the UI test's log: did the finger reach the swipe at all.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        Self.log("touch at \(touch.location(in: gestureRecognizer.view))")
        return true
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

    @objc private func changed(_ pop: UIGestureRecognizer) {
        Self.log("state \(pop.state.rawValue) at \(pop.location(in: pop.view))")
    }

    /// Switches the swipe on for the stack that shows `controller`.
    func enable(for controller: UIViewController) {
        guard let pop = controller.navigationController?.interactivePopGestureRecognizer else {
            Self.log("enable: no pop gesture")
            return
        }
        Self.log("enable: delegate was ours \(pop.delegate === self), enabled \(pop.isEnabled), \(controller.navigationController?.viewControllers.count ?? 0) pages")
        if pop.delegate !== self {
            pop.delegate = self
            if Self.logging { pop.addTarget(self, action: #selector(changed)) }
        }
        pop.isEnabled = true
        // iOS 26 adds a swipe back from anywhere on the page. With the bar
        // hidden it never goes back here, but the edge swipe could wait for it
        // to fail, and then a quick swipe ended before it was even asked (the
        // UI test's log: no "shouldBegin" for the dropped swipe; TestFlight
        // 602 to 611). Off, the edge swipe alone decides.
        if #available(iOS 26, *), let content = controller.navigationController?.interactiveContentPopGestureRecognizer {
            Self.log("enable: content swipe enabled \(content.isEnabled)")
            content.isEnabled = false
        }
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
