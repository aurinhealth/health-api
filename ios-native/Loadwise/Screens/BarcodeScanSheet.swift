import AVFoundation
import PhotosUI
import SwiftUI
import Vision

/// The barcode scanner: the camera in a window on the
/// app's background, a light for the dark, or a photo of the code from
/// Photos; the food comes from your foods or
/// the catalog, else an AI lookup by the code; then the amount on a wheel and
/// "Přidat".
struct BarcodeScanSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let meal: String
    /// Another meal than the one the scanner was opened for.
    @State private var chosenMeal: String?
    private var target: String { chosenMeal ?? meal }
    var onLogged: () -> Void = {}
    @State private var code: String?
    /// What the athlete says an unknown code is, for the AI estimate.
    @State private var guess = ""
    @State private var product: FoodProduct?
    /// In the food's unit (grams, ml, or portions for a per-portion food).
    @State private var amount: Double = 100
    @State private var state: ScanState = .scanning
    @State private var saving = false
    @State private var error: String?
    /// "Upravit produkt": the serving, the package and the values, saved for
    /// the user and maybe suggested for everyone.
    @State private var editing: FoodProduct?
    @State private var torch = false
    /// A photo of a code, picked from Photos instead of the camera.
    @State private var photo: PhotosPickerItem?
    /// "Vyfotit etiketu" for a code nobody knows: the values read from the
    /// label are saved with the code, so the next scan finds them.
    @State private var labelOpen = false

    /// nil until the camera permission is known (the scanner is unavailable
    /// before the first permission prompt, so the app asks first).
    @State private var cameraAllowed: Bool?

    enum ScanState { case scanning, searching, found, notFound }

    private var scannerReady: Bool { cameraAllowed == true && BarcodeScanner.device != nil }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                circle("xmark", label: "Zavřít") { dismiss() }
                Spacer()
                Text("ČÁROVÝ KÓD").font(.system(size: 12, weight: .medium)).tracking(1.9).foregroundStyle(Palette.muted)
                Spacer()
                if scannerReady && Self.hasTorch && (state == .scanning || state == .searching) {
                    circle(torch ? "flashlight.on.fill" : "flashlight.off.fill", label: torch ? "Zhasnout světlo" : "Rozsvítit světlo", on: torch) {
                        torch.toggle()
                    }
                } else {
                    Color.clear.frame(width: 40, height: 40)
                }
            }
            .padding(.horizontal, 24).padding(.top, 12)

            ScrollView {
                VStack(spacing: 20) {
                    if state == .scanning || state == .searching { finder }
                    if state != .scanning { resultCard }
                }
                .padding(.horizontal, 12).padding(.top, 24).padding(.bottom, 20)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.immediately)
        }
        .background(Palette.background.ignoresSafeArea())
        .task { await askCamera() }
        .onChange(of: torch) { Self.setTorch(torch) }
        .onChange(of: state) { if state != .scanning && state != .searching { torch = false } }
        .onDisappear { if torch { Self.setTorch(false) } }
        .onChange(of: photo) {
            guard let item = photo else { return }
            photo = nil
            Task { await read(item) }
        }
        .fullScreenCover(isPresented: $labelOpen) {
            LabelCameraSheet { image in
                labelOpen = false
                Task { await readLabel(image) }
            }
        }
        .sheet(item: $editing) { product in
            NavigationStack {
                FoodProductEditor(product: product) { corrected in show(corrected, keepAmount: true) }
            }
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

    /// The camera only in this window, with its corners; the text under it.
    @ViewBuilder
    private var finder: some View {
        VStack(spacing: 22) {
            ZStack {
                RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(light: 0x1D2020, dark: 0x151718))
                if cameraAllowed == nil {
                    ProgressView().tint(.white)
                } else if scannerReady {
                    BarcodeScanner(paused: state != .scanning) { scanned in
                        guard state == .scanning else { return }
                        code = scanned
                        error = nil
                        state = .searching
                        Task { await find(scanned) }
                    }
                } else {
                    VStack(spacing: 12) {
                        Text(BarcodeScanner.device != nil ? "Skener potřebuje kameru. Povol Aurinu přístup ke kameře v Nastavení iPhonu." : "Tento iPhone skener čárových kódů nepodporuje.")
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
            .frame(maxWidth: 320).frame(height: 230)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            if state == .scanning {
                VStack(spacing: 14) {
                    Text("Namiř na kód na obalu").font(Typo.sentence(20)).foregroundStyle(Palette.ink.opacity(0.85))
                    PhotosPicker(selection: $photo, matching: .images) {
                        Label("Vybrat fotku", systemImage: "photo").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 18).frame(height: 44)
                            .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center) }
                }
            }
        }
        .padding(.horizontal, 12)
    }

    private func askCamera() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: cameraAllowed = true
        case .notDetermined: cameraAllowed = await AVCaptureDevice.requestAccess(for: .video)
        default: cameraAllowed = false
        }
    }

    static var hasTorch: Bool { torchDevice?.hasTorch ?? false }

    /// The scanner's own lens: locking another camera for the light while the
    /// scanner's session ran froze the picture.
    nonisolated private static var torchDevice: AVCaptureDevice? { BarcodeScanner.device }

    /// Off the main thread: the lock waits for the camera session, and the
    /// screen must not stop meanwhile.
    nonisolated private static let torchQueue = DispatchQueue(label: "health.aurin.torch")

    /// The back camera's light, which the scanner's camera session keeps on.
    nonisolated static func setTorch(_ on: Bool) {
        torchQueue.async {
            guard let device = torchDevice, device.hasTorch, device.isTorchModeSupported(on ? .on : .off) else { return }
            guard (device.torchMode == .on) != on else { return }
            do {
                try device.lockForConfiguration()
                defer { device.unlockForConfiguration() }
                if on { try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel) } else { device.torchMode = .off }
            } catch {}
        }
    }

    @ViewBuilder
    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch state {
            case .searching:
                HStack { ProgressView(); Text("Hledám \(code ?? "")…").font(Typo.small).foregroundStyle(Palette.muted) }
            case .found:
                if let product {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            if product.source == "ai-estimate" { AIEstimateTag() }
                            else { Text("✓ Nalezeno").font(Typo.caption).foregroundStyle(Palette.green) }
                            Spacer()
                            Button { edit(product) } label: {
                                Label("Upravit produkt", systemImage: "pencil").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                                    .padding(.horizontal, 12).frame(height: 30)
                                    .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                        Text(product.name).font(Typo.sentence(27, relativeTo: .title2)).foregroundStyle(Palette.ink)
                        Text([product.brand, code.map { "EAN " + $0 }].compactMap { $0 }.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    NutritionCells(product: product, amount: amount)
                    VStack(alignment: .leading, spacing: 4) {
                        PortionWheel(product: product, amount: $amount).id(product.id + (product.serving_size?.string ?? "") + (product.serving_name ?? ""))
                        servingLine(product)
                    }
                    MealMenu(selection: Binding(get: { target }, set: { chosenMeal = $0 }))
                    Button { Task { await save(product) } } label: {
                        Text(saving ? L10n.tr("Ukládám…") : MealSlot.addText(target) + " · " + PortionWheel.label(product: product, amount: amount))
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                    }
                    .disabled(saving || amount <= 0)
                }
            case .notFound:
                Text("Kód \(code ?? "") neznám.").font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                // With a name AI can estimate the food when the code is nowhere on the web.
                TextField("Co to je? Třeba „tyčinka Margot“", text: $guess)
                    .font(.subheadline).textInputAutocapitalization(.never)
                    .padding(.horizontal, 16).frame(height: 46)
                    .background(Palette.background, in: Capsule())
                HStack(spacing: 10) {
                    Button("Skenovat znovu") { reset() }
                        .font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 16).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                    Button { Task { await lookUp() } } label: {
                        Label(L10n.tr(guess.trimmingCharacters(in: .whitespaces).count >= 2 ? "Odhadnout AI" : "Dohledat AI"), systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                            .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
                    }
                }
                Button { labelOpen = true } label: {
                    Label("Vyfotit etiketu", systemImage: "camera").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(model.demo)
            case .scanning:
                EmptyView()
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    /// "1 sušenka = 19 g · 90 kcal"; a serving stored as 1 g (or none) gets "Upravit".
    @ViewBuilder
    private func servingLine(_ product: FoodProduct) -> some View {
        if product.perPortion {
            EmptyView()
        } else if let size = product.usableServing {
            Text(L10n.f("1 %@ = %@ %@ · %@ kcal", product.servingName, FoodAmountView.text(size), product.unit, Fmt.int(product.kcal(for: size))))
                .font(Typo.caption).foregroundStyle(Palette.muted)
        } else {
            HStack(spacing: 8) {
                if let s = FoodProduct.size(product.serving_size, unit: product.unit) {
                    Text(L10n.f("1 porce = %@ %@", FoodAmountView.text(s), product.unit)).font(Typo.caption).foregroundStyle(Palette.muted)
                    Text(verbatim: "·").font(Typo.caption).foregroundStyle(Palette.muted)
                }
                Button { edit(product) } label: {
                    Label(L10n.tr(FoodProduct.size(product.serving_size, unit: product.unit) == nil ? "Nastavit porci" : "Upravit"), systemImage: "pencil")
                        .font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func edit(_ product: FoodProduct) {
        var p = product
        if p.barcode == nil { p.barcode = code }
        editing = p
    }

    /// The amount offered first: a serving that means something, else the
    /// package up to 500, else 100 (FoodProduct.defaultAmount without a 1 g serving).
    private static func firstAmount(_ p: FoodProduct) -> Double {
        if p.perPortion { return 1 }
        if let s = p.usableServing { return s }
        if let q = FoodProduct.leadingNumber(p.quantity), q > 0, q <= 500 { return q }
        return 100
    }

    private func show(_ p: FoodProduct, keepAmount: Bool = false) {
        let before = product
        product = p
        // After "Upravit produkt" with a new serving, the wheel starts on one serving.
        if !keepAmount || before?.usableServing != p.usableServing { amount = Self.firstAmount(p) }
        state = .found
    }

    private func reset() {
        code = nil
        guess = ""
        product = nil
        error = nil
        state = .scanning
    }

    private func find(_ code: String) async {
        state = .searching
        if model.demo { show(DemoData.foods[0]); return }
        do {
            let found = try await model.api.searchFood(name: "", barcode: code)
            if let first = found.first { show(first) } else { state = .notFound }
        } catch {
            self.error = error.localizedDescription
            state = .notFound
        }
    }

    /// The code in a picked photo, looked up as if scanned; without one the
    /// scanner keeps running and says so.
    private func read(_ item: PhotosPickerItem) async {
        guard state == .scanning else { return }
        error = nil
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            error = L10n.tr("Obrázek se nepodařilo načíst.")
            return
        }
        guard let found = await Self.barcode(in: data) else {
            error = L10n.tr("Na fotce jsem kód nenašel.")
            return
        }
        code = found
        await find(found)
    }

    /// Vision reads the same codes as the camera, off the main thread.
    nonisolated private static func barcode(in data: Data) async -> String? {
        await Task.detached(priority: .userInitiated) {
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.ean13, .ean8, .upce, .code128]
            try? VNImageRequestHandler(data: data).perform([request])
            return request.results?.compactMap(\.payloadStringValue).first { !$0.isEmpty }
        }.value
    }

    private func lookUp() async {
        guard let code else { return }
        state = .searching
        do {
            let name = guess.trimmingCharacters(in: .whitespaces)
            if let p = try await model.api.lookupFood(name: name, barcode: code) { show(p) }
            else { state = .notFound; error = name.isEmpty ? "AI ten kód nezná. Napiš, co to je, a odhadne to." : "AI ji nedokázala dohledat ani odhadnout. Zadej ji ručně." }
        } catch {
            self.error = error.localizedDescription
            state = .notFound
        }
    }

    /// The nutrition table read by AI, as the food of this code; adding it
    /// saves it with the code (src/routes-food.js /app/api/food/log).
    private func readLabel(_ image: UIImage) async {
        guard let code, !model.demo else { return }
        state = .searching
        error = nil
        guard let jpeg = await image.jpegForUpload() else { state = .notFound; return }
        do {
            var p = try await model.api.readFoodPhoto(jpeg, mode: "label").product
            p.barcode = code
            let name = guess.trimmingCharacters(in: .whitespaces)
            let unnamed = p.name == L10n.tr("Jídlo z fotky")
            if name.count >= 2 && unnamed { p.name = name }
            show(p)
            // A label rarely says what the food is called: the name first.
            if unnamed && name.count < 2 { editing = p }
        } catch {
            self.error = error.localizedDescription
            state = .notFound
        }
    }

    private func save(_ product: FoodProduct) async {
        let value = amount
        guard value > 0 else { return }
        saving = true
        defer { saving = false }
        var p = product
        if p.barcode == nil { p.barcode = code }
        if let message = await model.logFood(product: p, amount: value, meal: target) {
            error = message
        } else {
            dismiss()
            onLogged()
        }
    }
}

/// The four rounded corners of the scanner's window.
struct FinderCorners: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let l: CGFloat = 30, r: CGFloat = 16
        for (corner, dx, dy) in [(CGPoint(x: rect.minX, y: rect.minY), 1.0, 1.0), (CGPoint(x: rect.maxX, y: rect.minY), -1.0, 1.0),
                                 (CGPoint(x: rect.minX, y: rect.maxY), 1.0, -1.0), (CGPoint(x: rect.maxX, y: rect.maxY), -1.0, -1.0)] {
            p.move(to: CGPoint(x: corner.x, y: corner.y + dy * l))
            p.addLine(to: CGPoint(x: corner.x, y: corner.y + dy * r))
            p.addQuadCurve(to: CGPoint(x: corner.x + dx * r, y: corner.y), control: corner)
            p.addLine(to: CGPoint(x: corner.x + dx * l, y: corner.y))
        }
        return p
    }
}

/// The camera for EAN/UPC codes. Only the main (wide) lens, zoomed in so a
/// code fills the window from its closest focus: VisionKit's scanner filmed
/// with the back virtual camera, which jumped between the wide and the ultra
/// wide (macro) lens as the phone moved. Apple's barcode sample (AVCamBarcode)
/// keeps one lens the same way.
struct BarcodeScanner: UIViewRepresentable {
    var paused: Bool
    let onCode: (String) -> Void

    /// The lens the scanner films with, and the light belongs to.
    nonisolated(unsafe) static let device: AVCaptureDevice? = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.videoGravity = .resizeAspectFill
        context.coordinator.camera.start(on: view.previewLayer)
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        context.coordinator.onCode = onCode
        context.coordinator.paused = paused
    }

    static func dismantleUIView(_ view: PreviewView, coordinator: Coordinator) {
        coordinator.camera.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    /// The camera's picture, filling the window.
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    @MainActor
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: (String) -> Void
        var paused = false
        let camera = BarcodeCamera()

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
            super.init()
            camera.setDelegate(self)
        }

        nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            let code = metadataObjects.lazy.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }.first { !$0.isEmpty }
            guard let code else { return }
            // The delegate queue is the main queue. The output reports the
            // code on every frame: one is enough until the sheet scans again.
            MainActor.assumeIsolated {
                guard !paused else { return }
                paused = true
                onCode(code)
            }
        }
    }
}

