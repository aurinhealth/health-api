import UIKit

/// The screens draw their own back button and hide the navigation bar, which
/// also switches off iOS's swipe from the left edge back. This keeps the swipe
/// on whenever there is a screen to go back to.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer == interactivePopGestureRecognizer else { return true }
        // Not while a push or pop still animates: a swipe then left the stack
        // half popped and the screen frozen.
        return viewControllers.count > 1 && transitionCoordinator == nil
    }

}
