# Adaptive Workout Library

Every user has their own capability levels, feedback and Intervals.icu schedule. The workout catalog is shared. The library covers cycling and running.

## User flow

### Vygenerovat trénink
1. Open **Workouty** and choose the day, the available time (optional) and **Indoor / Outdoor**.
2. **Vygenerovat trénink** asks Cycling Coach V2 for the day's decision, which takes into account:
   - readiness: TSB, sleep and a manual check-in
   - hard days in the last 7 days
   - lower-body gym work
   - the season phase
   - capability in each energy system

   The coach decides the energy system, the duration and the target difficulty. The library then picks the best-fitting workout.
3. **Jiný návrh** walks through the top candidates of *different* families, so the alternative is genuinely different.
4. **Přidat do Intervals.icu** writes the chosen version to the user's own calendar:
   - indoor as `VirtualRide`
   - outdoor as `Ride`

### Knihovna
Filter by system, duration, load, maximum difficulty, phase, environment and source (PFD, research, public pro sessions). Results are ranked by suitability with the reasons shown.

### Feedback
After the ride, enter completion and RPE under **Naplánované workouty**. This updates the capability for that system. Automatic activity matching only marks the session as completed, because ride duration alone does not prove the intervals were done.

## Catalog

Built-in workouts are generated in code (`src/cycling-workouts.js`) and are not stored in D1:

- **685 original PFD workouts:** 35 families and 133 distinct templates. Each family is a progression ladder, for example Threshold 4×6 → 3×8 → … → 2×30. Each template is placed into several session lengths, from 45 to 360 minutes. Long sessions put the quality work after a first aerobic block.

  | System | Families |
  |---|---|
  | Tempo | blocks, surges, low-cadence force |
  | Sweet spot | blocks, bursts, 88/102 over-unders |
  | Threshold | blocks, 95/105 over-unders, progressive, hard start |
  | VO₂max | classic 1:1, 30/30, 40/20, hard start, pyramids |
  | Anaerobic | 1 min, 2 min, 45/15 |
  | Sprint | 10 s, standing starts, 20 s |
  | Endurance | steady, cadence drills, force, progressive, durability finish |
  | Recovery | steady, spin-ups |

- **6 published research protocols with citation:**
  - Rønnestad 30/15
  - Seiler 4×8
  - Helgerud 4×4
  - Billat 30-30
  - Tabata (indoor only)
  - Burgomaster 6×30 s
- **8 publicly described pro sessions with source URL:** UAE Team Emirates-XRG, JOIN, TrainingPeaks samples.

Proprietary libraries (TrainerRoad, Xert, JOIN, Zwift, TrainerDay, …) are **not copied or scraped**. The families cover the same energy systems with independent structures.

Difficulty (1–10) is computed from the structure (`difficultyFromStructure` in `src/workout-model.js`):
- time at or above the system's intensity
- intensity relative to the band
- work:rest density
- quality done late in a long ride

## Running

Switch **Kolo / Běh** at the top of **Workouty**. The generator, the library, capability levels and feedback are then all for running (`sport = run`). The choice is remembered in the browser.

### Intensity and thresholds
- Running intensity is **% of threshold speed**, the `% Pace` target of Intervals.icu: 100 % = threshold pace, 90 % = slower, 110 % = faster.
- Threshold pace priority:
  1. the value set in **Nastavení → FTP a zóny → Běh**
  2. the Run sport settings in Intervals.icu (`threshold_pace`, stored as m/s)
- It can be calculated from:
  - a 30 min test (average pace of the last 20 min, Friel)
  - a 5 km, 10 km or half-marathon race, or any distance and time (Riegel: the pace you could hold for 60 min)
- Pace zone models:
  - Friel 7 zones (the Intervals.icu default)
  - Daniels E/M/T/I/R
  - 5 zones
  - custom bounds, entered in % or as m:ss /km
- Running LTHR gives the Friel running HR zones; easy runs show a heart-rate cap.
- Load uses average speed relative to threshold (rTSS-like), not the 4th-power mean used for power.

### Catalog (`src/running-workouts.js`, 229 workouts)
| System | Families |
|---|---|
| Recovery | recovery jog |
| Endurance | easy, easy + strides, long, long with fast finish, long with marathon-pace blocks, progression |
| Tempo | tempo run, marathon-pace blocks |
| Threshold | cruise intervals, sub-threshold (Norwegian principle), continuous threshold |
| VO₂max | 3–5 min intervals, short 2–2.5 min, 30/30, fartlek pyramid, hills |
| Anaerobic | 45 s – 90 s repetitions |
| Sprint | 10 s hill sprints |

- **Research:** Helgerud 4×4, Billat 30-30, Seiler 4×8, Daniels cruise intervals (all with citation).
- **Public references:** Yasso 800s, Norwegian double threshold (morning and afternoon session).
- There is no sweet-spot band for running; a sweet-spot decision maps to sub-threshold work.

### Run coach
`buildCyclingCoachV2({ sport: "run" })` uses the same readiness model, applied to runs:
- **Runs** are detected by activity type (`Run`, `VirtualRun`, `TrailRun`); untyped entries are detected by name.
- **Hard runs** are detected by name (tempo, intervals, hills, fartlek, race), by Intervals intensity ≥ 88 %, or by load density.
- **Long run** from 90 min. Without a plan the default is 60 min.
- **Planned runs** in Intervals.icu are read from their `% Pace` / `Z2 Pace` steps.

### Treadmill / outdoor
- **Treadmill** (`VirtualRun`): exact paces with 1 % incline. Hill sessions use 6–8 % incline for the efforts.
- **Outdoor** (`Run`):
  - pace ranges: ±2 % at threshold and above, ±3–4 % below
  - hints to pick flat or hilly terrain
  - easy runs are run by heart rate

## Indoor / outdoor

`renderForEnvironment()` converts a workout at render and schedule time:

- **Indoor:** exact % FTP targets and cadence. ERG for steady blocks; sprints and micro-intervals in resistance mode.
- **Outdoor:**
  - % ranges instead of exact targets (±3–5 %)
  - rounded step lengths and a warm-up of at least 15 min
  - sprints and very short efforts written as `max` (free efforts)
  - a terrain hint for micro-intervals
  - no cadence targets

The Intervals.icu external ID includes the environment, so the indoor and outdoor versions of the same day are separate events.

## Ranking

Ranking is independent and does not reproduce proprietary scores. Inputs:

- primary / secondary energy-system match
- duration fit
- requested load
- maximum difficulty
- the gap between workout difficulty and the ideal difficulty: capability ± readiness/phase, or the coach's target difficulty
- readiness penalties (red / yellow)
- two or more hard days in the last 7 days
- families scheduled in the last 14 days (variety)
- a small bonus for research protocols and verified workouts

## Data

| Table | Scope | Key |
|---|---|---|
| `workout_library` | shared (reserved for future catalog additions; built-ins live in code) | `id` |
| `training_capabilities` | per user | `(user_id, sport, system)` |
| `workout_feedback` | per user | `id`; one manual review per `(user_id, workout_id, scheduled_date)` |
| `workout_schedule_links` | per user | `UNIQUE (user_id, intervals_external_id)` |

All tables carry `sport` (`ride`, `run` next) so running reuses the same schema. They are created by `migrations/0002_training_library.sql` and `ensureTrainingTables()`.
