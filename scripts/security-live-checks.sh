#!/usr/bin/env bash
# Non-destructive live security checks for aurin.health.
# Read-only: only GET / HEAD / OPTIONS, no writes, no brute force, no fuzzing.
# Run from your own machine (the cloud session's egress policy blocks aurin.health).
#
#   ./scripts/security-live-checks.sh [host]
#
# Default host: aurin.health
set -u
HOST="${1:-aurin.health}"
BASE="https://${HOST}"
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; }
info() { printf '  \033[36mINFO\033[0m %s\n' "$1"; }
hr()   { printf '\n== %s ==\n' "$1"; }

hr "1. Security response headers ($BASE/)"
H="$(curl -sS -D - -o /dev/null "$BASE/")"
printf '%s\n' "$H" | grep -iE '^(strict-transport-security|x-frame-options|x-content-type-options|content-security-policy|referrer-policy|permissions-policy):' | sed 's/^/  /'
grep -qi '^strict-transport-security:.*max-age=3' <<<"$H" && pass "HSTS present" || warn "HSTS missing/short"
grep -qi '^x-frame-options: *DENY' <<<"$H" && pass "X-Frame-Options DENY" || warn "X-Frame-Options not DENY"
grep -qi '^content-security-policy:' <<<"$H" && info "CSP present (note: no script-src — XSS not mitigated by CSP)" || warn "CSP missing"
grep -qi '^server:' <<<"$H" && warn "Server header present: $(grep -i '^server:' <<<"$H" | tr -d '\r')" || pass "No Server banner"

hr "2. HTTP -> HTTPS redirect (http://$HOST/)"
R="$(curl -sS -D - -o /dev/null "http://${HOST}/" 2>&1)"
printf '%s\n' "$R" | grep -iE '^(HTTP/|location):' | sed 's/^/  /'
grep -qiE '^location: *https://' <<<"$R" && pass "Redirects to HTTPS" || warn "No HTTPS redirect"

hr "3. Protected endpoints require auth (expect 401)"
for p in /app/api/today /app/api/account/export /app/api/coach/inbox; do
  C="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")"
  [ "$C" = "401" ] && pass "$p -> 401" || warn "$p -> $C (expected 401)"
done

hr "4. Session cookie attributes (unauthenticated probe of a login start)"
# Only reads Set-Cookie flags; sends no credentials.
SC="$(curl -sS -D - -o /dev/null -X POST "$BASE/auth/email/start" -H 'Content-Type: application/json' --data '{}' 2>&1 | grep -i '^set-cookie:')"
if [ -n "$SC" ]; then
  printf '  %s\n' "$SC"
  grep -qi 'httponly' <<<"$SC" && pass "HttpOnly" || warn "cookie not HttpOnly"
  grep -qi 'secure'   <<<"$SC" && pass "Secure"   || warn "cookie not Secure"
  grep -qi 'samesite' <<<"$SC" && pass "SameSite" || warn "cookie no SameSite"
else
  info "No Set-Cookie on this endpoint (expected unless it issues one)"
fi

hr "5. CORS reflection check (should NOT reflect arbitrary Origin with credentials)"
AC="$(curl -sS -D - -o /dev/null "$BASE/app/api/today" -H 'Origin: https://evil.example' 2>&1 | grep -iE '^access-control-allow-(origin|credentials):')"
if [ -z "$AC" ]; then pass "No ACAO header reflected to foreign origin"
else printf '  %s\n' "$AC"; grep -qi 'evil.example' <<<"$AC" && warn "Reflects arbitrary Origin!" || info "ACAO present (review value)"; fi

hr "6. CSRF origin guard (state-changing POST with foreign Origin -> expect 403/401)"
C="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/app/api/account/sign-out-everywhere" -H 'Origin: https://evil.example')"
[ "$C" = "403" ] || [ "$C" = "401" ] && pass "POST w/ foreign Origin -> $C" || warn "POST w/ foreign Origin -> $C"

hr "7. Info / recon surface"
for p in /robots.txt /sitemap.xml /.well-known/security.txt /nonexistent-$(date +%s); do
  C="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$p")"
  info "$p -> $C"
done

hr "8. TLS summary"
echo | openssl s_client -connect "${HOST}:443" -servername "${HOST}" 2>/dev/null \
  | openssl x509 -noout -issuer -dates 2>/dev/null | sed 's/^/  /' || warn "openssl probe failed"

hr "9. Staging exposure (staging.$HOST should not serve live data openly)"
C="$(curl -sS -o /dev/null -w '%{http_code}' "https://staging.${HOST}/app/api/today")"
info "staging /app/api/today -> $C (expect 401)"

echo
echo "Done. These are read-only checks. For authenticated IDOR/authz testing use two"
echo "real accounts you own and compare responses; never test against other users' data."
