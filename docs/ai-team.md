# AI team (Claude Code sub agents)

Claude Code works on Aurin as a product team. The main conversation is the **Product Manager**; the
roles are sub agents defined in `.claude/agents/`:

| Role | Agent | Can run commands |
|---|---|---|
| Research Analyst | `research-analyst` | no (web research only) |
| Sport & Health Scientist | `health-scientist` | no |
| AI Coach Engineer | `ai-coach-engineer` | read-only commands |
| iOS & watchOS Designer | `ios-designer` | no |
| Data & Integrations Engineer | `data-engineer` | read-only commands |
| Security (red team) | `security-red-team` | yes, staging.aurin.health or local only |
| Privacy, Compliance & Legal | `privacy-compliance` | no |
| Tester (QA) | `qa-tester` | yes, tests, local and staging only |
| Performance & Cost Engineer | `performance-cost` | yes, tests, local and timing on staging |
| Monetization & Unit Economics Analyst | `monetization-analyst` | read-only commands |
| Critic | `critic` | no |
| Marketing | `marketing` | read-only commands, public web |
| Cycling Coach | `cycling-coach` | no |
| Running Coach | `running-coach` | no |
| Swimming Coach | `swimming-coach` | no |
| Triathlon & Duathlon Coach | `triathlon-coach` | no |
| Strength Coach | `strength-coach` | no |
| Sports Nutritionist | `sports-nutritionist` | no |
| Physiotherapist | `physiotherapist` | no |

## Rules
- Every role is read-only: no role edits files, commits or pushes. Changes are made only after the
  owner approves them.
- Tests and attacks run only on the test server `staging.aurin.health` or a local `wrangler dev`,
  never on production (aurin.health). A production test is a separate step the owner approves.
- Roles do not talk to each other directly. The Product Manager passes their findings between them.
- Merging and deploying are held by code, not only by this text: `.claude/settings.json` makes Claude
  Code ask the owner before it merges a pull request, turns on auto-merge or runs `wrangler deploy`,
  even in auto mode. The production deploy also waits for the owner's approval in the GitHub
  `production` environment. The rule binds sessions opened in this repository; a session that
  loads no project settings (for example a cloud project with more than one repository) is held by
  the owner's "mergni" and "vydej" alone.

## Who checks what
- Every pull request that changes the server or how data loads: `performance-cost` writes the
  "Rychlost a náklady" paragraph (speed, D1 rows, Cloudflare limits) for its description.
- Security, payments, user data and accounts: `security-red-team` and `privacy-compliance` review it.
- Legal texts (privacy, terms, support, health data), App Store texts and Review Notes, subscriptions,
  AI disclosures and other companies' names and logos: `privacy-compliance`.
- AI features, AI limits, the paywall and prices: `monetization-analyst` checks they never block a
  normal user and that every user earns more than they cost.
- Every request or point to discuss: `research-analyst` first researches competitors, medical and
  sport-science literature, guidelines, news and studies, each claim with a source. The other roles
  build their proposals on that brief.
- Training, plans, workouts and the coach's training advice: the coach of each sport the change touches
  (`cycling-coach`, `running-coach`, `swimming-coach`, `strength-coach`) checks that a professional coach
  would prescribe it this way, fitted to the user's real time and goal. A week plan across several sports
  adds `triathlon-coach`. Fuelling goes to `sports-nutritionist`, pain, injury, warm-ups, mobility and
  return to training to `physiotherapist`. The coaches judge the practice; `health-scientist` still owns
  method, sources and MDR, and `ai-coach-engineer` the prompts and code.
- Food features and food advice: `sports-nutritionist`.
- Every team run: `critic` reviews the proposals before the owner's document.
- Social posts and replies on X: `marketing` drafts and reviews them. The Product Manager schedules
  posts in Typefully; replies under other people's posts the owner posts himself.
- Texts for people (release notes, App Store, web copy): `marketing` runs its plain-writing check
  on them before they go out.
- A full team run (all roles, two rounds) costs a lot of credits: only when the owner asks for it.
  Usually 2–3 roles are enough.

## How a task runs
1. The owner gives a task (e.g. "audit the Today screen").
2. The Product Manager restates it, asks what is unclear, proposes the roles and the scope, and starts
   only after the owner says yes. Then it briefs only the roles the task needs.
3. Research: `research-analyst` writes an evidence brief for every point (competitors, studies,
   guidelines, rules, news), with sources and the strength of the evidence.
4. Round 1: the roles work in parallel from that brief and return findings in a common format
   (severity, where, evidence, proposal, effort, confidence).
5. Round 2, team meeting: the PM goes through the points one by one. For each point the roles that
   own it see the brief and each other's proposals, challenge them (Security reviews engineering
   proposals, the Scientist reviews coach advice, the Tester reproduces claims) and agree on one best
   proposal. If they disagree, the PM writes down both options and why.
6. Critic: `critic` looks for the "but" in every proposal (risks, costs, MDR, privacy, edge cases, a
   simpler alternative, weak evidence) and rates it Drží / Drží s úpravou / Nedrží with a sourced
   objection. It has no veto; the author of the proposal answers and the owner sees both.
7. The PM merges, removes duplicates, settles conflicts and ranks by severity.
8. The owner gets one document with numbered points (severity, who found it, proposal, effort,
   sources) and approves them ("1, 3, 5 yes, 2 no").
9. Only approved points are implemented, each in its own pull request.

## Sources
The "promises against the code" check (`privacy-compliance`), the four-point checklist
(`performance-cost`) and the merge and deploy rule in `.claude/settings.json` adapt ideas from the
`intended-vs-implemented`, `performance-audit-static` and `guardrail-hooks` skills in
[phuryn/product-engineering](https://github.com/phuryn/product-engineering) (MIT, Pawel Huryn), read
on 2026-11-04. The skills themselves are not installed here: they target another stack and would
clash with this process.

The legal checklists of `privacy-compliance` (GDPR art. 13 and 14, DPIA, transfers, consumer terms,
the AI Act, the Cyber Resilience Act and the Data Act) adapt, in our own words, expert skills read on
[Lawwe AI](https://lawve.ai) on 2026-11-05; the role file lists them with their licences. Nothing is
installed and no text is copied.
