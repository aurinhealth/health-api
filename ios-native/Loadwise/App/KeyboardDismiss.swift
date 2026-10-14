import UIKit

// The keyboard goes away with a tap anywhere outside a text field, on every
// screen and sheet: each window of the app gets one tap recogniser that ends
// editing. It never cancels the tap, so the button or row under the finger
// still works; a tap into another text field keeps the keyboard up.

@MainActor
enum KeyboardDismiss {
    private static let handler = Handler()
    private static var observer: NSObjectProtocol?

    /// Once, at launch (AppDelegate): sheets and alerts bring their own key
    /// windows, so every window that becomes key gets the recogniser.
    static func install() {
        guard observer == nil else { return }
        observer = NotificationCenter.default.addObserver(forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main) { note in
            guard let window = note.object as? UIWindow else { return }
            MainActor.assumeIsolated { attach(to: window) }
        }
    }

    private static func attach(to window: UIWindow) {
        if window.gestureRecognizers?.contains(where: { $0.name == Handler.name }) == true { return }
        let tap = UITapGestureRecognizer(target: handler, action: #selector(Handler.tapped(_:)))
        tap.name = Handler.name
        tap.cancelsTouchesInView = false
        tap.delaysTouchesEnded = false
        tap.delegate = handler
        window.addGestureRecognizer(tap)
    }

    private final class Handler: NSObject, UIGestureRecognizerDelegate {
        static let name = "aurin.keyboardDismiss"

        @objc func tapped(_ tap: UITapGestureRecognizer) {
            tap.view?.endEditing(true)
        }

        // Taps into a text field or text view (SwiftUI's TextField and
        // TextEditor are both) don't count: they move the cursor or focus.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view = touch.view
            while let current = view {
                if current is UITextField || current is UITextView { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }
    }
}
