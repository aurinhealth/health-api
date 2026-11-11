import AVFoundation
import PhotosUI
import SwiftUI

/// "Etiketa": the camera in a window like the barcode scanner, a light, the
/// shutter, and a photo from Photos beside it; the picture goes back to be
/// read by AI.
struct LabelCameraSheet: View {
    @Environment(\.dismiss) private var dismiss
    /// The title and the line under the window: the nutrition table, or the
    /// front of the package for the name and the brand.
    let title: String
    let hint: String
    /// The front is a step after the label: it can be skipped.
    let front: Bool
    let onImage: (UIImage) -> Void
    /// nil until the camera permission is known.
    @State private var cameraAllowed: Bool?
    @State private var torch = false
    @State private var photo: PhotosPickerItem?
    @State private var camera: PhotoCamera
    @State private var taking = false
    @State private var error: String?

    /// The nutrition table up close; `front`: the front of the package for
    /// its name and brand, the whole package at 1x.
    init(front: Bool = false, onImage: @escaping (UIImage) -> Void) {
        self.front = front
        title = front ? "PŘEDNÍ STRANA" : "ETIKETA"
        hint = front ? "Vyfoť přední stranu s názvem" : "Vyfoť tabulku výživových údajů"
        self.onImage = onImage
        _camera = State(initialValue: PhotoCamera(closeUp: !front))
    }

    private var cameraReady: Bool { cameraAllowed == true && BarcodeScanner.device != nil }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                circle("xmark", label: "Zavřít") { dismiss() }
                Spacer()
                Text(L10n.tr(title)).font(.caption.weight(.medium)).tracking(1.9).foregroundStyle(Palette.muted)
                Spacer()
                if cameraReady && BarcodeScanSheet.hasTorch {
                    circle(torch ? "flashlight.on.fill" : "flashlight.off.fill", label: torch ? "Zhasnout světlo" : "Rozsvítit světlo", on: torch) {
                        torch.toggle()
                    }
                } else {
                    Color.clear.frame(width: 40, height: 40)
                }
            }
            .padding(.horizontal, 24).padding(.top, 12)

            ZStack {
                RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(light: 0x1D2020, dark: 0x151718))
                if cameraAllowed == nil {
                    ProgressView().tint(.white)
                } else if cameraReady {
                    CameraWindow(camera: camera)
                } else {
                    VStack(spacing: 12) {
                        Text(BarcodeScanner.device != nil ? "Fotoaparát potřebuje přístup. Povol ho Aurinu v Nastavení iPhonu, nebo vyber fotku." : "Vyber fotku etikety z Fotek.")
                            .font(Typo.sentence(18)).foregroundStyle(Color.white.opacity(0.85)).multilineTextAlignment(.center)
                        if cameraAllowed == false, let url = URL(string: UIApplication.openSettingsURLString) {
                            Link("Otevřít Nastavení", destination: url).font(Typo.bodyStrong).foregroundStyle(.white)
                        }
                    }
                    .padding(24)
                }
                FinderCorners().stroke(Color.white.opacity(0.9), style: StrokeStyle(lineWidth: 3, lineCap: .round)).padding(10)
                    .allowsHitTesting(false)
            }
            .frame(maxWidth: 320).frame(height: 320)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .padding(.horizontal, 24).padding(.top, 28)

            Text(L10n.tr(hint)).font(Typo.sentence(20)).foregroundStyle(Palette.ink.opacity(0.85))
                .multilineTextAlignment(.center).padding(.top, 22).padding(.horizontal, 24)

            HStack {
                PhotosPicker(selection: $photo, matching: .images) {
                    Image(systemName: "photo").scaledFont(20, weight: .medium, cap: .denseCap).foregroundStyle(Palette.ink)
                        .frame(width: 52, height: 52).background(Palette.ink.opacity(0.08), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.tr("Vybrat fotku"))
                Spacer()
                Button { Task { await shoot() } } label: {
                    Circle().fill(Palette.ink).frame(width: 58, height: 58)
                        .padding(5).overlay { Circle().stroke(Palette.ink, lineWidth: 4) }
                        .opacity(cameraReady && !taking ? 1 : 0.35)
                }
                .buttonStyle(.plain)
                .disabled(!cameraReady || taking)
                .accessibilityLabel(L10n.tr(front ? "Vyfotit přední stranu" : "Vyfotit etiketu"))
                Spacer()
                Color.clear.frame(width: 52, height: 52)
            }
            .padding(.horizontal, 48).padding(.top, 30)

            if front {
                Button { dismiss() } label: {
                    Text("Přeskočit").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 22).frame(height: 44)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 22)
            }

            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 14) }
            Spacer(minLength: 0)
        }
        .background { Palette.background.ignoresSafeArea() }
        .task { await askCamera() }
        .onChange(of: torch) { BarcodeScanSheet.setTorch(torch) }
        .onDisappear { if torch { BarcodeScanSheet.setTorch(false) } }
        .onChange(of: photo) {
            guard let item = photo else { return }
            photo = nil
            Task { await load(item) }
        }
    }

    private func circle(_ systemImage: String, label: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage).scaledFont(15, weight: .semibold, cap: .denseCap)
                .foregroundStyle(on ? Palette.onButton : Palette.ink)
                .frame(width: 40, height: 40)
                .background(on ? Palette.amber : Palette.ink.opacity(0.08), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.tr(label))
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
        // Only what the window showed, so the table gets the photo's pixels.
        if let image = await camera.capture() { onImage(await image.middleSquare()) } else { error = L10n.tr("Fotku se nepodařilo pořídit. Zkus to znovu.") }
    }

    private func load(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let image = await UIImage.photo(data) else {
            error = L10n.tr("Obrázek se nepodařilo načíst.")
            return
        }
        onImage(image)
    }
}

