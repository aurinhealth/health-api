import SwiftUI

/// A part of a screen whose data didn't come: one sentence and "Zkusit znovu",
/// the look of LoadingScreen's error, in place of the missing part.
struct RetryRow: View {
    let message: String
    let retry: () async -> Void
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.tr(message)).font(Typo.body).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { busy = true; await retry(); busy = false }
            } label: {
                HStack(spacing: 8) {
                    Text("Zkusit znovu").font(Typo.bodyStrong)
                    if busy { ProgressView().controlSize(.small) }
                }
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(Palette.ink)
            .disabled(busy)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
