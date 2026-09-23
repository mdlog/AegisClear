#!/usr/bin/env bash
# Conformance gate for aegisclear-console. Run from the aegisclear-console/ folder.
set -u; fail=0
flag() { echo "GATE FAIL: $1"; fail=1; }
SRC="client/src client/index.html"

# 1. Fonts: only Archivo + Atkinson Hyperlegible Mono (DESIGN_BRIEF §3)
grep -rniE "manrope|space grotesk|dm (sans|mono)|\binter\b|roboto|poppins|plus jakarta|\barial\b" $SRC >/dev/null && flag "banned font named"
grep -rqiE "archivo" $SRC package.json || flag "Archivo not wired"
grep -rqiE "atkinson" $SRC package.json || flag "Atkinson Hyperlegible Mono not wired"

# 2. Palette: the brief's tokens exist, the prototype's rejected cream/coral does not (DESIGN_BRIEF §4)
for t in E6ECE8 F6F8F6 1D5A45 A3126B 15201B; do grep -rqi "#$t" client/src || flag "token #$t missing"; done
grep -rniE "#(f3f0e8|f4f1ea|d55d4a|d97757)\b" client >/dev/null && flag "rejected cream/coral palette present"

# 3. Template chrome and surfaces (DESIGN_BRIEF §5-§6)
grep -rn "text-transform: *uppercase" client/src >/dev/null && flag "uppercase labels"
grep -rnE "box-shadow: *[^n;]*(rgba|px [0-9])" client/src | grep -vi focus >/dev/null && flag "drop shadows"
grep -rnE "translateY\(-[0-9]" client/src >/dev/null && flag "hover lift"

# 4. Platform coupling, telemetry, external hosts, login (README §2.2 #4, #11, #12)
grep -rniE "manus|butterfly-effect|forge|googleapis|google\.maps|oauth|getLoginUrl|rrweb|sendBeacon" client vite.config.ts package.json >/dev/null && flag "platform coupling or telemetry"
grep -nE "host: *true|allowedHosts" vite.config.ts >/dev/null && flag "dev server not loopback-only"
[ -d server ] && flag "Express server still present (use web/server)"

# 5. No invented data: no literal addresses/hashes and no fake progress in UI code (README §2.2 #2)
grep -rnoE "0x[0-9a-fA-F]{8,}" client/src --include=*.tsx --exclude=*.test.tsx >/dev/null && flag "literal hex in UI code (must come from API/fixtures)"
grep -rnE "setInterval" client/src --include=*.tsx | grep -viE "clock|countdown|tick" >/dev/null && flag "setInterval outside a clock (fake progress?)"

# 6. Real API wired (API_CONTRACT E1-E9) and the proxy present (README §2.3)
for f in getConfig getChannels getChannel startRun getRuns getRun subscribeRun leakCheck getOffer; do grep -rq "$f" client/src/lib/api 2>/dev/null || flag "ApiClient.$f missing"; done
grep -q "4040" vite.config.ts || flag "no /api proxy to :4040"
grep -q "build:web" package.json || flag "no build:web script"

exit $fail
