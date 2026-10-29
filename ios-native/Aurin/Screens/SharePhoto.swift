import AVFoundation
import PhotosUI
import SwiftUI

// MARK: - Fotka: a photo behind the share image

/// Fotka on Sdílet: the camera with the image's numbers over its picture, or
/// a photo from Photos, then a step to drag the numbers where they fit the
/// photo. The photo stays on the phone.
struct SharePhotoFlow: View {
    enum Step: Equatable {
        case camera
        /// fromLibrary: "Jiná fotka" picks another instead of "Znovu" going back to the camera.
        case place(fromLibrary: Bool)
    }

    @Environment(\.dismiss) private var dismiss
    let kind: ShareKind
    let layouts: [(index: Int, name: String)]
    @Binding var options: ShareOptions
    /// The image without a photo, at a width.
    let card: (ShareOptions, CGFloat) -> ShareCard
    @State var step: Step
    @State var photo: UIImage?
    /// The blocks' offsets by layout (ShareSheet.offsetKey), changed here until Použít.
    @State var offsets: [String: [String: CGSize]]
    let onUse: (UIImage, [String: [String: CGSize]]) -> Void
    @State private var picking = false
    @State private var item: PhotosPickerItem?
    @State private var error: String?

    var body: some View {
        Group {
            switch step {
            case .camera:
                ShareCameraView(layouts: layouts, options: $options, card: card, picking: $picking) { image in
                    photo = SharePhoto.fitted(image)
                    step = .place(fromLibrary: false)
                }
            case .place(let fromLibrary):
                if let photo {
                    SharePlaceView(card: { width, moved in
                        var c = card(options, width)
                        c.photo = photo
                        c.offsets = moved
                        return c
                    }, offsets: Binding(get: { offsets[ShareSheet.offsetKey(kind, options)] ?? [:] },
                                        set: { offsets[ShareSheet.offsetKey(kind, options)] = $0 }),
                       again: fromLibrary ? "Jiná fotka" : "Znovu",
                       onAgain: { if fromLibrary { picking = true } else { step = .camera } },
                       onUse: {
                           onUse(photo, offsets)
                           dismiss()
                       })
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.bottom, 8) }
        }
        .photosPicker(isPresented: $picking, selection: $item, matching: .images)
        .onChange(of: item) {
            guard let item else { return }
            self.item = nil
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                    error = L10n.tr("Obrázek se nepodařilo načíst.")
                    return
                }
                error = nil
                photo = SharePhoto.fitted(image)
                step = .place(fromLibrary: true)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }
}

enum SharePhoto {
    /// The photo upright and at most 2048 px on its long side: enough for the
    /// 1080 × 1920 image, light enough to redraw while the numbers move.
    static func fitted(_ image: UIImage, longSide: CGFloat = 2048) -> UIImage {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return image }
        let scale = min(1, longSide / max(size.width, size.height))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    /// The width of a 9:16 image that fits the space left for it.
    static func fit(_ size: CGSize, reserved: CGFloat, margin: CGFloat = 12) -> CGFloat {
        max(120, min(size.width - margin * 2, (size.height - reserved) * 9 / 16))
    }
}

// MARK: - The camera

/// The camera in the image's frame with its numbers over the picture, the
/// layouts to switch, Photos, the shutter and the selfie camera.
struct ShareCameraView: View {
    @Environment(\.dismiss) private var dismiss
    let layouts: [(index: Int, name: String)]
    @Binding var options: ShareOptions
    let card: (ShareOptions, CGFloat) -> ShareCard
    @Binding var picking: Bool
    let onImage: (UIImage) -> Void
    /// nil until the camera permission is known.
    @State private var cameraAllowed: Bool?
    @State private var camera = PhotoCamera()
    @State private var taking = false
    @State private var error: String?

    private var cameraReady: Bool { cameraAllowed == true && BarcodeScanner.device != nil }

