import Foundation
import Security

/// The sign-in (the pfd_session cookie) lives in the Keychain, readable after
/// the first unlock and only on this iPhone, so it never travels to another
/// phone in a backup. The cookie storage holds only a copy for this run of the
/// app: without an expiry date iOS never writes it to disk, and each launch
/// puts it back from the Keychain. A fresh cookie from the server (sign-in, the
/// daily refresh) goes to the Keychain the moment it lands.
enum SessionKeychain {
    private static let service = "health.aurin.session"
    /// Set once a sign-in went into the Keychain on this iPhone; after that, a
    /// cookie on disk without its Keychain copy came from a backup.
    private static let movedKey = "session.keychain.v1"
    private static let lock = NSRecursiveLock()
    nonisolated(unsafe) private static var started = false
    nonisolated(unsafe) private static var observer: NSObjectProtocol?

    private struct Stored: Codable {
        let value: String
        let expires: Date?
        let path: String
    }

    /// Once per run of the app, before the first request (APIClient.init).
    static func start() {
        lock.lock()
        defer { lock.unlock() }
        guard !started else { return }
        started = true
        let moved = UserDefaults.standard.bool(forKey: movedKey)
        for cookie in sessionCookies() where cookie.expiresDate != nil {
            // Restored onto another iPhone: the Keychain item stayed on the old one.
            if moved && read(cookie.domain) == nil {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            } else {
                keep(cookie)
            }
        }
        for server in ServerChoice.allCases {
            if let host = server.url.host() { restore(host) }
        }
        observer = NotificationCenter.default.addObserver(forName: .NSHTTPCookieManagerCookiesChanged, object: HTTPCookieStorage.shared, queue: nil) { _ in
            sync()
        }
    }

    /// A fresh cookie from the server into the Keychain (the storage tells of
    /// a change on its own time; the tests call this directly).
    static func sync() {
        lock.lock()
        defer { lock.unlock() }
        for cookie in sessionCookies() where cookie.expiresDate != nil { keep(cookie) }
    }

    /// When the session the Keychain holds for `host` runs out; nil without one.
    static func expires(_ host: String) -> Date? {
        lock.lock()
        defer { lock.unlock() }
        return read(host)?.expires
    }

    static func has(_ host: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard let stored = read(host) else { return false }
        return (stored.expires ?? .distantFuture) > Date()
    }

    /// Signing out: the Keychain copy goes with the cookie.
    static func delete(_ host: String) {
        lock.lock()
        defer { lock.unlock() }
        SecItemDelete(query(host) as CFDictionary)
    }

    // MARK: - Private

    private static func sessionCookies() -> [HTTPCookie] {
        (HTTPCookieStorage.shared.cookies ?? []).filter { $0.name == APIClient.sessionCookie }
    }

    /// The cookie into the Keychain, and a copy without an expiry date in its
    /// place. When the Keychain refuses it, the cookie stays as it is, so the
    /// sign-in survives the next launch.
    private static func keep(_ cookie: HTTPCookie) {
        guard write(Stored(value: cookie.value, expires: cookie.expiresDate, path: cookie.path), host: cookie.domain) else { return }
        UserDefaults.standard.set(true, forKey: movedKey)
        HTTPCookieStorage.shared.deleteCookie(cookie)
        if let copy = memoryCookie(host: cookie.domain, value: cookie.value, path: cookie.path) {
            HTTPCookieStorage.shared.setCookie(copy)
        }
    }

    private static func restore(_ host: String) {
        guard let stored = read(host) else { return }
        if let expires = stored.expires, expires <= Date() {
            SecItemDelete(query(host) as CFDictionary)
            return
        }
        let present = sessionCookies().contains { $0.domain == host }
        if !present, let copy = memoryCookie(host: host, value: stored.value, path: stored.path) {
            HTTPCookieStorage.shared.setCookie(copy)
        }
    }

    /// The host without a leading dot keeps the cookie to that host only, as
    /// the server sets it (aurin.health's never goes to staging.aurin.health).
    private static func memoryCookie(host: String, value: String, path: String) -> HTTPCookie? {
        HTTPCookie(properties: [
            .name: APIClient.sessionCookie,
            .value: value,
            .domain: host,
            .path: path.isEmpty ? "/" : path,
            .secure: "TRUE",
            .discard: "TRUE",
            HTTPCookiePropertyKey("HttpOnly"): "TRUE"
        ])
    }

    private static func query(_ host: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: host]
    }

    private static func read(_ host: String) -> Stored? {
        var item = query(host)
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Stored.self, from: data)
    }

    @discardableResult
    private static func write(_ stored: Stored, host: String) -> Bool {
        guard let data = try? JSONEncoder().encode(stored) else { return false }
        let attributes: [String: Any] = [kSecValueData as String: data,
                                         kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(query(host) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query(host).merging(attributes) { $1 } as CFDictionary, nil)
        }
        return status == errSecSuccess
    }
}
