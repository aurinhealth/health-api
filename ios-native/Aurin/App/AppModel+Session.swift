import AuthenticationServices
import Foundation

// Signing in and out: the profile setup, the account this phone keeps things
// for, and what a sign-out drops (AccountScope, AccountCaches, WriteQueue).
extension AppModel {
    /// Whether the profile setup (GET /app/api/onboarding) still waits; asked
    /// once per sign-in, remembered after it is done.
    func checkSetup() async {
        guard !demo, phase == .signedIn else { return }
        // An account set up before the health-data consent still has to give it.
        let state = try? await api.healthConsentState()
        // Paused on the server (here or on another device): the paused screen instead.
        if let state { notePaused(state.paused) }
        if healthPaused { needsSetup = resumingHealth; return }
        let consent = state?.needed ?? false
        if UserDefaults.standard.bool(forKey: Self.setupDoneKey) {
            if consent { needsSetup = true }
            return
        }
        if let done = try? await api.onboardingCompleted() {
            needsSetup = !done || consent
            if done { UserDefaults.standard.set(true, forKey: Self.setupDoneKey) }
        }
    }

    func finishSetup() async {
        UserDefaults.standard.set(true, forKey: Self.setupDoneKey)
        needsSetup = false
        if resumingHealth { healthResumed() }
        await refresh()
        await refreshFood()
        await refreshHealth()
    }

    nonisolated static let setupDoneKey = "setupDone"
    nonisolated static let accountInitialKey = "accountInitial"

    /// The account's name and e-mail for Profil, and the first letter of the
    /// name for the settings button while there is no photo.
    /// account: already fetched (signing in), so it is not asked for twice.
    func loadAccountInitial(_ known: (name: String?, email: String?, id: Int?)? = nil) async {
        guard !demo, phase == .signedIn else { return }
        var account = known
        if account == nil { account = try? await api.account() }
        guard let account else { return }
        if Self.accountUnconfirmed { checkAccount(account) }
        let defaults = UserDefaults.standard
        defaults.set(account.name, forKey: AvatarStore.nameKey)
        defaults.set(account.email, forKey: AvatarStore.emailKey)
        if let id = account.id { defaults.set(id, forKey: AvatarStore.idKey) }
        let shown = defaults.string(forKey: Self.displayNameKey)?.nilIfBlank ?? account.name ?? account.email
        if let first = shown?.trimmingCharacters(in: .whitespaces).first {
            defaults.set(String(first).uppercased(), forKey: Self.accountInitialKey)
        }
        // The photo the account keeps on the server, or this phone's going up.
        await AvatarStore.sync(api: api)
    }

    /// The name the user typed in Profil (kept in the profile on the server too).
    nonisolated static let displayNameKey = "displayName"

    func signIn() async {
        signingInWith = .google
        defer { signingInWith = nil }
        do {
            try await auth.signIn()
            await signedIn()
            await refresh()
        } catch is CancellationError {
            // The user closed the sign-in sheet.
        } catch {
            errorMessage = error.localizedDescription
            notInvited = error as? APIError == .notInvited(error.localizedDescription)
        }
    }

