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
