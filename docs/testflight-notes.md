# TestFlight notes (details)

Every build in TestFlight gets "What to Test" from the descriptions of the pull requests it contains
(`.github/scripts/testflight_notes.py`), in Czech for the app's Czech TestFlight information and in
English for English (U.S.). A pull request that changes `ios-native/` carries this section in its
description, written for a tester in Czech and then the same points in English, without PR numbers,
file or type names:

```
## TestFlight
**Co je nového**
- What changed, as the user sees it in the app (one line each).
**Co otestovat**
- Concrete steps in the app: where to tap and what should happen.
**What's new**
- The same lines in English.
**What to test**
- The same steps in English.
```

When nothing changes for a tester (a refactor, a build fix), the section says "Nic k otestování" (both
languages then get a stock line). The "TestFlight notes" workflow (`.github/workflows/testflight-notes.yml`)
fails a pull request without a usable section; editing the description re-runs it.
