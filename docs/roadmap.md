# Roadmap

Features that ship together as one future update. Each point is built in its own
commits on the branch `claude/roadmap`; the pull request "Roadmap" keeps the same
list with each point's state.

| # | Point | State |
|---|-------|-------|
| 1 | Ikony (app icons): sets A and G and 13 new Pro icons in the icon picker | built, waiting for CI |
| 2 | Deník (journal): ✕/✓ questions filled from the day's data, own items, "Co na tebe působí" impact on readiness, HRV, sleep and resting heart rate | built, waiting for CI |
| 3 | 3D postava svalů: Svaly → Odpočinek shows a 3D figure coloured by fatigue. Drag sideways to turn it, tap a muscle for a bubble (name, how rested, when), tap the bubble and the camera moves in before the muscle's detail opens; the detail's header is the figure close on that muscle. Model: "Muscle Anatomy Visualized \| Ecorche" by Alexander Lashko (Superhive Standard licence, male only), packed by `scripts/build-muscle-model.mjs`, uploaded to R2 by `scripts/upload-muscle-model.mjs`, served by `/app/api/muscles/model` and kept by the app; it never enters the repo. Without it the flat figure stays. | built (`Muscle3D.swift`) |

Mockups: `/mnt/project-files/mockups/denik/` (journal), `/mnt/project-files/mockups/ikona/roadmap/` (icons: the script that renders sets A and G and the Pro icons).
