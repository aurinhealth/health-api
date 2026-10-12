import CoreBluetooth
import Foundation
import Observation

/// A heart rate sensor over Bluetooth: a chest strap (Polar, Garmin, Wahoo) or
/// a band that broadcasts its heart rate (Whoop, some Fitbits, a watch in its
/// broadcast mode). Every one of them speaks the standard Heart Rate service,
/// so Režim tréninku gets the beat live without an Apple Watch.
///
/// Paired once in Nastavení → Snímač tepu; the sensor is remembered and
/// connected again when a workout starts.
@MainActor
@Observable
final class HeartRateSensor: NSObject {
    static let shared = HeartRateSensor()

    struct Found: Identifiable, Equatable {
        let id: UUID
        let name: String
    }

    private(set) var found: [Found] = []
    private(set) var scanning = false
    private(set) var connected = false
    private(set) var bpm: Double?
    /// Bluetooth is off or the app may not use it.
    private(set) var unavailable = false
    private(set) var savedName: String? = UserDefaults.standard.string(forKey: HeartRateSensor.nameKey)

    /// Each new beat (Režim tréninku counts it in the averages).
    @ObservationIgnored var onBeat: ((Double) -> Void)?

    @ObservationIgnored private var central: CBCentralManager?
    @ObservationIgnored private var peripherals: [UUID: CBPeripheral] = [:]
    @ObservationIgnored private var active: CBPeripheral?
    @ObservationIgnored private var wantsScan = false
    @ObservationIgnored private var wantsConnect = false
    @ObservationIgnored private var lastBeat: Date?

    private static let idKey = "heartRateSensorID"
    private static let nameKey = "heartRateSensorName"
    private static let service = CBUUID(string: "180D")
    private static let measurement = CBUUID(string: "2A37")

    var hasSaved: Bool { savedID != nil }
    private var savedID: UUID? { UserDefaults.standard.string(forKey: Self.idKey).flatMap(UUID.init(uuidString:)) }

    /// The latest beat, if it is fresh (a strap taken off stops sending).
    var liveBpm: Double? {
        guard let bpm, let lastBeat, Date().timeIntervalSince(lastBeat) < 10 else { return nil }
        return bpm
    }

    // MARK: Pairing

    func startScan() {
        found = []
        wantsScan = true
        guard let central = manager(), central.state == .poweredOn else { return }
        scan(central)
    }

    func stopScan() {
        wantsScan = false
        scanning = false
        central?.stopScan()
    }

    func pair(_ device: Found) {
        stopScan()
        if let active, active.identifier != device.id { central?.cancelPeripheralConnection(active) }
        UserDefaults.standard.set(device.id.uuidString, forKey: Self.idKey)
        UserDefaults.standard.set(device.name, forKey: Self.nameKey)
        savedName = device.name
        connectSaved()
    }

    func forget() {
        disconnect()
        UserDefaults.standard.removeObject(forKey: Self.idKey)
        UserDefaults.standard.removeObject(forKey: Self.nameKey)
        savedName = nil
    }

    // MARK: During a workout

    /// Connects the remembered sensor (nothing happens without one).
    func connectSaved() {
        guard hasSaved else { return }
        wantsConnect = true
        guard let central = manager(), central.state == .poweredOn else { return }
        connect(central)
    }

    func disconnect() {
        wantsConnect = false
        if let active { central?.cancelPeripheralConnection(active) }
        active = nil
        connected = false
        bpm = nil
    }

    // MARK: Internals

    private func manager() -> CBCentralManager? {
        if central == nil { central = CBCentralManager(delegate: self, queue: nil) }
        return central
    }

    private func scan(_ central: CBCentralManager) {
        scanning = true
        // Already connected straps don't advertise; list them too.
        for peripheral in central.retrieveConnectedPeripherals(withServices: [Self.service]) { add(peripheral, name: peripheral.name) }
        central.scanForPeripherals(withServices: [Self.service], options: nil)
    }

    private func connect(_ central: CBCentralManager) {
        guard let id = savedID else { return }
        let peripheral = peripherals[id] ?? central.retrievePeripherals(withIdentifiers: [id]).first
        guard let peripheral else { return }
        peripherals[id] = peripheral
        active = peripheral
        peripheral.delegate = self
        central.connect(peripheral, options: nil)
    }

    private func add(_ peripheral: CBPeripheral, name: String?) {
        peripherals[peripheral.identifier] = peripheral
        guard !found.contains(where: { $0.id == peripheral.identifier }) else { return }
        found.append(Found(id: peripheral.identifier, name: name ?? peripheral.name ?? L10n.tr("Snímač tepu")))
    }

    fileprivate func stateChanged(_ central: CBCentralManager) {
        unavailable = central.state == .unauthorized || central.state == .poweredOff || central.state == .unsupported
        guard central.state == .poweredOn else { scanning = false; connected = false; return }
        if wantsScan { scan(central) }
        if wantsConnect { connect(central) }
    }

    fileprivate func discovered(_ peripheral: CBPeripheral, name: String?) { add(peripheral, name: name) }

    fileprivate func didConnect(_ peripheral: CBPeripheral) {
        guard peripheral.identifier == active?.identifier else { return }
        connected = true
        peripheral.discoverServices([Self.service])
    }

    fileprivate func didDisconnect(_ peripheral: CBPeripheral) {
        guard peripheral.identifier == active?.identifier else { return }
        connected = false
        // Out of range for a moment: keep trying while the workout runs.
        if wantsConnect, let central { central.connect(peripheral, options: nil) }
    }

    fileprivate func beat(_ value: Double) {
        guard value > 25, value < 250 else { return }
        bpm = value
        lastBeat = Date()
        onBeat?(value)
    }

    /// Heart Rate Measurement: flags, then the rate as UInt8 or UInt16 (bit 0).
    nonisolated static func parse(_ data: Data) -> Double? {
        let bytes = [UInt8](data)
        guard let flags = bytes.first else { return nil }
        if flags & 0x01 == 0 { return bytes.count > 1 ? Double(bytes[1]) : nil }
        return bytes.count > 2 ? Double(UInt16(bytes[1]) | UInt16(bytes[2]) << 8) : nil
    }
}

extension HeartRateSensor: CBCentralManagerDelegate, CBPeripheralDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated { stateChanged(central) }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        MainActor.assumeIsolated { discovered(peripheral, name: name) }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        MainActor.assumeIsolated { didConnect(peripheral) }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        MainActor.assumeIsolated { didDisconnect(peripheral) }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        MainActor.assumeIsolated { didDisconnect(peripheral) }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for service in peripheral.services ?? [] where service.uuid == CBUUID(string: "180D") {
            peripheral.discoverCharacteristics([CBUUID(string: "2A37")], for: service)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for characteristic in service.characteristics ?? [] where characteristic.uuid == CBUUID(string: "2A37") {
            peripheral.setNotifyValue(true, for: characteristic)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value, let value = Self.parse(data) else { return }
        MainActor.assumeIsolated { beat(value) }
    }
}
