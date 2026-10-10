# User data databases

The existing `health-data` database remains the central directory and keeps every
preexisting account's history. New accounts receive a sticky entry in
`user_data_routes` pointing to one of 20 EU databases, `health-data-users-001`
through `health-data-users-020`. Staging uses two independent databases named
`health-data-staging-users-001` and `002`. No historical samples are copied.

Each new database initially admits at most 10 accounts: capacity for 200 new
accounts, in addition to the existing accounts on legacy. An indexed, atomic
claim in the central database checks the account count. Allocation also checks
the database's readiness marker and D1's `meta.size_after`; a database at or
above 7,000,000,000 bytes gets no new accounts. Assignments do not change if
bindings are missing or the shard is offline: the request fails with HTTP 503.
An existing account's subsequent growth is not capped by this allocation check.

The central database keeps users, invitations, sessions/authentication state,
encrypted provider credentials, consents, language/time zone, subscriptions,
AI spending, contribution/support records and shared catalogues. Remaining
`PERSONAL_TABLES` in `src/tenancy.js` stay together in the assigned database:
health history, diary, training/profile, workouts, chat, sync and cache state.
The user_id filter guard still applies. The router refuses joins or atomic
batches across the two databases before any write. Export and resumable account
deletion address both databases; deletion keeps the route until cleanup is done.

## Deployment and cutover

The existing GitHub Actions jobs use their Cloudflare secrets to provision the
named databases idempotently, bootstrap the empty schema, apply pending migrations,
register the shards, and generate `wrangler.runtime.jsonc` (ignored by Git).
The generated config preserves the environment, routes, assets and other settings.
Deploy using this generated config. Plain `wrangler deploy` does not include
the new bindings and must not be used once accounts have shard assignments.

The jobs wait for a routing-aware Worker (`X-Storage-Routing: 1` on an anonymous
401 response), verify a synthetic negative-user row in each shard, remove the
exact canary, and activate allocation. Activation first pins any accounts created
during deployment to legacy. Later deploys do not pin newly created accounts to
legacy or overwrite capacity/draining settings. Missing schema/API permission
fails the job before activation. Production deploys are serialized.

## Growth and operations

Increase `USER_DATA_SHARD_COUNT` in `wrangler.jsonc` and run the normal deployment
to add capacity. Do not decrease it: provisioning refuses to remove existing
database bindings. Set `accepting_new=0` in the central registry to drain a shard;
existing users keep working. `state='offline'` refuses all access to that shard.
Before a shard approaches D1's 10 GB paid-plan limit, inspect actual growth and
plan an explicit, verified move of affected users. This change does not automate
moves, archival, daily aggregation, or synchronization queues. The scheduled
sync loop remains serial and needs separate throughput work as usage grows.

Once new users have been assigned, rollback must retain this routing code and
bindings. Disabling routing or deploying an older Worker would access legacy
instead of their data. Restore a routing-aware version and keep the directory.
Existing legacy storage also continues to grow and needs monitoring.

More databases do not reset or divide the account-wide D1 usage allowance.
This deployment writes schema/migration metadata, directory entries and transient
canaries, not copies of existing history. Index maintenance can add billed writes;
deleting canaries is also billed. There is no fixed per-database monthly fee,
but stored bytes and read/write usage still cost according to the account's plan.
Twenty shards require Workers Paid; the free plan allows only ten databases per
account. No plan upgrade is performed by these scripts.

Cloudflare references: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[data location](https://developers.cloudflare.com/d1/configuration/data-location/).
