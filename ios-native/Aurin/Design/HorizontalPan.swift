import SwiftUI
import UIKit

/// A sideways drag over a view inside a vertical ScrollView (Dnes, Zdraví,
/// Jídlo: a day back or forward). UIKit's pan on the scroll view itself, so
/// once the finger moves sideways it wins: the card under the finger is not
/// opened and the page does not scroll. An up or down move leaves it to the
/// scroll view, and a horizontal list inside (chips, a strip) keeps its own.
struct HorizontalPan: UIViewRepresentable {
    var enabled: Bool
    var changed: (CGFloat) -> Void
    /// The distance moved and the speed at the end; (0, 0) when cancelled.
    var ended: (CGFloat, CGFloat) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> Marker {
        let view = Marker()
        view.coordinator = context.coordinator
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: Marker, context: Context) {
        context.coordinator.parent = self
        context.coordinator.pan.isEnabled = enabled
    }

    static func dismantleUIView(_ view: Marker, coordinator: Coordinator) {
        coordinator.pan.view?.removeGestureRecognizer(coordinator.pan)
    }

    /// Marks the area; the pan goes on the scroll view around it.
    final class Marker: UIView {
        weak var coordinator: Coordinator?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil, let coordinator else { return }
            var view = superview
            while let current = view, !(current is UIScrollView) { view = current.superview }
            if let scroll = view as? UIScrollView { coordinator.attach(to: scroll, marker: self) }
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: HorizontalPan?
        weak var marker: UIView?
        lazy var pan: UIPanGestureRecognizer = {
            let pan = UIPanGestureRecognizer(target: self, action: #selector(handle(_:)))
            pan.delegate = self
            pan.maximumNumberOfTouches = 1
            return pan
        }()

        func attach(to scroll: UIScrollView, marker: UIView) {
            self.marker = marker
            guard pan.view !== scroll else { return }
            pan.view?.removeGestureRecognizer(pan)
            scroll.addGestureRecognizer(pan)
        }

        @objc func handle(_ pan: UIPanGestureRecognizer) {
            switch pan.state {
            case .changed:
                parent?.changed(pan.translation(in: pan.view).x)
            case .ended:
                parent?.ended(pan.translation(in: pan.view).x, pan.velocity(in: pan.view).x)
            case .cancelled, .failed:
                parent?.ended(0, 0)
            default:
                break
            }
        }

        func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
            guard gesture === pan, let marker, marker.window != nil, let scroll = pan.view else { return false }
            guard marker.bounds.contains(pan.location(in: marker)) else { return false }
            let speed = pan.velocity(in: scroll)
            guard abs(speed.x) > abs(speed.y) * 1.2 else { return false }
            // A horizontal list under the finger scrolls itself.
            var view = scroll.hitTest(pan.location(in: scroll), with: nil)
            while let current = view, current !== scroll {
                if let inner = current as? UIScrollView, inner.contentSize.width > inner.bounds.width + 1 { return false }
                view = current.superview
            }
            return true
        }

        /// The page's own scroll waits until this has decided, so a sideways
        /// move does not also scroll it.
        func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            gesture === pan && other === (pan.view as? UIScrollView)?.panGestureRecognizer
        }
    }
}
