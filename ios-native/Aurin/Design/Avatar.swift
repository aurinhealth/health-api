import PhotosUI
import SwiftUI
import UIKit

/// The profile photo: a small JPEG in Application Support, kept with the
/// account on the server too (src/profile-photo.js), so a new install or
/// another iPhone shows it. The copy on the phone belongs to the account that
/// chose it: a sign-out keeps it for that account's next sign-in, another
/// account or a deleted one removes it (AppModel.checkAccount).
enum AvatarStore {
    /// Bumped on every change, so views showing the photo load it again.
    static let versionKey = "avatarVersion"
    static let nameKey = "accountName"
    static let emailKey = "accountEmail"
    /// The account's id (GET /app/api/me): the same account after an e-mail change.
    static let idKey = "accountId"
    /// The account the photo belongs to; it outlasts a sign-out, unlike idKey and emailKey.
    static let ownerIdKey = "avatarOwnerId"
    static let ownerEmailKey = "avatarOwnerEmail"
    /// Where the phone's photo stands with the server: "synced", "upload" (a new
    /// photo not sent yet), "delete" (removed here, not yet there), or nothing
    /// (not known: a photo from before the server kept one, or none at all).
    static let serverStateKey = "avatarServerState"

    private static var url: URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appending(path: "avatar.jpg")
    }

    static func image() -> UIImage? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    /// A square, 600 px at most, from whatever the picker gave.
    static func save(_ data: Data) -> Bool {
        guard let image = UIImage(data: data) else { return false }
        let side = min(image.size.width, image.size.height)
        let scale = min(1, 600 / side)
        let size = CGSize(width: side * scale, height: side * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let square = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            image.draw(in: CGRect(x: (size.width - drawn.width) / 2, y: (size.height - drawn.height) / 2, width: drawn.width, height: drawn.height))
        }
        guard let jpeg = square.jpegData(compressionQuality: 0.85), write(jpeg) else { return false }
        UserDefaults.standard.set("upload", forKey: serverStateKey)
        return true
    }

    /// The phone's copy goes (another account, a deleted one); the server's stays.
    static func remove() {
        try? FileManager.default.removeItem(at: url)
        for key in [ownerIdKey, ownerEmailKey, serverStateKey] { UserDefaults.standard.removeObject(forKey: key) }
        bump()
    }

    /// "Odebrat fotku": gone here and, at the next sync, on the server.
    static func removeByUser() {
        remove()
        UserDefaults.standard.set("delete", forKey: serverStateKey)
    }

    /// Brings the phone and the server to the same photo: what changed here goes
    /// up, and a phone without one takes the account's (a new install, another
    /// iPhone). Run after sign-in and on each start (AppModel.loadAccountInitial).
    static func sync(api: APIClient) async {
        let defaults = UserDefaults.standard
        let local = try? Data(contentsOf: url)
        switch defaults.string(forKey: serverStateKey) {
        case "upload":
            guard let local else { defaults.removeObject(forKey: serverStateKey); return }
            if (try? await api.saveProfilePhoto(local)) != nil { defaults.set("synced", forKey: serverStateKey) }
        case "delete":
            if (try? await api.removeProfilePhoto()) != nil { defaults.removeObject(forKey: serverStateKey) }
        case "synced" where local != nil:
            return
        default:
            guard let server = try? await api.profilePhoto() else { return }
            if let jpeg = server.jpeg, let data = Data(base64Encoded: jpeg), UIImage(data: data) != nil {
                // The account's photo wins over one this phone kept from before.
                if write(data) { defaults.set("synced", forKey: serverStateKey) }
            } else if let local {
                if (try? await api.saveProfilePhoto(local)) != nil { defaults.set("synced", forKey: serverStateKey) }
            }
        }
    }

    /// Writes the JPEG as the account's photo on this phone.
    private static func write(_ jpeg: Data) -> Bool {
        guard (try? jpeg.write(to: url, options: .atomic)) != nil else { return false }
        let defaults = UserDefaults.standard
        claim(id: defaults.object(forKey: idKey) as? Int, email: defaults.string(forKey: emailKey))
        bump()
        return true
    }

    /// After a sign-in: the photo stays only for the account it belongs to.
    /// A photo from before owners were kept goes to the account signed in now.
    static func keep(forId id: Int?, email: String?) {
        guard FileManager.default.fileExists(atPath: url.path()) else { return }
        let defaults = UserDefaults.standard
        let ownerId = defaults.object(forKey: ownerIdKey) as? Int, ownerEmail = defaults.string(forKey: ownerEmailKey)
        if ownerId == nil && ownerEmail == nil {
            claim(id: id, email: email)
        } else if Self.belongs(ownerId: ownerId, ownerEmail: ownerEmail, id: id, email: email) {
            // The id stays over an e-mail change in Settings → Účet; the address follows it.
            claim(id: id ?? ownerId, email: email ?? ownerEmail)
        } else {
            remove()
        }
    }

    /// The same account: the same id, or (with no id to compare) the same e-mail.
    static func belongs(ownerId: Int?, ownerEmail: String?, id: Int?, email: String?) -> Bool {
        if let ownerId, let id { return ownerId == id }
        guard let ownerEmail, let email else { return false }
        return ownerEmail.lowercased() == email.lowercased()
    }

    private static func claim(id: Int?, email: String?) {
        let defaults = UserDefaults.standard
        if let id { defaults.set(id, forKey: ownerIdKey) } else { defaults.removeObject(forKey: ownerIdKey) }
        if let email { defaults.set(email, forKey: ownerEmailKey) } else { defaults.removeObject(forKey: ownerEmailKey) }
    }

    private static func bump() {
        UserDefaults.standard.set(UserDefaults.standard.integer(forKey: versionKey) + 1, forKey: versionKey)
    }
}

