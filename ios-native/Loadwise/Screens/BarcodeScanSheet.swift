import AVFoundation
import SwiftUI
import VisionKit

/// The native barcode scanner (VisionKit): the camera in a window on the
/// app's background, a light for the dark; the food comes from your foods or
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

    /// nil until the camera permission is known (the scanner is unavailable
    /// before the first permission prompt, so the app asks first).
    @State private var cameraAllowed: Bool?

    enum ScanState { case scanning, searching, found, notFound }

    private var scannerReady: Bool {
        cameraAllowed == true && DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

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
        }
        .background(Palette.background.ignoresSafeArea())
        .task { await askCamera() }
        .onChange(of: torch) { Self.setTorch(torch) }
        .onChange(of: state) { if state != .scanning && state != .searching { torch = false } }
        .onDisappear { if torch { Self.setTorch(false) } }
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
                        Task { await find(scanned) }
                    }
                } else {
                    VStack(spacing: 12) {
                        Text(DataScannerViewController.isSupported ? "Skener potřebuje kameru. Povol Aurinu přístup ke kameře v Nastavení iPhonu." : "Tento iPhone skener čárových kódů nepodporuje.")
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
                Text("Namiř na kód na obalu").font(Typo.sentence(20)).foregroundStyle(Palette.ink.opacity(0.85))
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

    private static var hasTorch: Bool { AVCaptureDevice.default(for: .video)?.hasTorch ?? false }

    /// The back camera's light, which the scanner's camera session keeps on.
    private static func setTorch(_ on: Bool) {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            if on { try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel) } else { device.torchMode = .off }
            device.unlockForConfiguration()
        } catch {}
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

/// VisionKit's DataScannerViewController for EAN/UPC codes.
struct BarcodeScanner: UIViewControllerRepresentable {
    var paused: Bool
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
                                                qualityLevel: .balanced, recognizesMultipleItems: false,
                                                isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onCode = onCode
        if paused { scanner.stopScanning() } else if !scanner.isScanning { try? scanner.startScanning() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onCode: (String) -> Void
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let barcode) = item, let code = barcode.payloadStringValue, !code.isEmpty {
                    onCode(code)
                    return
                }
            }
        }
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
