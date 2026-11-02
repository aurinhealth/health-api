# TestFlight notes (details)

Every build in TestFlight gets "What to Test" from the descriptions of the pull requests it contains
(`.github/scripts/testflight_notes.py`), in English for English (U.S.) and in Czech for the app's Czech
TestFlight information. English always comes first: in the pull request, in the notes file
(`--- Česky ---` splits it) and in the summary of every TestFlight and Vydat run. A pull request that
changes `ios-native/` carries this section in its description, written for a tester in English and then
the same points in Czech, without PR numbers, file or type names:

```
## TestFlight
**What's new**
- What changed, as the user sees it in the app (one line each).
**What to test**
- Concrete steps in the app: where to tap and what should happen.
**Co je nového**
- The same lines in Czech.
**Co otestovat**
- The same steps in Czech.
```

Keep it short and plain: updates reach ordinary users too, so only what a user notices, with no technical
details (no database, cache or server internals).

When nothing changes for a tester (a refactor, a build fix), the section says "Nic k otestování" (both
languages then get a stock line). The "TestFlight notes" workflow (`.github/workflows/testflight-notes.yml`)
fails a pull request without a usable section; editing the description re-runs it. Text typed into
Vydat's "What to Test" goes to every language as it is, unless it holds English, a line `--- Česky ---`
and then Czech.
