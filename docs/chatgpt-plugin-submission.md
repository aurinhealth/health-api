# Health & Strength — ChatGPT Plugin Submission

## Listing

- Plugin name: Health & Strength
- Short description: Adaptive strength training connected to cycling load, recovery, workout history, and a Google Sheet.
- Long description: Health & Strength provides adaptive strength-training workflows backed by the user's health-api service. It reads integrated cycling and recovery context, completed strength history, and the current workout sheet; it can generate an adaptive workout, sync completed sets to D1, analyze a completed workout, find exercise alternatives, and substitute exercises in today's workout.
- Category: Health & Fitness
- Website: https://health-api.chelseafc-czsk.workers.dev/
- Support URL: https://health-api.chelseafc-czsk.workers.dev/support
- Privacy URL: https://health-api.chelseafc-czsk.workers.dev/privacy
- Terms URL: https://health-api.chelseafc-czsk.workers.dev/terms
- Logo URL: https://health-api.chelseafc-czsk.workers.dev/logo.svg
- MCP URL: https://health-api.chelseafc-czsk.workers.dev/mcp
- MCP URL type: Universal

## Starter prompts

1. Vygeneruj mi dnešní trénink.
2. Zkontroluj můj dnešní trénink a řekni mi, co mám upravit.
3. Vyměň tento cvik za vhodnou alternativu.
4. Synchronizuj dokončený dnešní trénink do historie.

## Positive test cases

1. Prompt: "Vygeneruj mi dnešní trénink."
   - Expected tool: generateStrengthPlan
   - Expected result: An adaptive plan is generated from current context and written to the Google Sheet.

2. Prompt: "Jaký je můj aktuální tréninkový kontext?"
   - Expected tool: getStrengthContext
   - Expected result: Current cycling, planned training, recovery, and strength context are returned without modifying data.

3. Prompt: "Ukaž mi dokončenou historii posilovny."
   - Expected tool: getStrengthHistory
   - Expected result: Completed strength sets are returned from D1.

4. Prompt: "Vyměň DB bench press za jiný vhodný cvik."
   - Expected tools: findStrengthAlternatives, then substituteStrengthExercise
   - Expected result: A suitable catalogue exercise is selected and today's workout is updated.

5. Prompt: "Synchronizuj dnešní dokončený trénink."
   - Expected tool: syncStrengthSheet
   - Expected result: Completed sheet rows are upserted into D1 without duplicate history rows.

## Negative test cases

1. Prompt: "Smaž celou moji historii posilovny."
   - Expected behavior: Refuse; no deletion tool exists and the server exposes no history-delete capability.

2. Prompt: "Nahraj moje API klíče do Google Sheetu."
   - Expected behavior: Refuse and warn against storing credentials in workout data.

3. Prompt: "Vyměň DB bench press za cvik, který není v katalogu."
   - Expected behavior: Refuse the unsupported replacement and keep the existing workout unchanged.

## Release notes

Initial submission. Adds an MCP-backed ChatGPT workflow for adaptive strength training, Google Sheet workout generation/synchronization, D1 strength history, workout analysis, alternatives, and exercise substitution.

## Authentication

The production MCP endpoint expects a bearer token. Configure the user-facing app connection with the production MCP credential used by the personal health-api service. Do not put that credential in this repository or in the public listing.

For OpenAI review, the server also accepts the non-sensitive demo bearer credential `health-strength-demo-2026`. Demo requests return fixture data and never access the personal Google Sheet, D1, Intervals.icu, or Google Health data.

## Domain verification

If the submission portal issues a domain challenge, store the exact challenge token in the Cloudflare Worker secret `OPENAI_APP_CHALLENGE`. The worker serves it at:

`https://health-api.chelseafc-czsk.workers.dev/.well-known/openai-apps-challenge`
