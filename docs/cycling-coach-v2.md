# Cycling Coach V2 — pre-deployment design

Status: **ported to the multi-user workout library** (see docs/workout-library.md)

## Goal

Create an adaptive cycling coach for Petr Fitness Data that combines public, general principles seen in modern cycling platforms while keeping the implementation independent:

- **TrainerRoad-style concept:** compare current ability in an energy system with the challenge of the planned workout and progress difficulty sustainably.
- **JOIN-style concept:** adapt around real availability, completed training, daily readiness/soreness and post-workout RPE.
- **Xert-style concept:** account for freshness plus the balance of low / moderate / high intensity load and the focus of the next session.
- **Own application context:** Intervals.icu, gym history, sleep/recovery, nutrition, season, weather, wind and daylight.

This project does **not** reproduce proprietary formulas, scores, ML models, XSS, Workout Levels, Cycling Level, or any private WorldTour team methodology.

## Coach persona

The LLM is instructed to reason with the detail and discipline expected from an elite WorldTour performance staff, including teams such as UAE Team Emirates-XRG, without claiming affiliation, private team knowledge or access to non-public methods.

The model is the explanation and planning layer, not the sole safety mechanism. Deterministic guardrails are calculated first in `src/cycling-coach-v2.js`.

## Decision stack

1. Recovery / safety / consistency.
2. Goal and season phase.
3. Quality of key cycling sessions.
4. Available time and real-world constraints.
5. Strength training interference.
6. Extra volume/intensity only after the above are satisfied.

Default quality budget: no more than two genuinely hard cycling days in a rolling seven-day window unless future race-specific logic explicitly justifies otherwise.

A session counts as hard by its name (`src/session-intensity.js`): threshold, práh, sweet spot, VO₂, over-unders, Billat 30-30, Norský 4×4, Seiler, Rønnestad 30/15, Tabata, cruise intervals, repeats such as "5×6 min" outside an easy session. Tempo makes a run hard, not a ride. The same rule is used by the daily summary and the gym.

## Readiness

The score starts at 100 and drops for:

- form (TSB ≤ −30 / ≤ −20 / ≤ −10: −30 / −16 / −7),
- a fast ramp (> 8: −10),
- sleep (under 6 h / 7 h: −18 / −8), from Google Health or the Intervals.icu wellness,
- HRV against the athlete's own 4-week average (20 % / 10 % lower: −22 / −10) and resting HR (7 / 4 beats higher: −18 / −8); both at once another −8,
- hard days this week, lower-body gym in 48 h, a session already done today.

Under 55 is red (no intensity), under 75 yellow (no VO₂/threshold/sweet spot).

## Season phase

With a main event in the settings (`focus.event`), the phase follows the days left:

| Days to the event | Phase |
|---|---|
| more than 84 | base: aerobic base and sweet spot |
| 8–84 | build: race-specific quality |
| 2–7 | taper: volume −35 to −40 %, one short sharp session if fresh, not counted as a recovery week |
| 1 | openers: 45 min ride / 30 min run with short race-pace efforts |
| 0 | race: warm-up only, also on a low-readiness day |

An explicit `goal.phase` wins. The phase never prescribes quality within 48 h of the last one or after a week off.

## Inputs already connected

The existing `/app/api/assistant` endpoint now feeds the coach:

- current daily plan,
- previous + current + next calendar weeks,
- Intervals.icu wellness / CTL / ATL / TSB,
- Google Health dashboard data,
- gym history,
- optional request-time availability,
- optional manual readiness,
- optional goal/phase,
- optional preferences.

The API remains backwards-compatible with the existing UI. New fields are optional.

### Optional assistant request fields

```json
{
  "message": "Naplánuj dnešní kolo",
  "availabilityMinutes": 75,
  "manualReadiness": 82,
  "goal": {
    "phase": "build",
    "focus": "FTP"
  },
  "preferences": {
    "cadence": "85–95 rpm"
  }
}
```

## Session length

The length comes from the first of these that exists:

1. the time the athlete entered
2. the planned workout in Intervals.icu
3. **automatic**: an estimate of what the athlete can do today (`capacityMinutes`)