    var body: some View {
        GeometryReader { geo in
            let width = SharePhoto.fit(geo.size, reserved: 210)
            VStack(spacing: 0) {
                HStack {
                    ShareRoundButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                    Spacer()
                }
                .padding(.horizontal, 18).padding(.top, 6)

                ZStack {
                    Color(hex: 0x151718)
                    if cameraAllowed == nil {
                        ProgressView().tint(.white)
                    } else if cameraReady {
                        CameraWindow(camera: camera)
                    } else {
                        VStack(spacing: 12) {
                            Text(L10n.tr(BarcodeScanner.device != nil ? "Fotoaparát potřebuje přístup. Povol ho Aurinu v Nastavení iPhonu, nebo vyber fotku." : "Vyber fotku z Fotek."))
                                .font(Typo.sentence(18)).foregroundStyle(Color.white.opacity(0.85)).multilineTextAlignment(.center)
                            if cameraAllowed == false, let url = URL(string: UIApplication.openSettingsURLString) {
                                Link("Otevřít Nastavení", destination: url).font(Typo.bodyStrong).foregroundStyle(.white)
                            }
                        }
                        .padding(24)
                    }
                    overlay(width).allowsHitTesting(false)
                }
                .frame(width: width, height: width * 16 / 9)
                .clipShape(RoundedRectangle(cornerRadius: width * 0.065, style: .continuous))
                .padding(.top, 10)

                if layouts.count > 1 {
                    HStack(spacing: 22) {
                        ForEach(layouts, id: \.index) { layout in
                            let i = layout.index, name = layout.name
                            Button { options.variant = i } label: {
                                Text(L10n.tr(name).uppercased()).scaledFont(13, weight: .semibold).tracking(0.6)
                                    .foregroundStyle(options.variant == i ? Palette.amber : Color.white.opacity(0.6))
                                    .lineLimit(1).fixedSize()
                                    .padding(.vertical, 6).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(options.variant == i ? .isSelected : [])
                        }
                    }
                    .padding(.top, 12)
                }

                HStack {
                    Button { picking = true } label: {
                        Image(systemName: "photo.on.rectangle").scaledFont(20, weight: .medium, cap: .denseCap).foregroundStyle(.white)
                            .frame(width: 52, height: 52).background(Color.white.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("Vybrat z knihovny"))
                    Spacer()
                    Button { Task { await shoot() } } label: {
                        Circle().fill(Color.white).frame(width: 60, height: 60)
                            .padding(5).overlay(Circle().stroke(Color.white, lineWidth: 4))
                            .opacity(cameraReady && !taking ? 1 : 0.35)
                    }
                    .buttonStyle(.plain)
                    .disabled(!cameraReady || taking)
                    .accessibilityLabel(L10n.tr("Vyfotit"))
                    Spacer()
                    Button { camera.flip() } label: {
                        Image(systemName: "arrow.triangle.2.circlepath.camera").scaledFont(20, weight: .medium, cap: .denseCap).foregroundStyle(.white)
                            .frame(width: 52, height: 52).background(Color.white.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!cameraReady)
                    .opacity(cameraReady ? 1 : 0.35)
                    .accessibilityLabel(L10n.tr("Otočit fotoaparát"))
                }
                .padding(.horizontal, 36).padding(.top, 14)

                if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 10) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
        }
        .task { await askCamera() }
    }

    private func overlay(_ width: CGFloat) -> ShareCard {
        var c = card(options, width)
        c.photo = nil
        c.overCamera = true
        return c
    }

    private func askCamera() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: cameraAllowed = true
        case .notDetermined: cameraAllowed = await AVCaptureDevice.requestAccess(for: .video)
        default: cameraAllowed = false
        }
    }

    private func shoot() async {
        taking = true
        defer { taking = false }
        if let image = await camera.capture() { onImage(image) } else { error = L10n.tr("Fotku se nepodařilo pořídit. Zkus to znovu.") }
    }
}

// MARK: - Moving the numbers

/// The photo with the image on it: each number dragged with a finger stays
/// inside the picture, below the header, and settles on the edges and the
/// middle. Původní rozložení puts them all back.
struct SharePlaceView: View {
    @Environment(\.dismiss) private var dismiss
    let card: (CGFloat, [String: CGSize]) -> ShareCard
    @Binding var offsets: [String: CGSize]
    let again: String
    let onAgain: () -> Void
    let onUse: () -> Void
    /// Each block's frame where the layout put it, in points at this width.
    @State private var frames: [String: CGRect] = [:]
    /// The block under the finger: its offset and its frame (in hundredths) when the drag began.
    @State private var moving: (id: String, start: CGSize, rect: CGRect)?
    @State private var guides = Guides()

    struct Guides: Equatable {
        var x: CGFloat?
        var y: CGFloat?
    }

    /// The image's height in hundredths of its width.
    private static let height: CGFloat = 100 * 16 / 9
    /// Below the header with the mark and the date.
    private static let top: CGFloat = 17
    private static let margin: CGFloat = 3
    private static let snap: CGFloat = 2.5

