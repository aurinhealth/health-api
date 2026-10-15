# Roadmap

Features that ship together as one future update. Each point is built in its own
commits on the branch `claude/roadmap`; the pull request "Roadmap" keeps the same
list with each point's state.

| # | Point | State |
|---|-------|-------|
| 1 | Ikony (app icons): sets A and G and 13 new Pro icons in the icon picker | built, waiting for CI |
| 2 | Deník (journal): ✕/✓ questions filled from the day's data, own items, "Co na tebe působí" impact on readiness, HRV, sleep and resting heart rate | built, waiting for CI |
| 3 | 3D postava svalů: Svaly → Odpočinek shows a 3D figure coloured by fatigue. Drag sideways to turn it, tap a muscle for a bubble (name, how rested, when), tap the bubble and the camera moves in before the muscle's detail opens; the detail's header is the figure close on that muscle. Model: "Muscle Anatomy Visualized \| Ecorche" by Alexander Lashko (Superhive Standard licence, male only), packed by `scripts/build-muscle-model.mjs`, uploaded to R2 by `scripts/upload-muscle-model.mjs`, served by `/app/api/muscles/model` and kept by the app; it never enters the repo. Without it the flat figure stays. | built (`Muscle3D.swift`) |
| 4 | Další sporty v generátoru: today the generator builds only rides, runs and gym sessions (`endurance-templates.js`); swimming and other sports are not generated. Proposals, most useful first: (a) walking and hiking, an easy or recovery day in zone 2 on low readiness, by time or heart rate (S); (b) mobility, yoga and stretching, 10–20 min routines picked by the tired muscles and on rest days (S–M); (c) pool swimming, sets by pace per 100 m (CSS from a 400 + 200 m test), technique, warm-up and cool-down, load from heart rate (M); (d) circuit training / HIIT, timed blocks from the gym's exercise catalogue (S–M); (e) rowing machine, intervals by watts or pace per 500 m from a 2 km test (M); (f) cross-country skiing and ski touring, the winter version of rides and runs by heart rate (M). Team and racket sports are not generated, only logged, with their heart-rate load counted in the week plan | idea, nothing built |

Mockups: `/mnt/project-files/mockups/denik/` (journal), `/mnt/project-files/mockups/ikona/roadmap/` (icons: the script that renders sets A and G and the Pro icons).