    /// Signs in with what Sign in with Apple returned; nonce is the raw value
    /// whose hash went into the request.
    func signIn(apple credential: ASAuthorizationAppleIDCredential, nonce: String) async {
        guard let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
            errorMessage = L10n.tr("Apple nevrátil identitu účtu. Zkus to znovu.")
            return
        }
        signingInWith = .apple
        defer { signingInWith = nil }
        let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let name = credential.fullName.map { PersonNameComponentsFormatter().string(from: $0) }
        do {
            try await api.appleLogin(identityToken: token, authorizationCode: code, nonce: nonce, name: name)
            await signedIn()
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
            notInvited = error as? APIError == .notInvited(error.localizedDescription)
        }
    }

    /// Signs in with the code from the e-mail. The first time on this phone
    /// the app offers a passkey ("Příště přes Face ID") the next time it opens
    /// (PasskeyOfferLater), not between the sign-in and the setup.
    func signIn(email: String, code: String) async throws {
        try await api.verifyEmailLogin(email: email, code: code)
        if ServerChoice.current.passkeys && !PasskeyService.mayHaveOne { PasskeyOfferLater.note() }
        await signedIn()
        await refresh()
    }

    /// Signs in with a passkey of this phone (Data/Passkeys.swift). Throws
    /// CancellationError when the sheet was closed; any other error means the
    /// e-mail code is the way in.
    func signInWithPasskey() async throws {
        signingInWith = .passkey
        defer { signingInWith = nil }
        try await passkeys.signIn(api: api)
        await signedIn()
        await refresh()
    }

    /// After either sign-in: no sample data left on screen, and what an expired
    /// session left behind (writes waiting for signal, the photo, Apple Health)
    /// is kept only for the same account. That is settled before the screens
    /// load; when the account cannot be asked, nothing of it goes out until it can.
    private func signedIn() async {
        if demo {
            today = nil; training = nil; health = nil; food = nil
            calendar = [:]
            demo = false
        }
        errorMessage = nil
        notInvited = false
        let defaults = UserDefaults.standard
        if defaults.string(forKey: AvatarStore.emailKey) != nil { defaults.set(true, forKey: Self.accountUncheckedKey) }
        let account = try? await api.account()
        if let account { checkAccount(account) }
        phase = .signedIn
        await loadAccountInitial(account)
        // The settings this account kept (a new install, another account before).
        await SettingsBackup.restore(api: api)
        // Back in the account that read Apple Health before signing out.
        if !Self.accountUnconfirmed {
            await AppleHealth.shared.resume(account: defaults.string(forKey: AvatarStore.emailKey), api: api)
        }
        await checkSetup()
        // The morning readiness push for this account (PushRegistration.swift).
        await PushRegistration.refresh(api: api)
    }

    /// Signed in, but not yet known whether to the account this phone kept things
    /// for (GET /app/api/me failed): its waiting writes and Apple Health wait.
    nonisolated static let accountUncheckedKey = "accountUnchecked"
    nonisolated static var accountUnconfirmed: Bool { UserDefaults.standard.bool(forKey: accountUncheckedKey) }

    /// The one place that decides about what the last account left on this
    /// phone: another account's writes, photo, saved screens, cycle, pill and
    /// Apple Health go (it turns Apple Health on itself); the same keeps them.
    private func checkAccount(_ account: (name: String?, email: String?, id: Int?)) {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: Self.accountUncheckedKey)
        // The photo outlasts a sign-out, so it is checked against its own account.
        AvatarStore.keep(forId: account.id, email: account.email)
        guard Self.anotherAccount(id: account.id, email: account.email, defaults: defaults) else { return }
        writes.clear()
        AvatarStore.remove()
        defaults.removeObject(forKey: Self.displayNameKey)
        AccountCaches.forget()
        clearScreens()
        AppleHealth.shared.pause(account: defaults.string(forKey: AvatarStore.emailKey))
        forgetAccountData()
    }

    /// The tabs' data of the account that left.
    func clearScreens() {
        todayScreen.clear()
        foodScreen.clear()
        healthScreen.clear()
        trainingScreen.clear()
        calendar = [:]
        fetched = [:]
    }

    /// What follows the account and has no sense for the next one.
    func forgetAccountData() {
        cycle = nil
        cycleHealthSynced = false
        Reminders.forgetPill()
        AppleHealthExport.shared.reset()
    }

    /// Someone else than the account this phone kept things for: neither the
    /// same e-mail nor the same account id. The id stays when the e-mail is
    /// changed in Settings → Účet, so the other devices, signed out by the
    /// change, keep their waiting writes and the photo when they sign in again.
    nonisolated static func anotherAccount(id: Int?, email: String?, defaults: UserDefaults) -> Bool {
        guard let previous = defaults.string(forKey: AvatarStore.emailKey), email != previous else { return false }
        if let id, defaults.object(forKey: AvatarStore.idKey) != nil, defaults.integer(forKey: AvatarStore.idKey) == id { return false }
        return true
    }


    /// Settings → "Odhlásit se": ends the session on the server as well.
    func logout() async {
        if !demo {
            // While the session still works: no more pushes to this phone.
            if !(await PushRegistration.unregister(api: api)) { PushRegistration.leavePushService() }
            await api.logout()
        }
        signOut()
    }

    /// expired: the session ran out (401), not "Odhlásit se". Writes waiting
    /// for signal, the photo and the account's name stay until the next
    /// sign-in shows whether it is the same account (signedIn()).
    func signOut(expired: Bool = false) {
        api.signOut()
        // The session ran out, so the server cannot be asked to drop this phone's
        // token: the phone leaves Apple's push service and the morning pushes stop
        // reaching the lock screen. The next sign-in registers again.
        if expired { PushRegistration.leavePushService() }
        clearLocal(expired: expired)
    }

    /// Nastavení → Testování → Server: the other server, with its own account
    /// data and sign-in. What the screens and the outbox hold belongs to the
    /// old server; both sessions stay, so switching back needs no sign-in.
    /// Apple Health stays as it is on this iPhone and reads into the chosen
    /// server, each with its own last sync (AppleHealth.serverChanged). It
    /// used to pause like a sign-out, and the way back switched it off for good.
    func switchServer(to choice: ServerChoice) async {
        guard !demo, choice != ServerChoice.current else { return }
        if phase == .signedIn { await PushRegistration.unregister(api: api) }
        ServerChoice.current = choice
        AppleHealth.shared.serverChanged()
        clearLocal(expired: true)
        writes.clear()
        if api.hasSession {
            await signedIn()
            await refresh()
        }
    }

    /// What the screens, caches, widgets, the watch and the reminders hold of the
    /// account's data (signing out, pausing health data: AppModel+HealthPause).
    func forgetShownData() {
        // What is still loading belongs to this sign-in: it stops, and what
        // comes back anyway is dropped (stillSignedIn, SnapshotCache.generation).
        scope.end()
        scope = AccountScope()
        dropRefresh()
        AccountCaches.forget()
        // Files the account left in tmp: its data export and replies to the coach.
        APIClient.removeExports()
        CoachReplyUpload.sweep()
        Reminders.cancelAll()
        WidgetBridge.clear()
        clearScreens()
        paths = [:]
        tab = .today
        selectedDate = nil
        athleteStatus = nil
        muscleFatigue = nil
        musclesAt = nil
        pastStrain = [:]
    }

    private func clearLocal(expired: Bool) {
        forgetShownData()
        // The next account's purchases carry its own appAccountToken.
        ProStore.shared.forgetAccount()
        if expired {
            // The writes wait for the next sign-in, which shows whether it is the same account.
            writes.forgetSent()
        } else {
            // Waiting writes belong to this account; the next one must not send them.
            writes.clear()
            // Apple Health was allowed for this account, not the next one.
            AppleHealth.shared.pause(account: UserDefaults.standard.string(forKey: AvatarStore.emailKey))
            forgetAccountData()
            ErrorLog.clear()
            // The next account looks for its own kept settings.
            SettingsBackup.forget()
            for key in [AvatarStore.nameKey, AvatarStore.emailKey, AvatarStore.idKey, Self.displayNameKey, Self.accountUncheckedKey] { UserDefaults.standard.removeObject(forKey: key) }
            // The photo stays for this account's next sign-in (AvatarStore.keep).
        }
        notice = nil
        // The next sign-in sends the push token again for its own account.
        PushRegistration.forget()
        UserDefaults.standard.removeObject(forKey: Self.setupDoneKey)
        UserDefaults.standard.removeObject(forKey: Self.accountInitialKey)
        needsSetup = false
        // The next sign-in asks the server whether its health data is paused.
        resumingHealth = false
        healthPaused = false
        UserDefaults.standard.removeObject(forKey: Self.healthPausedKey)
        passkeyOffer = false
        PasskeyOfferLater.forget()
        FirstDays.forget()
        offline = false
        demo = false
        phase = .signedOut
    }
}
