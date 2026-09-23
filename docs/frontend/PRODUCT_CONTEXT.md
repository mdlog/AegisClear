# AegisClear: Product Context for the Frontend

Read this before designing anything. It says what the product is, who looks at this UI, what the UI must prove in the first seconds, which claims are true, and which claims must never appear. Sources: `prd-arsitektur.md` (the spec, Indonesian; § numbers below refer to it), `README.md` and `docs/SUBMISSION.md`.

---

## 1. The product in plain English

AI agents and machines on **Robinhood Chain** (an Arbitrum chain) already pay each other in **USDG** (Paxos' dollar stablecoin) over the **x402** "HTTP 402 Payment Required" rails. They use the scheme `exact`: **pay first, receive later, no recourse.** That is fine for cents. For machine work worth tens to thousands of dollars (a robot fleet buying charging or compute, a B2B agent buying data or inference), the buyer carries all the risk that the seller under-delivers (spec §0, §2).

The emerging standard for fixing this, **ERC-8183**, adds an escrow with an *evaluator* that decides `complete` or `reject`. Its outcome is binary, the evaluator is a trusted party, and the terms are public. Its own text says the evaluator "MAY be a smart contract … verifying a zero-knowledge proof", but nobody had built one.

**AegisClear is that evaluator, and it is a circuit rather than a person or an LLM** (spec §0):

1. **A micro-escrow state channel at the x402 `payTo` address.** The client funds one USDG channel per agent pair. Every unit of service produces a receipt signed by both parties **off-chain**, so there are zero transactions per unit. The chain only sees two commitments: **T** (the terms) and **R** (the receipts root).
2. **Settlement by zero-knowledge proof.** If the seller breached the SLA, the client submits a **Groth16 proof** of "under the committed terms and the co-signed receipts, the lawful refund is X". The contract verifies it (229,241 gas) and splits the money **proportionally**, without ever seeing the price, the thresholds or the metrics.
3. **Payouts to any address:** a fleet treasury, a Safe or a smart account, via `AegisTreasuryRouter`.
4. **Rollover:** one deposit can cover many 128-unit epochs.
5. **Anchored mode:** for high-value, low-frequency jobs, every unit is acked on-chain. The Merkle hashing (7 Poseidon hashes per ack) runs in a **Rust program on Arbitrum Stylus**, measured **1.75× cheaper** than the best Yul implementation.

### The one comparison that explains the product (spec §0, §6.5)

100 requests at 0.02 USDG; 7 of them breach the latency SLA (> 800 ms):

| Payment rail | What the client gets back | What the public chain sees |
|---|---|---|
| x402 `exact` (today) | nothing; 2.00 USDG is gone, no recourse | every transfer |
| ERC-8183 escrow with an evaluator | **0 or 2.00**: binary, depends on trusting the evaluator | the terms and the reason, in plain text |
| **AegisClear** | **0.07 back to the client, 1.93 to the provider**, deterministic | two commitments + the final split |

This is the story the UI tells. The number pair **`0.07 / 1.93`** and the leak-check result **`0 leaks`** are the product's signature: its "wow moment" (SUBMISSION §3, 0:00–0:10).

---

## 2. What this frontend is, and who looks at it

- It is an **operator console** that runs locally at `http://localhost:4040` (new console: `aegisclear-console`, built with `pnpm build:web`; served by the console server), not a public website. The server runs the x402 provider, two client agents **A** and **B**, the Groth16 prover and a chain indexer, all in one process. The browser holds **no keys** and never signs.
- The same screen serves three audiences:

| Audience | Situation | What they need from the UI |
|---|---|---|
| **Presenter / operator** (the builder) | Drives scenarios live on a laptop, or records the ≤ 3-minute demo video at 1920×1080 | Obvious controls, no dead ends, the waits explained, recovery from any state, everything legible on video |
| **Hackathon judges** (Arbitrum Open House Singapore Buildathon; Arbitrum Foundation, Robinhood Chain and Paxos/USDG ecosystem) | Watch the video or a live run; may click Blockscout links; skim for 30 seconds | The novelty legible in seconds: proportional split, private terms, a real proof, real on-chain transactions |
| **Technical reviewers / integrators** (spec §4: fleet operators U1, buying agents U2, provider merchants U3, treasury curators U4, rail integrators U5) | Inspect channels, events, gas, the raw 402 offer, the contract addresses | Precise data, copyable hashes, explorer links, honest caveats |

Judging criteria (verbatim from the HackQuest page; **weights not published**):
- "Smart contract quality"
- "Product-Market Fit"
- "Innovation and Creativity"
- "Real Problem Solving"
- plus extra consideration for USDG, and at least 1 of 3 prizes reserved for Robinhood Chain.

There is **no design criterion**. The UI earns points by making innovation and real problem-solving *visible*, not by decoration (SUBMISSION §7).

---

## 3. What must be visible, and when

1. **Within 5 seconds of landing:** what AegisClear does, the three-rail comparison or the live `0.07 / 1.93` result, and the network it runs on (Robinhood Chain testnet 46630, contracts verified on Blockscout).
2. **During a run:** that 100 units happen with **zero transactions**, that the dispute produces a **real Groth16 proof (~4 s)**, and that the **60-second challenge window** is a real safety mechanism (anyone may answer with a higher co-signed checkpoint, and after the deadline anyone may settle), not a loading spinner.
3. **After a run:** the result row next to Market A's binary outcome, then **private vs public** side by side: the terms only the two parties know vs what the chain actually shows. The leak-check proves the private values appear in **none** of the channel's transactions.
4. **On demand:** every transaction and event with gas, linked to Blockscout; the raw x402 offer with `payTo` explained; the contract registry.

---

## 4. Privacy model: what leaks and what does not (spec §6.7, must be shown honestly)

| Visible on-chain | Hidden |
|---|---|
| Client, provider and payout addresses; the token | Unit price `p`, latency ceiling `L*`, quality floor `Q*`, penalty `π`, cap `κ`, nonce `ν` |
| Deposit `B`, acked total `A`, unit count `seq` | Per-unit quantity, latency, quality, amount due |
| `payToClient` (if a proof was claimed); the time of every transaction | How many units breached, and how |
| `termsCommitment` (T), `receiptsRoot` (R) | Their contents |
| `epoch` and `RolledOver(...)` amounts | the same, per epoch |
| **Anchored mode only:** leaf hash and running `A` per ack, which **implies the unit price** | metrics, thresholds, penalty, cap, nonce; leaf preimages |

Inferences that **remain possible**: `A / seq` ≈ average price, `payToClient / A` = the penalty share, ack timing = service rhythm. AegisClear **does not claim anonymity**. The UI must state this. The existing console shows the anchored caveat; keep it: "anchored: leaf hashes and A per ack are visible on-chain (unit price implied); metrics and thresholds stay private."

---

## 5. Claims the UI must never make (SUBMISSION §3, "Jangan diklaim")

| Never say | Why | Say instead |
|---|---|---|
| "ZK / Groth16 is cheaper on Stylus" | False: the verifier stays in Solidity (pairing is a precompile; a Stylus verifier costs more) | "Stylus is used only for anchored-mode Poseidon hashing: 1.75× cheaper than Yul, measured on-chain" |
| "2.33×" | A retracted figure (not circuit-compatible) | "1.75× (≈ 1.9× execution-only)" |
| "anonymous", "nothing leaks" | See §4 | "Terms and metrics stay private; amounts and timing are public" |
| "audited" | Self-audit only (Slither + manual review) | "Self-audited (Slither triage, 0 true High/Medium)" |
| "live on mainnet", "real USDG" | Testnet 46630 uses **MockUSDG**; mainnet 4663 is not deployed | "Robinhood Chain testnet · MockUSDG (USDG-native design)" |
| "integrated with Mesh facilitator" | Not tested (V8 open) | "x402-compatible offer: facilitators need no change (untested with Mesh)" |
| "fully trustless" | Acks need cooperation during service; the trusted setup has a single contributor | "Deterministic settlement; loss bounded on-chain by payToClient ≤ A" |
| any gas figure not in README/spec/fixtures | Numbers must be measured | Use only figures from `API_CONTRACT.md` §6 / fixtures |

### Honest limitations to surface (a compact "Known limits" panel or footer; SUBMISSION §4.9)
- Trusted setup: single contributor, so a public ceremony is required before real funds. Loss is bounded by `payToClient ≤ A`.
- MockUSDG on testnet; mainnet 4663 is not deployed yet.
- Self-audit only.
- Facilitator (Mesh) funding path untested.
- The Stylus program needs a manual keepalive (365-day expiry). Funds are always recoverable through the pure-EVM close paths.

---

## 6. Numbers you may use (all measured; cite as given)

| Fact | Value | Source |
|---|---|---|
| Groth16 verifier gas | 229,241 | `contracts/test/Verifier.t.sol` (spec §8.2) |
| Circuit size / proving time | 115,066 constraints / ≈ 3.2–4.7 s | `docs/TOOLCHAIN.md`, fixtures |
| Anchored `insertPath` (7 hashes) | 144,076 gas Stylus vs 252,271 Yul → 1.75× | `docs/benchmarks/poseidon.md` |
| Testnet v2 deploy | block 122,028,843, 7/7 contracts verified on Blockscout | README |
| Full-cycle gas, testnet (dispute / anchored / rollover / cooperative) | 575,544 / 4,799,914 / 298,821 / 182,452 | README (console run, 20 Sep 2026) |
| Epoch size | 128 units (`MAX_SEQ`) | spec §6.6 |
| Demo challenge window | 60 s testnet (factory `MIN_CHALLENGE_WINDOW`), production factory 6 h | README |
| MeshGateway (why now) | 1,030 storefronts, 15,718 settlements, 512.48 USDG lifetime, avg 0.033 USDG | spec §2.3 (read 19 Sep 2026) |

---

## 7. Glossary (use these words consistently in the UI)

| Term | Meaning | UI wording |
|---|---|---|
| Channel | One escrow contract per client–provider pair (EIP-1167 clone, CREATE2 address) | "channel" |
| Market A | The control: an ERC-8183-style binary escrow (`SimpleJobEscrow`) | "Binary escrow (control)" |
| Market B | AegisClear | "AegisClear" |
| Unit | One served request (e.g. one inference call) | "unit" |
| Receipt / checkpoint | Signed record of a unit / cumulative state signed by both parties | "receipt", "co-signed checkpoint" |
| Ack | The client acknowledging a unit (off-chain co-signed, or on-chain in anchored mode) | "ack" |
| T / termsCommitment | Poseidon commitment of the private terms | "Terms commitment (T)" |
| R / receiptsRoot | Poseidon Merkle root of receipts | "Receipts root (R)" |
| A / cumulativeAmount | Total acked amount owed for the epoch | "Acked total (A)" |
| payToClient | Refund proven by the Groth16 proof | "Proven refund" |
| Challenge window | Time after a close/checkpoint during which a higher co-signed state can still win; after it, settle is permissionless | "Challenge window" |
| Watcher | The provider's bot that answers stale checkpoints and settles/sweeps channels | "provider watcher" |
| Epoch / rollover | A 128-unit segment / closing one epoch and carrying the remainder into the next | "epoch", "rollover" |
| Anchored mode | Every ack is an on-chain transaction hashed by the Stylus Poseidon program | "Anchored (on-chain acks)" |
| Co-signed mode | Acks are off-chain signatures; zero txs per unit | "Co-signed (off-chain acks)" |
| Leak-check | Scan of every channel tx's calldata and logs for the private values | "Leak check" |
| x402 offer / 402 | The `402 Payment Required` JSON the provider returns | "x402 offer" |
| Clients A / B | The two demo buyer agents (server-held keys) | "Client A", "Client B" |
| MockUSDG | 6-decimal test stand-in for USDG on testnet | "MockUSDG" (never just "USDG" next to testnet balances) |

---

## 8. Feature inventory: parity with the current console (all must survive)

The new frontend lives in `aegisclear-console/` and replaces, as the demo UI, the current console in `web/src/**` (kept untouched as the fallback: `App.tsx`, `components/Header.tsx`, `ChannelsTable.tsx`, `ChannelDrawer.tsx`, `DemoPanel.tsx`, `PrivacyCards.tsx`, `OfferView.tsx`). Every item below exists today and must still exist, improved:

| # | Feature | Today (file) | Data |
|---|---|---|---|
| F1 | Network and deployment header: network, chain id, every contract address with explorer link, provider, clients A/B | `Header.tsx` | E1 |
| F2 | "Server not running" state with the start command | `Header.tsx:19` | E1 failure |
| F3 | Channel registry across all factories: channel, client, mode, state, seq, epoch, A, budget, CLOSING countdown, proof, `run` tag, factory tag; auto-refresh | `ChannelsTable.tsx` | E2 |
| F4 | Channel detail: state, mode, seq, epoch, A, budget, T, R, client→payoutClient, provider→payoutProvider, windows, proof, opened tx/block/factory, **on-chain event trail with gas and args** | `ChannelDrawer.tsx` | E3 |
| F5 | Scenario runner: 6 scenarios + run-all, disabled while a run is active; start errors surfaced | `DemoPanel.tsx` | E4 |
| F6 | Live step log over SSE: elapsed time, phase, label, detail, tx link + gas, progress | `DemoPanel.tsx:81-95` | E6, E7 |
| F7 | Resume the latest run on page load (re-attach if still running) | `DemoPanel.tsx:31-37` | E5, E6, E7 |
| F8 | Result table: market, client/provider split, decided by, readable on explorer, full-cycle gas, proving ms, tx links | `DemoPanel.tsx:97-110` | run `result` |
| F9 | Leak check (after a finished run with channels): leaks, ambiguous, tx count, tx links per channel | `DemoPanel.tsx:61-70`, `PrivacyCards.tsx:55-60` | E8 |
| F10 | Private vs chain-visible comparison: private terms and breaching units vs T, R, A, payToClient per channel; the anchored caveat | `PrivacyCards.tsx` | E1 + E3 |
| F11 | Raw x402 offer for client A/B with an explanation of `payTo` and `extra.aegis` | `OfferView.tsx` | E9 |

Improvements the rewrite should add (all derived from existing data, no new endpoints):
- Settlement figures from the `Settled` event (`toProvider`, `toClient`, `penalty`) in the channel detail and privacy view.
- A per-channel lifecycle timeline built from events: `Opened → (Acked…) → CheckpointSubmitted/CloseStarted → PenaltyClaimed → Settled`, or `RolledOver`.
- Filters on the registry (state, mode, factory, "from this session").
- Deep links for every entity (channel, run) that survive a reload.
- An honest "known limits" surface (§5).
