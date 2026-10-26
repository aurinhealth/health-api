import UIKit

// The keyboard can always be hidden, on every screen and sheet:
// - a tap anywhere outside a text field: each window of the app gets one tap
//   recogniser that ends editing. It never cancels the tap, so the button or
//   row under the finger still works; a tap into another text field keeps the
//   keyboard up.
// - the button above the keyboard, on the right: every text field and text
//   view (SwiftUI's TextField and TextEditor) that starts editing gets it as
//   its input accessory, so the screen moves up above it like above the keys.

@MainActor
enum KeyboardDismiss {
    private static let handler = Handler()
    private static var observers: [NSObjectProtocol] = []

    /// Once, at launch (AppDelegate): sheets and alerts bring their own key
    /// windows, so every window that becomes key gets the recogniser.
    static func install() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main) { note in
            guard let window = note.object as? UIWindow else { return }
            MainActor.assumeIsolated { attach(to: window) }
        })
        for name in [UITextField.textDidBeginEditingNotification, UITextView.textDidBeginEditingNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { note in
                guard let field = note.object as? UIResponder else { return }
                MainActor.assumeIsolated { addHideButton(to: field) }
            })
        }
    }

    private static func addHideButton(to field: UIResponder) {
        if let text = field as? UITextField, text.inputAccessoryView == nil {
            text.inputAccessoryView = HideBar()
            text.reloadInputViews()
        } else if let text = field as? UITextView, text.isEditable, text.inputAccessoryView == nil {
            text.inputAccessoryView = HideBar()
            text.reloadInputViews()
        }
    }

    /// The strip above the keys with the keyboard-down button on the right.
    private final class HideBar: UIInputView {
        init() {
            super.init(frame: CGRect(x: 0, y: 0, width: 0, height: 44), inputViewStyle: .keyboard)
            autoresizingMask = .flexibleWidth
            var config = UIButton.Configuration.gray()
            config.image = UIImage(systemName: "keyboard.chevron.compact.down",
                                   withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .medium))
            config.cornerStyle = .capsule
            config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
            config.baseForegroundColor = .label
            let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
                self?.window?.endEditing(true)
            })
            button.accessibilityLabel = L10n.tr("Skrýt klávesnici")
            button.translatesAutoresizingMaskIntoConstraints = false
            addSubview(button)
            NSLayoutConstraint.activate([
                button.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -12),
                button.centerYAnchor.constraint(equalTo: centerYAnchor)
            ])
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
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
