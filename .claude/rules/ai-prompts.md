---
paths:
  - "src/**"
---

# AI prompt texts are private

The texts the server sends to the AI models live in the private repository `aurinhealth/aurin-prompts`,
checked out to `src/private` (gitignored): `git clone https://github.com/aurinhealth/aurin-prompts src/private`.
Modules in `src/` import them from `./private/<same file name>`. Change prompt texts only with a pull
request to `aurin-prompts`, never in this public repository. A change that needs both repositories merges
`aurin-prompts` first; an `aurin-prompts`-only change goes live by running "Deploy Cloudflare Worker" on
`main` (workflow_dispatch).
