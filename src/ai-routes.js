// App API requests that send the user's data to OpenAI, so they need AI
// access (consent, and the subscription once it is on; subscription.js)
// before anything runs. The coach's notes (/app/api/coach/reflections) are not
// here: without AI access they fall back to the rule-based note.
export const AI_ROUTE = /^\/app\/api\/(assistant(?:\/stream)?$|gym\/adjust$|gym\/equipment\/detect$|food\/(ai-lookup|photo|chat)$|coach\/review$|review(?:\/|$))/;

export function needsAIAccess(method, pathname) {
  return method === "POST" && AI_ROUTE.test(pathname);
}