/// The capture session, set up and run on its own queue so the screen does
/// not wait for the camera.
final class BarcodeCamera: @unchecked Sendable {
    private let session = AVCaptureSession()
    private let output = AVCaptureMetadataOutput()
    private let queue = DispatchQueue(label: "health.aurin.barcode")
    private var configured = false

    func setDelegate(_ delegate: AVCaptureMetadataOutputObjectsDelegate) {
        output.setMetadataObjectsDelegate(delegate, queue: .main)
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

    private func configure() -> Bool {
        guard let device = BarcodeScanner.device, let input = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.hd1920x1080) { session.sessionPreset = .hd1920x1080 }
        guard session.canAddInput(input), session.canAddOutput(output) else { return false }
        session.addInput(input)
        session.addOutput(output)
        output.metadataObjectTypes = ([.ean13, .ean8, .upce, .code128] as [AVMetadataObject.ObjectType]).filter(output.availableMetadataObjectTypes.contains)
        Self.zoomForCodes(device)
        return true
    }

    /// The main lens of newer iPhones focuses only from 15–20 cm, where a code
    /// is small; zoom in so a 35 mm wide code fills most of the window there
    /// (Apple's recipe from AVCamBarcode), at most 2.5× so it stays sharp.
    private static func zoomForCodes(_ device: AVCaptureDevice) {
        guard (try? device.lockForConfiguration()) != nil else { return }
        defer { device.unlockForConfiguration() }
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
        let closest = Double(device.minimumFocusDistance)
        guard closest > 0 else { return }
        // The window's width is the sensor's shorter side (the phone is upright).
        let dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
        let wide = Double(device.activeFormat.videoFieldOfView) * .pi / 180
        let short = 2 * atan(tan(wide / 2) * Double(min(dims.width, dims.height)) / Double(max(dims.width, dims.height)))
        let filled = 35 / 0.7
        let distance = filled / 2 / tan(short / 2)
        guard distance < closest else { return }
        device.videoZoomFactor = CGFloat(min(closest / distance, 2.5, Double(device.activeFormat.videoMaxZoomFactor)))
    }
}

/// The system camera (or the photo library where there is no camera) for one photo.
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage?) -> Void
        init(onImage: @escaping (UIImage?) -> Void) { self.onImage = onImage }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onImage(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onImage(nil)
        }
    }
}

extension UIImage {
    /// JPEG at most `side` pixels on the longer side, small enough for the
    /// server's 5 MB limit. Shrunk off the main thread, so the screen does not
    /// stop while a 12-megapixel photo is drawn again.
    func jpegForUpload(side: CGFloat = 1600) async -> Data? {
        await Task.detached(priority: .userInitiated) { self.resizedJPEG(side: side) }.value
    }

    /// Drawn at scale 1 (as Avatar does): the renderer's default is the
    /// screen's 3×, which made a 1600 px photo 4800 px.
    private func resizedJPEG(side: CGFloat) -> Data? {
        let pixels = CGSize(width: size.width * scale, height: size.height * scale)
        let factor = min(1, side / max(pixels.width, pixels.height))
        let target = CGSize(width: max(1, (pixels.width * factor).rounded()), height: max(1, (pixels.height * factor).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.75)
    }
}
