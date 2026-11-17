// App API requests that send the user's data to OpenAI, so they need AI
// access (consent, and the subscription once it is on; subscription.js)
// before anything runs. The coach's notes (/app/api/coach/reflections) are not
// here: without AI access they fall back to the rule-based note.
export const AI_ROUTE = /^\/app\/api\/(assistant(?:\/stream)?$|gym\/adjust$|gym\/equipment\/detect$|food\/(ai-lookup|photo|chat)$|my-workouts\/describe$|coach\/review$|review(?:\/|$))/;

export function needsAIAccess(method, pathname) {
  return method === "POST" && AI_ROUTE.test(pathname);
}

// The feature the gate checks for a route (subscription.js assertAIAccess): a
// photo of food can run without Pro while the month's free photos last.
export const aiRouteFeature = pathname => pathname === "/app/api/food/photo" ? "food-photo" : null;
