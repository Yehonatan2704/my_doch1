#!/usr/bin/env bash
# S4 smoke test against the deployed app. Usage: scripts/smoke.sh [WEB_URL] [API_URL]
# Read-only: no login, no writes. Exit code 0 = all checks passed.
set -uo pipefail

WEB="${1:-https://doch1-web.onrender.com}"
API="${2:-https://doch1-api.onrender.com/api/v1}"
fails=0

check() { # name, condition-result
  if [ "$2" = "ok" ]; then echo "  ✓ $1"; else echo "  ✗ $1 — $2"; fails=$((fails + 1)); fi
}
hdr() { curl -s -D - -o /dev/null -m 30 "$@" | tr -d '\r'; }

echo "API $API"
# Free-plan services sleep; the first request can take ~1 min.
health=$(curl -s -m 120 "$API/health")
check "health" "$([ "$health" = '{"ok":true}' ] && echo ok || echo "got: $health")"
me=$(curl -s -m 30 -w ' %{http_code}' "$API/me")
check "/me without login → 401 UNAUTHORIZED" "$([[ "$me" == *'"code":"UNAUTHORIZED"'*' 401' ]] && echo ok || echo "got: $me")"
nf=$(curl -s -m 30 -w ' %{http_code}' "$API/definitely-not-a-route")
check "unknown route → contract error, no stack" "$([[ "$nf" == *'"error":{"code":'* && "$nf" != *stack* ]] && echo ok || echo "got: $nf")"
h=$(hdr "$API/health")
for name in strict-transport-security x-content-type-options; do
  check "API header $name" "$(grep -qi "^$name:" <<<"$h" && echo ok || echo missing)"
done
cors=$(hdr -X OPTIONS -H "Origin: $WEB" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' "$API/me")
check "CORS allows the web app" "$(grep -qi "^access-control-allow-origin: $WEB" <<<"$cors" && echo ok || echo 'no allow-origin')"
evil=$(hdr -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' "$API/me")
check "CORS rejects other origins" "$(grep -qi '^access-control-allow-origin' <<<"$evil" && echo 'allowed!' || echo ok)"

echo "WEB $WEB"
for path in / /login /history; do
  code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$WEB$path")
  check "GET $path → 200 (SPA rewrite)" "$([ "$code" = 200 ] && echo ok || echo "HTTP $code")"
done
h=$(hdr "$WEB/")
for name in x-frame-options x-content-type-options referrer-policy strict-transport-security; do
  check "web header $name" "$(grep -qi "^$name:" <<<"$h" && echo ok || echo missing)"
done
# Expo splits the app into several bundles (runtime, common, entry) — check them all.
bundles=$(curl -s -m 30 "$WEB/" | grep -oE '/_expo/static/js/web/[^"]+\.js' | sort -u)
check "JS bundles referenced" "$([ -n "$bundles" ] && echo ok || echo 'none in index.html')"
if [ -n "$bundles" ]; then
  js=$(for b in $bundles; do curl -s -m 60 "$WEB$b"; done)
  api_host=$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"$API")
  check "bundle points at $api_host" "$(grep -q "$api_host" <<<"$js" && echo ok || echo 'API URL not baked in')"
  check "bundle has no server secrets" "$(grep -qE 'SERVICE_ROLE|JWT_SECRET|postgres(ql)?://' <<<"$js" && echo 'FOUND' || echo ok)"
fi

echo
[ "$fails" -eq 0 ] && echo "SMOKE OK" || echo "SMOKE FAILED: $fails check(s)"
exit "$fails"
