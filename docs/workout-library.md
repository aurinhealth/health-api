# Adaptive Workout Library

Every user has their own capability levels, feedback and Intervals.icu schedule. The workout catalog is shared.

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

## MCP

- `searchCyclingWorkouts` and `scheduleCyclingWorkout` accept `environment`.
- `getCyclingCapabilities` and `recordCyclingWorkoutFeedback` are unchanged.
- Scheduling still requires an explicit `confirm=true`.
