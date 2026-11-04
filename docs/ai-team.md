# AI team (Claude Code sub agents)

Claude Code works on Aurin as a product team. The main conversation is the **Product Manager**; the
ten roles are sub agents defined in `.claude/agents/`:

| Role | Agent | Can run commands |
|---|---|---|
| Sport & Health Scientist | `health-scientist` | no |
| AI Coach Engineer | `ai-coach-engineer` | read-only commands |
| iOS & watchOS Designer | `ios-designer` | no |
| Data & Integrations Engineer | `data-engineer` | read-only commands |
| Security (red team) | `security-red-team` | yes, staging.aurin.health or local only |
| Privacy & Compliance | `privacy-compliance` | no |
| Tester (QA) | `qa-tester` | yes, tests, local and staging only |
| Performance & Cost Engineer | `performance-cost` | yes, tests, local and timing on staging |
| Monetization & Unit Economics Analyst | `monetization-analyst` | read-only commands |
| Marketing | `marketing` | read-only commands, public web |

## Rules
- Every role is read-only: no role edits files, commits or pushes. Changes are made only after the
  owner approves them.
- Tests and attacks run only on the test server `staging.aurin.health` or a local `wrangler dev`,
  never on production (aurin.health). A production test is a separate step the owner approves.
- Roles do not talk to each other directly. The Product Manager passes their findings between them.

## Who checks what
- Every pull request that changes the server or how data loads: `performance-cost` writes the
  "Rychlost a náklady" paragraph (speed, D1 rows, Cloudflare limits) for its description.
- Security, payments, user data and accounts: `security-red-team` and `privacy-compliance` review it.
- AI features, AI limits, the paywall and prices: `monetization-analyst` checks they never block a
  normal user and that every user earns more than they cost.
- Social posts and replies on X: `marketing` drafts and reviews them. The Product Manager schedules
  posts in Typefully; replies under other people's posts the owner posts himself.
- A full team run (all roles, two rounds) costs a lot of credits: only when the owner asks for it.
  Usually 2–3 roles are enough.

## How a task runs
1. The owner gives a task (e.g. "audit the Today screen").
2. The Product Manager restates it, asks what is unclear, proposes the roles and the scope, and starts
   only after the owner says yes. Then it briefs only the roles the task needs.
3. Round 1: the roles work in parallel and return findings in a common format
   (severity, where, evidence, proposal, effort, confidence).
4. Round 2, cross-check: the PM sends findings to the role that can challenge them (Security reviews
   engineering proposals, the Scientist reviews coach advice, the Tester reproduces claims).
5. The PM merges, removes duplicates, settles conflicts and ranks by severity.
6. The owner gets one document with numbered points and approves them ("1, 3, 5 yes, 2 no").
7. Only approved points are implemented, each in its own pull request.
