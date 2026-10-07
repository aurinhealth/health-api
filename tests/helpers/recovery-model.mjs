// A vm context with the shared recovery model loaded, as the dashboard client has it.
import vm from "node:vm";
import { RECOVERY_MODEL_FUNCTIONS } from "../../src/recovery-model.js";

export function modelContext(extra = {}) {
  const ctx = vm.createContext({ Math, Number, String, Date, Object, ...extra });
  vm.runInContext(RECOVERY_MODEL_FUNCTIONS.map(f => f.toString()).join("\n"), ctx);
  return ctx;
}
