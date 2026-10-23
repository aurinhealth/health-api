import AVFoundation
import PhotosUI
import SwiftUI

/// "Etiketa": the camera in a window like the barcode scanner, a light, the
/// shutter, and a photo from Photos beside it; the picture goes back to be
/// read by AI.
struct LabelCameraSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onImage: (UIImage) -> Void
    /// nil until the camera permission is known.
    @State private var cameraAllowed: Bool?
    @State private var torch = false
    @State private var photo: PhotosPickerItem?
    @State private var camera = PhotoCamera()
    @State private var taking = false
    @State private var error: String?

    private var cameraReady: Bool { cameraAllowed == true && BarcodeScanner.device != nil }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                circle("xmark", label: "Zavřít") { dismiss() }
                Spacer()
                Text("ETIKETA").font(.system(size: 12, weight: .medium)).tracking(1.9).foregroundStyle(Palette.muted)
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

            Text("Vyfoť tabulku výživových údajů").font(Typo.sentence(20)).foregroundStyle(Palette.ink.opacity(0.85))
                .multilineTextAlignment(.center).padding(.top, 22).padding(.horizontal, 24)

            HStack {
                PhotosPicker(selection: $photo, matching: .images) {
                    Image(systemName: "photo").font(.system(size: 20, weight: .medium)).foregroundStyle(Palette.ink)
                        .frame(width: 52, height: 52).background(Palette.ink.opacity(0.08), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.tr("Vybrat fotku"))
                Spacer()
                Button { Task { await shoot() } } label: {
                    Circle().fill(Palette.ink).frame(width: 58, height: 58)
                        .padding(5).overlay(Circle().stroke(Palette.ink, lineWidth: 4))
                        .opacity(cameraReady && !taking ? 1 : 0.35)
                }
                .buttonStyle(.plain)
                .disabled(!cameraReady || taking)
                .accessibilityLabel(L10n.tr("Vyfotit etiketu"))
                Spacer()
                Color.clear.frame(width: 52, height: 52)
            }
            .padding(.horizontal, 48).padding(.top, 30)

            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).padding(.top, 14) }
            Spacer(minLength: 0)
        }
        .background(Palette.background.ignoresSafeArea())
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
            Image(systemName: systemImage).font(.system(size: 15, weight: .semibold))
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
        if let image = await camera.capture() { onImage(image) } else { error = L10n.tr("Fotku se nepodařilo pořídit. Zkus to znovu.") }
    }

    private func load(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
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
    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "health.aurin.label-camera")
    private var configured = false
    private var input: AVCaptureDeviceInput?
    /// The selfie camera instead of the main lens (Sdílet's camera can switch).
    private var front = false
    private var pending: CheckedContinuation<UIImage?, Never>?

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
                output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
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
        let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
        queue.async { [self] in
            pending?.resume(returning: image)
            pending = nil
        }
    }

    private func configure() -> Bool {
        guard let device = BarcodeScanner.device, let input = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        guard session.canAddInput(input), session.canAddOutput(output) else { return false }
        session.addInput(input)
        session.addOutput(output)
        self.input = input
        if (try? device.lockForConfiguration()) != nil {
            if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
            device.unlockForConfiguration()
        }
        return true
    }
}
