# Aurin Pro in the App Store

How Aurin Pro is bought and how the server learns about it. The code is in
`ios-native/Aurin/App/ProStore.swift` (StoreKit 2), the offer in
`ios-native/Aurin/Screens/SubscriptionView.swift` and the server in
`src/app-store.js`.

## How it works

1. The app asks `/app/api/subscription` for the account's `appAccountToken` (a random
   UUID per account, kept in `subscriptions.app_account_token`) and passes it to
   `Product.purchase(options: [.appAccountToken(…)])`.
2. Every transaction the app sees (a purchase, a renewal, a restore, a code redeemed in the
   App Store) goes to `POST /app/api/subscription/transaction` as its JWS. The server checks
   the x5c chain up to Apple Root CA - G3 (pinned by SHA-256), Apple's marker extensions on the
   intermediate and the leaf, each signature, the bundle ID and the product, then sets
   `subscriptions.plan='ai'` and `valid_until` = `expiresDate` (or `'free'` after a refund
   or revocation). A transaction carrying another account's token, or one another account
   sent first, is refused with 409. Once the token's account is deleted, the person's new
   account may restore a subscription that still runs; one that had ended or was refunded by
   then stays in `store_originals` under account 0 (`keepEndedPurchases`, in the batch that
   deletes the account), so its old record gives nothing, and the cron forgets it after 400
   days. A running one that was refunded once and bought again stays there from that refund
   on (`revoked_at`), so only its records from before the refund give nothing.
   `store_originals` holds one row per original transaction (the account, the newest
   `signedDate` and the newest refund's), claimed in one statement, so two accounts
   sending it at once cannot both get it.
3. Apple sends App Store Server Notifications V2 to `POST /webhooks/app-store`
   (renewals, failed renewals with the grace period, expiry, refunds, revocation). The row is
   found by the token, or by the original transaction id for a code redeemed outside the app.
   An older record never overwrites a newer one (`store_signed_at`, and per subscription
   `store_originals.signed_at`, so a refunded subscription cannot come back by sending another
   purchase and then its record from before the refund). A refund of a subscription no account
   has sent yet (bought without the token) is kept in `store_originals` under account 0, so its
   record from before the refund gives nothing; a newer record goes to the account that sends it.
   A refund of a period that has already run out is not kept there: its record gives no Pro,
   and the paid period's record must stay the newest.
4. While `AI_PAYWALL_ENABLED` is off (the pilot) everyone keeps AI and nothing is on sale
   (`checkoutAvailable` stays false). `owner` turns the paid split on for the owner's account
   only, to try the offer, the locked plans and a TestFlight purchase; `true` turns it on for
   everyone.

## Extra coach messages (packs)

Two consumable In-App Purchases, `<bundle>.coach.messages40` and `<bundle>.coach.messages100`
(`src/coach-packs.js`). The app sends the purchase like any other transaction; the server
records it once in `coach_pack_purchases` (central database) and keeps a SHA-256 of the
transaction id in `coach_pack_seen`, which outlives a deleted account, so one purchase never
fills two accounts. The coach takes a bought message only after the week's messages and the
running conversation's 2 extra ones (`coach-allowance.js`, kind `pack`); `coach_pack_balance.used`
counts them in one conditional statement. Apple's REFUND notification sets `refunded_at` and the
pack stops counting; for a pack no account has sent yet it leaves the mark in `coach_pack_seen`,
and a record that itself carries a revocation adds nothing. A Sandbox purchase (TestFlight) is recorded but adds messages only on the
test server. Packs cannot be restored: they belong to the account, not the Apple ID.
`GET /app/api/coach-packs` gives the messages left and the purchases for the app's history.

Transactions from Xcode's StoreKit testing (`StoreKit/Aurin.storekit`, the Aurin scheme in
the simulator) are signed by Xcode, never verify, and stay on the phone.

## Worker settings

| Name | Kind | What |
| --- | --- | --- |
| `APP_STORE_APP_ID` | secret or var | The app's Apple ID (App Store Connect → App Information → Apple ID, a number). Once set, `/app/api/subscription` reports `checkoutAvailable: true` to every account the paywall is on for and production notifications must name this app. |
| `AI_PAYWALL_ENABLED` | var | Empty: the pilot (everyone has AI and every plan, nothing on sale). `owner`: the paid split for the owner's account only. `true`: for everyone. |
| `APP_STORE_BUNDLE_ID` | var, optional | `health.aurin.app` unless set. The products are `<bundle>.pro.monthly` and `<bundle>.pro.yearly`. |

No private key is needed: verification uses Apple's public certificate chain only.

    npx wrangler secret put APP_STORE_APP_ID

## App Store Connect

1. Agreements, Tax and Banking: the **Paid Apps** agreement signed, with bank and tax forms.
2. The app (bundle `health.aurin.app`) → Monetization → Subscriptions → a subscription group
   **Aurin Pro** with two auto-renewable subscriptions at the same level:
   - `health.aurin.app.pro.monthly`, 1 month, 199 Kč (base storefront Czechia),
   - `health.aurin.app.pro.yearly`, 1 year, 1 490 Kč, with the billing plan **Monthly with
     12-Month Commitment** at 149 Kč (iOS 26.4+, not in the US).
   Display names and descriptions in Czech and English, and a review screenshot of the offer.
3. On the yearly one, an **introductory offer**: free trial, 1 week, new subscribers, all storefronts,
   once for each billing plan (1 Year Upfront and Monthly with 12-Month Commitment).
   In-App Purchases: the two packs above as **Consumable**, 99 Kč and 199 Kč.
4. On the yearly one, an **offer code** campaign: pay up front, 1 year, 745 Kč, one-time-use
   codes, for new and expired subscribers. Codes are redeemed in the app (⋯ → Uplatnit promo kód)
   or by the App Store link.
5. App Information → **App Store Server Notifications**: Version 2, the production URL
   `https://aurin.health/webhooks/app-store` and the sandbox URL the same (TestFlight builds
   talk to the live server). Send a test notification: the server answers 200.
6. Users and Access → Sandbox: sandbox testers for trying it outside TestFlight. TestFlight
   testers buy with sandbox purchases automatically and are never charged.
7. Attach both subscriptions to the next app version when submitting it for review.
