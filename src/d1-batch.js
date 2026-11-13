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
// Only plain reads are joined (SELECT/WITH, first() or all()). Anything else
// (a write, also one with RETURNING, exec, a batch) first sends the reads the
// request started before it, so the database sees them in the order the code
// asked. A batch is one transaction: when it fails (a missing table a handler
// expects and catches, one heavy read that resets D1), every read is asked on
// its own as without batching, so one read never fails the others; d1-retry.js
// then repeats a read that hit a blip, and a statement that fails alone is
// never joined again in this isolate. (Such a read asked again may already see
// a write the request sent after the batch.)
import { readOnlySql, transientD1Error } from "./d1-retry.js";
import { countTrip, timingStore, viaBatcher } from "./request-timing.js";

// Smaller trips keep one big read (a 90-day health read) from holding the others' answers.
export const MAX_BATCH = 20;
const REAL = Symbol("batched statement");
const facades = new WeakMap();
// Statements that failed on their own after a batch failed: asked alone from then on.
const NEVER_JOIN = new Set();
const NEVER_JOIN_LIMIT = 500;
const nextTurn = fn => setTimeout(fn, 0);
const started = fn => { try { return Promise.resolve(fn()); } catch (error) { return Promise.reject(error); } };

export function batchingD1(binding) {
  if (!binding || typeof binding !== "object" || typeof binding.prepare !== "function" || typeof binding.batch !== "function") return binding;
  if (binding[REAL] !== undefined) return binding;
  if (facades.has(binding)) return facades.get(binding);
  // The reads waiting to be sent, per request (request-timing.js timed): a
  // Worker must not answer one request's read from another request's trip.
  const queues = new WeakMap();

  function send(queue) {
    if (queue.timer !== null) { clearTimeout(queue.timer); queue.timer = null; }
    const reads = queue.waiting;
    queue.waiting = [];
    for (let i = 0; i < reads.length; i += MAX_BATCH) runTrip(reads.slice(i, i + MAX_BATCH));
  }
  // Before anything that is not a joined read: this request's reads started earlier go first.
  function sendWaiting(store) {
    const queue = store && queues.get(store);
    if (queue?.waiting.length) send(queue);
  }

  function alone(read) {
    countTrip(read.store);
    started(() => read.statement[read.kind]()).then(read.resolve, failure => {
      // A blip (overloaded, reset) is no reason to stop joining the statement.
      if (read.joined && !transientD1Error(failure) && NEVER_JOIN.size < NEVER_JOIN_LIMIT) NEVER_JOIN.add(read.sql);
      read.reject(failure);
    });
  }

  function runTrip(reads) {
    if (reads.length === 1) return alone(reads[0]);
    countTrip(reads[0].store, reads.length);
    // Sent now, before any write asked after these reads.
    started(() => binding.batch(reads.map(r => r.statement))).then(results => {
      reads.forEach((read, i) => {
        const result = results?.[i];
        read.resolve(read.kind === "first" ? (result?.results?.[0] ?? null) : result);
      });
    }, () => {
      for (const read of reads) alone({ ...read, joined: true });
    });
  }

  function direct(statement, kind, args, store) {
    sendWaiting(store);
    countTrip(store);
    return statement[kind](...args);
  }

  function read(sql, statement, kind) {
    const store = timingStore();
    // Outside a timed request or job there is nobody to share a trip with.
    if (!store || NEVER_JOIN.has(sql)) return direct(statement, kind, [], store);
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
    const call = kind => (...args) => {
      viaBatcher.seen = true;
      return joinable && args.length === 0 && (kind === "first" || kind === "all") ? read(sql, statement, kind) : direct(statement, kind, args, timingStore());
    };
    return {
      [REAL]: statement,
      bind: (...values) => wrap(sql, statement.bind(...values)),
      first: call("first"),
      all: call("all"),
      raw: call("raw"),
      run: call("run")
    };
  }

  // A batch or exec sent as it is, after this request's waiting reads.
  function whole(statements, send) {
    viaBatcher.seen = true;
    const store = timingStore();
    sendWaiting(store);
    countTrip(store, statements);
    return send();
  }

  const facade = {
    [REAL]: binding,
    prepare: sql => wrap(String(sql), binding.prepare(sql)),
    batch: statements => whole(statements.length, () => binding.batch(statements.map(s => s?.[REAL] || s))),
    exec: sql => whole(1, () => binding.exec(sql)),
    dump: () => binding.dump()
  };
  facades.set(binding, facade);
  return facade;
}
