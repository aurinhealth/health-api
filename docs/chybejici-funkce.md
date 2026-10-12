# Chybějící funkce proti WHOOP, Oura a Garminu

Order agreed in the 12 Oct review; worked on after the low-priority items shipped (PR #138).

1. "Data k HH:MM": how fresh the health data on Today and Health is. UI waits on Petr's mockup pick (mockups/chybejici-funkce/1-stari-dat.png).
2. Wrist temperature from Apple Watch: data path, baseline deviation and readiness signal done (`src/recovery-model.js` `wristTempDeviation` / `wristTempPenalty`). Health card waits on mockup approval.
3. ACWR and training monotony: done in `src/workload-ratio.js`, fed to the training API, coach facts and the deterministic coach. Display waits on Petr's pick.
4. 7 / 30 / 90-day range switch in chart details: mockup sent.
5. Menstrual cycle tracking: last, own mockup.
