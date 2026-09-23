#!/usr/bin/env bash
# The final checks, in one place. Exit non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")"
MP4=out/aegisclear-demo.mp4
echo "1. streams + duration"
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate:format=duration -of csv=p=0 "$MP4"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MP4")
python3 -c "import sys; d=float('$dur'); print(f'   {d:.1f}s'); sys.exit(0 if d <= 180 else 1)"
echo "2. caption cue counts (ass == srt)"
python3 - <<'PY'
import sys
a = open("out/captions.ass").read().count(",Cap,")
b = open("out/aegisclear-demo.srt").read().count("-->")
print(f"   ass={a} srt={b}"); sys.exit(0 if a == b and a > 0 else 1)
PY
echo "3. narrated numbers match the take"
python3 - <<'PY'
import json, subprocess, sys
t = json.load(open("out/take.json"))
n = {x["id"]: x["text"] for x in json.loads(subprocess.check_output(["node", "--experimental-strip-types", "script.ts", "--narration"], text=True, stderr=subprocess.DEVNULL))}
client, provider = [s.strip() for s in t["dispute"]["split"].split("/")]
checks = [
    ("01-three-rails", f"sends {client} back and {provider} to the provider"),
    ("08-anchored-stylus", f"{t['anchored']['acks']} acks and {t['anchored']['split'].split('/')[0].strip()} back"),
    ("09-rollover", f"holds {t['rollover']['epochUnits']} receipts"),
    ("09-rollover", f"one deposit, {t['rollover']['units']} units"),
]
bad = [(i, s) for i, s in checks if s not in n[i]]
print("   ", "ok" if not bad else f"MISMATCH {bad}", "-", t["dispute"]["split"], t["anchored"]["split"], t["rollover"]["split"]); sys.exit(1 if bad else 0)
PY
echo "4. the live run is on record"
python3 - <<'PY'
import json, sys
live = json.load(open("out/live.json"))
ok = all(live.get(k) for k in ("id", "channel", "claimPenalty"))
print("   ", live); sys.exit(0 if ok else 1)
PY
echo "5. nothing large staged"
git -C .. status --short | grep -E "\.(mp4|webm|mp3|png)$" | grep -v "^?? docs/media/" && { echo "   media staged!"; exit 1; } || echo "   ok"
echo "all checks passed"
