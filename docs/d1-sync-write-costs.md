# D1 sync write reduction

The main health sample UPSERT and the Google batch UPSERT previously updated
every conflicting row, even if all persisted values were identical. Both now
compare sample time, interval times, numeric value, unit and payload using
SQLite's NULL-safe `IS NOT`. Identical samples leave `updated_at` and activity
matching metadata untouched. New samples and provider corrections still save.

Provider JSON is serialized deterministically, including nested object keys;
array order and provider fields are preserved. Existing unsorted JSON may be
rewritten once when that sample is next synchronized. There is no bulk rewrite,
schema migration, historical deletion or food import in this change.

The Intervals weight import, weight export ledger and wellness export ledger
also skip identical updates. Existing 50-statement Google batches are retained.
The sync's `saved` counters retain their existing meaning (processed samples),
so use D1's metrics to measure billed writes, rather than those counters.

## Validation

- Six regression tests exercise the actual persistence SQL against SQLite:
  identical samples, all changed fields and NULL transitions, user isolation,
  nested JSON order, a 125-sample Google batch and Intervals weight corrections.
- The first 125-sample batch modifies 125 application rows; its repeat modifies
  zero; changing one sample modifies one. These are SQLite affected-row counts,
  not measurements of the live account's billed D1 usage.
- Weight, wellness and Intervals import regression suites remain applicable.

## Staging and production rollout

1. Deploy through the existing staging PR workflow. Do not refresh/copy the
   production data into staging just to test this fix; that creates extra writes.
2. Run the same small sync window twice. Compare the health sample INSERTs in
   staging Query Insights. On an unchanged repeat, sample updates should stop;
   new/changed provider records and sync status/ledger changes may still write.
3. After staging succeeds, merge the PR to deploy through the existing main
   workflow. No manual SQL in the Cloudflare console is required.
4. Compare production rows written for equivalent windows before/after deployment
   and after one full daily sync cycle. Check both health-data and staging, because
   included D1 usage is shared across the account. Historical charges will remain.

## Remaining cost boundaries

This removes an observed source of avoidable writes, not every possible charge.
Recent Google polling still rereads a two-day overlap every five minutes, and
the queued daily import rereads the configured historical windows. The overlap
continues to accept late corrections; this patch does not change sync scheduling
or cursor semantics. Calendar reconciliation still replaces its scoped window,
tenancy migration may still copy records, and indexed new/changed rows have their
own D1 write cost. Do not restart migrations, remove indexes, or delete historical
data as a billing workaround.

A budget alert is not an application spending cap. Do not begin a new food bulk
import until live measurements show sufficient remaining account allowance and
an explicit import budget has been chosen. This patch adds no paid service and
does not claim a zero-dollar bill or a measured percentage saving.
