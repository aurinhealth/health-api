# Aurin (formerly Loadwise)

## Rules by area

Area rules live in `.claude/rules/` and load when Claude reads or edits a matching file:
`website.md` (the website follows the app; `ios-native/` and the site), `testflight.md` (TestFlight notes
in `ios-native/` pull requests) and `ai-prompts.md` (prompt texts are private; `src/`).

## Name

The app and the site are only Aurin on aurin.health. petrfitnessdata.eu only redirects there; the bundle
IDs `eu.petrfitnessdata.*` cannot change and are never shown as a name.

## Writing code

Adapted from [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (MIT).

- Simplest code that does the job: no features, options or abstractions nobody asked for. If 200 lines
  could be 50, rewrite it.
- Touch only what the task needs. Match the existing style, leave working code alone, mention unrelated
  dead code instead of deleting it, and remove only what your own change left unused.
- Before writing, say how the change will be checked (a test, a CI check, a staging call), then make it pass.

## AI team

Claude Code works here as a product team: the main conversation is the Product Manager, the roles
are read-only sub agents in `.claude/agents/`. Tests and attacks only on staging.aurin.health or local,
never production; nothing changes before the owner approves. Every request starts with a task brief from
`prompter` and a sourced brief from `research-analyst`, then the team goes through the points one by one. See [docs/ai-team.md](docs/ai-team.md).
