# Fixtures: real responses recorded from the AegisClear console

Everything in this folder was **recorded from the real server on 23 Sep 2026**. Nothing is hand-written. Use these files to build, test and demo the UI without a chain. The contract that explains every field is [`../API_CONTRACT.md`](../API_CONTRACT.md).

## Envelope format

Every `.json` file is wrapped as:

```json
{ "httpStatus": 200, "body": { "...": "the exact response body" } }
```

`body` is the exact response the endpoint returned. `*.sse.txt` files are the raw `text/event-stream` bytes, and `runs/*.start.json` is `{ "scenario", "response" }` for the `POST /api/demo/run` call.

## `testnet-46630/`: Robinhood Chain testnet, deploy v2 (read-only capture)

These are the network, addresses and channels the live demo uses. Explorer links built from them work: `https://explorer.testnet.chain.robinhood.com/{address|tx}/…`.

| File | Endpoint | What's inside |
|---|---|---|
| `config.json` | `GET /api/config` | Network `testnet`, chain 46630, all 8 contract addresses, provider and clients A/B, windows 60/30 s, private terms, breaches, deposit |
| `channels.json` | `GET /api/channels` | 16 real channels: 14 SETTLED, 2 OPEN (unfunded leftovers). 10 from `factory`, 6 from `factoryAnchored`. Includes epoch-1 rollover channels and proofs. |
| `channels/B-dispute.0x4B6F….json` | `GET /api/channels/:addr` | The **hero channel**: `Opened → CheckpointSubmitted → PenaltyClaimed → Settled` (payToClient 70000, toProvider 1930000, toClient 3070000) with real gas |
| `channels/B-anchored-dispute.0xAD30….json` | same | 20 × `Acked` (Stylus Poseidon; gas 349,751 then ~201–210k) → `CloseStarted` → `PenaltyClaimed` → `Settled` |
| `channels/B-rollover.0xD1F6….json` | same | `Opened → RolledOver (newEpoch 1, toProvider 2560000) → Settled` (epoch 1, seq 5) |
| `channels/B-cooperative.0x66C4….json` | same | `Opened → Settled (cooperative, toProvider 2000000)`. Note `cumulativeAmount` is `"0"` on-chain here, so read money from `Settled` (API_CONTRACT §4.1). |
| `channels/open-unfunded.0x9AA0….json` | same | An `OPEN` channel with only `Opened`. Use it for the "open, no activity" state. |
| `offer-A.json`, `offer-B.json` | `GET /api/offer?client=A\|B` | Real x402 402 challenges (`network eip155:46630`, MockUSDG, predicted `payTo`, `extra.aegis`) |

Runs, SSE and leak-checks were **not** recorded on testnet. Running scenarios there spends testnet gas and adds channels to the judges' view. For those, use the local recordings below: the result rows are identical on both networks (the penalty function is deterministic), and only gas and timing differ (see API_CONTRACT §5.5 and §6).

## `local-31337/`: private local chain, every scenario run end-to-end

This was captured with a second console instance (port 4044) against the private dev chain. `network: "local"`, so there is **no `explorerBase`** (render hashes as copyable text) and the challenge window is a single time-travel step.

| File | What's inside |
|---|---|
| `config.json` | Local config (no `factoryProd`, windows 120/60 s) |
| `offer-A.json`, `offer-B.json` | x402 challenges on chain 31337 |
| `runs-list.empty.json` | `GET /api/demo/runs` on a fresh server → `[]` |
| `runs-list.while-running.json` | The list while a run is `running` (steps stripped) |
| `runs-list.json` | The list after all 7 runs (newest first, steps stripped) |
| `runs/<scenario>.start.json` | `POST /api/demo/run` → `202 {runId}` |
| `runs/<scenario>.snapshot.json` | `GET /api/demo/runs/:id` after completion: **every step with `i`, `t`, phase, label, tx, gas, progress, plus `result` rows** |
| `sse/<scenario>.sse.txt` | The raw SSE stream for that run (`event: step` … `event: done`, `id: end`) |
| `leak-check/<scenario>.json` | `GET /api/demo/leak-check/:runId`. `A-complete`/`A-reject` are the **404** case. |
| `channels/<scenario>.<address>.json` | `GET /api/channels/:addr` for each channel a run created |
| `channels.json` | `GET /api/channels` with **129 channels** (10 OPEN, 119 SETTLED) accumulated on the dev chain. Use it for density, sorting and pagination tests. |
| `errors/*.json` | Real error bodies: `run-busy.409`, `run-unknown-scenario.400`, `run-unknown-id.404`, `channel-unknown.404`, `offer-bad-client.400`, `api-not-found.404` |

### Recorded runs at a glance

| Scenario | Steps | Duration | Result row (client / provider) | Full-cycle gas (local) | Proving | Leak-check |
|---|---|---|---|---|---|---|
| `B-dispute` | 21 | 7.3 s | `0.07 / 1.93` | 545,726 | 4,682 ms | 0 leaks, 5 tx |
| `B-anchored-dispute` | 33 | 65.1 s | `0.02 / 0.38` | 6,766,629 (Yul; Stylus on testnet: 4,799,914) | 3,436 ms | 0 leaks, 25 tx |
| `B-rollover` | 16 | 3.3 s | `0.00 / 2.66` | 267,485 | n/a | 0 leaks, 4 tx |
| `B-cooperative` | 16 | 2.4 s | `0.00 / 2.00` | 163,025 | n/a | 0 leaks, 3 tx |
| `A-complete` | 6 | 0.15 s | `0 / 2.00` | 330,854 | n/a | 404 (no channel) |
| `A-reject` | 6 | 0.12 s | `2.00 / 0` | 330,781 | n/a | 404 (no channel) |
| `all` | 49 | 20.5 s | 4 rows (A-complete, A-reject, B-cooperative, B-dispute) | n/a | 3,184 ms | 0 leaks, 3 + 5 tx |

## Not captured (shape documented from code only)

These cases exist in the code but could not be triggered on demand. Their exact shape is in API_CONTRACT and the cited source lines.

- `409 {"error":"client-has-open-channel","channel":"0x…"}` (`web/server/demo.ts:13,72`).
- `502 {"error":"preflight-failed","message":"…"}` (`web/server/demo.ts:70,80`).
- SSE `error` terminal event (`status: "error"`, `error: "<message>"`).
- Testnet `wait` steps: `menunggu jendela tantangan: <left> s tersisa`, every 10 s with `progress` (`web/server/chain.ts:41-45`).
- Settle alternatives: `sudah di-settle oleh watcher provider…` / `settle() klien kalah balapan…` (`demo/src/scenarios.ts:114,122`).
- Faucet step `faucet: mint 50 USDG ke klien A|B` (only when a client's MockUSDG balance is low).
- Channel events `Funded` and `Swept` exist in the ABI but never appeared, because funding is a plain ERC-20 transfer. Handle them generically.

## Privacy note

These files contain only public testnet data and well-known local dev-chain addresses. No private keys. The signatures in `offer-*.json` are the provider's testnet signatures over channel configs that were never opened.
