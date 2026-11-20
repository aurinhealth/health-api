---
name: verify
description: Run the change before opening a pull request in health-api (server or iOS app) and write what was run into the pull request. Use before every commit that opens or updates a pull request.
---

# Verify a change before the pull request

CI mostly proves the code builds. Before a pull request, run the change the way a user would hit it.
Only locally or on staging.aurin.health, never on aurin.health.

## Server (`src/`, `migrations/`, `scripts/`)
1. `npm run check`, `npm run lint` and `npm test`. A failing test is fixed, never skipped,
   retried until green or slowed down with a sleep.
2. Call what the change touches: with `npm run dev` (local) or on staging after the merge to main,
   with a test account you created yourself. Check the answer itself (fields, numbers, language), not
   only the status code. For the coach, the coach eval on staging stays the check (3 rounds).

## iOS app (`ios-native/`)
1. The `ios-native` workflow builds the app and runs the smoke test of the main screens
   (`AurinUITests/SmokeTests.swift`). Open its screenshots of the screens the change touches and
   look at them.
2. A TestFlight build talks to production: it is not a test of a server change on staging.

## After three rounds
If a check still fails after three rounds of fixes, stop and tell the Product Manager what fails and
what you tried.

## In the pull request
Write `Ověřeno:` with what ran and what you saw (for example `npm test passed; /app/api/food-today on
staging with a new account, food targets filled`). If nothing could be run, write `Ověřeno: nic`
and why.