/// The camera's picture in the window; the session stops with the window.
struct CameraWindow: UIViewRepresentable {
    let camera: PhotoCamera

    func makeUIView(context: Context) -> BarcodeScanner.PreviewView {
        let view = BarcodeScanner.PreviewView()
        view.previewLayer.videoGravity = .resizeAspectFill
        camera.start(on: view.previewLayer)
        return view
    }

    func updateUIView(_ view: BarcodeScanner.PreviewView, context: Context) {}

    func makeCoordinator() -> PhotoCamera { camera }

    static func dismantleUIView(_ view: BarcodeScanner.PreviewView, coordinator: PhotoCamera) {
        coordinator.stop()
    }
}

/// A photo from the main lens (the scanner's), set up and taken on its own
/// queue so the screen does not wait for the camera.
final class PhotoCamera: NSObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    /// Up close (a label): zoomed so the window shows about 8 cm where the
    /// lens is still sharp. Without it the table looked small at 20 cm, the
    /// phone went closer than the main lens can focus and the photo was
    /// blurred (Petr, 2026-11-06).
    private let closeUp: Bool
    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "health.aurin.label-camera")
    private var configured = false
    private var input: AVCaptureDeviceInput?
    /// The selfie camera instead of the main lens (Sdílet's camera can switch).
    private var front = false
    private var pending: CheckedContinuation<UIImage?, Never>?

    init(closeUp: Bool = false) {
        self.closeUp = closeUp
    }

    func start(on layer: AVCaptureVideoPreviewLayer) {
        layer.session = session
        queue.async { [self] in
            if !configured { configured = configure() }
            if configured && !session.isRunning { session.startRunning() }
        }
    }

    func stop() {
        queue.async { [self] in if session.isRunning { session.stopRunning() } }
    }

    func capture() async -> UIImage? {
        await withCheckedContinuation { continuation in
            queue.async { [self] in
                guard configured, session.isRunning, pending == nil else { continuation.resume(returning: nil); return }
                pending = continuation
                // Upright like the phone, so the label reads the right way up.
                if let connection = output.connection(with: .video) {
                    if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
                    // The selfie camera saves the picture as its preview showed it.
                    if connection.isVideoMirroringSupported {
                        connection.automaticallyAdjustsVideoMirroring = false
                        connection.isVideoMirrored = front
                    }
                }
                let settings = AVCapturePhotoSettings()
                // Several frames merged: small print stays sharp in a kitchen's light.
                settings.photoQualityPrioritization = closeUp ? .quality : .balanced
                output.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    /// Between the main lens and the selfie camera.
    func flip() {
        queue.async { [self] in
            guard configured else { return }
            let device = front ? BarcodeScanner.device : AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
            guard let device, let next = try? AVCaptureDeviceInput(device: device) else { return }
            session.beginConfiguration()
            if let input { session.removeInput(input) }
            if session.canAddInput(next) {
                session.addInput(next)
                input = next
                front.toggle()
            } else if let input {
                session.addInput(input)
            }
            session.commitConfiguration()
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let image = photo.fileDataRepresentation().flatMap { UIImage.downsampled($0) }
        queue.async { [self] in
            pending?.resume(returning: image)
            pending = nil
        }
    }

    private func configure() -> Bool {
        guard let device = BarcodeScanner.device, let input = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(output) else {
            session.commitConfiguration()
            return false
        }
        session.addInput(input)
        session.addOutput(output)
        output.maxPhotoQualityPrioritization = .quality
        self.input = input
        // The zoom is measured on the photo format the preset chose.
        session.commitConfiguration()
        if closeUp {
            BarcodeCamera.zoomForCloseUp(device, width: 80)
        } else if (try? device.lockForConfiguration()) != nil {
            if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
            if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .none }
            // The whole scene, not the zoom the scanner or the label camera left.
            device.videoZoomFactor = 1
            device.unlockForConfiguration()
        }
        return true
    }
}

extension UIImage {
    /// The middle square: what the label camera's square window showed of
    /// the upright photo.
    func middleSquare() async -> UIImage {
        await Task.detached(priority: .userInitiated) {
            let side = min(self.size.width, self.size.height)
            let format = UIGraphicsImageRendererFormat()
            format.scale = self.scale
            return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
                self.draw(at: CGPoint(x: (side - self.size.width) / 2, y: (side - self.size.height) / 2))
            }
        }.value
    }
}
