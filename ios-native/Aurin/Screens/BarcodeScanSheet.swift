import AVFoundation
import CoreImage
import PhotosUI
import SwiftUI
import Vision

/// The barcode scanner: the camera in a window on the
/// app's background, a light for the dark, or a photo of the code from
/// Photos, or the digits typed by hand; the food comes from your foods or
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
    /// The unit the portion wheel shows, for the add button's wording.
    @State private var portionKind: PortionWheel.Kind?
    @State private var state: ScanState = .scanning
    @State private var saving = false
    @State private var error: String?
    /// "Upravit produkt": the serving, the package and the values, saved for
    /// the user and maybe suggested for everyone.
    @State private var editing: FoodProduct?
    @State private var torch = false
    /// A photo of a code, picked from Photos instead of the camera.
    @State private var photo: PhotosPickerItem?
    /// "Zadat kód": the digits under the code typed by hand, for a code the
    /// camera can't read (creased, wet, a bad light) or a phone without one.
    @State private var typing = false
    @State private var typed = ""
    @FocusState private var typedFocused: Bool
    /// "Vyfotit etiketu" for a code nobody knows: the values read from the
    /// label are saved with the code, so the next scan finds them.
    @State private var labelOpen = false
    /// After the label, the front of the package, read by AI for the name
    /// and the brand of this food: a label rarely names the food, and never
    /// its brand (Petr, 2026-11-10).
    @State private var frontOf: FoodProduct?
    /// The front was photographed, not skipped.
    @State private var frontTaken = false
    /// Whether the user has AI, asked once a code is unknown: only with AI is
    /// the front read, and the card says so before the label.
    @State private var aiAccess: Bool?
    /// The AI found nothing by the code: the field for what the food is shows.
    @State private var askName = false
    /// "Přidat a skenovat další": the last food added while the scanner stays
    /// open, shown over the camera.
    @State private var added: String?
    /// A food was added with the scanner kept open: closing it closes the
    /// food sheet under it too, as after a single add.
    @State private var loggedAny = false
    /// "Navrhnout pro všechny" for a food read from its label (FoodProduct.canSuggestNew).
    @State private var suggestNew = true
    /// What AI noted on the label it read: unsure values, or energy that
    /// doesn't match the macros (a kJ figure read as kcal).
    @State private var labelNote: String?

    /// nil until the camera permission is known (the scanner is unavailable
    /// before the first permission prompt, so the app asks first).
    @State private var cameraAllowed: Bool?

    enum ScanState { case scanning, searching, found, notFound }

    private var scannerReady: Bool { cameraAllowed == true && BarcodeScanner.device != nil }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                circle("xmark", label: "Zavřít") {
                    dismiss()
                    if loggedAny { onLogged() }
                }
                Spacer()
                Text("ČÁROVÝ KÓD").font(.caption.weight(.medium)).tracking(1.9).foregroundStyle(Palette.muted)
                Spacer()
                if scannerReady && Self.hasTorch && !typing && (state == .scanning || state == .searching) {
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
                    if let added, state == .scanning || state == .searching {
                        Label(added, systemImage: "checkmark")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.green).lineLimit(1)
                            .padding(.horizontal, 16).frame(height: 36)
                            .background(Palette.green.opacity(0.15), in: Capsule())
                            .padding(.horizontal, 12)
                            .transition(.opacity)
                    }
                    if state == .scanning || state == .searching { finder }
                    if state != .scanning { resultCard }
                }
                .padding(.horizontal, 12).padding(.top, 24).padding(.bottom, 20)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.immediately)
        }
        .background { Palette.background.ignoresSafeArea() }
        .task { await askCamera() }
        // A tap when a code is read, then whether its food was found.
        .sensoryFeedback(trigger: state) { old, new in
            switch new {
            case .searching where old == .scanning: .impact(weight: .medium)
            case .found where old == .searching: .success
            case .notFound where old == .searching: .warning
            default: nil
            }
        }
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
        // Skipped (or closed) with no name yet: the editor for it, once the cover is gone.
        .fullScreenCover(item: $frontOf, onDismiss: {
            if !frontTaken, let product, product.name == L10n.tr("Jídlo z fotky") { editing = product }
        }) { product in
            LabelCameraSheet(front: true) { image in
                frontTaken = true
                frontOf = nil
                Task { await readFront(image, of: product) }
            }
        }
        .sheet(item: $editing) { product in
            NavigationStack {
                FoodProductEditor(product: product) { corrected in
                    // The user checked the values: AI's note on them is settled.
                    labelNote = nil
                    show(corrected, keepAmount: true)
                }
            }
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

    /// The camera only in this window, with its corners; the text under it.
    /// While a code is typed the window goes, so the keyboard covers nothing.
    @ViewBuilder
    private var finder: some View {
        VStack(spacing: 22) {
            if !typing { camera }
            if state == .scanning {
                VStack(spacing: 14) {
                    if typing {
                        typedField
                    } else {
                        Text("Namiř na kód na obalu").font(Typo.sentence(20)).foregroundStyle(Palette.ink.opacity(0.85))
                        HStack(spacing: 10) {
                            PhotosPicker(selection: $photo, matching: .images) {
                                Label("Vybrat fotku", systemImage: "photo").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                                    .lineLimit(1).minimumScaleFactor(0.8)
                                    .padding(.horizontal, 18).frame(height: 44)
                                    .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                            }
                            .buttonStyle(.plain)
                            Button {
                                error = nil
                                torch = false
                                typing = true
                            } label: {
                                Label("Zadat kód", systemImage: "keyboard").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                                    .lineLimit(1).minimumScaleFactor(0.8)
                                    .padding(.horizontal, 18).frame(height: 44)
                                    .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                                    .contentShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust).multilineTextAlignment(.center) }
                }
            }
        }
        .padding(.horizontal, 12)
    }

    @ViewBuilder
    private var camera: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(light: 0x1D2020, dark: 0x151718))
            if cameraAllowed == nil {
                ProgressView().tint(.white)
            } else if scannerReady {
                BarcodeScanner(paused: state != .scanning) { scanned in
                    guard state == .scanning else { return }
                    code = scanned
                    error = nil
                    added = nil
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
        // Square: a code turned across the window fits as well as along it
        // (230 high cut its ends off at 90°, Petr 2026-11-10).
        .frame(maxWidth: 320).frame(height: 320)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    /// The digits under the code and "Hledat".
    private var typedField: some View {
        VStack(spacing: 10) {
            TextField("Číslo pod kódem", text: $typed)
                .keyboardType(.numberPad)
                .font(.body.monospacedDigit()).multilineTextAlignment(.center)
                .focused($typedFocused)
                .onAppear { typedFocused = true }
                .padding(.horizontal, 16).frame(height: 46)
                .background(Palette.ink.opacity(0.06), in: Capsule())
                .onChange(of: typed) {
                    let digits = String(typed.filter { $0.isASCII && $0.isNumber }.prefix(14))
                    if digits != typed { typed = digits }
                    error = nil
                }
            HStack(spacing: 10) {
                Button {
                    typing = false
                    typed = ""
                    error = nil
                } label: {
                    Text("Zrušit").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 18).frame(height: 44)
                        .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button { findTyped() } label: {
                    Text("Hledat").font(.subheadline.weight(.semibold)).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 44).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(typed.count < 8)
                .opacity(typed.count < 8 ? 0.5 : 1)
            }
        }
        .frame(maxWidth: 320)
    }

    private func findTyped() {
        guard let found = Self.typedCode(typed) else {
            error = L10n.tr([8, 12, 13].contains(typed.count) ? "Poslední číslice nesedí. Zkontroluj číslo pod kódem." : "Kód na obalu má 8, 12 nebo 13 číslic.")
            return
        }
        typedFocused = false
        typing = false
        typed = ""
        code = found
        error = nil
        added = nil
        state = .searching
        Task { await find(found) }
    }

    /// Typed digits as the camera reads them: EAN-13, EAN-8 or UPC-E as they
    /// are, a 12-digit UPC-A with the leading 0 the camera adds. nil for
    /// another length, or when the last digit of a 12/13-digit code doesn't
    /// match the others: a typo would look up a different food. An 8-digit
    /// code isn't checked, since EAN-8 and UPC-E count their check digit
    /// differently.
    nonisolated static func typedCode(_ text: String) -> String? {
        guard text.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        if text.count == 8 { return text }
        let code = text.count == 12 ? "0" + text : text
        guard code.count == 13 else { return nil }
        let digits = code.compactMap(\.wholeNumberValue)
        let sum = digits.prefix(12).enumerated().reduce(0) { $0 + $1.element * ($1.offset.isMultiple(of: 2) ? 1 : 3) }
        return (10 - sum % 10) % 10 == digits[12] ? code : nil
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
                CoachThinkingLine(text: L10n.f("Hledám %@…", code ?? ""))
            case .found:
                if let product {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            if product.isEstimate { AIEstimateTag() }
                            else { Text("✓ Nalezeno").font(Typo.caption).foregroundStyle(Palette.green) }
                            Spacer()
                            Button { edit(product) } label: {
                                Label("Upravit produkt", systemImage: "pencil").font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                                    .padding(.horizontal, 12).frame(height: 30)
                                    .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                            }
                            .buttonStyle(.plain)
                        }
                        Text(product.name).font(Typo.sentence(27, relativeTo: .title2)).foregroundStyle(Palette.ink)
                        Text([product.brand, code.map { "EAN " + $0 }].compactMap { $0 }.joined(separator: ", ")).font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    NutritionCells(product: product, amount: amount)
                    if let labelNote {
                        Label(labelNote, systemImage: "sparkles").font(Typo.caption).foregroundStyle(Palette.amber)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    DayLeftLine(day: model.writeDay, kcal: product.kcal(for: amount) ?? 0,
                                protein: product.grams(product.protein_100g, for: amount) ?? 0,
                                carbs: product.grams(product.carbs_100g, for: amount) ?? 0)
                    VStack(alignment: .leading, spacing: 4) {
                        PortionWheel(product: product, amount: $amount, kind: Binding(get: { portionKind ?? .base }, set: { portionKind = $0 })).id(product.id + (product.serving_size?.string ?? "") + (product.serving_name ?? ""))
                        servingLine(product)
                    }
                    // Without energy the food would count as 0 kcal: it is filled in first.
                    if product.calories_100g == nil {
                        Text("Doplň energii v Upravit produkt, jinak by se jídlo počítalo jako 0 kcal.").font(Typo.small).foregroundStyle(Palette.amber)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    MissingMacrosLine(missing: product.missingMacros)
                    if product.canSuggestNew && !model.demo {
                        SettingsGroup { SettingsToggle(title: "Navrhnout pro všechny", isOn: $suggestNew) }
                    }
                    MealMenu(selection: Binding(get: { target }, set: { chosenMeal = $0 }))
                    Button { Task { await save(product) } } label: {
                        Text(saving ? L10n.tr("Ukládám…") : MealSlot.addText(target) + ", " + PortionWheel.label(product: product, amount: amount, kind: portionKind))
                            .font(Typo.bodyStrong).foregroundStyle(Palette.onButton).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity).frame(height: 50).background(Palette.button, in: Capsule())
                    }
                    .disabled(saving || amount <= 0 || product.calories_100g == nil)
                    Button { Task { await save(product, next: true) } } label: {
                        Label("Přidat a skenovat další", systemImage: "barcode.viewfinder")
                            .font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(saving || amount <= 0 || product.calories_100g == nil)
                }
            case .notFound:
                Text("Kód \(code ?? "") neznám.").font(Typo.sentence(22)).foregroundStyle(Palette.ink)
                // The label first: its values are exact and saved with the
                // code for everyone; AI only estimates.
                Button { labelOpen = true } label: {
                    Label("Vyfotit etiketu", systemImage: "camera").font(Typo.bodyStrong).foregroundStyle(Palette.onButton)
                        .frame(maxWidth: .infinity).frame(height: 46).background(Palette.button, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(model.demo)
                if aiAccess == true && !model.demo {
                    Text("Potom přední stranu obalu: název a značka se doplní samy.").font(Typo.caption).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if askName {
                    Rectangle().fill(Palette.ink.opacity(0.08)).frame(height: 1)
                    // With a name AI can estimate the food when the code is nowhere on the web.
                    TextField("Co to je? Třeba „tyčinka Margot“", text: $guess)
                        .font(.subheadline).textInputAutocapitalization(.never)
                        .padding(.horizontal, 16).frame(height: 46)
                        .background(Palette.background, in: Capsule())
                }
                HStack(spacing: 10) {
                    Button { reset() } label: {
                        Text("Skenovat znovu").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                            .padding(.horizontal, 16).frame(maxWidth: askName ? nil : .infinity).frame(height: 46)
                            .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    Button { Task { await lookUp() } } label: {
                        Label(L10n.tr(guess.trimmingCharacters(in: .whitespaces).count >= 2 ? "Odhadnout AI" : "Dohledat AI"), systemImage: "sparkles")
                            .font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .overlay { Capsule().stroke(Palette.ink.opacity(0.2), lineWidth: 1) }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            case .scanning:
                EmptyView()
            }
            if let error { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(cornerRadius: 28)
        .task(id: state) {
            if state == .notFound && aiAccess == nil && !model.demo { aiAccess = (try? await model.api.subscription())?.aiAccess }
        }
    }

    /// "1 sušenka = 19 g, 90 kcal"; a serving stored as 1 g (or none) gets "Upravit".
    @ViewBuilder
    private func servingLine(_ product: FoodProduct) -> some View {
        if product.perPortion {
            EmptyView()
        } else if let size = product.usableServing {
            Text(L10n.f("1 %@ = %@ %@, %@ kcal", product.servingName, FoodAmountView.text(size), product.unit, Fmt.int(product.kcal(for: size))))
                .font(Typo.caption).foregroundStyle(Palette.muted)
        } else {
            HStack(spacing: 14) {
                if let s = FoodProduct.size(product.serving_size, unit: product.unit) {
                    Text(L10n.f("1 porce = %@ %@", FoodAmountView.text(s), product.unit)).font(Typo.caption).foregroundStyle(Palette.muted)
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
        askName = false
        product = nil
        error = nil
        labelNote = nil
        suggestNew = true
        typing = false
        typed = ""
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
    /// When the bars can't be read (a blurred photo, a code bent round a can,
    /// Petr 2026-11-11), the digits printed under them are.
    nonisolated static func barcode(in data: Data) async -> String? {
        await Task.detached(priority: .userInitiated) {
            // Upright as the photo is seen, so its digits read left to right.
            guard let image = CIImage(data: data, options: [.applyOrientationProperty: true]) else { return nil }
            let handler = VNImageRequestHandler(ciImage: image)
            let request = VNDetectBarcodesRequest()
            request.symbologies = BarcodeScanner.visionSymbologies
            try? handler.perform([request])
            if let code = request.results?.compactMap(\.payloadStringValue).first(where: { !$0.isEmpty }) {
                return VisionBarcodeReader.likeTheCamera(code)
            }
            // The digits at most 2000 px across: a 48 MP photo read whole took seconds.
            let scale = min(1, 2000 / max(image.extent.width, image.extent.height))
            return VisionBarcodeReader.printedCode(VNImageRequestHandler(ciImage: image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))))
        }.value
    }

    private func lookUp() async {
        guard let code else { return }
        state = .searching
        do {
            let name = guess.trimmingCharacters(in: .whitespaces)
            if let p = try await model.api.lookupFood(name: name, barcode: code) { show(p) }
            else { state = .notFound; askName = true; error = name.isEmpty ? "AI ten kód nezná. Napiš, co to je, a odhadne to." : "AI ji nedokázala dohledat ani odhadnout. Zadej ji ručně." }
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
        do {
            let r = try await LabelReader.read(image, api: model.api)
            var p = r.product
            p.barcode = code
            labelNote = r.note
            // Values that don't add up aren't offered to everyone unless the user turns it on.
            if r.warning != nil { suggestNew = false }
            let name = guess.trimmingCharacters(in: .whitespaces)
            let unnamed = p.name == L10n.tr("Jídlo z fotky")
            if name.count >= 2 && unnamed { p.name = name }
            show(p)
            // The front of the package next, read by AI for the name and the
            // brand, even when the label had a name: it is often a guess from
            // the ingredients, and a label has no brand. Without AI an unnamed
            // food gets its name typed.
            if aiAccess == nil { aiAccess = r.aiAccess }
            if aiAccess == nil { aiAccess = (try? await model.api.subscription())?.aiAccess }
            if aiAccess == true {
                // The values a moment on the card, and the label's camera fully
                // closed: a cover opened while another closes does not show.
                try? await Task.sleep(for: .milliseconds(700))
                if state == .found && self.code == p.barcode && editing == nil && !saving {
                    frontTaken = false
                    frontOf = p
                }
            } else if unnamed && name.count < 2 { editing = p }
        } catch {
            self.error = error.localizedDescription
            state = .notFound
        }
    }

    /// The name and the brand from the front, over what the label gave; when
    /// AI can't read them, the editor opens to type them.
    private func readFront(_ image: UIImage, of product: FoodProduct) async {
        var p = product
        state = .searching
        error = nil
        if let jpeg = await image.jpegForUpload(), let front = try? await model.api.readPackageFront(jpeg) {
            // A name the user typed stays; the front adds the brand.
            if guess.trimmingCharacters(in: .whitespaces).count < 2 { p.name = front.name }
            p.brand = front.brand ?? p.brand
            show(p, keepAmount: true)
        } else {
            show(p, keepAmount: true)
            editing = p
        }
    }

    /// `next`: the scanner stays open for the next code ("Přidat a skenovat
    /// další"), with the food just added shown over the camera.
    private func save(_ product: FoodProduct, next: Bool = false) async {
        let value = amount
        guard value > 0 else { return }
        saving = true
        defer { saving = false }
        var p = product
        if p.barcode == nil { p.barcode = code }
        if let message = await model.logFood(product: p, amount: value, meal: target) {
            error = message
        } else {
            if suggestNew { model.suggestNewFood(p) }
            if next {
                loggedAny = true
                added = L10n.f("Přidáno " + MealSlot.toMeal(target) + ": %@", p.name)
                portionKind = nil
                reset()
            } else {
                dismiss()
                onLogged()
            }
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

    /// The codes on food packages (UPC-A arrives as EAN-13 with a leading 0).
    /// No Code 128: shelf and shipping labels use it, foods do not.
    nonisolated static let symbologies: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce]
    nonisolated static let visionSymbologies: [VNBarcodeSymbology] = [.ean13, .ean8, .upce]

    /// The lens the scanner films with, and the light belongs to.
    nonisolated(unsafe) static let device: AVCaptureDevice? = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.videoGravity = .resizeAspectFill
        let camera = context.coordinator.camera
        view.onLayout = { [weak view] in if let view { camera.readOnlyInside(view.previewLayer) } }
        camera.start(on: view.previewLayer) { [weak view] in if let view { camera.readOnlyInside(view.previewLayer) } }
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
        var onLayout: (() -> Void)?

        override func layoutSubviews() {
            super.layoutSubviews()
            onLayout?()
        }
    }

    @MainActor
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: (String) -> Void
        var paused = false {
            didSet {
                if paused != oldValue { candidate = nil }
                camera.pauseVision(paused)
            }
        }
        let camera = BarcodeCamera()
        /// The code read last: a code counts once two reads in a row give
        /// the same digits, so one misread frame adds nothing.
        private var candidate: String?

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
            super.init()
            camera.setDelegate(self)
            camera.onVisionCode { [weak self] code in self?.read(code) }
        }

        nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            let code = metadataObjects.lazy.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }.first { !$0.isEmpty }
            guard let code else { return }
            // The delegate queue is the main queue.
            MainActor.assumeIsolated { read(code) }
        }

        /// A code from either reader. Both report it on every frame: one is
        /// enough until the sheet scans again.
        private func read(_ code: String) {
            guard !paused else { return }
            guard candidate == code else { candidate = code; return }
            paused = true
            onCode(code)
        }
    }
}

/// The capture session, set up and run on its own queue so the screen does
/// not wait for the camera.
final class BarcodeCamera: @unchecked Sendable {
    private let session = AVCaptureSession()
    private let output = AVCaptureMetadataOutput()
    /// The frames for Vision, next to AVFoundation's own reader.
    private let frames = AVCaptureVideoDataOutput()
    private let vision = VisionBarcodeReader()
    private let queue = DispatchQueue(label: "health.aurin.barcode")
    private var configured = false

    func setDelegate(_ delegate: AVCaptureMetadataOutputObjectsDelegate) {
        output.setMetadataObjectsDelegate(delegate, queue: .main)
    }

    /// Vision rests while the sheet looks a code up or reads a photo.
    func pauseVision(_ paused: Bool) { vision.paused = paused }

    /// A code Vision read, on the main thread.
    func onVisionCode(_ found: @escaping @MainActor @Sendable (String) -> Void) {
        vision.onCode = { code in DispatchQueue.main.async { MainActor.assumeIsolated { found(code) } } }
    }

    /// `running` comes on the main thread once the camera films, when the
    /// preview can say where its window lies in the camera's picture.
    func start(on layer: AVCaptureVideoPreviewLayer, running: @escaping @MainActor () -> Void) {
        layer.session = session
        queue.async { [self] in
            if !configured { configured = configure() }
            if configured && !session.isRunning { session.startRunning() }
            if session.isRunning { DispatchQueue.main.async { MainActor.assumeIsolated { running() } } }
        }
    }

    /// Codes only inside the window: the preview fills it and crops the
    /// picture, and a code outside it (the next product on the shelf) was
    /// read too (Apple's AVCamBarcode does the same). Before the camera runs
    /// the layer has no picture to measure, so the whole picture stays.
    @MainActor
    func readOnlyInside(_ layer: AVCaptureVideoPreviewLayer) {
        guard !layer.bounds.isEmpty, session.isRunning else { return }
        let rect = layer.metadataOutputRectConverted(fromLayerRect: layer.bounds).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        guard !rect.isNull, rect.width > 0.05, rect.height > 0.05 else { return }
        queue.async { [self] in output.rectOfInterest = rect }
        vision.readOnlyInside(rect)
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
        output.metadataObjectTypes = BarcodeScanner.symbologies.filter(output.availableMetadataObjectTypes.contains)
        // Without the frames the scanner still reads codes held straight.
        if session.canAddOutput(frames) {
            frames.alwaysDiscardsLateVideoFrames = true
            frames.setSampleBufferDelegate(vision, queue: vision.queue)
            session.addOutput(frames)
        }
        Self.zoomForCloseUp(device, width: 35 / 0.6)
        return true
    }

    /// The main lens of newer iPhones focuses only from 15–20 cm, where a code
    /// is small; zoom in so the window shows `width` millimetres a bit beyond
    /// that (Apple's recipe from AVCamBarcode): a 35 mm wide code then fills
    /// most of it. The earlier cap of 2.5× filled the window only closer than
    /// the lens can focus, so the code was blurred just as it looked big
    /// enough (Petr, 2026-11-03). The label camera zooms the same way.
    static func zoomForCloseUp(_ device: AVCaptureDevice, width: Double) {
        guard (try? device.lockForConfiguration()) != nil else { return }
        defer { device.unlockForConfiguration() }
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
        if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
        // The lens keeps its zoom from the camera before (the label's or the scanner's).
        device.videoZoomFactor = 1
        let closest = Double(device.minimumFocusDistance)
        guard closest > 0 else { return }
        // The window's width is the sensor's shorter side (the phone is upright).
        let dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
        let wide = Double(device.activeFormat.videoFieldOfView) * .pi / 180
        let short = 2 * atan(tan(wide / 2) * Double(min(dims.width, dims.height)) / Double(max(dims.width, dims.height)))
        let distance = width / 2 / tan(short / 2)
        // A fifth beyond the closest focus, where the picture is sharp.
        let sharp = closest * 1.2
        guard distance < sharp else { return }
        device.videoZoomFactor = CGFloat(min(sharp / distance, 4, Double(device.activeFormat.videoMaxZoomFactor)))
    }
}

/// The scanner's frames read by Vision, ten a second, on their own queue.
/// AVFoundation's reader samples a code only along horizontal and vertical
/// lines through the middle of the window (Apple TN2325), so a code held at
/// an angle wasn't read (Petr, 2026-11-10); Vision finds one at any angle.
final class VisionBarcodeReader: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "health.aurin.barcode-vision")
    /// Set before the camera starts.
    var onCode: (@Sendable (String) -> Void)?
    private let lock = NSLock()
    /// The window as the metadata output's rectOfInterest.
    private var window = CGRect(x: 0, y: 0, width: 1, height: 1)
    private var resting = false
    var paused: Bool {
        get { lock.withLock { resting } }
        set { lock.withLock { resting = newValue; if newValue { scanningSince = nil } } }
    }
    /// The first frame since the scanner last found a code (under `lock`).
    private var scanningSince: Date?
    /// Only on `queue`.
    private var last = Date.distantPast
    private var lastText = Date.distantPast

    /// `rect`: the window as the metadata output's rectOfInterest.
    func readOnlyInside(_ rect: CGRect) {
        lock.withLock { window = rect }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let now = Date()
        guard !paused, now.timeIntervalSince(last) >= 0.1, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        last = now
        let (window, since) = lock.withLock { () -> (CGRect, Date) in
            if scanningSince == nil { scanningSince = now }
            return (self.window, scanningSince ?? now)
        }
        if let code = Self.code(in: pixels, region: Self.visionRegion(window)) { onCode?(code); return }
        // Bars too blurred or bent to read (a can, a dim kitchen): the digits
        // under them. A slower read, so only once the bars have failed for a
        // while, and with a pause after each. The phone is upright, so the
        // picture is turned to read a code held along the screen.
        guard now.timeIntervalSince(since) >= 1.2, now.timeIntervalSince(lastText) >= 0.6 else { return }
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .right)
        let code = Self.printedCode(handler, region: Self.uprightRegion(window))
        lastText = Date()
        if let code { onCode?(code) }
    }

    /// The metadata output's rect (the camera's unrotated picture, origin top
    /// left) in Vision's terms: the same picture, origin bottom left.
    static func visionRegion(_ rect: CGRect) -> CGRect {
        CGRect(x: rect.minX, y: 1 - rect.maxY, width: rect.width, height: rect.height)
    }

    /// The window in the frame turned upright (orientation .right, the back
    /// camera with the phone upright), in Vision's terms.
    static func uprightRegion(_ rect: CGRect) -> CGRect {
        CGRect(x: 1 - rect.maxY, y: 1 - rect.maxX, width: rect.height, height: rect.width)
    }

    /// The code in the frame's region, whichever way it lies.
    static func code(in pixels: CVPixelBuffer, region: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1)) -> String? {
        let request = VNDetectBarcodesRequest()
        request.symbologies = BarcodeScanner.visionSymbologies
        request.regionOfInterest = region
        try? VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up).perform([request])
        return request.results?.compactMap(\.payloadStringValue).first { !$0.isEmpty }.map(likeTheCamera)
    }

    /// UPC-A as AVFoundation reports it: EAN-13 with a leading 0 (TN2325).
    static func likeTheCamera(_ code: String) -> String {
        code.count == 12 ? "0" + code : code
    }

    /// The digits printed under the bars, read as text.
    static func printedCode(_ handler: VNImageRequestHandler, region: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1)) -> String? {
        printedCode(textLines(handler, region: region))
    }

    /// The text in the region, one line per row, top first.
    static func textLines(_ handler: VNImageRequestHandler, region: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1)) -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.regionOfInterest = region
        try? handler.perform([request])
        return LabelReader.rows((request.results ?? []).compactMap { o in o.topCandidates(1).first.map { (o.boundingBox, $0.string) } })
    }

    /// "4 006795 304763" on a line of text, as EAN-13 prints it: one digit,
    /// six and six (or 1 and 12, or all 13 together), with a matching check
    /// digit. Only these layouts: other numbers in the window (a date, a
    /// batch) never add up to a code. Not 12 digits (UPC-A): an EAN-13 with
    /// one digit missed would pass one time in ten. Not 8: dates have 8 too.
    static func printedCode(_ lines: [String]) -> String? {
        for line in lines {
            // The guard bars reach into the digit row and read as marks.
            let tokens = String(line.map { "<>|‘’'\"`".contains($0) ? " " : $0 }).split(separator: " ").map { digitsMisread(String($0)) }
            for start in tokens.indices {
                for layout in [[1, 6, 6], [1, 12], [13]] where start + layout.count <= tokens.count {
                    let group = tokens[start..<start + layout.count]
                    guard zip(group, layout).allSatisfy({ $0.count == $1 && $0.allSatisfy { $0.isASCII && $0.isNumber } }) else { continue }
                    if let code = BarcodeScanSheet.typedCode(group.joined()) { return code }
                }
            }
        }
        return nil
    }

    /// A blurred 0 read as a letter ("C06795") inside a group of digits; the
    /// check digit catches a wrong guess. Not 1: a guard bar looks like one.
    static func digitsMisread(_ token: String) -> String {
        guard token.contains(where: { $0.isASCII && $0.isNumber }) else { return token }
        return String(token.map { "OoQDC".contains($0) ? "0" : $0 })
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
        /// The photo is shrunk before onImage, while the picker still shows:
        /// a second tap on Use Photo is not another photo.
        private var done = false
        init(onImage: @escaping (UIImage?) -> Void) { self.onImage = onImage }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard !done else { return }
            done = true
            // At most 2560 px, so a 48-megapixel shot is not kept whole (PhotoDownsample.swift).
            guard let image = info[.originalImage] as? UIImage else { return onImage(nil) }
            Task {
                let small = await Task.detached(priority: .userInitiated) { image.shrunk() }.value
                onImage(small)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            guard !done else { return }
            done = true
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
        shrunk(side: side).jpegData(compressionQuality: 0.75)
    }
}