The automatic estimate starts from fitness. CTL is roughly the average daily load, and a training day carries about 7/5 of it. Easy riding is about 49 TSS/h; easy running is about 69 rTSS/h, and a run gets 20 % less. The estimate is then adjusted:

| Signal | Change |
|---|---|
| Sleep under 6 h / under 7 h | −20 % / −10 % |
| TSB ≤ −25 / ≤ −15 / ≥ +5 | −25 % / −15 % / +15 % |
| Readiness red / yellow | −30 % / −10 % |
| Recovery week | −30 % |
| Comeback after 7+ days off | −30 % |

Then the session type sets the final length:

- **Easy day:** when the estimate reaches the long-session length (bike 150 min, run 90 min), the day becomes a long ride or run. This applies on any day of the week.
- **Quality:** bike 60–120 min, run 40–80 min.
- **Recovery:** half the estimate (bike 30–60 min, run 20–40 min).

The time the athlete entered is a limit, not a target: recovery stays at most 60 min (run 40), quality at most 120 min (run 80), and the taper shortens it to about 65 %. A run is never more than 10 % longer than the longest run of the last two weeks (30 min after a break).

Without CTL the estimate starts at 75 min (bike) or 45 min (run). The reasons appear as the last line of `rationale` ("Délka 95 min: kondice CTL 55 ≈ 77 TSS…").

### Changing the length of a proposal
**Změnit délku** keeps the proposal and changes only its length (`resizeWorkout`):

1. If the library has the same family and main set at that length, that workout is used.
2. Otherwise the structure is resized:
   - the aerobic part grows or shrinks
   - in long sessions, an aerobic block is added before the main set and a cool-down ride after it
   - when that is not enough, warm-up and cool-down are trimmed first, then repetitions are removed
3. A resized workout has the id `<id>~<minutes>`. It can be scheduled and rated like any other.

The workout explanation ("Jak ho jet", "Venku", "Jídlo a pití") is also built from the workout's own structure:
- the main set with watts or paces
- the minutes of work in the target intensity
- pacing for the reps
- the uninterrupted stretch needed outdoors
- total carbohydrates and fluids for the length

## Deterministic engine output

`buildCyclingCoachV2()` returns:

- readiness score and traffic-light state,
- reasons for readiness changes,
- rolling 7-day bike TSS,
- hard bike days in rolling 7 days,
- low / moderate / high intensity load balance,
- lower-body gym interference signal,
- current constraints,
- primary session,
- fallback alternatives,
- adaptation reasons,
- missing-data list and confidence.

Current workout templates support recovery, endurance, tempo, sweet spot, threshold, VO2max and long endurance.

## Current limitations before production activation

The following should be added before treating V2 as a full autonomous season planner:

1. Persistent weekly availability instead of request-time availability only.
2. Persistent A/B/C events and target-event demands.
3. Daily subjective check-in: recovery, soreness, motivation.
4. Post-workout RPE and completion reason.
5. Energy-system capability history based on detailed interval execution, not only names/TSS.
6. Weather/daylight adaptation passed directly into the AI assistant context.
7. Explicit race taper and recovery-week state machine.
8. User-confirmed write path to Intervals.icu. No plan should be written automatically.

## Deployment safety

The Cloudflare deploy workflow runs only on pushes to `main`. This feature branch therefore does not deploy the Worker.

Before merge:

1. Require all Node regression tests to pass.
2. Review the assistant output on representative historical days.
3. Confirm `OPENAI_API_KEY` and the selected API model on Cloudflare.
4. Merge only after review.
5. After deployment run smoke tests for dashboard, assistant, daily plan and MCP.
6. Keep writes to Intervals.icu behind explicit user confirmation.

## Files

- `src/cycling-coach-v2.js` — deterministic adaptive engine.
- `src/coach-assistant.js` — WorldTour-level coaching prompt + V2 context.
- `src/entrypoint.js` — rolling multi-week context and optional request inputs.
- `tests/cycling-coach-v2.test.mjs` — regression coverage.
