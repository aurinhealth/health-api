// A service answers a moment of its own outage with HTTP 5xx (Google's 503
// "The service is currently unavailable" on 2026-11-06 cost the night for one
// sync): such a read is asked once more a second later. Other answers (400,
// 401, 429) come back at once. Only for reads and token refreshes: a write
// the service may have taken despite the 5xx is not sent twice.
export async function againAfterOutage(call, wait = 1000) {
  const response = await call();
  if (!(response?.status >= 500)) return response;
  await new Promise(resolve => setTimeout(resolve, wait));
  return call();
}
