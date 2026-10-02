// Only catches what the syntax check cannot: undefined variables (a removed
// variable still referenced once took down the week view in production).
import globals from "globals";

export default [{
  files: ["**/*.js", "**/*.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...globals.worker, ...globals.node } },
  rules: { "no-undef": "error" }
}];
