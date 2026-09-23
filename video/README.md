# Demo video pipeline

Produces `out/aegisclear-demo.mp4` (+ `.srt`) from the live console on `localhost:4040`, talking to
Robinhood Chain testnet 46630. The narration is the clock: every on-screen action is anchored to a
phrase in the TTS word timings, and each clip is held as long as its narration. Adapted from the
pipeline in `Dorahacks/somnia/video/`.

## One-time setup

    npm --prefix video install
    python3 -m venv video/.venv && video/.venv/bin/pip install edge-tts

## Re-shoot, start to finish (≈ 20 min, 4 testnet runs)

    pnpm -C aegisclear-console build:web                         # the console the video films
    AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve    # keep it running (another terminal)
    node --experimental-strip-types video/select.ts         # 3 runs off-camera → out/take.json (aborts if not filmable)
    video/.venv/bin/python video/tts.py                     # → out/audio/*.mp3 + index.json
    node --experimental-strip-types video/record.ts --probe # every selector resolves? (starts no run)
    node --experimental-strip-types video/record.ts         # → out/clips/*.webm; beat 3 starts the live run
    video/.venv/bin/python video/captions.py                # → out/captions.ass + .srt + timeline.json
    video/.venv/bin/python video/build.py                   # → out/aegisclear-demo.mp4 + contact.png
    bash video/verify.sh

Tests: `node --experimental-strip-types --test video/test/*.test.ts` and
`python3 -m unittest discover -s video/test -p "test_*.py"`.

## How the shots are made

- `select.ts` runs B-dispute, anchored and rollover through the console API before anything is
  filmed, checks every number the voice will say (splits, 7 breaches, the 800 ms ceiling, the 60 s
  window, the 5-token deposit, 20 acks, 133 units), and writes them to `out/take.json`.
- Beat 3 clicks **Run dispute** on camera. Beats 4 and 5 film the same run after off-camera waits for
  its proof and its settlement; the recorder refuses to film the verdict if that run's split differs
  from the one the narration says. These are jump-cuts of one real run, not a replay.
- The Blockscout shots are screenshots of the real explorer pages, for the live run's
  `claimPenalty` transaction and the Stylus `AegisPoseidon` program, captured off-camera just before
  the beat that shows them.
- The viewport is 1536 × 864 CSS px at a device scale of 1.25, which is the runbook's 125 % zoom,
  filmed at 1920 × 1080. The theme is light, the design's primary theme.

## What to look at before sending it

- `out/contact.png`: one frame every 5 s. It must show no "Fixture replay" badge, no server-down
  page, and no empty table where the narration says there are rows.
- `out/aegisclear-demo.srt`: read it once; it is exactly what the voice says.
- `bash video/verify.sh`: checks the duration (≤ 3:00), the streams, the cue counts, the narrated
  numbers against the take, the live run on record (`out/live.json`), and that no media is staged.
