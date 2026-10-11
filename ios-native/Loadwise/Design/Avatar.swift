import PhotosUI
import SwiftUI
import UIKit

/// The profile photo. It stays on this phone only (a small JPEG in Application
/// Support), so it needs no storage on the server; signing out deletes it.
enum AvatarStore {
    /// Bumped on every change, so views showing the photo load it again.
    static let versionKey = "avatarVersion"
    static let nameKey = "accountName"
    static let emailKey = "accountEmail"

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
        guard let jpeg = square.jpegData(compressionQuality: 0.85), (try? jpeg.write(to: url, options: .atomic)) != nil else { return false }
        bump()
        return true
    }

    static func remove() {
        try? FileManager.default.removeItem(at: url)
        bump()
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
        .overlay(Circle().stroke(Palette.ink.opacity(image == nil ? 0.2 : 0.08), lineWidth: 1))
        .task(id: version) { image = AvatarStore.image() }
    }
}

/// "Přidat fotku" / "Změnit fotku" with the system photo picker (no photo
/// library permission needed), and "Odebrat".
struct AvatarEditor: View {
    @AppStorage(AvatarStore.versionKey) private var version = 0
    @State private var item: PhotosPickerItem?
    @State private var hasPhoto = AvatarStore.image() != nil
    @State private var error: String?

    var body: some View {
        VStack(spacing: 10) {
            PhotosPicker(selection: $item, matching: .images) {
                VStack(spacing: 8) {
                    AvatarView(size: 96)
                    Text(hasPhoto ? L10n.tr("Změnit fotku") : L10n.tr("Přidat fotku")).font(Typo.caption.weight(.semibold)).foregroundStyle(Palette.ink)
                }
            }
            .buttonStyle(.plain)
            if hasPhoto {
                Button(L10n.tr("Odebrat fotku")) { AvatarStore.remove() }
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
            }
        }
        .onChange(of: version) { hasPhoto = AvatarStore.image() != nil }
    }
}