    var body: some View {
        GeometryReader { geo in
            let width = SharePhoto.fit(geo.size, reserved: 140)
            let u = width / 100
            let store = $frames
            VStack(spacing: 0) {
                HStack {
                    ShareRoundButton(systemImage: "xmark", label: "Zavřít") { dismiss() }
                    Spacer()
                    if !offsets.isEmpty {
                        Button {
                            withAnimation(.snappy) { offsets = [:] }
                        } label: {
                            Label(L10n.tr("Původní rozložení"), systemImage: "arrow.counterclockwise")
                                .font(.subheadline.weight(.medium)).foregroundStyle(.white)
                                .padding(.horizontal, 14).frame(height: 40)
                                .background(Color.white.opacity(0.12), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 18).padding(.top, 6)

                card(width, offsets)
                    .onPreferenceChange(ShareBlockFrames.self) { store.wrappedValue = $0 }
                    .overlay { guideLines(u) }
                    .clipShape(RoundedRectangle(cornerRadius: width * 0.065, style: .continuous))
                    .contentShape(Rectangle())
                    .gesture(drag(u))
                    .sensoryFeedback(.selection, trigger: guides) { _, new in new != Guides() }
                    .padding(.top, 10)

                HStack(spacing: 10) {
                    SecondaryButton(title: again, action: onAgain)
                    PrimaryButton(title: L10n.tr("Použít"), action: onUse)
                }
                .padding(.horizontal, 24).padding(.top, 18)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder private func guideLines(_ u: CGFloat) -> some View {
        let dash = StrokeStyle(lineWidth: 1.5, dash: [5, 4])
        ZStack(alignment: .topLeading) {
            if let x = guides.x {
                Path { p in
                    p.move(to: CGPoint(x: x * u, y: 0))
                    p.addLine(to: CGPoint(x: x * u, y: Self.height * u))
                }
                .stroke(Palette.amber, style: dash)
            }
            if let y = guides.y {
                Path { p in
                    p.move(to: CGPoint(x: 0, y: y * u))
                    p.addLine(to: CGPoint(x: 100 * u, y: y * u))
                }
                .stroke(Palette.amber, style: dash)
            }
            // The number under the finger.
            if let moving, let frame = frames[moving.id] {
                let o = offsets[moving.id] ?? .zero
                let box = frame.offsetBy(dx: o.width * u, dy: o.height * u).insetBy(dx: -6, dy: -6)
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Palette.amber.opacity(0.1))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Palette.amber, lineWidth: 1.5))
                    .frame(width: box.width, height: box.height)
                    .offset(x: box.minX, y: box.minY)
            }
        }
        .allowsHitTesting(false)
    }

    private func drag(_ u: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                if moving == nil {
                    guard let id = block(at: value.startLocation, u: u), let frame = frames[id] else { return }
                    moving = (id, offsets[id] ?? .zero,
                              CGRect(x: frame.minX / u, y: frame.minY / u, width: frame.width / u, height: frame.height / u))
                }
                guard let moving else { return }
                let r = moving.rect
                var dx = moving.start.width + value.translation.width / u
                var dy = moving.start.height + value.translation.height / u
                var shown = Guides()
                // Settle on the left edge, the middle or the right edge, and on the middle or where it started.
                for (line, shift) in [(7, 7 - r.minX), (50, 50 - r.midX), (93, 93 - r.maxX)] as [(CGFloat, CGFloat)] where abs(dx - shift) < Self.snap {
                    dx = shift
                    shown.x = line
                    break
                }
                if abs(dy) < Self.snap {
                    dy = 0
                } else if abs(dy - (Self.height / 2 - r.midY)) < Self.snap {
                    dy = Self.height / 2 - r.midY
                    shown.y = Self.height / 2
                }
                dx = Self.clamp(dx, Self.margin - r.minX, 100 - Self.margin - r.maxX)
                dy = Self.clamp(dy, Self.top - r.minY, Self.height - Self.margin - r.maxY)
                offsets[moving.id] = CGSize(width: dx, height: dy)
                guides = shown
            }
            .onEnded { _ in
                moving = nil
                guides = Guides()
            }
    }

    /// The smallest block under the finger, where it is drawn now.
    private func block(at point: CGPoint, u: CGFloat) -> String? {
        frames.filter { id, frame in
            let o = offsets[id] ?? .zero
            return frame.offsetBy(dx: o.width * u, dy: o.height * u).insetBy(dx: -12, dy: -12).contains(point)
        }
        .min { $0.value.width * $0.value.height < $1.value.width * $1.value.height }?.key
    }

    /// Within low…high; a block bigger than the room keeps where the layout put it.
    private static func clamp(_ value: CGFloat, _ low: CGFloat, _ high: CGFloat) -> CGFloat {
        let lo = min(low, 0), hi = max(high, 0)
        return min(max(value, lo), hi)
    }
}

/// A round button on the dark camera screens.
struct ShareRoundButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage).scaledFont(15, weight: .semibold, cap: .denseCap).foregroundStyle(.white)
                .frame(width: 40, height: 40).background(Color.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
    }
}
