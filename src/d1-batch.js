// Reads of one request that start at the same moment go to D1 in one trip (db.batch).
//
// A user's database answers one trip at a time, and the trip, not the SQL, is
// what costs: on 2026-11-11 Today ran 78 queries with 22 ms of SQL and waited
// 5 s for its account's database, while the app's other requests queued on
// the same database. Today, the coach cards and their internal sub-requests
// start many reads side by side (Promise.all); here those that start before
// the event loop turns are sent together as one batch, so the database gets one
// trip instead of dozens. Each caller still gets its own answer.
//
// Only plain reads are joined (SELECT/WITH, first() or all()). A write, exec or
// batch first sends the reads started before it, so the database sees them in
// the order the code asked. A batch is one transaction: when it fails because of
// one statement (a missing table a handler expects and catches), every read is
// asked on its own as before and that statement is never joined again in this
// isolate. A blip of D1 (overloaded, reset) fails all of them, and d1-retry.js
// asks again.
import { readOnlySql, transientD1Error } from "./d1-retry.js";
import { sharedTrip, timingStore } from "./request-timing.js";

// D1 takes up to 100 statements in a batch; smaller trips keep one big read
// (a 90-day health read) from holding the others' answers.
export const MAX_BATCH = 20;
const REAL = Symbol("batched statement");
const facades = new WeakMap();
// Statements that failed inside a batch: asked on their own from then on.
const NEVER_JOIN = new Set();
const NEVER_JOIN_LIMIT = 500;
const nextTurn = fn => setTimeout(fn, 0);

export function batchingD1(binding) {
  if (!binding || typeof binding !== "object" || typeof binding.prepare !== "function" || typeof binding.batch !== "function") return binding;
  if (binding[REAL] !== undefined) return binding;
  if (facades.has(binding)) return facades.get(binding);
  // The reads waiting to be sent, per request (request-timing.js timed): a
  // Worker must not answer one request's read from another request's trip.
  const queues = new WeakMap();

  function send(queue) {
    if (!queue) return;
    if (queue.timer !== null) { clearTimeout(queue.timer); queue.timer = null; }
    const reads = queue.waiting;
    queue.waiting = [];
    for (let i = 0; i < reads.length; i += MAX_BATCH) runTrip(reads.slice(i, i + MAX_BATCH));
  }
  // Before a write: the reads this request started earlier go first.
  function sendWaiting() {
    const store = timingStore();
    if (store && queues.get(store)?.waiting.length) send(queues.get(store));
  }

  function alone(read) {
    return read.kind === "first" ? read.statement.first() : read.statement.all();
  }

  function runTrip(reads) {
    if (reads.length === 1) {
      alone(reads[0]).then(reads[0].resolve, reads[0].reject);
      return;
    }
    sharedTrip(reads.map(r => r.store));
    // Sent now, before any write asked after these reads.
    let sent;
    try { sent = binding.batch(reads.map(r => r.statement)); } catch (error) { sent = Promise.reject(error); }
    Promise.resolve(sent).then(results => {
      reads.forEach((read, i) => {
        const result = results?.[i];
        read.resolve(read.kind === "first" ? (result?.results?.[0] ?? null) : result);
      });
    }, error => {
      if (transientD1Error(error)) { for (const read of reads) read.reject(error); return; }
      // One statement spoiled the batch: each asked on its own, as without batching.
      for (const read of reads) {
        alone(read).then(read.resolve, failure => {
          if (NEVER_JOIN.size < NEVER_JOIN_LIMIT) NEVER_JOIN.add(read.sql);
          read.reject(failure);
        });
      }
    });
  }

  function read(sql, statement, kind) {
    const store = timingStore();
    // Outside a timed request or job there is nobody to share a trip with.
    if (!store || NEVER_JOIN.has(sql)) return statement[kind]();
    if (!queues.has(store)) queues.set(store, { waiting: [], timer: null });
    const queue = queues.get(store);
    return new Promise((resolve, reject) => {
      queue.waiting.push({ sql, statement, kind, resolve, reject, store });
      if (queue.waiting.length >= MAX_BATCH) send(queue);
      else if (queue.timer === null) queue.timer = nextTurn(() => send(queue));
    });
  }

  function wrap(sql, statement) {
    const joinable = readOnlySql(sql);
    return {
      [REAL]: statement,
      bind: (...values) => wrap(sql, statement.bind(...values)),
      first: (...args) => (joinable && args.length === 0 ? read(sql, statement, "first") : statement.first(...args)),
      all: (...args) => (joinable && args.length === 0 ? read(sql, statement, "all") : statement.all(...args)),
      raw: (...args) => statement.raw(...args),
      run: (...args) => { sendWaiting(); return statement.run(...args); }
    };
  }

  const facade = {
    [REAL]: binding,
    prepare: sql => wrap(String(sql), binding.prepare(sql)),
    batch(statements) {
      sendWaiting();
      return binding.batch(statements.map(s => s?.[REAL] || s));
    },
    exec(sql) { sendWaiting(); return binding.exec(sql); },
    dump: () => binding.dump()
  };
  facades.set(binding, facade);
  return facade;
}
