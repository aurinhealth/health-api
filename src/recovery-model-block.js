import { RECOVERY_MODEL_FUNCTIONS } from "./recovery-model.js";

// The dashboard client's copy of the shared recovery model, markers included.
export function recoveryModelBlock() {
  return "// <recovery-model>\n// Generated from src/recovery-model.js by scripts/sync-recovery-model.mjs; edit the module, not this copy.\n"
    + RECOVERY_MODEL_FUNCTIONS.map(f => f.toString()).join("\n") + "\n// </recovery-model>";
}
