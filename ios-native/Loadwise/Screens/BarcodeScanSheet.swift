import AVFoundation
import SwiftUI
import VisionKit

/// The native barcode scanner (VisionKit): point at the code, the food comes
/// from your foods or the catalog, else an AI lookup by the code; then the
/// amount and "Přidat".
struct BarcodeScanSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let meal: String
    var onLogged: () -> Void = {}
    @State private var code: String?
    @State private var product: FoodProduct?
    @State private var amount = ""
    @State private var state: ScanState = .scanning
    @State private var saving = false
    @State private var error: String?

    /// nil until the camera permission is known (the scanner is unavailable
    /// before the first permission prompt, so the app asks first).
    @State private var cameraAllowed: Bool?

    enum ScanState { case scanning, searching, found, notFound }

    var body: some View {
        ZStack {
            Color(light: 0x1D2020, dark: 0x1D2020).ignoresSafeArea()
            if cameraAllowed == nil {
                ProgressView().tint(.white)
            } else if cameraAllowed == true && DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                BarcodeScanner(paused: state != .scanning) { scanned in
                    guard state == .scanning else { return }
                    code = scanned
                    Task { await find(scanned) }
                }
                .ignoresSafeArea()
            } else {
                VStack(spacing: 16) {
                    Text(DataScannerViewController.isSupported ? "Skener potřebuje kameru. Povol Loadwise přístup ke kameře v Nastavení iPhonu." : "Tento iPhone skener čárových kódů nepodporuje.")
                        .font(Typo.sentence(20)).foregroundStyle(Color.white.opacity(0.85)).multilineTextAlignment(.center)
                    if cameraAllowed == false, let url = URL(string: UIApplication.openSettingsURLString) {
                        Link("Otevřít Nastavení", destination: url).font(Typo.bodyStrong).foregroundStyle(.white)
                    }
                }
                .padding(32)
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 40, height: 40).background(Color.black.opacity(0.5), in: Circle())
                    }
                    .accessibilityLabel("Zavřít")
                    Spacer()
                    Text("ČÁROVÝ KÓD").font(.system(size: 12, weight: .medium)).tracking(1.9).foregroundStyle(Color.white.opacity(0.8))
                    Spacer()
                    Color.clear.frame(width: 40, height: 40)
                }
                .padding(.horizontal, 24)
                if state == .scanning {
                    Text("Namiř na kód na obalu").font(Typo.sentence(20)).foregroundStyle(Color.white.opacity(0.9)).padding(.top, 60)
                }
                Spacer()
                if state != .scanning { resultCard.padding(.horizontal, 12).padding(.bottom, 20) }
            }
        }
        .task { await askCamera() }
    }

    private func askCamera() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: cameraAllowed = true
        case .notDetermined: cameraAllowed = await AVCaptureDevice.requestAccess(for: .video)
        default: cameraAllowed = false
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
                        Text("✓ Nalezeno").font(Typo.caption).foregroundStyle(Palette.green)
                        Text(product.name).font(Typo.sentence(27, relativeTo: .title2)).foregroundStyle(Palette.ink)
                        Text([product.brand, code.map { "EAN " + $0 }].compactMap { $0 }.joined(separator: " · ")).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    NutritionCells(product: product, amount: amountValue ?? 0)
                    HStack(spacing: 10) {
                        HStack(spacing: 4) {
                            TextField("100", text: $amount).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 56)
                            Text(product.perPortion ? "porce" : product.unit).foregroundStyle(Palette.muted)
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 14).frame(height: 50)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                        Button { Task { await save(product) } } label: {
                            Text(saving ? "Ukládám…" : "Přidat " + MealSlot.toMeal(meal)).font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                                .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                        }
                        .disabled(saving || amountValue == nil)
                    }
                }
            case .notFound:
                Text("Kód \(code ?? "") neznám.").font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                Text("Zkus ho dohledat pomocí AI, nebo naskenuj jiný.").font(Typo.small).foregroundStyle(Palette.muted)
                HStack(spacing: 10) {
                    Button("Skenovat znovu") { reset() }
                        .font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 16).frame(height: 46)
                        .overlay(Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1))
                    Button { Task { await lookUp() } } label: {
                        Label("Dohledat AI", systemImage: "sparkles").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
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

    private var amountValue: Double? {
        guard let v = Double(amount.replacingOccurrences(of: ",", with: ".")), v > 0 else { return nil }
        return v
    }

    private func show(_ p: FoodProduct) {
        product = p
        amount = Fmt.decimal(p.defaultAmount, digits: p.defaultAmount.rounded() == p.defaultAmount ? 0 : 1)
        state = .found
    }

    private func reset() {
        code = nil
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
            if let p = try await model.api.lookupFood(name: "", barcode: code) { show(p) } else { state = .notFound; error = "AI ten kód nezná." }
        } catch {
            self.error = error.localizedDescription
            state = .notFound
        }
    }

    private func save(_ product: FoodProduct) async {
        guard let value = amountValue else { return }
        saving = true
        defer { saving = false }
        var p = product
        if p.barcode == nil { p.barcode = code }
        if let message = await model.logFood(product: p, amount: value, meal: meal) {
            error = message
        } else {
            dismiss()
            onLogged()
        }
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
    /// JPEG at most `side` points on the longer side, small enough for the
    /// server's 5 MB limit.
    func jpegForUpload(side: CGFloat = 1600) -> Data? {
        let scale = min(1, side / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let resized = UIGraphicsImageRenderer(size: target).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.75)
    }
}
