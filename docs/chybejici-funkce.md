# Chybějící funkce proti WHOOP, Oura a Garminu

Order agreed in the 12 Oct review; worked on after the low-priority items shipped (PR #138).

1. "Data k HH:MM": how fresh the health data on Today and Health is. Done as variant B: an amber "data z HH:MM · obnovit" pill under the day on Today once the last Apple Health sync is over 3 hours old (`DataAgePill`, TodayView.swift); nothing while fresh.
2. Wrist temperature from Apple Watch: data path, baseline deviation and readiness signal done (`src/recovery-model.js` `wristTempDeviation` / `wristTempPenalty`). Health card done: the "Teplota zápěstí" widget shows Apple Watch's deviation and the last 14 nights as bars (`WristTempWidget`, `wristTemp.deviations` from the server), in place of Google's skin temperature when both exist.
3. ACWR and training monotony: done in `src/workload-ratio.js`, fed to the training API, coach facts and the deterministic coach. Display done as variant B: one amber line in the Forma card when the ratio is elevated/high or the week monotonous (`FormWidget.loadNote`).
4. 7 / 30 / 90-day range switch in chart details: done as variant B in `TrendChart` (daily dots, 7-day average line, chips above the chart, bad-side days amber); Health sends 90 days of HRV and resting heart rate.
5. Menstrual cycle tracking: last, own mockup.
