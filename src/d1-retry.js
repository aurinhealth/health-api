// D1 sometimes refuses a query for a moment: the database is busy with others
// ("overloaded. Requests queued for too long"), was reset after a heavy query,
// or the connection dropped. A second try a moment later usually works, so a
// route doesn't answer 500 (or the app show an empty card) for a blip.
//
// A read is tried again after any of these. A write only when D1 says the
// request waited in the queue and never ran: after a lost connection or a
// reset a write may already have happened, and running it twice could add a
// row twice.
import { noteD1 } from "./request-timing.js";

const TRANSIENT = /D1 DB is overloaded|Requests queued for too long|exceeded its CPU time limit and was reset|Network connection lost|storage caused object to be reset|transient issue|Cannot resolve D1 DB|internal error; reference/i;
const NEVER_RAN = /D1 DB is overloaded|Requests queued for too long/i;
export const D1_RETRY_DELAYS_MS = [150, 500];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const messageOf = error => String(error?.message ?? error ?? "");

export function transientD1Error(error, { read = true } = {}) {
  const message = messageOf(error);
  return (read ? TRANSIENT : NEVER_RAN).test(message);
}

// A statement that only reads: SELECT or WITH … SELECT with no write in it.
export function readOnlySql(sql) {
  const code = String(sql || "").replace(/'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  return /^\s*(SELECT|WITH)\b/i.test(code) && !/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(code);
}

export async function withD1Retry(run, { read = true, delays = D1_RETRY_DELAYS_MS, sleep = wait } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const started = Date.now();
      const result = await run();
      noteD1(result, Date.now() - started);
      return result;
    }
    catch (error) {
      if (attempt >= delays.length || !transientD1Error(error, { read })) throw error;
      console.warn(JSON.stringify({ d1_retry: attempt + 1, read, why: messageOf(error).slice(0, 160) }));
      await sleep(delays[attempt]);
    }
  }
}