/// The photo in a circle, else the account's initial, else a person.
struct AvatarView: View {
    var size: CGFloat = 36
    @AppStorage(AvatarStore.versionKey) private var version = 0
    @AppStorage(AppModel.accountInitialKey) private var initial = ""
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else if initial.isEmpty {
                Image(systemName: "person").font(.system(size: size * 0.4, weight: .medium))
            } else {
                Text(initial).font(.system(size: size * 0.36, weight: .medium))
            }
        }
        .foregroundStyle(Palette.ink)
        .frame(width: size, height: size)
        .background(image == nil ? Palette.sand.opacity(size > 50 ? 0.6 : 0) : .clear)
        .clipShape(Circle())
        .overlay { Circle().stroke(Palette.ink.opacity(image == nil ? 0.2 : 0.08), lineWidth: 1) }
        .task(id: version) { image = AvatarStore.image() }
    }
}

/// "Přidat fotku" / "Změnit fotku" with the system photo picker (no photo
/// library permission needed), and "Odebrat".
struct AvatarEditor: View {
    @Environment(AppModel.self) private var model
    @AppStorage(AvatarStore.versionKey) private var version = 0
    @State private var item: PhotosPickerItem?
    @State private var hasPhoto = AvatarStore.image() != nil
    @State private var error: String?

    var body: some View {
        VStack(spacing: 10) {
            let photoSet = hasPhoto
            PhotosPicker(selection: $item, matching: .images) {
                VStack(spacing: 8) {
                    AvatarView(size: 96)
                    Text(photoSet ? L10n.tr("Změnit fotku") : L10n.tr("Přidat fotku")).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                }
            }
            .buttonStyle(.plain)
            if hasPhoto {
                Button(L10n.tr("Odebrat fotku")) {
                    AvatarStore.removeByUser()
                    Task { await AvatarStore.sync(api: model.api) }
                }
                    .font(Typo.caption).foregroundStyle(Palette.muted)
            }
            if let error { Text(error).font(Typo.caption).foregroundStyle(Palette.rust) }
        }
        .frame(maxWidth: .infinity)
        .onChange(of: item) { _, picked in
            guard let picked else { return }
            Task {
                let data = try? await picked.loadTransferable(type: Data.self)
                error = data.map(AvatarStore.save) == true ? nil : L10n.tr("Fotku se nepodařilo načíst.")
                item = nil
                if error == nil { await AvatarStore.sync(api: model.api) }
            }
        }
        .onChange(of: version) { hasPhoto = AvatarStore.image() != nil }
    }
}

/// GET, PUT and DELETE /app/api/profile/photo (src/profile-photo.js).
struct ProfilePhotoResponse: Decodable {
    let jpeg: String?
    let updatedAt: String?
}

extension APIClient {
    func profilePhoto() async throws -> ProfilePhotoResponse {
        try await get("/app/api/profile/photo")
    }

    func saveProfilePhoto(_ jpeg: Data) async throws {
        let _: JSONValue = try await send("/app/api/profile/photo", method: "PUT", body: ["jpeg": JSONValue.string(jpeg.base64EncodedString())])
    }

    func removeProfilePhoto() async throws {
        let _: JSONValue = try await send("/app/api/profile/photo", method: "DELETE", body: JSONObject())
    }
}
