import SwiftUI
import UIKit

// One keyboard rule for the whole app (Petr 2026-11-16), set here once and not
// per screen:
// - dragging scrolled content hides it (keyboardRule at the root, and every
//   scroll view in the window once a field starts editing, for the sheets);
// - a tap anywhere outside a text field hides it: each window of the app gets
//   one tap recogniser that ends editing. It never cancels the tap, so the
//   button or row under the finger still works, and a pick from a list hides
//   it too; a tap into another text field keeps the keyboard up;
// - a text field's return key is Done (a screen may make it Search or Send)
//   and acts and hides;
// - a number pad has no return key, so it gets a bar with Done above it; the
//   weight keeps its decimal pad;
// - a text view (several lines, return is a new line) gets the keyboard-down
//   button above it.

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

    static let numberPads: Set<UIKeyboardType> = [.numberPad, .decimalPad, .phonePad, .asciiCapableNumberPad]

    private static func addHideButton(to field: UIResponder) {
        if let text = field as? UITextField {
            if text.inputAccessoryView == nil, numberPads.contains(text.keyboardType) {
                text.inputAccessoryView = HideBar(done: true)
                text.reloadInputViews()
            }
        } else if let text = field as? UITextView, text.isEditable, text.inputAccessoryView == nil {
            text.inputAccessoryView = HideBar(done: false)
            text.reloadInputViews()
        }
        if let view = field as? UIView, let window = view.window { dragHides(in: window) }
    }

    /// Every scroll view on screen hides the keyboard when dragged, also in
    /// sheets and lists the root's keyboardRule does not reach.
    private static func dragHides(in view: UIView) {
        if let scroll = view as? UIScrollView, !(scroll is UITextView), scroll.keyboardDismissMode == .none { scroll.keyboardDismissMode = .interactive }
        for child in view.subviews { dragHides(in: child) }
    }

    /// The strip above the keys: Done for a number pad, the keyboard-down
    /// button for a text view, on the right.
    private final class HideBar: UIInputView {
        init(done: Bool) {
            super.init(frame: CGRect(x: 0, y: 0, width: 0, height: 44), inputViewStyle: .keyboard)
            autoresizingMask = .flexibleWidth
            var config = UIButton.Configuration.gray()
            if done {
                var title = AttributedString(L10n.tr("Hotovo"))
                title.uiKit.font = UIFont.systemFont(ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize, weight: .semibold)
                config.attributedTitle = title
            } else {
                config.image = UIImage(systemName: "keyboard.chevron.compact.down",
                                       withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .medium))
            }
            config.cornerStyle = .capsule
            config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 14, bottom: 6, trailing: 14)
            config.baseForegroundColor = .label
            let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
                self?.window?.endEditing(true)
            })
            button.accessibilityLabel = L10n.tr(done ? "Hotovo" : "Skrýt klávesnici")
            button.accessibilityIdentifier = done ? "keyboard.done" : "keyboard.hide"
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

extension View {
    /// The keyboard rule's SwiftUI half, once at the root (AurinApp): dragging a
    /// scroll view hides the keyboard and a text field's return key reads Done.
    func keyboardRule() -> some View {
        scrollDismissesKeyboard(.interactively).submitLabel(.done)
    }
}
