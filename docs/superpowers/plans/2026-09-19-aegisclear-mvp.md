# AegisClear MVP (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun P0 AegisClear — escrow channel USDG per pasangan agen di Robinhood Chain yang penyelesaian sengketanya diadili bukti Groth16 (`sla_settlement.circom`), lengkap dengan SDK ack/prove, integrasi x402 `payTo`, demo A-vs-B, dan gerbang benchmark Poseidon (D2).

**Architecture:** Tiga implementasi satu semantik (§6 spec): `tools/settlement_vectors.py` (referensi) → `sdk/src/core/settlement.ts` (SDK) → `circuits/sla_settlement.circom` (bukti) → `contracts/src/AegisChannel.sol` (pembayaran, hanya memakai `payToClient` dari bukti). Channel = EIP-1167 clone per pasangan (alamat = atribusi, CREATE2 dari hash `Config`), verifier Groth16 di Solidity (ekspor snarkjs), Stylus hanya untuk benchmark Poseidon (gerbang D2, hasilnya menentukan Plan 2/P1).

**Tech Stack:** Foundry 1.5.x (solc 0.8.28), OpenZeppelin Contracts v5.7.0, Permit2 (interface), circom 2.2.3 + circomlib 2.0.5 + snarkjs 0.7.6 + circomlibjs 0.1.7, Node 22 + pnpm 9 + TypeScript 5.9 + vitest 5 + tsx, viem 2.56, Hono 4.13, Python 3.12, cargo-stylus 0.10.9 + `openzeppelin-crypto` 0.3.0 (hanya Task 18).

**Spec:** `AegisClear/prd-arsitektur.md` (v1.0, 19 Sep 2026). Nomor bagian/FR/INV/T/D/V di plan ini merujuk ke dokumen itu.

**Scope plan ini:** P0 seluruhnya (§1 "Di dalam scope") + gerbang D2. **Tidak** termasuk implementasi P1 (anchored mode + `AegisPoseidon.rs`, `AegisTreasuryRouter`, `rollover`) — itu Plan 2, ditulis setelah hasil Task 18 diketahui, sesuai urutan pemangkasan §16.

## Global Constraints

- Chain target: Robinhood Chain testnet `46630` (RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com`) dan mainnet `4663` (RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`); dev lokal Anvil chain id `31337`.
- Token: USDG **6 desimal**; mainnet `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; testnet memakai `MockUSDG` (FR-22). Jangan pernah asumsikan 18 desimal.
- Alamat kanonik (ada di 4663 **dan** 46630): Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`; `x402ExactPermit2Proxy` `0x402085c248EeA27D92E8b30b2C58ed07f9E20001`; Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`.
- Hash: circomlib **Poseidon v1** (D3) di sirkuit, SDK (`circomlibjs`), dan Yul (`poseidon-solidity`). Leaf `Poseidon(seq, qty, m1, m2, due)` (t=6), node `Poseidon(kiri, kanan)` (t=3), terms `Poseidon(unitPrice, maxM1, minM2, penaltyBps, capBps, nonce)` (t=7). `EMPTY_LEAF = 0`. `MAX_SEQ = 128`, `DEPTH = 7`.
- Field: BN254 scalar `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.
- Input publik sirkuit, urutan tetap: `[channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]`; `channelIdField = uint256(uint160(alamat channel))`.
- EIP-712: domain `name = "AegisClear"`, `version = "1"`, `chainId`, `verifyingContract = alamat channel`. Tipe: `ChannelTerms(address client,address provider,address token,bytes32 termsCommitment,uint32 challengeWindow,uint32 responseWindow,address payoutClient,address payoutProvider,bytes32 salt)`, `Checkpoint(uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)`, `Close(uint64 seq,uint128 toProvider)`.
- Kontrak: tidak ada owner/pause/proxy/upgrade di jalur dana (§7 prinsip 6). Semua tanda tangan lewat `SignatureChecker.isValidSignatureNow` (EOA + ERC-1271, FR-5). `payToClient ≤ cumulativeAmount` dipaksakan di kontrak (FR-18).
- Angka contoh wajib: EX1 (100 unit @ 20.000, 7 pelanggaran latensi, π=5000, κ=3000) → `payToClient = 70.000`, `payToProvider = 1.930.000`; EX2 (80 pelanggaran) → `600.000 / 1.400.000`; EX3 → `100.000 / 1.900.000`.
- Git: commit message polos, **tanpa** trailer atribusi AI apa pun (aturan global pengguna). Satu commit per task minimal.
- Semua perintah dijalankan dari root repo `AegisClear/` kecuali disebutkan (`contracts/` untuk forge).

---

## File Structure

```
AegisClear/
├── prd-arsitektur.md                     spec (ada)
├── tools/settlement_vectors.py           referensi penyelesaian (ada; dimodifikasi Task 2)
├── vectors/*.json                        vektor uji bernama (Task 2)
├── package.json  pnpm-workspace.yaml  tsconfig.base.json  .gitignore
├── sdk/                                  @aegisclear/sdk
│   ├── package.json  tsconfig.json  vitest.config.ts  src/types.d.ts
│   ├── src/core/poseidon.ts              wrapper circomlibjs (satu instance)
│   ├── src/core/terms.ts                 Terms, commitTerms, randomNonce
│   ├── src/core/receipts.ts              Receipt, leafHash, merkleRoot, ReceiptTree
│   ├── src/core/settlement.ts            settle() — port 1:1 Python
│   ├── src/core/vectors.ts               loadVector()
│   ├── src/core/circuitInput.ts          buildCircuitInput(), publicSignals()
│   ├── src/core/typedData.ts             EIP-712 types/domain/sign/verify (Task 13)
│   ├── src/core/prover.ts                prove(), toCalldata(), verify() (Task 13)
│   ├── src/chain/abi.ts                  ABI factory/channel/usdg (Task 13)
│   ├── src/chain/predict.ts              predictChannel() (Task 13)
│   ├── src/provider/server.ts            middleware Hono (Task 14)
│   ├── src/client/agent.ts               klien agen (Task 14)
│   ├── src/watcher/watcher.ts            settle/sweep bot (Task 15)
│   └── test/*.test.ts
├── circuits/                             @aegisclear/circuits
│   ├── package.json
│   ├── sla_settlement.circom
│   ├── scripts/build.sh  scripts/setup.sh  scripts/prove.ts
│   ├── test/sla_settlement.test.ts
│   └── build/                            gitignored kecuali verification_key.json
├── contracts/                            Foundry
│   ├── foundry.toml  remappings.txt  lib/
│   ├── src/AegisChannel.sol  src/AegisChannelFactory.sol  src/SLASettlementVerifier.sol (generated)
│   ├── src/MockUSDG.sol  src/SimpleJobEscrow.sol  src/interfaces/ISLASettlementVerifier.sol
│   ├── test/utils/Sigs.sol  test/mocks/MockVerifier.sol  test/mocks/Mock1271Wallet.sol
│   ├── test/Base.t.sol  Verifier.t.sol  Factory.t.sol  Checkpoint.t.sol  Cooperative.t.sol
│   │   Penalty.t.sol  Permit2.t.sol  Wallet1271.t.sol  Invariant.t.sol  PoseidonBench.t.sol
│   ├── test/fixtures/ex1_verifier.json  permit2.bytecode  x402proxy.bytecode
│   ├── script/DeployLocal.s.sol  script/DeployTestnet.s.sol
│   └── deployments/local.json  deployments/testnet-46630.json
├── demo/                                 @aegisclear/demo: run.ts, leak-check.ts, out/
├── stylus/poseidon-bench/                Task 18 (cargo stylus)
└── docs/benchmarks/poseidon.md           hasil gerbang D2
```

---

### Task 1: Repo, toolchain, workspace (V9)

**Files:**
- Create: `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `docs/TOOLCHAIN.md`

**Interfaces:**
- Produces: workspace pnpm dengan paket `sdk`, `circuits`, `demo`; binari `circom` 2.2.3 di PATH; `snarkjs` sebagai dependency workspace.

- [ ] **Step 1: Inisialisasi git dan `.gitignore`**

```bash
cd /home/mdlog/Project-MDlabs/Hackquest/arbitrum-sg/AegisClear
git init -b main
cat > .gitignore <<'EOF'
node_modules/
dist/
.env
.env.*
circuits/build/*
!circuits/build/verification_key.json
circuits/ptau/
contracts/out/
contracts/cache/
contracts/broadcast/
demo/out/
stylus/**/target/
vectors/RAND_*.json
*.log
EOF
git add prd-arsitektur.md tools/settlement_vectors.py .gitignore docs/
git commit -m "docs: AegisClear PRD v1.0, settlement reference script, implementation plan"
```

- [ ] **Step 2: Instal circom 2.2.3 (binari resmi)**

```bash
mkdir -p ~/.local/bin
curl -L -o ~/.local/bin/circom https://github.com/iden3/circom/releases/download/v2.2.3/circom-linux-amd64
chmod +x ~/.local/bin/circom
export PATH="$HOME/.local/bin:$PATH"   # tambahkan juga ke ~/.bashrc
circom --version
```
Expected: `circom compiler 2.2.3`

- [ ] **Step 3: Workspace pnpm**

```bash
cat > package.json <<'EOF'
{
  "name": "aegisclear",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "test:sdk": "pnpm --filter @aegisclear/sdk test",
    "test:circuits": "pnpm --filter @aegisclear/circuits test",
    "test:contracts": "cd contracts && forge test -vv",
    "test": "pnpm test:sdk && pnpm test:circuits && pnpm test:contracts"
  }
}
EOF
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - sdk
  - circuits
  - demo
EOF
cat > tsconfig.base.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
EOF
mkdir -p sdk circuits demo
pnpm add -w -D tsx@^4.23.13 typescript@^5.9.3   # di root agar `npx tsx` bekerja dari contracts/ (vm.ffi, Task 10)
```

- [ ] **Step 4: Catat versi toolchain (V9) dan commit**

```bash
cat > docs/TOOLCHAIN.md <<EOF
# Toolchain (diverifikasi $(date -I))
- forge/cast/anvil: $(forge --version | head -1)
- node: $(node --version), pnpm: $(pnpm --version)
- circom: $(circom --version)
- python3: $(python3 --version)
- cargo: $(cargo --version), cargo-stylus: $(cargo stylus --version | head -1)
- rustup targets: $(rustup target list --installed | tr '\n' ' ')
EOF
git add package.json pnpm-workspace.yaml tsconfig.base.json docs/TOOLCHAIN.md
git commit -m "chore: pnpm workspace, base tsconfig, toolchain record"
```

---

### Task 2: Vektor uji bernama (JSON) dari skrip referensi

**Files:**
- Modify: `tools/settlement_vectors.py` (fungsi `main`)
- Create: `vectors/EX1_7_latency_breaches.json`, `vectors/EX2_cap_binds_80_breaches.json`, `vectors/EX3_qty5_2_quality_breaches.json`, `vectors/EDGE_*.json`

**Interfaces:**
- Produces: format JSON vektor `{ terms: {unitPrice,maxM1,minM2,penaltyBps,capBps,nonce}, receipts: [{seq,qty,m1,m2,due}], seq, cumulativeAmount, breaches, penRaw, cap, payToClient, payToProvider }` — semua angka integer JSON. Dipakai Task 3, 4, 5, 10, 14.

- [ ] **Step 1: Tambah flag `--no-random` agar vektor acak tidak ikut ditulis ke repo**

Ganti fungsi `main()` di `tools/settlement_vectors.py` dengan:

```python
def main():
    args = sys.argv[1:]
    write_random = "--no-random" not in args
    out = {}
    for name, (rs, t) in VECTORS.items():
        cum, nb, pen, cap, pc, pp = settle(rs, t)
        out[name] = {"terms": t, "receipts": rs, "seq": len(rs), "cumulativeAmount": cum,
                     "breaches": nb, "penRaw": pen, "cap": cap, "payToClient": pc, "payToProvider": pp}
        print(f"{name:32s} seq={len(rs):3d} A={cum:9d} breaches={nb:3d} penRaw={pen:8d} cap={cap:8d} -> client={pc:8d} provider={pp:9d}")
    rng = random.Random(8004)
    for k in range(200):
        n = rng.randint(0, MAX_SEQ); p = rng.randint(1, 10**6)
        t = {"unitPrice": p, "maxM1": rng.randint(0, 5000), "minM2": rng.randint(0, 100),
             "penaltyBps": rng.randint(0, BPS), "capBps": rng.randint(0, BPS), "nonce": rng.getrandbits(253)}
        rs = [{"seq": i, "qty": rng.randint(0, 50), "m1": rng.randint(0, 6000), "m2": rng.randint(0, 100)} for i in range(n)]
        for r in rs: r["due"] = r["qty"] * p
        cum, nb, pen, cap, pc, pp = settle(rs, t)
        assert pc <= cap and pc <= pen and pc + pp == cum and pp >= min(cum - cap, cum)
        if write_random:
            out[f"RAND_{k:03d}"] = {"terms": t, "receipts": rs, "seq": n, "cumulativeAmount": cum,
                                    "breaches": nb, "penRaw": pen, "cap": cap, "payToClient": pc, "payToProvider": pp}
    print("200 vektor acak lulus INV-4/INV-5/INV-10")
    if "--json" in args:
        d = args[args.index("--json") + 1]
        os.makedirs(d, exist_ok=True)
        for name, v in out.items():
            with open(os.path.join(d, f"{name}.json"), "w") as f:
                json.dump(v, f)
        print(f"{len(out)} vektor ditulis ke {d}/")
```

- [ ] **Step 2: Hasilkan vektor dan periksa angka wajib**

```bash
python3 tools/settlement_vectors.py --json vectors --no-random
python3 -c "import json; v=json.load(open('vectors/EX1_7_latency_breaches.json')); assert (v['payToClient'],v['payToProvider'])==(70000,1930000); print('EX1 ok')"
python3 -c "import json; v=json.load(open('vectors/EX2_cap_binds_80_breaches.json')); assert (v['payToClient'],v['payToProvider'])==(600000,1400000); print('EX2 ok')"
ls vectors | wc -l
```
Expected: `EX1 ok`, `EX2 ok`, `8` file.

- [ ] **Step 3: Commit**

```bash
git add tools/settlement_vectors.py vectors/
git commit -m "test: named settlement vectors (EX1-EX3 + edge cases) from reference script"
```

---
### Task 3: SDK core — Poseidon, terms, receipts, settlement (diferensial vs Python)

**Files:**
- Create: `sdk/package.json`, `sdk/tsconfig.json`, `sdk/vitest.config.ts`, `sdk/src/types.d.ts`
- Create: `sdk/src/core/poseidon.ts`, `sdk/src/core/terms.ts`, `sdk/src/core/receipts.ts`, `sdk/src/core/settlement.ts`, `sdk/src/core/vectors.ts`, `sdk/src/core/index.ts`
- Test: `sdk/test/settlement.test.ts`, `sdk/test/receipts.test.ts`, `sdk/test/terms.test.ts`

**Interfaces:**
- Produces (dipakai Task 4–16):
  - `poseidon(): Promise<(inputs: bigint[]) => bigint>`
  - `interface Terms { unitPrice: bigint; maxM1: bigint; minM2: bigint; penaltyBps: bigint; capBps: bigint; nonce: bigint }`, `commitTerms(t): Promise<bigint>`, `randomNonce(): bigint`, `BPS = 10000n`
  - `interface Receipt { seq: number; qty: bigint; m1: bigint; m2: bigint; due: bigint }`, `makeReceipt(seq, qty, m1, m2, unitPrice)`, `leafHash(r): Promise<bigint>`, `merkleRoot(leaves: bigint[]): Promise<bigint>`, `class ReceiptTree { append(r); root(); size; leaves }`, `MAX_SEQ = 128`, `DEPTH = 7`, `EMPTY_LEAF = 0n`
  - `settle(receipts, terms): Settlement` dengan `{ cumulativeAmount, breaches, penRaw, cap, payToClient, payToProvider }` (semua bigint kecuali breaches: number)
  - `loadVector(name): { terms: Terms; receipts: Receipt[]; expected: {...} }`

- [ ] **Step 1: Paket SDK**

```bash
cat > sdk/package.json <<'EOF'
{
  "name": "@aegisclear/sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/core/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "circomlibjs": "^0.1.7",
    "snarkjs": "^0.7.6",
    "viem": "^2.56.8",
    "hono": "^4.13.8",
    "@hono/node-server": "^2.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.23.13",
    "typescript": "^5.9.3",
    "vitest": "^5.0.1"
  }
}
EOF
cat > sdk/tsconfig.json <<'EOF'
{ "extends": "../tsconfig.base.json", "compilerOptions": { "rootDir": ".", "noEmit": true, "types": ["node"] }, "include": ["src", "test"] }
EOF
cat > sdk/vitest.config.ts <<'EOF'
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 120_000, hookTimeout: 120_000 } });
EOF
cat > sdk/src/types.d.ts <<'EOF'
declare module "circomlibjs";
declare module "snarkjs";
EOF
pnpm install
```

- [ ] **Step 2: Tulis test yang gagal — settlement diferensial vs vektor Python**

`sdk/test/settlement.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { settle, loadVector } from "../src/core/index.js";

const NAMES = ["EX1_7_latency_breaches", "EX2_cap_binds_80_breaches", "EX3_qty5_2_quality_breaches",
  "EDGE_seq0", "EDGE_seq128_all_breach", "EDGE_cap0", "EDGE_cap100_pen100", "EDGE_qty0_slot"];

describe("settle() == tools/settlement_vectors.py", () => {
  for (const name of NAMES) {
    it(name, () => {
      const v = loadVector(name);
      const s = settle(v.receipts, v.terms);
      expect(s.cumulativeAmount).toBe(v.expected.cumulativeAmount);
      expect(s.breaches).toBe(v.expected.breaches);
      expect(s.penRaw).toBe(v.expected.penRaw);
      expect(s.cap).toBe(v.expected.cap);
      expect(s.payToClient).toBe(v.expected.payToClient);
      expect(s.payToProvider).toBe(v.expected.payToProvider);
      expect(s.payToClient + s.payToProvider).toBe(s.cumulativeAmount);
    });
  }
  it("EX1 angka wajib spec §6.5", () => {
    const v = loadVector("EX1_7_latency_breaches");
    const s = settle(v.receipts, v.terms);
    expect(s.payToClient).toBe(70_000n);
    expect(s.payToProvider).toBe(1_930_000n);
  });
  it("menolak due != qty*unitPrice (C3)", () => {
    const v = loadVector("EX1_7_latency_breaches");
    const bad = v.receipts.map((r, i) => (i === 0 ? { ...r, due: r.due + 1n } : r));
    expect(() => settle(bad, v.terms)).toThrow(/C3/);
  });
});
```

- [ ] **Step 3: Jalankan — harus gagal**

Run: `pnpm --filter @aegisclear/sdk test`
Expected: FAIL — `Cannot find module '../src/core/index.js'`

- [ ] **Step 4: Implementasi core**

`sdk/src/core/poseidon.ts`:
```ts
import { buildPoseidon } from "circomlibjs";

export type PoseidonFn = (inputs: bigint[]) => bigint;
export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let cached: Promise<PoseidonFn> | undefined;
/** Satu instance circomlibjs untuk seluruh proses; hasil = bigint field element. */
export function poseidon(): Promise<PoseidonFn> {
  if (!cached) {
    cached = buildPoseidon().then((p: any) => (inputs: bigint[]): bigint => {
      if (inputs.length < 1 || inputs.length > 16) throw new Error("poseidon: 1..16 inputs");
      return p.F.toObject(p(inputs)) as bigint;
    });
  }
  return cached;
}
```

`sdk/src/core/terms.ts`:
```ts
import { randomBytes } from "node:crypto";
import { poseidon, FIELD_PRIME } from "./poseidon.js";

export const BPS = 10_000n;
export const U32 = 1n << 32n;

export interface Terms {
  unitPrice: bigint; maxM1: bigint; minM2: bigint; penaltyBps: bigint; capBps: bigint; nonce: bigint;
}

export function assertTermsInRange(t: Terms): void {
  for (const k of ["unitPrice", "maxM1", "minM2"] as const) {
    if (t[k] < 0n || t[k] >= U32) throw new Error(`terms.${k} out of range (< 2^32)`);
  }
  for (const k of ["penaltyBps", "capBps"] as const) {
    if (t[k] < 0n || t[k] > BPS) throw new Error(`terms.${k} out of range (<= 10000)`);
  }
  if (t.nonce < 0n || t.nonce >= FIELD_PRIME) throw new Error("terms.nonce must be a field element");
}

/** 253-bit nonce dari CSPRNG (byte teratas dimask ke 5 bit) — selalu < p. */
export function randomNonce(): bigint {
  const b = randomBytes(32);
  b[0] &= 0x1f;
  return BigInt("0x" + b.toString("hex"));
}

/** T = Poseidon(unitPrice, maxM1, minM2, penaltyBps, capBps, nonce)  (t = 7) */
export async function commitTerms(t: Terms): Promise<bigint> {
  assertTermsInRange(t);
  const h = await poseidon();
  return h([t.unitPrice, t.maxM1, t.minM2, t.penaltyBps, t.capBps, t.nonce]);
}
```

`sdk/src/core/receipts.ts`:
```ts
import { poseidon } from "./poseidon.js";
import { U32 } from "./terms.js";

export const MAX_SEQ = 128;
export const DEPTH = 7;
export const EMPTY_LEAF = 0n;
export const U64 = 1n << 64n;

export interface Receipt { seq: number; qty: bigint; m1: bigint; m2: bigint; due: bigint }

export function makeReceipt(seq: number, qty: bigint, m1: bigint, m2: bigint, unitPrice: bigint): Receipt {
  return { seq, qty, m1, m2, due: qty * unitPrice };
}

export function assertReceiptInRange(r: Receipt): void {
  if (r.seq < 0 || r.seq >= MAX_SEQ) throw new Error("receipt.seq out of range");
  for (const k of ["qty", "m1", "m2"] as const) if (r[k] < 0n || r[k] >= U32) throw new Error(`receipt.${k} out of range (< 2^32)`);
  if (r.due < 0n || r.due >= U64) throw new Error("receipt.due out of range (< 2^64)");
}

/** leaf = Poseidon(seq, qty, m1, m2, due)  (t = 6) */
export async function leafHash(r: Receipt): Promise<bigint> {
  assertReceiptInRange(r);
  const h = await poseidon();
  return h([BigInt(r.seq), r.qty, r.m1, r.m2, r.due]);
}

/** Root pohon biner 128 slot; slot kosong = EMPTY_LEAF (0). Node = Poseidon(kiri, kanan). */
export async function merkleRoot(leaves: bigint[]): Promise<bigint> {
  if (leaves.length > MAX_SEQ) throw new Error("MAX_SEQ exceeded");
  const h = await poseidon();
  let layer = [...leaves];
  while (layer.length < MAX_SEQ) layer.push(EMPTY_LEAF);
  while (layer.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 2) next.push(h([layer[i], layer[i + 1]]));
    layer = next;
  }
  return layer[0];
}

export class ReceiptTree {
  readonly leaves: bigint[] = [];
  readonly receipts: Receipt[] = [];
  get size(): number { return this.leaves.length; }
  async append(r: Receipt): Promise<void> {
    if (r.seq !== this.leaves.length) throw new Error(`expected seq ${this.leaves.length}, got ${r.seq}`);
    if (this.leaves.length >= MAX_SEQ) throw new Error("MAX_SEQ exceeded");
    this.leaves.push(await leafHash(r));
    this.receipts.push(r);
  }
  root(): Promise<bigint> { return merkleRoot(this.leaves); }
}
```

`sdk/src/core/settlement.ts`:
```ts
import { BPS, type Terms, assertTermsInRange } from "./terms.js";
import { MAX_SEQ, type Receipt, assertReceiptInRange } from "./receipts.js";

export interface Settlement {
  cumulativeAmount: bigint; breaches: number; penRaw: bigint; cap: bigint; payToClient: bigint; payToProvider: bigint;
}

/** Port 1:1 dari tools/settlement_vectors.py::settle — sumber kebenaran §6.3. */
export function settle(receipts: Receipt[], t: Terms): Settlement {
  assertTermsInRange(t);
  if (receipts.length > MAX_SEQ) throw new Error("MAX_SEQ exceeded");
  let cumulativeAmount = 0n, penRaw = 0n, breaches = 0;
  receipts.forEach((r, i) => {
    if (r.seq !== i) throw new Error("seq harus 0..n-1 berurutan");
    assertReceiptInRange(r);
    if (r.due !== r.qty * t.unitPrice) throw new Error("C3: due == qty * unitPrice");
    cumulativeAmount += r.due;
    const breach = r.m1 > t.maxM1 || r.m2 < t.minM2;
    if (breach) { breaches += 1; penRaw += (r.due * t.penaltyBps) / BPS; }
  });
  const cap = (cumulativeAmount * t.capBps) / BPS;
  const payToClient = penRaw < cap ? penRaw : cap;
  return { cumulativeAmount, breaches, penRaw, cap, payToClient, payToProvider: cumulativeAmount - payToClient };
}
```

`sdk/src/core/vectors.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Terms } from "./terms.js";
import type { Receipt } from "./receipts.js";

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "vectors");

export interface Vector {
  terms: Terms; receipts: Receipt[];
  expected: { seq: number; cumulativeAmount: bigint; breaches: number; penRaw: bigint; cap: bigint; payToClient: bigint; payToProvider: bigint };
}

export function loadVector(name: string): Vector {
  const j = JSON.parse(readFileSync(join(VECTORS_DIR, `${name}.json`), "utf8"));
  const b = (x: number | string) => BigInt(x);
  return {
    terms: { unitPrice: b(j.terms.unitPrice), maxM1: b(j.terms.maxM1), minM2: b(j.terms.minM2),
             penaltyBps: b(j.terms.penaltyBps), capBps: b(j.terms.capBps), nonce: b(j.terms.nonce) },
    receipts: j.receipts.map((r: any) => ({ seq: r.seq, qty: b(r.qty), m1: b(r.m1), m2: b(r.m2), due: b(r.due) })),
    expected: { seq: j.seq, cumulativeAmount: b(j.cumulativeAmount), breaches: j.breaches, penRaw: b(j.penRaw),
                cap: b(j.cap), payToClient: b(j.payToClient), payToProvider: b(j.payToProvider) },
  };
}
```
> Catatan: `nonce` vektor RAND adalah integer 253-bit; `JSON.parse` kehilangan presisi > 2^53. Di `tools/settlement_vectors.py`, tepat sebelum blok `if "--json" in args:`, tambahkan:
> ```python
>     for v in out.values():
>         v["terms"] = {**v["terms"], "nonce": str(v["terms"]["nonce"])}
> ```
> `loadVector` memakai `BigInt(x)` sehingga string maupun angka sama-sama terbaca. Regenerasi: `python3 tools/settlement_vectors.py --json vectors --no-random`.

`sdk/src/core/index.ts`:
```ts
export * from "./poseidon.js";
export * from "./terms.js";
export * from "./receipts.js";
export * from "./settlement.js";
export * from "./vectors.js";
```

- [ ] **Step 5: Test receipts & terms**

`sdk/test/receipts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ReceiptTree, merkleRoot, leafHash, makeReceipt, MAX_SEQ, EMPTY_LEAF, poseidon } from "../src/core/index.js";

describe("ReceiptTree", () => {
  it("root pohon kosong = hash berlapis dari EMPTY_LEAF", async () => {
    const h = await poseidon();
    let node = EMPTY_LEAF;
    for (let d = 0; d < 7; d++) node = h([node, node]);
    expect(await merkleRoot([])).toBe(node);
  });
  it("append berurutan, root berubah, menolak seq lompat & > MAX_SEQ", async () => {
    const t = new ReceiptTree();
    await t.append(makeReceipt(0, 1n, 300n, 95n, 20_000n));
    const r0 = await t.root();
    await t.append(makeReceipt(1, 1n, 300n, 95n, 20_000n));
    expect(await t.root()).not.toBe(r0);
    await expect(t.append(makeReceipt(5, 1n, 300n, 95n, 20_000n))).rejects.toThrow(/expected seq 2/);
    for (let i = 2; i < MAX_SEQ; i++) await t.append(makeReceipt(i, 1n, 300n, 95n, 20_000n));
    await expect(t.append(makeReceipt(MAX_SEQ, 1n, 300n, 95n, 20_000n))).rejects.toThrow(/seq out of range|MAX_SEQ/);
  });
  it("leafHash deterministik dan sensitif terhadap tiap field", async () => {
    const a = await leafHash(makeReceipt(3, 2n, 300n, 95n, 20_000n));
    expect(await leafHash(makeReceipt(3, 2n, 300n, 95n, 20_000n))).toBe(a);
    expect(await leafHash(makeReceipt(3, 2n, 301n, 95n, 20_000n))).not.toBe(a);
  });
});
```

`sdk/test/terms.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { commitTerms, randomNonce, FIELD_PRIME, type Terms } from "../src/core/index.js";

const base: Terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: 0n };
describe("commitTerms", () => {
  it("nonce berbeda → komitmen berbeda; nonce < p", async () => {
    const n1 = randomNonce(), n2 = randomNonce();
    expect(n1).not.toBe(n2); expect(n1 < FIELD_PRIME).toBe(true);
    expect(await commitTerms({ ...base, nonce: n1 })).not.toBe(await commitTerms({ ...base, nonce: n2 }));
  });
  it("menolak bps > 10000", async () => {
    await expect(commitTerms({ ...base, capBps: 10_001n })).rejects.toThrow(/capBps/);
  });
});
```

- [ ] **Step 6: Jalankan semua test SDK**

Run: `pnpm --filter @aegisclear/sdk test`
Expected: PASS (3 file, ~12 test). Jika `settlement.test.ts` gagal di `EDGE_*`, bandingkan dengan output Python — kedua implementasi harus identik bit-per-bit.

- [ ] **Step 7: Commit**

```bash
git add sdk/ tools/settlement_vectors.py vectors/
git commit -m "feat(sdk): poseidon, terms commitment, receipt tree, settlement port with vector tests"
```

---

### Task 4: Sirkuit `sla_settlement.circom` + test constraint

**Files:**
- Create: `circuits/package.json`, `circuits/sla_settlement.circom`, `circuits/scripts/build.sh`
- Create: `sdk/src/core/circuitInput.ts` (+ export di `index.ts`)
- Test: `circuits/test/sla_settlement.test.ts`

**Interfaces:**
- Consumes: `settle`, `commitTerms`, `leafHash`, `merkleRoot`, `loadVector` (Task 3)
- Produces: `buildCircuitInput(channel: 0x-address, terms, receipts): Promise<CircuitInput>` (semua nilai string desimal, array dipad ke 128); `publicSignalsOf(input): bigint[6]`; artefak `circuits/build/sla_settlement.r1cs`, `circuits/build/sla_settlement_js/sla_settlement.wasm`.

- [ ] **Step 1: Paket circuits & builder input**

```bash
cat > circuits/package.json <<'EOF'
{
  "name": "@aegisclear/circuits",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bash scripts/build.sh",
    "test": "node --import tsx --test test/*.test.ts"
  },
  "dependencies": { "@aegisclear/sdk": "workspace:*", "circomlib": "^2.0.5", "snarkjs": "^0.7.6", "viem": "^2.56.8" },
  "devDependencies": { "circom_tester": "^0.0.24", "tsx": "^4.23.13", "typescript": "^5.9.3" }
}
EOF
pnpm install
```

`sdk/src/core/circuitInput.ts`:
```ts
import { type Terms, commitTerms } from "./terms.js";
import { type Receipt, MAX_SEQ, leafHash, merkleRoot } from "./receipts.js";
import { settle } from "./settlement.js";

export interface CircuitInput {
  channelIdField: string; termsCommitment: string; receiptsRoot: string; seq: string; cumulativeAmount: string; payToClient: string;
  unitPrice: string; maxM1: string; minM2: string; penaltyBps: string; capBps: string; nonce: string;
  qty: string[]; m1: string[]; m2: string[]; due: string[];
}

export async function buildCircuitInput(channel: `0x${string}`, terms: Terms, receipts: Receipt[]): Promise<CircuitInput> {
  const s = settle(receipts, terms);
  const T = await commitTerms(terms);
  const R = await merkleRoot(await Promise.all(receipts.map(leafHash)));
  const pad = (f: (r: Receipt) => bigint) => {
    const a = receipts.map(f); while (a.length < MAX_SEQ) a.push(0n); return a.map(String);
  };
  return {
    channelIdField: BigInt(channel).toString(), termsCommitment: T.toString(), receiptsRoot: R.toString(),
    seq: String(receipts.length), cumulativeAmount: s.cumulativeAmount.toString(), payToClient: s.payToClient.toString(),
    unitPrice: terms.unitPrice.toString(), maxM1: terms.maxM1.toString(), minM2: terms.minM2.toString(),
    penaltyBps: terms.penaltyBps.toString(), capBps: terms.capBps.toString(), nonce: terms.nonce.toString(),
    qty: pad(r => r.qty), m1: pad(r => r.m1), m2: pad(r => r.m2), due: pad(r => r.due),
  };
}

/** Urutan input publik tetap (Global Constraints). */
export function publicSignalsOf(i: CircuitInput): bigint[] {
  return [i.channelIdField, i.termsCommitment, i.receiptsRoot, i.seq, i.cumulativeAmount, i.payToClient].map(BigInt);
}
```
Tambahkan `export * from "./circuitInput.js";` ke `sdk/src/core/index.ts`.

- [ ] **Step 2: Tulis test sirkuit yang gagal (circom_tester)**

`circuits/test/sla_settlement.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wasm as wasmTester } from "circom_tester";
import { loadVector, buildCircuitInput, settle } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const CIRCUIT = path.join(here, "..", "sla_settlement.circom");
const CHANNEL = "0x00000000000000000000000000000000000001ff" as const;

let circuit: any;
async function getCircuit() {
  if (!circuit) circuit = await wasmTester(CIRCUIT, { include: [path.join(here, "..", "node_modules")] });
  return circuit;
}

for (const name of ["EX1_7_latency_breaches", "EX2_cap_binds_80_breaches", "EX3_qty5_2_quality_breaches", "EDGE_seq0", "EDGE_seq128_all_breach", "EDGE_cap0"]) {
  test(`witness valid untuk ${name}`, async () => {
    const c = await getCircuit();
    const v = loadVector(name);
    const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
    const w = await c.calculateWitness(input, true);
    await c.checkConstraints(w);
    assert.equal(input.payToClient, v.expected.payToClient.toString());
  });
}

test("payToClient salah → constraint gagal", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.payToClient = (BigInt(input.payToClient) + 1n).toString();
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});

test("due != qty*unitPrice → constraint gagal (C3)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.due[0] = (BigInt(input.due[0]) + 1n).toString();
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});

test("slot kosong berisi data → gagal (kanonik)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX3_qty5_2_quality_breaches");   // seq = 20
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.m1[50] = "1";
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});

test("nonce salah → termsCommitment tidak cocok (C1)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.nonce = "1";
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});
```

Run: `pnpm --filter @aegisclear/circuits test`
Expected: FAIL — file `sla_settlement.circom` tidak ada.

- [ ] **Step 3: Tulis sirkuit**

`circuits/sla_settlement.circom`:
```circom
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// floor(x / 10000) dengan witness (q, r): x == 10000*q + r, r < 10000, q < 2^64
template DivBps() {
    signal input x;
    signal output q;
    signal r;
    q <-- x \ 10000;
    r <-- x % 10000;
    x === q * 10000 + r;
    component rb = Num2Bits(14);   // WAJIB: ikat r ke [0, 2^14) sebelum komparator — tanpa ini LessThan(14) menerima r negatif (celah soundness, ditemukan review Task 4)
    rb.in <== r;
    component rlt = LessThan(14);
    rlt.in[0] <== r;
    rlt.in[1] <== 10000;
    rlt.out === 1;
    component qb = Num2Bits(64);
    qb.in <== q;
}

// Root pohon biner penuh kedalaman DEPTH; node = Poseidon(kiri, kanan)
template MerkleRoot(DEPTH) {
    var N = 1 << DEPTH;
    signal input leaves[N];
    signal output root;
    signal nodes[2 * N - 1];
    component h[N - 1];
    for (var i = 0; i < N; i++) { nodes[i] <== leaves[i]; }
    var idx = 0;
    for (var d = 0; d < DEPTH; d++) {
        var w = N >> d;            // lebar layer d
        var s = 2 * N - 2 * w;     // indeks awal layer d
        var sn = 2 * N - w;        // indeks awal layer d+1
        for (var i = 0; i < w / 2; i++) {
            h[idx] = Poseidon(2);
            h[idx].inputs[0] <== nodes[s + 2 * i];
            h[idx].inputs[1] <== nodes[s + 2 * i + 1];
            nodes[sn + i] <== h[idx].out;
            idx++;
        }
    }
    root <== nodes[2 * N - 2];
}

template SlaSettlement(N, DEPTH) {
    // ---- publik (urutan = Global Constraints) ----
    signal input channelIdField;
    signal input termsCommitment;
    signal input receiptsRoot;
    signal input seq;
    signal input cumulativeAmount;
    signal input payToClient;
    // ---- privat ----
    signal input unitPrice;
    signal input maxM1;
    signal input minM2;
    signal input penaltyBps;
    signal input capBps;
    signal input nonce;
    signal input qty[N];
    signal input m1[N];
    signal input m2[N];
    signal input due[N];

    // channelIdField hanya pengikat; satu constraint agar tidak dioptimasi keluar
    signal cidSq;
    cidSq <== channelIdField * channelIdField;

    // C1: pembukaan komitmen syarat
    component tc = Poseidon(6);
    tc.inputs[0] <== unitPrice;  tc.inputs[1] <== maxM1;      tc.inputs[2] <== minM2;
    tc.inputs[3] <== penaltyBps; tc.inputs[4] <== capBps;     tc.inputs[5] <== nonce;
    tc.out === termsCommitment;

    // C10: rentang global
    component upB = Num2Bits(32); upB.in <== unitPrice;
    component mxB = Num2Bits(32); mxB.in <== maxM1;
    component mnB = Num2Bits(32); mnB.in <== minM2;
    component penB = Num2Bits(14); penB.in <== penaltyBps;   // ikat sebelum LessEqThan (soundness komparator)
    component capB = Num2Bits(14); capB.in <== capBps;
    component seqB = Num2Bits(8);  seqB.in <== seq;
    component penLe = LessEqThan(14); penLe.in[0] <== penaltyBps; penLe.in[1] <== 10000; penLe.out === 1;
    component capLe = LessEqThan(14); capLe.in[0] <== capBps;     capLe.in[1] <== 10000; capLe.out === 1;
    component seqLe = LessEqThan(8);  seqLe.in[0] <== seq;        seqLe.in[1] <== N;     seqLe.out === 1;
    component cumB = Num2Bits(64); cumB.in <== cumulativeAmount;

    component filled[N]; component leaf[N]; component gt1[N]; component lt2[N];
    component qB[N]; component aB[N]; component bB[N]; component dB[N]; component div[N];
    signal leaves[N]; signal b[N]; signal penFull[N]; signal pen[N]; signal fDue[N];
    signal sumDue[N + 1]; signal sumPen[N + 1];
    sumDue[0] <== 0;
    sumPen[0] <== 0;

    for (var i = 0; i < N; i++) {
        // C2: slot terisi jika i < seq
        filled[i] = LessThan(8); filled[i].in[0] <== i; filled[i].in[1] <== seq;
        // C10 per receipt
        qB[i] = Num2Bits(32); qB[i].in <== qty[i];
        aB[i] = Num2Bits(32); aB[i].in <== m1[i];
        bB[i] = Num2Bits(32); bB[i].in <== m2[i];
        dB[i] = Num2Bits(64); dB[i].in <== due[i];
        // C3
        due[i] === qty[i] * unitPrice;
        // slot kosong kanonik (nol)
        (1 - filled[i].out) * qty[i] === 0;
        (1 - filled[i].out) * m1[i] === 0;
        (1 - filled[i].out) * m2[i] === 0;
        // C4: leaf
        leaf[i] = Poseidon(5);
        leaf[i].inputs[0] <== i;      leaf[i].inputs[1] <== qty[i]; leaf[i].inputs[2] <== m1[i];
        leaf[i].inputs[3] <== m2[i];  leaf[i].inputs[4] <== due[i];
        leaves[i] <== filled[i].out * leaf[i].out;
        // C7: breach = m1 > maxM1 OR m2 < minM2
        gt1[i] = GreaterThan(32); gt1[i].in[0] <== m1[i]; gt1[i].in[1] <== maxM1;
        lt2[i] = LessThan(32);    lt2[i].in[0] <== m2[i]; lt2[i].in[1] <== minM2;
        b[i] <== gt1[i].out + lt2[i].out - gt1[i].out * lt2[i].out;
        // C8: pen_i = b_i * floor(due_i * penaltyBps / 10000), hanya slot terisi
        div[i] = DivBps(); div[i].x <== due[i] * penaltyBps;
        penFull[i] <== b[i] * div[i].q;
        pen[i] <== filled[i].out * penFull[i];
        fDue[i] <== filled[i].out * due[i];
        sumDue[i + 1] <== sumDue[i] + fDue[i];
        sumPen[i + 1] <== sumPen[i] + pen[i];
    }
    // C6
    sumDue[N] === cumulativeAmount;
    // C5
    component mr = MerkleRoot(DEPTH);
    for (var i = 0; i < N; i++) { mr.leaves[i] <== leaves[i]; }
    mr.root === receiptsRoot;
    // C9: payToClient == min(penRaw, floor(cumulativeAmount * capBps / 10000))
    component capDiv = DivBps(); capDiv.x <== cumulativeAmount * capBps;
    component lt = LessThan(64); lt.in[0] <== sumPen[N]; lt.in[1] <== capDiv.q;
    signal minv;
    minv <== lt.out * (sumPen[N] - capDiv.q) + capDiv.q;
    minv === payToClient;
}

component main {public [channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]} = SlaSettlement(128, 7);
```

- [ ] **Step 4: Skrip build & cek jumlah constraint (V11)**

`circuits/scripts/build.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
circom sla_settlement.circom --O2 --r1cs --wasm --sym -o build -l node_modules   # --O2 wajib: O1 default = 217.908 constraint (> 2^17); O2 = ~115k
npx snarkjs r1cs info build/sla_settlement.r1cs
```
```bash
chmod +x circuits/scripts/build.sh && pnpm --filter @aegisclear/circuits build
```
Expected: baris `# of Constraints: <n>` dengan `n < 131072` (terukur 19 Sep 2026: 115.066 pada `--O2` setelah perbaikan soundness). Catat `n` di `docs/TOOLCHAIN.md`. Jika `n ≥ 131072`: terapkan D4 — ubah `SlaSettlement(128, 7)` menjadi `SlaSettlement(64, 6)` **dan** `MAX_SEQ = 64`, `DEPTH = 6` di `sdk/src/core/receipts.ts`, lalu catat di spec §6.6/§20.

- [ ] **Step 5: Jalankan test sirkuit**

Run: `pnpm --filter @aegisclear/circuits test`
Expected: 10 test PASS (kompilasi pertama via circom_tester memakan ~1–3 menit). **Tambahan (dari review Task 4, implementasi final di repo):** `DivBps` dipecah menjadi `DivBpsConstraints()` (x, q, r sebagai input; seluruh constraint) + wrapper `DivBps()` di `circuits/lib/divbps.circom`, di-`include` oleh sirkuit utama; sirkuit probe `circuits/test/circuits/divbps_probe.circom` (`component main = DivBpsConstraints();`) memungkinkan dua test tambahan: triple jujur `(13616, 1, 3616)` diterima dan triple sisa-negatif `(13616, 2, p−6384)` DITOLAK — test ini gagal jika `rb` dihapus (bukti diskriminasi dicatat di laporan Task 4). Memanipulasi slot witness sirkuit utama secara langsung TIDAK diskriminatif (constraint dekomposisi bit lain ikut rusak).

- [ ] **Step 6: Commit**

```bash
git add circuits/package.json circuits/sla_settlement.circom circuits/scripts/build.sh circuits/test sdk/src/core/circuitInput.ts sdk/src/core/index.ts pnpm-lock.yaml
git commit -m "feat(circuits): sla_settlement circuit with vector-driven constraint tests"
```

---
### Task 5: Trusted setup lokal, verifier Solidity, skrip prove, fixture

**Files:**
- Create: `circuits/scripts/setup.sh`, `circuits/scripts/prove.ts`
- Create (generated): `contracts/src/SLASettlementVerifier.sol`, `contracts/src/interfaces/ISLASettlementVerifier.sol`, `circuits/build/verification_key.json`, `contracts/test/fixtures/ex1_verifier.json`
- Modify: `prd-arsitektur.md` (§19 baris V14)

**Interfaces:**
- Consumes: `circuits/build/sla_settlement.r1cs`, `.wasm` (Task 4); `buildCircuitInput`, `loadVector`, `commitTerms` (Task 3–4)
- Produces:
  - `circuits/build/sla_final.zkey` (tidak di-commit; dihasilkan `setup.sh`)
  - `SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6]) view returns (bool)`
  - CLI `prove.ts --vector <NAME> --channel <0x..> [--json] [--terms-only]`: stdout hex `abi.encode(uint256[8] proof, uint256[6] inputs)` (untuk `vm.ffi`), atau JSON `{proof: string[8], inputs: string[6]}` (desimal) dengan `--json`; `--terms-only` mencetak hex `abi.encode(uint256 termsCommitment)`.

- [ ] **Step 1: Skrip setup (ptau lokal karena mirror Hermez 403 pada 19 Sep 2026)**

`circuits/scripts/setup.sh`:
```bash
#!/usr/bin/env bash
# Trusted setup Groth16 untuk sla_settlement. Satu kontributor (hackathon) — lihat spec T4/§9.4.
set -euo pipefail
cd "$(dirname "$0")/.."
POWER=17
mkdir -p ptau build
BEACON=0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
entropy() { head -c 64 /dev/urandom | xxd -p | tr -d '\n'; }

if [ ! -f ptau/pot${POWER}_final.ptau ]; then
  if [ -n "${PTAU_URL:-}" ]; then
    echo ">> mengunduh ptau dari $PTAU_URL"
    curl -fL -o ptau/pot${POWER}_final.ptau "$PTAU_URL"
    npx snarkjs powersoftau verify ptau/pot${POWER}_final.ptau
  else
    echo ">> mirror publik tidak tersedia; membangkitkan Powers of Tau 2^${POWER} lokal (±5-10 menit)"
    npx snarkjs powersoftau new bn128 ${POWER} ptau/pot${POWER}_0000.ptau -v
    npx snarkjs powersoftau contribute ptau/pot${POWER}_0000.ptau ptau/pot${POWER}_0001.ptau --name="aegisclear-ptau-1" -v -e="$(entropy)"
    npx snarkjs powersoftau beacon ptau/pot${POWER}_0001.ptau ptau/pot${POWER}_beacon.ptau $BEACON 10 -n="ptau beacon"
    npx snarkjs powersoftau prepare phase2 ptau/pot${POWER}_beacon.ptau ptau/pot${POWER}_final.ptau -v
    npx snarkjs powersoftau verify ptau/pot${POWER}_final.ptau
  fi
fi

[ -f build/sla_settlement.r1cs ] || bash scripts/build.sh
npx snarkjs groth16 setup build/sla_settlement.r1cs ptau/pot${POWER}_final.ptau build/sla_0000.zkey
npx snarkjs zkey contribute build/sla_0000.zkey build/sla_0001.zkey --name="aegisclear-phase2-1" -v -e="$(entropy)"
npx snarkjs zkey beacon build/sla_0001.zkey build/sla_final.zkey $BEACON 10 -n="phase2 beacon"
npx snarkjs zkey verify build/sla_settlement.r1cs ptau/pot${POWER}_final.ptau build/sla_final.zkey
npx snarkjs zkey export verificationkey build/sla_final.zkey build/verification_key.json

mkdir -p ../contracts/src/interfaces
npx snarkjs zkey export solidityverifier build/sla_final.zkey ../contracts/src/SLASettlementVerifier.sol
sed -i 's/contract Groth16Verifier/contract SLASettlementVerifier/' ../contracts/src/SLASettlementVerifier.sol
cat > ../contracts/src/interfaces/ISLASettlementVerifier.sol <<'SOL'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Verifier Groth16 hasil ekspor snarkjs (circuits/scripts/setup.sh).
/// inputs = [channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]
interface ISLASettlementVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata inputs)
        external view returns (bool);
}
SOL
echo ">> setup selesai: build/sla_final.zkey, build/verification_key.json, contracts/src/SLASettlementVerifier.sol"
```

```bash
chmod +x circuits/scripts/setup.sh && pnpm --filter @aegisclear/circuits exec bash scripts/setup.sh
ls -la circuits/build/sla_final.zkey circuits/build/verification_key.json contracts/src/SLASettlementVerifier.sol
grep -n "contract SLASettlementVerifier\|function verifyProof" contracts/src/SLASettlementVerifier.sol
```
Expected: ketiga file ada; `function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[6] calldata _pubSignals)`.

- [ ] **Step 2: Tulis test prove/verify yang gagal**

Tambahkan ke `circuits/test/prove.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAbiParameters } from "viem";
import { loadVector, settle, commitTerms } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROVE = path.join(here, "..", "scripts", "prove.ts");
const CHANNEL = "0x00000000000000000000000000000000000001ff";

test("prove.ts EX1 → bukti valid, inputs sesuai vektor", () => {
  const out = execFileSync("npx", ["tsx", PROVE, "--vector", "EX1_7_latency_breaches", "--channel", CHANNEL], { encoding: "utf8" }).trim();
  const [proof, inputs] = decodeAbiParameters([{ type: "uint256[8]" }, { type: "uint256[6]" }], out as `0x${string}`);
  assert.equal(proof.length, 8);
  assert.equal(inputs[0], BigInt(CHANNEL));
  assert.equal(inputs[3], 100n);
  assert.equal(inputs[4], 2_000_000n);
  assert.equal(inputs[5], 70_000n);
});

test("prove.ts --terms-only", async () => {
  const out = execFileSync("npx", ["tsx", PROVE, "--vector", "EX1_7_latency_breaches", "--terms-only"], { encoding: "utf8" }).trim();
  const [T] = decodeAbiParameters([{ type: "uint256" }], out as `0x${string}`);
  assert.equal(T, await commitTerms(loadVector("EX1_7_latency_breaches").terms));
});
```
Run: `pnpm --filter @aegisclear/circuits test`
Expected: FAIL — `scripts/prove.ts` tidak ada.

- [ ] **Step 3: Skrip prove**

`circuits/scripts/prove.ts`:
```ts
#!/usr/bin/env tsx
// prove.ts --vector <NAME> --channel <0x..> [--json] [--terms-only]
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { encodeAbiParameters } from "viem";
import { loadVector, buildCircuitInput, commitTerms } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "build", "sla_settlement_js", "sla_settlement.wasm");
const ZKEY = path.join(here, "..", "build", "sla_final.zkey");

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const has = (name: string) => process.argv.includes(name);

/** "[a0,a1],[[b00,b01],[b10,b11]],[c0,c1],[i0..i5]" → 14 bigint (urutan pB sudah di-swap oleh snarkjs) */
export async function toCalldata(proof: any, publicSignals: string[]): Promise<{ proof: bigint[]; inputs: bigint[] }> {
  const s: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const nums = s.replace(/[\[\]\s"]/g, "").split(",").map((x) => BigInt(x));
  if (nums.length !== 14) throw new Error(`calldata: expected 14 words, got ${nums.length}`);
  return { proof: nums.slice(0, 8), inputs: nums.slice(8, 14) };
}

async function main() {
  const name = arg("--vector"); if (!name) throw new Error("--vector wajib");
  const v = loadVector(name);
  if (has("--terms-only")) {
    process.stdout.write(encodeAbiParameters([{ type: "uint256" }], [await commitTerms(v.terms)]));
    return;
  }
  const channel = arg("--channel") as `0x${string}`; if (!channel) throw new Error("--channel wajib");
  const input = await buildCircuitInput(channel, v.terms, v.receipts);
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  const ms = Date.now() - t0;
  const cd = await toCalldata(proof, publicSignals);
  if (has("--json")) {
    process.stdout.write(JSON.stringify({ proof: cd.proof.map(String), inputs: cd.inputs.map(String), provingMs: ms }));
  } else {
    process.stdout.write(encodeAbiParameters([{ type: "uint256[8]" }, { type: "uint256[6]" }], [cd.proof as any, cd.inputs as any]));
  }
  process.stderr.write(`proving ${name}: ${ms} ms\n`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```
> `process.exit(0)` wajib: snarkjs meninggalkan worker thread yang menahan proses.

- [ ] **Step 4: Jalankan test, verifikasi dengan snarkjs CLI, ukur waktu proving (V11)**

```bash
pnpm --filter @aegisclear/circuits test
cd circuits && npx tsx scripts/prove.ts --vector EX1_7_latency_breaches --channel 0x00000000000000000000000000000000000001ff --json > /tmp/ex1.json && cd ..
python3 - <<'EOF'
import json; d=json.load(open('/tmp/ex1.json')); print("provingMs:", d["provingMs"], "| payToClient:", d["inputs"][5])
EOF
```
Expected: test PASS; `payToClient: 70000`; `provingMs` < 30000 (catat di `docs/TOOLCHAIN.md`; jika > 30000 → D4).

- [ ] **Step 5: Fixture untuk test gas verifier (channelIdField tetap `0x1ff`)**

```bash
mkdir -p contracts/test/fixtures
cp /tmp/ex1.json contracts/test/fixtures/ex1_verifier.json
```

- [ ] **Step 6: Perbarui spec V14 dan commit**

Ganti baris V14 di `prd-arsitektur.md` menjadi:
```
| V14 | Powers of Tau 2¹⁷ | mirror `storage.googleapis.com/zkevm/ptau` **dan** `hermez.s3-eu-west-1.amazonaws.com` mengembalikan HTTP 403 (19 Sep 2026) → `circuits/scripts/setup.sh` membangkitkan ptau lokal (`powersoftau new/contribute/beacon/prepare phase2`); jika mirror kembali tersedia, `PTAU_URL=… setup.sh` + cocokkan hash blake2b `6247a343…49345` dari README snarkjs | Setup lokal = kontributor tunggal juga untuk phase 1 (T4 tidak berubah) |
```
```bash
git add circuits/scripts contracts/src/SLASettlementVerifier.sol contracts/src/interfaces circuits/build/verification_key.json contracts/test/fixtures/ex1_verifier.json circuits/test/prove.test.ts prd-arsitektur.md docs/TOOLCHAIN.md
git commit -m "feat(circuits): local trusted setup, exported Solidity verifier, prove CLI and EX1 fixture"
```

---

### Task 6: Foundry scaffold, MockUSDG, test gas verifier (V10)

**Files:**
- Create: `contracts/foundry.toml`, `contracts/remappings.txt`, `contracts/src/MockUSDG.sol`
- Create: `contracts/test/fixtures/permit2.bytecode`, `contracts/test/fixtures/x402proxy.bytecode`
- Test: `contracts/test/Verifier.t.sol`

**Interfaces:**
- Produces: `MockUSDG` (ERC20, `decimals() = 6`, `mint(address,uint256)` publik); fixture bytecode kanonik Permit2 & proxy x402 (dipakai Task 11); angka gas verifier terukur (§8.7).

- [ ] **Step 1: Scaffold Foundry + dependency**

```bash
mkdir -p contracts && cd contracts
forge init --no-git --force . 2>/dev/null || true
rm -rf src/Counter.sol test/Counter.t.sol script/Counter.s.sol
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0 --no-commit
forge install foundry-rs/forge-std --no-commit
forge install Uniswap/permit2 --no-commit
cat > remappings.txt <<'EOF'
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
permit2/=lib/permit2/
EOF
cat > foundry.toml <<'EOF'
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
solc_version = "0.8.28"
evm_version = "cancun"
optimizer = true
optimizer_runs = 200
ffi = true
fs_permissions = [
  { access = "read", path = "./test/fixtures" },
  { access = "read-write", path = "./deployments" }
]

[fuzz]
runs = 256

[invariant]
runs = 64
depth = 32
fail_on_revert = false
EOF
mkdir -p deployments test/fixtures test/mocks test/utils src/interfaces
cd ..
```
> Jika `forge install` gagal karena git root berada di `AegisClear/` (bukan `contracts/`), jalankan dari root: `git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts contracts/lib/openzeppelin-contracts && (cd contracts/lib/openzeppelin-contracts && git checkout v5.7.0)`, dan serupa untuk `forge-std` dan `permit2`.

- [ ] **Step 2: MockUSDG**

`contracts/src/MockUSDG.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Pengganti USDG untuk testnet/Anvil. 6 desimal seperti USDG asli (FR-22). Hanya untuk uji.
contract MockUSDG is ERC20 {
    constructor() ERC20("Mock Global Dollar", "USDG") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
```

- [ ] **Step 3: Fixture bytecode kanonik (Permit2, proxy x402) dari mainnet Robinhood Chain**

```bash
RPC=https://rpc.mainnet.chain.robinhood.com
cast code 0x000000000022D473030F116dDEE9F6B43aC78BA3 --rpc-url $RPC | tr -d '\n' > contracts/test/fixtures/permit2.bytecode
cast code 0x402085c248EeA27D92E8b30b2C58ed07f9E20001 --rpc-url $RPC | tr -d '\n' > contracts/test/fixtures/x402proxy.bytecode
wc -c contracts/test/fixtures/permit2.bytecode contracts/test/fixtures/x402proxy.bytecode
```
Expected: keduanya > 1000 byte (Permit2 ± 20 KB hex).

- [ ] **Step 4: Test gas verifier (gagal dulu karena belum ada kontrak? — verifier sudah ada dari Task 5; test ini langsung mengukur)**

`contracts/test/Verifier.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";

contract VerifierTest is Test {
    SLASettlementVerifier v;

    function setUp() public { v = new SLASettlementVerifier(); }

    function _fixture() internal view returns (uint256[8] memory p, uint256[6] memory inp) {
        string memory j = vm.readFile("test/fixtures/ex1_verifier.json");
        uint256[] memory pr = vm.parseJsonUintArray(j, ".proof");
        uint256[] memory ins = vm.parseJsonUintArray(j, ".inputs");
        for (uint256 i; i < 8; i++) p[i] = pr[i];
        for (uint256 i; i < 6; i++) inp[i] = ins[i];
    }

    function _verify(uint256[8] memory p, uint256[6] memory inp) internal view returns (bool ok, uint256 gasUsed) {
        uint256 g0 = gasleft();
        ok = v.verifyProof([p[0], p[1]], [[p[2], p[3]], [p[4], p[5]]], [p[6], p[7]], inp);
        gasUsed = g0 - gasleft();
    }

    function test_ex1_valid_and_gas() public {
        (uint256[8] memory p, uint256[6] memory inp) = _fixture();
        assertEq(inp[5], 70_000, "payToClient EX1");
        (bool ok, uint256 gasUsed) = _verify(p, inp);
        assertTrue(ok, "proof must verify");
        emit log_named_uint("verifyProof gas (6 public inputs)", gasUsed);
        assertLt(gasUsed, 300_000);
    }

    function test_tampered_public_input_fails() public {
        (uint256[8] memory p, uint256[6] memory inp) = _fixture();
        inp[5] += 1;
        (bool ok,) = _verify(p, inp);
        assertFalse(ok);
    }

    function test_tampered_proof_fails() public {
        (uint256[8] memory p, uint256[6] memory inp) = _fixture();
        p[0] ^= 1;
        (bool ok,) = _verify(p, inp);
        assertFalse(ok);
    }
}
```
```bash
cd contracts && forge test --match-contract VerifierTest -vv && cd ..
```
Expected: 3 PASS; log `verifyProof gas (6 public inputs): 2xxxxx` — salin angkanya ke tabel §8.7 spec (baris `claimPenalty`) dan `docs/TOOLCHAIN.md`.

- [ ] **Step 5: Commit**

```bash
git add contracts/foundry.toml contracts/remappings.txt contracts/src/MockUSDG.sol contracts/test/Verifier.t.sol contracts/test/fixtures .gitmodules contracts/lib prd-arsitektur.md docs/TOOLCHAIN.md
git commit -m "feat(contracts): foundry scaffold, MockUSDG, verifier gas test, canonical Permit2/x402 bytecode fixtures"
```

---
### Task 7: `AegisChannel` (skeleton + `initialize`) dan `AegisChannelFactory` (CREATE2 clone)

**Files:**
- Create: `contracts/src/AegisChannel.sol`, `contracts/src/AegisChannelFactory.sol`
- Create: `contracts/test/utils/Sigs.sol`, `contracts/test/mocks/MockVerifier.sol`, `contracts/test/Base.t.sol`
- Test: `contracts/test/Factory.t.sol`

**Interfaces:**
- Consumes: `ISLASettlementVerifier` (Task 5), `MockUSDG` (Task 6)
- Produces (dipakai Task 8–17):
  - `AegisChannel.Config { address client; address provider; address token; bytes32 termsCommitment; uint32 challengeWindow; uint32 responseWindow; address payoutClient; address payoutProvider; bytes32 salt; }`
  - `AegisChannel.State { UNINIT, OPEN, CLOSING, SETTLED }`; storage publik `cfg()`, `domainSeparator()`, `state()`, `seq()`, `cumulativeAmount()`, `receiptsRoot()`, `deadline()`, `payToClient()`, `proofSeq()`, `hasProof()`; `budget()`, `channelIdField()`
  - `initialize(Config, address opener, bytes sigClient, bytes sigProvider)` (factory-only); `hashChannelTerms(Config) pure`, `hashCheckpoint(uint64,uint128,bytes32) pure`, `hashClose(uint64,uint128) pure`
  - Factory: `salt(Config) pure`, `predict(Config) view → address`, `open(Config, bytes sigClient, bytes sigProvider) → address`, immutables `IMPLEMENTATION`, `VERIFIER`, `PERMIT2`, `MIN_CHALLENGE_WINDOW`; event `ChannelOpened(channel, client, provider, termsCommitment)`
  - Test helper: `Sigs.domain(address channel)`, `Sigs.digest(bytes32 dom, bytes32 structHash)`, `Sigs.sign(uint256 pk, bytes32 digest) → bytes`; `AegisTestBase` dengan `usdg`, `verifier` (mock), `factory`, `client/provider` (+pk), `defaultConfig()`, `termsDigest(cfg)`, `openByClient(cfg)`, `fund(ch, amount)`, `checkpointSigs(ch, seq, amount, root)`, `closeSigs(ch, seq, toProvider)`

- [ ] **Step 1: Helper test & mock**

`contracts/test/utils/Sigs.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

library Sigs {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function domain(address channel) internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("AegisClear"), keccak256("1"), block.chainid, channel));
    }
    function digest(bytes32 dom, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", dom, structHash));
    }
    function sign(uint256 pk, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }
}
```

`contracts/test/mocks/MockVerifier.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockVerifier {
    bool public result;
    constructor(bool r) { result = r; }
    function set(bool r) external { result = r; }
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[6] calldata)
        external view returns (bool) { return result; }
}
```

- [ ] **Step 2: Tulis test factory yang gagal**

`contracts/test/Base.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisChannel} from "../src/AegisChannel.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {Sigs} from "./utils/Sigs.sol";

abstract contract AegisTestBase is Test {
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    MockUSDG internal usdg;
    MockVerifier internal verifier;
    AegisChannelFactory internal factory;
    uint256 internal clientPk = 0xA11CE;
    uint256 internal providerPk = 0xB0B;
    address internal client;
    address internal provider;

    function setUp() public virtual {
        usdg = new MockUSDG();
        verifier = new MockVerifier(true);
        factory = new AegisChannelFactory(address(verifier), PERMIT2, 60);
        client = vm.addr(clientPk);
        provider = vm.addr(providerPk);
        vm.label(client, "client");
        vm.label(provider, "provider");
        usdg.mint(client, 100e6);
    }

    function defaultConfig() internal view returns (AegisChannel.Config memory c) {
        c = AegisChannel.Config({
            client: client, provider: provider, token: address(usdg),
            termsCommitment: bytes32(uint256(12345)),
            challengeWindow: 120, responseWindow: 60,
            payoutClient: client, payoutProvider: provider,
            salt: bytes32(uint256(1))
        });
    }

    function termsDigest(AegisChannel.Config memory c) internal view returns (bytes32) {
        address predicted = factory.predict(c);
        bytes32 structHash = AegisChannel(factory.IMPLEMENTATION()).hashChannelTerms(c);
        return Sigs.digest(Sigs.domain(predicted), structHash);
    }

    function openByClient(AegisChannel.Config memory c) internal returns (AegisChannel ch) {
        bytes memory sigP = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(client);
        ch = AegisChannel(factory.open(c, "", sigP));
    }

    function fund(AegisChannel ch, uint256 amount) internal {
        vm.prank(client);
        usdg.transfer(address(ch), amount);
    }

    function checkpointSigs(AegisChannel ch, uint64 s, uint128 a, bytes32 r)
        internal view returns (bytes memory sc, bytes memory sp)
    {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(s, a, r));
        sc = Sigs.sign(clientPk, d);
        sp = Sigs.sign(providerPk, d);
    }

    function closeSigs(AegisChannel ch, uint64 s, uint128 toProvider)
        internal view returns (bytes memory sc, bytes memory sp)
    {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashClose(s, toProvider));
        sc = Sigs.sign(clientPk, d);
        sp = Sigs.sign(providerPk, d);
    }
}
```

`contracts/test/Factory.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, AegisChannelFactory, Sigs} from "./Base.t.sol";

contract FactoryTest is AegisTestBase {
    function test_predict_matches_open_and_state_open() public {
        AegisChannel.Config memory c = defaultConfig();
        address predicted = factory.predict(c);
        AegisChannel ch = openByClient(c);
        assertEq(address(ch), predicted);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
        (address cl, address pr, address tok, bytes32 T,,,,,) = ch.cfg();
        assertEq(cl, client); assertEq(pr, provider); assertEq(tok, address(usdg)); assertEq(T, c.termsCommitment);
        assertEq(ch.channelIdField(), uint256(uint160(address(ch))));
        assertEq(ch.domainSeparator(), Sigs.domain(address(ch)));
    }

    function test_open_by_third_party_requires_both_sigs() public {
        AegisChannel.Config memory c = defaultConfig();
        bytes32 d = termsDigest(c);
        bytes memory sc = Sigs.sign(clientPk, d);
        bytes memory sp = Sigs.sign(providerPk, d);
        vm.prank(address(0xBEEF));
        AegisChannel ch = AegisChannel(factory.open(c, sc, sp));
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
    }

    function test_open_by_third_party_missing_client_sig_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        bytes memory sp = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(address(0xBEEF));
        vm.expectRevert(AegisChannel.BadSignature.selector);
        factory.open(c, "", sp);
    }

    function test_open_by_client_with_wrong_provider_sig_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        bytes memory bad = Sigs.sign(0xDEAD, termsDigest(c));
        vm.prank(client);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        factory.open(c, "", bad);
    }

    function test_open_window_too_short_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        c.challengeWindow = 59;
        vm.prank(client);
        vm.expectRevert(AegisChannelFactory.WindowTooShort.selector);
        factory.open(c, "", "");
    }

    function test_open_twice_same_config_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        openByClient(c);
        bytes memory sigP = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(client);
        vm.expectRevert();
        factory.open(c, "", sigP);
    }

    function test_direct_initialize_reverts_not_factory() public {
        AegisChannel.Config memory c = defaultConfig();
        AegisChannel ch = openByClient(c);
        vm.expectRevert(AegisChannel.NotFactory.selector);
        ch.initialize(c, client, "", "");
    }

    function test_bad_config_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        c.responseWindow = 121; // > challengeWindow
        vm.prank(client);
        vm.expectRevert(AegisChannel.BadConfig.selector);
        factory.open(c, "", Sigs.sign(providerPk, termsDigest(c)));
    }
}
```

Run: `cd contracts && forge test --match-contract FactoryTest && cd ..`
Expected: gagal kompilasi — `AegisChannel.sol` tidak ada.

- [ ] **Step 3: Tulis `AegisChannel` (skeleton) dan factory**

`contracts/src/AegisChannel.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {ISLASettlementVerifier} from "./interfaces/ISLASettlementVerifier.sol";

/// @title AegisChannel — micro-escrow channel USDG per pasangan agen (spec §8.1).
/// @dev Satu clone EIP-1167 per channel; alamat = atribusi. Tidak ada owner/pause/upgrade.
contract AegisChannel is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { UNINIT, OPEN, CLOSING, SETTLED }

    struct Config {
        address client;
        address provider;
        address token;            // USDG
        bytes32 termsCommitment;  // T = Poseidon(terms)
        uint32  challengeWindow;
        uint32  responseWindow;
        address payoutClient;
        address payoutProvider;
        bytes32 salt;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant CHANNEL_TERMS_TYPEHASH = keccak256(
        "ChannelTerms(address client,address provider,address token,bytes32 termsCommitment,uint32 challengeWindow,uint32 responseWindow,address payoutClient,address payoutProvider,bytes32 salt)"
    );
    bytes32 public constant CHECKPOINT_TYPEHASH =
        keccak256("Checkpoint(uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)");
    bytes32 public constant CLOSE_TYPEHASH = keccak256("Close(uint64 seq,uint128 toProvider)");
    uint64 public constant MAX_SEQ = 128;

    address public immutable FACTORY;
    ISLASettlementVerifier public immutable VERIFIER;
    ISignatureTransfer public immutable PERMIT2;

    Config public cfg;
    bytes32 public domainSeparator;
    State public state;
    uint64 public seq;
    uint128 public cumulativeAmount;   // A
    bytes32 public receiptsRoot;       // R
    uint64 public deadline;            // hanya bermakna di CLOSING
    uint128 public payToClient;        // hasil bukti tertunda
    uint64 public proofSeq;            // seq yang dibuktikan
    bool public hasProof;

    event Opened(address indexed client, address indexed provider, bytes32 termsCommitment, uint32 challengeWindow);
    event Funded(address indexed from, uint256 amount);
    event CheckpointSubmitted(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline);
    event PenaltyClaimed(address indexed by, uint64 seq, uint128 payToClient);
    event Settled(uint64 seq, uint128 cumulativeAmount, uint256 penalty, uint256 toProvider, uint256 toClient, bool cooperative);
    event Swept(uint256 amount);
    // Bentuk ERC-8183 (FR-27)
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

    error NotFactory();
    error AlreadyInitialized();
    error BadConfig();
    error BadSignature();
    error WrongState();
    error StaleCheckpoint();
    error SeqTooLarge();
    error NotParty();
    error ExceedsCumulative();
    error InvalidProof();
    error TooEarly();
    error ExceedsBudget();
    error WrongToken();

    constructor(address verifier, address permit2) {
        FACTORY = msg.sender;
        VERIFIER = ISLASettlementVerifier(verifier);
        PERMIT2 = ISignatureTransfer(permit2);
        state = State.SETTLED; // implementasi tidak pernah dipakai langsung
    }

    /// @notice Dipanggil factory tepat setelah clone. Untuk tiap pihak: opener == pihak ATAU tanda tangan ChannelTerms sah (FR-2).
    function initialize(Config calldata c, address opener, bytes calldata sigClient, bytes calldata sigProvider) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (state != State.UNINIT) revert AlreadyInitialized();
        if (c.client == address(0) || c.provider == address(0) || c.client == c.provider || c.token == address(0)) revert BadConfig();
        if (c.payoutClient == address(0) || c.payoutProvider == address(0)) revert BadConfig();
        if (c.responseWindow > c.challengeWindow) revert BadConfig();
        cfg = c;
        domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("AegisClear"), keccak256("1"), block.chainid, address(this))
        );
        bytes32 d = _digest(hashChannelTerms(c));
        if (opener != c.client && !SignatureChecker.isValidSignatureNow(c.client, d, sigClient)) revert BadSignature();
        if (opener != c.provider && !SignatureChecker.isValidSignatureNow(c.provider, d, sigProvider)) revert BadSignature();
        state = State.OPEN;
        emit Opened(c.client, c.provider, c.termsCommitment, c.challengeWindow);
    }

    // ---------- views ----------
    function budget() public view returns (uint256) { return IERC20(cfg.token).balanceOf(address(this)); }
    function channelIdField() public view returns (uint256) { return uint256(uint160(address(this))); }

    function hashChannelTerms(Config memory c) public pure returns (bytes32) {
        return keccak256(abi.encode(
            CHANNEL_TERMS_TYPEHASH, c.client, c.provider, c.token, c.termsCommitment,
            c.challengeWindow, c.responseWindow, c.payoutClient, c.payoutProvider, c.salt
        ));
    }
    function hashCheckpoint(uint64 seq_, uint128 amount, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(CHECKPOINT_TYPEHASH, seq_, amount, root));
    }
    function hashClose(uint64 seq_, uint128 toProvider) public pure returns (bytes32) {
        return keccak256(abi.encode(CLOSE_TYPEHASH, seq_, toProvider));
    }

    // ---------- internal ----------
    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
    function _requireBothSigned(bytes32 structHash, bytes calldata sigClient, bytes calldata sigProvider) internal view {
        bytes32 d = _digest(structHash);
        if (!SignatureChecker.isValidSignatureNow(cfg.client, d, sigClient)) revert BadSignature();
        if (!SignatureChecker.isValidSignatureNow(cfg.provider, d, sigProvider)) revert BadSignature();
    }
}
```

`contracts/src/AegisChannelFactory.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AegisChannel} from "./AegisChannel.sol";

/// @title AegisChannelFactory — CREATE2 clone per Config; predict() sebelum open() (spec §8.5).
contract AegisChannelFactory {
    address public immutable IMPLEMENTATION;
    address public immutable VERIFIER;
    address public immutable PERMIT2;
    uint32 public immutable MIN_CHALLENGE_WINDOW;

    event ChannelOpened(address indexed channel, address indexed client, address indexed provider, bytes32 termsCommitment);
    error WindowTooShort();

    constructor(address verifier, address permit2, uint32 minChallengeWindow) {
        IMPLEMENTATION = address(new AegisChannel(verifier, permit2));
        VERIFIER = verifier;
        PERMIT2 = permit2;
        MIN_CHALLENGE_WINDOW = minChallengeWindow;
    }

    function salt(AegisChannel.Config calldata c) public pure returns (bytes32) { return keccak256(abi.encode(c)); }

    function predict(AegisChannel.Config calldata c) external view returns (address) {
        return Clones.predictDeterministicAddress(IMPLEMENTATION, salt(c), address(this));
    }

    /// @notice Tanda tangan boleh kosong untuk pihak yang == msg.sender.
    function open(AegisChannel.Config calldata c, bytes calldata sigClient, bytes calldata sigProvider)
        external returns (address channel)
    {
        if (c.challengeWindow < MIN_CHALLENGE_WINDOW) revert WindowTooShort();
        channel = Clones.cloneDeterministic(IMPLEMENTATION, salt(c));
        AegisChannel(channel).initialize(c, msg.sender, sigClient, sigProvider);
        emit ChannelOpened(channel, c.client, c.provider, c.termsCommitment);
    }
}
```

- [ ] **Step 4: Jalankan test factory**

Run: `cd contracts && forge test --match-contract FactoryTest -vv && cd ..`
Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/src/AegisChannelFactory.sol contracts/test
git commit -m "feat(contracts): AegisChannel skeleton with EIP-712 initialize and CREATE2 clone factory"
```

---

### Task 8: `submitCheckpoint` + `settle` (jalur default, FR-12/13/16/17)

**Files:**
- Modify: `contracts/src/AegisChannel.sol` (tambah 3 fungsi setelah bagian `views`)
- Test: `contracts/test/Checkpoint.t.sol`

**Interfaces:**
- Produces: `submitCheckpoint(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, bytes sigClient, bytes sigProvider)` (permissionless, butuh dua tanda tangan); `settle()` (permissionless setelah `deadline`); internal `_payout(uint256 owedToProvider, uint256 penalty, bool cooperative)` (dipakai Task 9).

- [ ] **Step 1: Tulis test yang gagal**

`contracts/test/Checkpoint.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

contract CheckpointTest is AegisTestBase {
    AegisChannel ch;
    bytes32 constant ROOT = bytes32(uint256(777));

    function setUp() public override {
        super.setUp();
        ch = openByClient(defaultConfig());
        fund(ch, 5_000_000); // 5.00 USDG
    }

    function _cp(uint64 s, uint128 a) internal {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, s, a, ROOT);
        ch.submitCheckpoint(s, a, ROOT, sc, sp);
    }

    function test_checkpoint_opens_window() public {
        uint256 t0 = block.timestamp;
        _cp(100, 2_000_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.CLOSING));
        assertEq(ch.seq(), 100); assertEq(ch.cumulativeAmount(), 2_000_000); assertEq(ch.receiptsRoot(), ROOT);
        assertEq(ch.deadline(), t0 + 120);
    }

    function test_checkpoint_requires_both_valid_sigs() public {
        (bytes memory sc,) = checkpointSigs(ch, 1, 20_000, ROOT);
        bytes memory bad = Sigs.sign(0xDEAD, Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(1, 20_000, ROOT)));
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.submitCheckpoint(1, 20_000, ROOT, sc, bad);
    }

    function test_seq_too_large_reverts() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 129, 1, ROOT);
        vm.expectRevert(AegisChannel.SeqTooLarge.selector);
        ch.submitCheckpoint(129, 1, ROOT, sc, sp);
    }

    function test_stale_seq_reverts_in_closing() public {
        _cp(50, 1_000_000);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
    }

    function test_newer_checkpoint_replaces_and_extends() public {
        uint256 t0 = block.timestamp;
        _cp(50, 1_000_000);
        vm.warp(t0 + 100);
        _cp(100, 2_000_000);
        assertEq(ch.seq(), 100);
        assertEq(ch.deadline(), t0 + 160); // max(t0+120, t0+100+60)
    }

    function test_newer_checkpoint_never_shrinks_deadline() public {
        uint256 t0 = block.timestamp;
        _cp(50, 1_000_000);
        vm.warp(t0 + 10);
        _cp(60, 1_200_000);
        assertEq(ch.deadline(), t0 + 120);
    }

    function test_settle_too_early_reverts() public {
        _cp(100, 2_000_000);
        vm.expectRevert(AegisChannel.TooEarly.selector);
        ch.settle();
    }

    function test_settle_wrong_state_reverts() public {
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.settle();
    }

    function test_settle_default_pays_A_then_remainder() public {
        _cp(100, 2_000_000);
        vm.warp(block.timestamp + 120);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        vm.prank(address(0xCAFE)); // siapa pun
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 2_000_000);
        assertEq(usdg.balanceOf(client) - c0, 3_000_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_settle_caps_at_budget_when_A_exceeds() public {
        _cp(100, 9_000_000);
        vm.warp(block.timestamp + 120);
        uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 5_000_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
    }

    function test_settle_twice_reverts() public {
        _cp(1, 20_000);
        vm.warp(block.timestamp + 120);
        ch.settle();
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.settle();
    }
}
```
Run: `cd contracts && forge test --match-contract CheckpointTest && cd ..`
Expected: gagal kompilasi — `submitCheckpoint`/`settle` belum ada.

- [ ] **Step 2: Implementasi**

Tambahkan ke `AegisChannel.sol` setelah bagian `// ---------- views ----------` (sebelum `// ---------- internal ----------`):
```solidity
    // ---------- checkpoint & settle ----------
    /// @notice Checkpoint co-signed. OPEN → mulai jendela; CLOSING → hanya seq lebih tinggi, perpanjang ≤ responseWindow (FR-12/13).
    function submitCheckpoint(uint64 seq_, uint128 amount, bytes32 root, bytes calldata sigClient, bytes calldata sigProvider)
        external
    {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (seq_ > MAX_SEQ) revert SeqTooLarge();
        if (state == State.CLOSING && seq_ <= seq) revert StaleCheckpoint();
        _requireBothSigned(hashCheckpoint(seq_, amount, root), sigClient, sigProvider);
        seq = seq_;
        cumulativeAmount = amount;
        receiptsRoot = root;
        hasProof = false; // FR-15: bukti lama gugur
        uint64 nowTs = uint64(block.timestamp);
        if (state == State.OPEN) {
            state = State.CLOSING;
            deadline = nowTs + cfg.challengeWindow;
        } else {
            uint64 ext = nowTs + cfg.responseWindow;
            if (ext > deadline) deadline = ext;
        }
        emit CheckpointSubmitted(seq_, amount, root, deadline);
    }

    /// @notice Permissionless setelah deadline (FR-16). Penalti hanya dari bukti atas state saat ini.
    function settle() external nonReentrant {
        if (state != State.CLOSING) revert WrongState();
        if (block.timestamp < deadline) revert TooEarly();
        uint256 pen = (hasProof && proofSeq == seq) ? payToClient : 0;
        _payout(uint256(cumulativeAmount) - pen, pen, false);
    }

    /// @dev toProvider = min(owed, budget); sisa selalu ke klien (FR-17). Efek sebelum interaksi.
    function _payout(uint256 owedToProvider, uint256 penalty, bool cooperative) internal {
        uint256 b = budget();
        uint256 toProvider = owedToProvider < b ? owedToProvider : b;
        uint256 toClient = b - toProvider;
        state = State.SETTLED;
        IERC20 t = IERC20(cfg.token);
        if (toProvider > 0) t.safeTransfer(cfg.payoutProvider, toProvider);
        if (toClient > 0) t.safeTransfer(cfg.payoutClient, toClient);
        uint256 jobId = channelIdField();
        emit Settled(seq, cumulativeAmount, penalty, toProvider, toClient, cooperative);
        emit PaymentReleased(jobId, cfg.provider, toProvider);
        emit Refunded(jobId, cfg.client, toClient);
    }
```

- [ ] **Step 3: Jalankan test**

Run: `cd contracts && forge test --match-contract CheckpointTest -vv && cd ..`
Expected: 11 PASS.

- [ ] **Step 4: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/test/Checkpoint.t.sol
git commit -m "feat(contracts): co-signed checkpoints with challenge window and default settlement"
```

---
### Task 9: `closeCooperative` + `sweep` (FR-11, FR-6)

**Files:**
- Modify: `contracts/src/AegisChannel.sol`
- Test: `contracts/test/Cooperative.t.sol`

**Interfaces:**
- Produces: `closeCooperative(uint64 seq, uint128 toProvider, bytes sigClient, bytes sigProvider)` (seketika; `toClient = budget − toProvider`); `sweep()` (SETTLED → sisa ke `payoutClient`).

- [ ] **Step 1: Tulis test yang gagal**

`contracts/test/Cooperative.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

contract CooperativeTest is AegisTestBase {
    AegisChannel ch;
    bytes32 constant ROOT = bytes32(uint256(777));

    function setUp() public override {
        super.setUp();
        ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
    }

    function _close(uint64 s, uint128 toProvider) internal {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        ch.closeCooperative(s, toProvider, sc, sp);
    }

    function test_close_from_open_pays_split_immediately() public {
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        _close(100, 2_000_000);
        assertEq(usdg.balanceOf(provider) - p0, 2_000_000);
        assertEq(usdg.balanceOf(client) - c0, 3_000_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
        assertEq(ch.seq(), 100);
    }

    function test_close_from_closing_with_higher_or_equal_seq() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        _close(50, 1_000_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_close_with_lower_seq_reverts() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        (bytes memory c2, bytes memory p2) = closeSigs(ch, 49, 900_000);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.closeCooperative(49, 900_000, c2, p2);
    }

    function test_close_exceeding_budget_reverts() public {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 5_000_001);
        vm.expectRevert(AegisChannel.ExceedsBudget.selector);
        ch.closeCooperative(1, 5_000_001, sc, sp);
    }

    function test_close_requires_both_sigs() public {
        (bytes memory sc,) = closeSigs(ch, 1, 1);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.closeCooperative(1, 1, sc, sc);
    }

    function test_close_replay_after_settled_reverts() public {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 1_000_000);
        ch.closeCooperative(1, 1_000_000, sc, sp);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.closeCooperative(1, 1_000_000, sc, sp);
    }

    function test_sweep_only_after_settled_and_sends_late_funds_to_client() public {
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.sweep();
        _close(1, 1_000_000);
        fund(ch, 250_000); // dana masuk belakangan
        uint256 c0 = usdg.balanceOf(client);
        vm.prank(address(0xCAFE));
        ch.sweep();
        assertEq(usdg.balanceOf(client) - c0, 250_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
    }
}
```
Run: `cd contracts && forge test --match-contract CooperativeTest && cd ..`
Expected: gagal kompilasi.

- [ ] **Step 2: Implementasi**

Tambahkan ke `AegisChannel.sol` setelah `settle()`:
```solidity
    /// @notice Cooperative close: kedua pihak menandatangani Close(seq, toProvider); sisa ke klien; seketika (FR-11).
    function closeCooperative(uint64 seq_, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider)
        external nonReentrant
    {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (seq_ > MAX_SEQ) revert SeqTooLarge();
        if (seq_ < seq) revert StaleCheckpoint();
        _requireBothSigned(hashClose(seq_, toProvider), sigClient, sigProvider);
        if (toProvider > budget()) revert ExceedsBudget();
        seq = seq_;
        hasProof = false;
        _payout(toProvider, 0, true);
    }

    /// @notice Setelah SETTLED: dana yang masuk belakangan → payoutClient (FR-6). Siapa pun boleh memanggil.
    function sweep() external nonReentrant {
        if (state != State.SETTLED) revert WrongState();
        uint256 b = budget();
        if (b > 0) IERC20(cfg.token).safeTransfer(cfg.payoutClient, b);
        emit Swept(b);
    }
```

- [ ] **Step 3: Jalankan test**

Run: `cd contracts && forge test --match-contract CooperativeTest -vv && cd ..`
Expected: 7 PASS.

- [ ] **Step 4: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/test/Cooperative.t.sol
git commit -m "feat(contracts): cooperative close and post-settlement sweep"
```

---

### Task 10: `claimPenalty` dengan bukti Groth16 asli (FFI) + FR-18

**Files:**
- Modify: `contracts/src/AegisChannel.sol`
- Test: `contracts/test/Penalty.t.sol`

**Interfaces:**
- Consumes: `SLASettlementVerifier` (Task 5), `circuits/scripts/prove.ts` via `vm.ffi` (Task 5)
- Produces: `claimPenalty(uint256[8] proof, uint128 payToClient)` — hanya `client`/`provider`, state `CLOSING`, input publik `[channelIdField, T, R, seq, A, payToClient]` dari storage, `payToClient ≤ A` sebelum verifikasi.

- [ ] **Step 1: Tulis test yang gagal**

`contracts/test/Penalty.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, AegisChannelFactory, Sigs} from "./Base.t.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";

/// @dev Memakai bukti asli: `npx tsx ../circuits/scripts/prove.ts` lewat vm.ffi (cwd = contracts/). Butuh setup.sh sudah dijalankan.
contract PenaltyTest is AegisTestBase {
    SLASettlementVerifier realVerifier;
    AegisChannelFactory realFactory;
    AegisChannel ch;
    uint256[8] proof;
    uint256[6] inputs;

    function _cmd(bool termsOnly, address channel) internal pure returns (string[] memory cmd) {
        cmd = new string[](termsOnly ? 6 : 7);
        cmd[0] = "npx"; cmd[1] = "tsx"; cmd[2] = "../circuits/scripts/prove.ts";
        cmd[3] = "--vector"; cmd[4] = "EX1_7_latency_breaches";
        if (termsOnly) { cmd[5] = "--terms-only"; }
        else { cmd[5] = "--channel"; cmd[6] = vm.toString(channel); }
    }

    function setUp() public override {
        super.setUp();
        realVerifier = new SLASettlementVerifier();
        realFactory = new AegisChannelFactory(address(realVerifier), PERMIT2, 60);
        uint256 T = abi.decode(vm.ffi(_cmd(true, address(0))), (uint256));
        AegisChannel.Config memory c = defaultConfig();
        c.termsCommitment = bytes32(T);
        address predicted = realFactory.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(realFactory.IMPLEMENTATION()).hashChannelTerms(c));
        vm.prank(client);
        ch = AegisChannel(realFactory.open(c, "", Sigs.sign(providerPk, d)));
        fund(ch, 5_000_000);
        (proof, inputs) = abi.decode(vm.ffi(_cmd(false, address(ch))), (uint256[8], uint256[6]));
        assertEq(inputs[0], ch.channelIdField());
        assertEq(inputs[1], T);
        assertEq(inputs[3], 100); assertEq(inputs[4], 2_000_000); assertEq(inputs[5], 70_000);
    }

    function _checkpointEx1(bytes32 root) internal {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 100, 2_000_000, root);
        ch.submitCheckpoint(100, 2_000_000, root, sc, sp);
    }

    function test_claim_ex1_then_settle_pays_proportionally() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(client);
        ch.claimPenalty(proof, 70_000);
        assertTrue(ch.hasProof()); assertEq(ch.payToClient(), 70_000); assertEq(ch.proofSeq(), 100);
        vm.warp(block.timestamp + 120);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 1_930_000);
        assertEq(usdg.balanceOf(client) - c0, 3_070_000); // 70.000 penalti + 3.000.000 sisa budget
    }

    function test_provider_may_also_submit_same_proof() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(provider);
        ch.claimPenalty(proof, 70_000);
        assertEq(ch.payToClient(), 70_000);
    }

    function test_wrong_amount_is_invalid_proof() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(client);
        vm.expectRevert(AegisChannel.InvalidProof.selector);
        ch.claimPenalty(proof, 70_001);
    }

    function test_proof_against_other_root_rejected() public {
        _checkpointEx1(bytes32(uint256(1)));
        vm.prank(client);
        vm.expectRevert(AegisChannel.InvalidProof.selector);
        ch.claimPenalty(proof, 70_000);
    }

    function test_non_party_reverts() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(address(0xBEEF));
        vm.expectRevert(AegisChannel.NotParty.selector);
        ch.claimPenalty(proof, 70_000);
    }

    function test_claim_in_open_reverts() public {
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.claimPenalty(proof, 70_000);
    }

    function test_newer_checkpoint_voids_proof() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(client);
        ch.claimPenalty(proof, 70_000);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 101, 2_020_000, bytes32(uint256(2)));
        ch.submitCheckpoint(101, 2_020_000, bytes32(uint256(2)), sc, sp);
        assertFalse(ch.hasProof());
        vm.warp(block.timestamp + 200);
        uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 2_020_000);
    }

    function test_fr18_exceeds_cumulative_reverts_even_if_verifier_says_true() public {
        // factory dari Base memakai MockVerifier(true)
        AegisChannel m = openByClient(defaultConfig());
        fund(m, 1_000_000);
        (bytes memory sc, bytes memory sp) = checkpointSigs(m, 5, 100_000, bytes32(uint256(9)));
        m.submitCheckpoint(5, 100_000, bytes32(uint256(9)), sc, sp);
        uint256[8] memory dummy;
        vm.prank(client);
        vm.expectRevert(AegisChannel.ExceedsCumulative.selector);
        m.claimPenalty(dummy, 100_001);
        vm.prank(client);
        m.claimPenalty(dummy, 100_000);
        assertEq(m.payToClient(), 100_000);
    }
}
```
Run: `cd contracts && forge test --match-contract PenaltyTest && cd ..`
Expected: gagal kompilasi — `claimPenalty` belum ada.

- [ ] **Step 2: Implementasi**

Tambahkan ke `AegisChannel.sol` setelah `submitCheckpoint`:
```solidity
    /// @notice Klaim penalti dengan bukti Groth16 atas state saat ini (FR-14). Hanya pihak; payToClient ≤ A dipaksakan kontrak (FR-18).
    function claimPenalty(uint256[8] calldata p, uint128 payToClient_) external {
        if (msg.sender != cfg.client && msg.sender != cfg.provider) revert NotParty();
        if (state != State.CLOSING) revert WrongState();
        if (payToClient_ > cumulativeAmount) revert ExceedsCumulative();
        uint256[6] memory inputs = [
            channelIdField(), uint256(cfg.termsCommitment), uint256(receiptsRoot),
            uint256(seq), uint256(cumulativeAmount), uint256(payToClient_)
        ];
        if (!VERIFIER.verifyProof([p[0], p[1]], [[p[2], p[3]], [p[4], p[5]]], [p[6], p[7]], inputs)) revert InvalidProof();
        payToClient = payToClient_;
        proofSeq = seq;
        hasProof = true;
        emit PenaltyClaimed(msg.sender, seq, payToClient_);
    }
```

- [ ] **Step 3: Jalankan test (proving ±10–30 s per test karena FFI di setUp)**

Run: `cd contracts && forge test --match-contract PenaltyTest -vv && cd ..`
Expected: 8 PASS. Jika `vm.ffi` gagal dengan "command not found": pastikan `npx` ada di PATH shell non-interaktif (`which npx`), atau ganti `cmd[0]` menjadi path absolut `$(which npx)`.

- [ ] **Step 4: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/test/Penalty.t.sol
git commit -m "feat(contracts): claimPenalty verifies Groth16 proof bound to current channel state"
```

---
### Task 11: `fundWithPermit2` + settlement x402 ke alamat `predict()` (bytecode kanonik di-etch)

**Files:**
- Modify: `contracts/src/AegisChannel.sol`
- Test: `contracts/test/Permit2.t.sol`

**Interfaces:**
- Consumes: fixture `permit2.bytecode`, `x402proxy.bytecode` (Task 6); `factory.predict` (Task 7)
- Produces: `fundWithPermit2(ISignatureTransfer.PermitTransferFrom permit, bytes signature)` — `owner = msg.sender`, `to = channel`, token harus `cfg.token`; bukti bahwa `x402ExactPermit2Proxy.settle(...)` kanonik mendanai alamat channel **sebelum** `open` (FR-23 sisi on-chain, T19).

- [ ] **Step 1: Tulis test yang gagal**

`contracts/test/Permit2.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";

interface IPermit2Domain { function DOMAIN_SEPARATOR() external view returns (bytes32); }

interface IX402ExactPermit2Proxy {
    struct Witness { address to; uint256 validAfter; }
    function settle(ISignatureTransfer.PermitTransferFrom calldata permit, address owner, Witness calldata witness, bytes calldata signature) external;
}

contract Permit2Test is AegisTestBase {
    address constant X402_PROXY = 0x402085c248EeA27D92E8b30b2C58ed07f9E20001;
    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_TRANSFER_FROM_TYPEHASH =
        keccak256("PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)");   // EIP-712 encodeType: struct yang dirujuk ikut di-append (Permit2 PermitHash.sol)
    string constant WITNESS_TYPE_STRING =
        "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter)";
    bytes32 constant WITNESS_TYPEHASH = keccak256("Witness(address to,uint256 validAfter)");
    bytes32 immutable PERMIT_WITNESS_TYPEHASH = keccak256(abi.encodePacked(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,", WITNESS_TYPE_STRING));

    function setUp() public override {
        super.setUp();
        vm.etch(PERMIT2, vm.parseBytes(vm.readFile("test/fixtures/permit2.bytecode")));
        vm.etch(X402_PROXY, vm.parseBytes(vm.readFile("test/fixtures/x402proxy.bytecode")));
        vm.label(PERMIT2, "Permit2"); vm.label(X402_PROXY, "x402ExactPermit2Proxy");
        vm.warp(1_700_000_000);
        vm.prank(client);
        usdg.approve(PERMIT2, type(uint256).max);
    }

    function _permit(address token, uint256 amount, uint256 nonce) internal view returns (ISignatureTransfer.PermitTransferFrom memory p) {
        p = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: amount}),
            nonce: nonce, deadline: block.timestamp + 1 hours
        });
    }
    function _tokenPermHash(ISignatureTransfer.PermitTransferFrom memory p) internal pure returns (bytes32) {
        return keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, p.permitted.token, p.permitted.amount));
    }
    function _domainDigest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", IPermit2Domain(PERMIT2).DOMAIN_SEPARATOR(), structHash));
    }
    function _signPlain(ISignatureTransfer.PermitTransferFrom memory p, address spender) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, _tokenPermHash(p), spender, p.nonce, p.deadline));
        return Sigs.sign(clientPk, _domainDigest(structHash));
    }
    function _signWitness(ISignatureTransfer.PermitTransferFrom memory p, address spender, address to, uint256 validAfter)
        internal view returns (bytes memory)
    {
        bytes32 witnessHash = keccak256(abi.encode(WITNESS_TYPEHASH, to, validAfter));
        bytes32 structHash = keccak256(abi.encode(PERMIT_WITNESS_TYPEHASH, _tokenPermHash(p), spender, p.nonce, p.deadline, witnessHash));
        return Sigs.sign(clientPk, _domainDigest(structHash));
    }

    function test_fundWithPermit2_credits_budget() public {
        AegisChannel ch = openByClient(defaultConfig());
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), 1_500_000, 1);
        bytes memory sig = _signPlain(p, address(ch));
        vm.prank(client);
        ch.fundWithPermit2(p, sig);
        assertEq(ch.budget(), 1_500_000);
        assertEq(usdg.balanceOf(client), 100e6 - 1_500_000);
    }

    function test_fundWithPermit2_wrong_token_reverts() public {
        AegisChannel ch = openByClient(defaultConfig());
        MockUSDG other = new MockUSDG();
        other.mint(client, 10e6);
        vm.prank(client); other.approve(PERMIT2, type(uint256).max);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(other), 1, 2);
        bytes memory sig = _signPlain(p, address(ch));
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongToken.selector);
        ch.fundWithPermit2(p, sig);
    }

    function test_x402_proxy_settles_into_predicted_address_before_open() public {
        AegisChannel.Config memory c = defaultConfig();
        address predicted = factory.predict(c);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), 2_000_000, 7);
        uint256 validAfter = block.timestamp - 1;
        bytes memory sig = _signWitness(p, X402_PROXY, predicted, validAfter);
        vm.prank(address(0xFAC1));  // facilitator mana pun, tidak perlu tahu AegisClear
        IX402ExactPermit2Proxy(X402_PROXY).settle(p, client, IX402ExactPermit2Proxy.Witness({to: predicted, validAfter: validAfter}), sig);
        assertEq(usdg.balanceOf(predicted), 2_000_000);
        AegisChannel ch = openByClient(c);
        assertEq(address(ch), predicted);
        assertEq(ch.budget(), 2_000_000);
    }

    function test_x402_witness_destination_cannot_be_redirected() public {
        AegisChannel.Config memory c = defaultConfig();
        address predicted = factory.predict(c);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), 2_000_000, 8);
        uint256 validAfter = block.timestamp - 1;
        bytes memory sig = _signWitness(p, X402_PROXY, predicted, validAfter);
        vm.prank(address(0xFAC1));
        vm.expectRevert(); // Permit2: InvalidSigner
        IX402ExactPermit2Proxy(X402_PROXY).settle(p, client, IX402ExactPermit2Proxy.Witness({to: address(0xBAD), validAfter: validAfter}), sig);
    }
}
```
Run: `cd contracts && forge test --match-contract Permit2Test && cd ..`
Expected: gagal kompilasi — `fundWithPermit2` belum ada.

- [ ] **Step 2: Implementasi**

Tambahkan ke `AegisChannel.sol` sebelum `// ---------- checkpoint & settle ----------`:
```solidity
    // ---------- funding ----------
    /// @notice Pendanaan tanpa allowance langsung ke channel: Permit2 permitTransferFrom, owner = msg.sender (FR-3).
    /// @dev Transfer ERC-20 biasa (termasuk settlement x402 ke alamat ini) juga sah — budget() = saldo.
    function fundWithPermit2(ISignatureTransfer.PermitTransferFrom calldata permit, bytes calldata signature) external {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (permit.permitted.token != cfg.token) revert WrongToken();
        PERMIT2.permitTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: permit.permitted.amount}),
            msg.sender,
            signature
        );
        emit Funded(msg.sender, permit.permitted.amount);
        emit JobFunded(channelIdField(), msg.sender, permit.permitted.amount);
    }
```

- [ ] **Step 3: Jalankan test**

Run: `cd contracts && forge test --match-contract Permit2Test -vv && cd ..`
Expected: 4 PASS. Jika `test_x402_proxy_settles_…` gagal dengan `InvalidSigner`: periksa `PERMIT_WITNESS_TYPEHASH` (string harus persis seperti di proxy kanonik: `Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter)`).

- [ ] **Step 4: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/test/Permit2.t.sol
git commit -m "feat(contracts): Permit2 funding and x402 proxy settlement into predicted channel address"
```

---

### Task 12: ERC-1271 (agen di smart account) + invariant & fuzz

**Files:**
- Create: `contracts/test/mocks/Mock1271Wallet.sol`
- Test: `contracts/test/Wallet1271.t.sol`, `contracts/test/Invariant.t.sol`

**Interfaces:**
- Consumes: seluruh API `AegisChannel` (Task 7–11)
- Produces: bukti INV-1, INV-2, INV-5, INV-9 (fuzz/invariant Foundry); FR-5 (1271).

- [ ] **Step 1: Mock wallet 1271 & test**

`contracts/test/mocks/Mock1271Wallet.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Smart account minimal: sah jika ditandatangani owner (pola SimpleAccount 4337).
contract Mock1271Wallet is IERC1271 {
    address public immutable owner;
    constructor(address o) { owner = o; }
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (address rec,,) = ECDSA.tryRecover(hash, sig);
        return rec == owner ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}
```

`contracts/test/Wallet1271.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {Mock1271Wallet} from "./mocks/Mock1271Wallet.sol";

contract Wallet1271Test is AegisTestBase {
    Mock1271Wallet wallet;

    function setUp() public override {
        super.setUp();
        wallet = new Mock1271Wallet(vm.addr(clientPk)); // klien = smart account, owner = clientPk
        usdg.mint(address(wallet), 10e6);
    }

    function test_channel_with_1271_client_end_to_end() public {
        AegisChannel.Config memory c = defaultConfig();
        c.client = address(wallet); c.payoutClient = address(wallet);
        address predicted = factory.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(factory.IMPLEMENTATION()).hashChannelTerms(c));
        // provider membuka dengan tanda tangan owner wallet (dicek via isValidSignature)
        vm.prank(provider);
        AegisChannel ch = AegisChannel(factory.open(c, Sigs.sign(clientPk, d), ""));
        vm.prank(address(wallet)); usdg.transfer(address(ch), 3_000_000);
        bytes32 cd = Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(10, 200_000, bytes32(uint256(5))));
        ch.submitCheckpoint(10, 200_000, bytes32(uint256(5)), Sigs.sign(clientPk, cd), Sigs.sign(providerPk, cd));
        vm.warp(block.timestamp + 120);
        ch.settle();
        assertEq(usdg.balanceOf(address(wallet)), 10e6 - 200_000);
        assertEq(usdg.balanceOf(provider), 200_000);
    }

    function test_1271_rejects_non_owner_signature() public {
        AegisChannel.Config memory c = defaultConfig();
        c.client = address(wallet); c.payoutClient = address(wallet);
        address predicted = factory.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(factory.IMPLEMENTATION()).hashChannelTerms(c));
        vm.prank(provider);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        factory.open(c, Sigs.sign(0xDEAD, d), "");
    }
}
```
Run: `cd contracts && forge test --match-contract Wallet1271Test -vv && cd ..`
Expected: 2 PASS (tanpa perubahan kontrak — `SignatureChecker` sudah menangani 1271).

- [ ] **Step 2: Invariant handler & fuzz**

`contracts/test/Invariant.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {MockUSDG} from "../src/MockUSDG.sol";

contract Handler is Test {
    AegisChannel public ch;
    MockUSDG usdg;
    uint256 clientPk; uint256 providerPk; address client; address provider;

    uint256 public totalFunded;
    uint256 public settledBudget;
    uint256 public paidProvider;
    uint256 public paidClient;
    uint256 public penaltyAtSettle;
    uint128 public amountAtSettle;
    bool public settled;
    bool public cooperative;

    constructor(AegisChannel _ch, MockUSDG _usdg, uint256 _cpk, uint256 _ppk, address _c, address _p) {
        ch = _ch; usdg = _usdg; clientPk = _cpk; providerPk = _ppk; client = _c; provider = _p;
    }

    function _cpSigs(uint64 s, uint128 a, bytes32 r) internal view returns (bytes memory, bytes memory) {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(s, a, r));
        return (Sigs.sign(clientPk, d), Sigs.sign(providerPk, d));
    }

    function fund(uint96 amt) external {
        if (settled) return;
        amt = uint96(bound(amt, 0, 10e6));
        usdg.mint(address(ch), amt);
        totalFunded += amt;
    }

    function checkpoint(uint8 s, uint96 a) external {
        if (settled) return;
        uint64 seq_ = uint64(bound(s, 0, 128));
        uint128 a_ = uint128(bound(a, 0, 20e6));
        if (ch.state() == AegisChannel.State.CLOSING && seq_ <= ch.seq()) return;
        (bytes memory sc, bytes memory sp) = _cpSigs(seq_, a_, bytes32(uint256(seq_) + 1));
        ch.submitCheckpoint(seq_, a_, bytes32(uint256(seq_) + 1), sc, sp);
    }

    function claim(uint96 pc) external {
        if (settled || ch.state() != AegisChannel.State.CLOSING) return;
        uint128 pc_ = uint128(bound(pc, 0, ch.cumulativeAmount()));
        uint256[8] memory dummy;
        vm.prank(client);
        ch.claimPenalty(dummy, pc_);   // MockVerifier(true)
    }

    function warpAndSettle() external {
        if (settled || ch.state() != AegisChannel.State.CLOSING) return;
        vm.warp(ch.deadline());
        penaltyAtSettle = (ch.hasProof() && ch.proofSeq() == ch.seq()) ? ch.payToClient() : 0;
        amountAtSettle = ch.cumulativeAmount();
        settledBudget = usdg.balanceOf(address(ch));
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.settle();
        paidProvider = usdg.balanceOf(provider) - p0;
        paidClient = usdg.balanceOf(client) - c0;
        settled = true;
    }

    function closeCoop(uint96 toProv) external {
        if (settled) return;
        uint128 tp = uint128(bound(toProv, 0, usdg.balanceOf(address(ch))));
        uint64 s = ch.seq();
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashClose(s, tp));
        settledBudget = usdg.balanceOf(address(ch));
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.closeCooperative(s, tp, Sigs.sign(clientPk, d), Sigs.sign(providerPk, d));
        paidProvider = usdg.balanceOf(provider) - p0;
        paidClient = usdg.balanceOf(client) - c0;
        settled = true; cooperative = true;
    }
}

contract InvariantTest is AegisTestBase {
    Handler h;

    function setUp() public override {
        super.setUp();
        AegisChannel ch = openByClient(defaultConfig());
        h = new Handler(ch, usdg, clientPk, providerPk, client, provider);
        targetContract(address(h));
    }

    /// INV-9: tidak ada USDG keluar sebelum SETTLED
    function invariant_no_outflow_before_settle() public view {
        if (!h.settled()) assertEq(usdg.balanceOf(address(h.ch())), h.totalFunded());
    }

    /// INV-1: konservasi saat settle
    function invariant_conservation_at_settle() public view {
        if (h.settled()) assertEq(h.paidProvider() + h.paidClient(), h.settledBudget());
    }

    /// INV-5: batas provider pada jalur jendela
    function invariant_provider_bounds() public view {
        if (h.settled() && !h.cooperative()) {
            uint256 owed = uint256(h.amountAtSettle()) - h.penaltyAtSettle();
            uint256 expected = owed < h.settledBudget() ? owed : h.settledBudget();
            assertEq(h.paidProvider(), expected);
        }
    }

    /// INV-2 (versi observabel): seq tidak pernah turun
    uint64 lastSeq;
    function invariant_seq_monotonic() public {
        assertGe(h.ch().seq(), lastSeq);
        lastSeq = h.ch().seq();
    }
}

contract SettleFuzzTest is AegisTestBase {
    function testFuzz_settle_split(uint96 budget_, uint96 amount, uint96 pen) public {
        budget_ = uint96(bound(budget_, 0, 50e6)); amount = uint96(bound(amount, 0, 50e6)); pen = uint96(bound(pen, 0, amount));
        AegisChannel ch = openByClient(defaultConfig());
        usdg.mint(address(ch), budget_);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 1, amount, bytes32(uint256(1)));
        ch.submitCheckpoint(1, amount, bytes32(uint256(1)), sc, sp);
        uint256[8] memory dummy;
        vm.prank(client); ch.claimPenalty(dummy, pen);
        vm.warp(block.timestamp + 120);
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.settle();
        uint256 owed = uint256(amount) - pen;
        uint256 exp = owed < budget_ ? owed : budget_;
        assertEq(usdg.balanceOf(provider) - p0, exp);
        assertEq(usdg.balanceOf(client) - c0, uint256(budget_) - exp);
    }
}
```

- [ ] **Step 3: Jalankan**

Run: `cd contracts && forge test --match-contract "InvariantTest|SettleFuzzTest" -vv && cd ..`
Expected: 4 invariant PASS (64 run × depth 32), fuzz 256 run PASS. Lalu seluruh suite: `forge test` — semua PASS; `forge coverage --report summary` → `AegisChannel.sol` ≥ 90% line.

- [ ] **Step 4: Commit**

```bash
git add contracts/test
git commit -m "test(contracts): ERC-1271 client, invariant handler, settlement fuzz"
```

---
### Task 13: SDK — EIP-712, prover, ABI & helper on-chain

**Files:**
- Create: `sdk/src/core/typedData.ts`, `sdk/src/core/prover.ts`, `sdk/src/chain/abi.ts`, `sdk/src/chain/channel.ts`, `sdk/src/index.ts`
- Modify: `sdk/package.json` (`exports`), `circuits/scripts/prove.ts` (pakai `toCalldata` dari SDK)
- Test: `sdk/test/typedData.test.ts`, `sdk/test/prover.test.ts`

**Interfaces:**
- Consumes: core (Task 3–4), artefak `circuits/build/*` (Task 5)
- Produces (dipakai Task 14–16):
  - `domain(channel, chainId)`, `CHANNEL_TERMS_TYPES`, `CHECKPOINT_TYPES`, `CLOSE_TYPES`; tipe `ChannelConfig`, `Checkpoint { seq: number; cumulativeAmount: bigint; receiptsRoot: bigint }`, `CloseMsg`
  - `signChannelTerms/verifyChannelTermsSig`, `signCheckpoint/verifyCheckpointSig`, `signClose/verifyCloseSig` (EOA via viem)
  - `prove(input, wasm, zkey) → { proof, publicSignals, provingMs }`, `toCalldata(proof, publicSignals) → { proof: bigint[8], inputs: bigint[6] }`, `verifyOffchain(vkey, publicSignals, proof)`, `defaultArtifacts(repoRoot)`
  - `factoryAbi`, `channelAbi`, `erc20Abi`, `CHANNEL_STATE`; `ChainCtx { publicClient, walletClient, factory, chainId }`; `predictChannel`, `openChannel`, `readChannel`, `submitCheckpointTx`, `claimPenaltyTx`, `settleTx`, `sweepTx`, `closeCooperativeTx`, `erc20Transfer`, `waitTx`

- [ ] **Step 1: Test typed data & prover (gagal dulu)**

`sdk/test/typedData.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { signCheckpoint, verifyCheckpointSig, signChannelTerms, verifyChannelTermsSig, signClose, verifyCloseSig, type ChannelConfig } from "../src/core/typedData.js";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const channel = "0x00000000000000000000000000000000000001ff" as const;
const cfg: ChannelConfig = {
  client: acct.address, provider: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  termsCommitment: "0x" + "12".padStart(64, "0") as `0x${string}`, challengeWindow: 120, responseWindow: 60,
  payoutClient: acct.address, payoutProvider: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", salt: "0x" + "1".padStart(64, "0") as `0x${string}`,
};

describe("EIP-712", () => {
  it("checkpoint sign/verify roundtrip; nilai berbeda gagal", async () => {
    const cp = { seq: 100, cumulativeAmount: 2_000_000n, receiptsRoot: 777n };
    const sig = await signCheckpoint(acct, channel, 31337, cp);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(true);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, { ...cp, seq: 101 }, sig)).toBe(false);
    expect(await verifyCheckpointSig(acct.address, channel, 4663, cp, sig)).toBe(false);
  });
  it("channel terms & close roundtrip", async () => {
    const s1 = await signChannelTerms(acct, channel, 31337, cfg);
    expect(await verifyChannelTermsSig(acct.address, channel, 31337, cfg, s1)).toBe(true);
    const s2 = await signClose(acct, channel, 31337, { seq: 10, toProvider: 5n });
    expect(await verifyCloseSig(acct.address, channel, 31337, { seq: 10, toProvider: 5n }, s2)).toBe(true);
    expect(await verifyCloseSig(acct.address, channel, 31337, { seq: 10, toProvider: 6n }, s2)).toBe(false);
  });
});
```

`sdk/test/prover.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadVector, buildCircuitInput } from "../src/core/index.js";
import { prove, toCalldata, verifyOffchain, defaultArtifacts } from "../src/core/prover.js";

const art = defaultArtifacts(new URL("../..", import.meta.url).pathname);

describe("prover", () => {
  it("EX1 → 14 kata calldata, verifikasi off-chain true, payToClient 70000", async () => {
    const v = loadVector("EX1_7_latency_breaches");
    const input = await buildCircuitInput("0x00000000000000000000000000000000000001ff", v.terms, v.receipts);
    const { proof, publicSignals, provingMs } = await prove(input, art.wasm, art.zkey);
    expect(provingMs).toBeGreaterThan(0);
    const vkey = JSON.parse(readFileSync(art.vkey, "utf8"));
    expect(await verifyOffchain(vkey, publicSignals, proof)).toBe(true);
    const cd = await toCalldata(proof, publicSignals);
    expect(cd.proof.length).toBe(8); expect(cd.inputs.length).toBe(6);
    expect(cd.inputs[5]).toBe(70_000n);
  });
});
```
Run: `pnpm --filter @aegisclear/sdk test`
Expected: FAIL — modul belum ada.

- [ ] **Step 2: Implementasi typed data & prover**

`sdk/src/core/typedData.ts`:
```ts
import { type Address, type Hex, type PrivateKeyAccount, verifyTypedData, toHex } from "viem";

export const EIP712_NAME = "AegisClear";
export const EIP712_VERSION = "1";

export function domain(channel: Address, chainId: number) {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: channel } as const;
}

export const CHANNEL_TERMS_TYPES = {
  ChannelTerms: [
    { name: "client", type: "address" }, { name: "provider", type: "address" }, { name: "token", type: "address" },
    { name: "termsCommitment", type: "bytes32" }, { name: "challengeWindow", type: "uint32" }, { name: "responseWindow", type: "uint32" },
    { name: "payoutClient", type: "address" }, { name: "payoutProvider", type: "address" }, { name: "salt", type: "bytes32" },
  ],
} as const;
export const CHECKPOINT_TYPES = {
  Checkpoint: [{ name: "seq", type: "uint64" }, { name: "cumulativeAmount", type: "uint128" }, { name: "receiptsRoot", type: "bytes32" }],
} as const;
export const CLOSE_TYPES = { Close: [{ name: "seq", type: "uint64" }, { name: "toProvider", type: "uint128" }] } as const;

export interface ChannelConfig {
  client: Address; provider: Address; token: Address; termsCommitment: Hex;
  challengeWindow: number; responseWindow: number; payoutClient: Address; payoutProvider: Address; salt: Hex;
}
export interface Checkpoint { seq: number; cumulativeAmount: bigint; receiptsRoot: bigint }
export interface CloseMsg { seq: number; toProvider: bigint }

export const rootHex = (r: bigint): Hex => toHex(r, { size: 32 });
const cpMsg = (cp: Checkpoint) => ({ seq: BigInt(cp.seq), cumulativeAmount: cp.cumulativeAmount, receiptsRoot: rootHex(cp.receiptsRoot) });
const closeMsg = (m: CloseMsg) => ({ seq: BigInt(m.seq), toProvider: m.toProvider });

export function signChannelTerms(a: PrivateKeyAccount, channel: Address, chainId: number, c: ChannelConfig): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: CHANNEL_TERMS_TYPES, primaryType: "ChannelTerms", message: c });
}
export function verifyChannelTermsSig(signer: Address, channel: Address, chainId: number, c: ChannelConfig, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CHANNEL_TERMS_TYPES, primaryType: "ChannelTerms", message: c, signature });
}
export function signCheckpoint(a: PrivateKeyAccount, channel: Address, chainId: number, cp: Checkpoint): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: CHECKPOINT_TYPES, primaryType: "Checkpoint", message: cpMsg(cp) });
}
export function verifyCheckpointSig(signer: Address, channel: Address, chainId: number, cp: Checkpoint, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CHECKPOINT_TYPES, primaryType: "Checkpoint", message: cpMsg(cp), signature });
}
export function signClose(a: PrivateKeyAccount, channel: Address, chainId: number, m: CloseMsg): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: CLOSE_TYPES, primaryType: "Close", message: closeMsg(m) });
}
export function verifyCloseSig(signer: Address, channel: Address, chainId: number, m: CloseMsg, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CLOSE_TYPES, primaryType: "Close", message: closeMsg(m), signature });
}
```
> Verifikasi off-chain di atas hanya untuk EOA. Untuk klien ERC-1271 gunakan `publicClient.verifyTypedData(...)` (viem melakukan panggilan `isValidSignature`); kontrak sendiri selalu memakai `SignatureChecker`.

`sdk/src/core/prover.ts`:
```ts
import path from "node:path";
import * as snarkjs from "snarkjs";
import type { CircuitInput } from "./circuitInput.js";

export interface ProofBundle { proof: any; publicSignals: string[]; provingMs: number }
export interface ProofCalldata { proof: bigint[]; inputs: bigint[] }
export interface Artifacts { wasm: string; zkey: string; vkey: string }

export function defaultArtifacts(repoRoot: string): Artifacts {
  const b = path.join(repoRoot, "circuits", "build");
  return { wasm: path.join(b, "sla_settlement_js", "sla_settlement.wasm"), zkey: path.join(b, "sla_final.zkey"), vkey: path.join(b, "verification_key.json") };
}

export async function prove(input: CircuitInput, wasm: string, zkey: string): Promise<ProofBundle> {
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  return { proof, publicSignals, provingMs: Date.now() - t0 };
}

/** exportSolidityCallData → 8 kata bukti (pB sudah di-swap) + 6 input publik. */
export async function toCalldata(proof: any, publicSignals: string[]): Promise<ProofCalldata> {
  const s: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const nums = s.replace(/[\[\]\s"]/g, "").split(",").map((x) => BigInt(x));
  if (nums.length !== 14) throw new Error(`calldata: expected 14 words, got ${nums.length}`);
  return { proof: nums.slice(0, 8), inputs: nums.slice(8, 14) };
}

export function verifyOffchain(vkey: object, publicSignals: string[], proof: any): Promise<boolean> {
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}
```
Ubah `circuits/scripts/prove.ts`: hapus fungsi `toCalldata` lokal, ganti impor menjadi `import { loadVector, buildCircuitInput, commitTerms, prove, toCalldata } from "@aegisclear/sdk";` dan panggil `const { proof, publicSignals, provingMs: ms } = await prove(input, WASM, ZKEY);`.

- [ ] **Step 3: ABI & helper on-chain**

`sdk/src/chain/abi.ts`:
```ts
import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "struct Config { address client; address provider; address token; bytes32 termsCommitment; uint32 challengeWindow; uint32 responseWindow; address payoutClient; address payoutProvider; bytes32 salt; }",
  "function predict(Config c) view returns (address)",
  "function open(Config c, bytes sigClient, bytes sigProvider) returns (address)",
  "function IMPLEMENTATION() view returns (address)",
  "function MIN_CHALLENGE_WINDOW() view returns (uint32)",
  "event ChannelOpened(address indexed channel, address indexed client, address indexed provider, bytes32 termsCommitment)",
]);

export const channelAbi = parseAbi([
  "function state() view returns (uint8)",
  "function seq() view returns (uint64)",
  "function cumulativeAmount() view returns (uint128)",
  "function receiptsRoot() view returns (bytes32)",
  "function deadline() view returns (uint64)",
  "function hasProof() view returns (bool)",
  "function payToClient() view returns (uint128)",
  "function budget() view returns (uint256)",
  "function submitCheckpoint(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, bytes sigClient, bytes sigProvider)",
  "function claimPenalty(uint256[8] proof, uint128 payToClient)",
  "function settle()",
  "function sweep()",
  "function closeCooperative(uint64 seq, uint128 toProvider, bytes sigClient, bytes sigProvider)",
  "event Settled(uint64 seq, uint128 cumulativeAmount, uint256 penalty, uint256 toProvider, uint256 toClient, bool cooperative)",
  "event CheckpointSubmitted(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline)",
  "event PenaltyClaimed(address indexed by, uint64 seq, uint128 payToClient)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function decimals() view returns (uint8)",
]);

export const CHANNEL_STATE = ["UNINIT", "OPEN", "CLOSING", "SETTLED"] as const;
```

`sdk/src/chain/channel.ts`:
```ts
import type { Address, Hex, PublicClient, WalletClient, Transport, Chain, Account } from "viem";
import { factoryAbi, channelAbi, erc20Abi, CHANNEL_STATE } from "./abi.js";
import { type ChannelConfig, type Checkpoint, rootHex } from "../core/typedData.js";
import type { ProofCalldata } from "../core/prover.js";

export interface ChainCtx {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  factory: Address;
  chainId: number;
}

export interface ChannelView {
  state: (typeof CHANNEL_STATE)[number]; seq: number; cumulativeAmount: bigint; receiptsRoot: bigint;
  deadline: number; hasProof: boolean; payToClient: bigint; budget: bigint;
}

export async function waitTx(ctx: ChainCtx, hash: Hex) {
  const r = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx ${hash} reverted`);
  return r;
}

export function predictChannel(ctx: ChainCtx, cfg: ChannelConfig): Promise<Address> {
  return ctx.publicClient.readContract({ address: ctx.factory, abi: factoryAbi, functionName: "predict", args: [cfg] });
}

export async function openChannel(ctx: ChainCtx, cfg: ChannelConfig, sigClient: Hex, sigProvider: Hex) {
  const channel = await predictChannel(ctx, cfg);
  const hash = await ctx.walletClient.writeContract({ address: ctx.factory, abi: factoryAbi, functionName: "open", args: [cfg, sigClient, sigProvider] });
  const receipt = await waitTx(ctx, hash);
  return { channel, hash, gasUsed: receipt.gasUsed };
}

export async function readChannel(ctx: ChainCtx, channel: Address): Promise<ChannelView> {
  const c = { address: channel, abi: channelAbi } as const;
  const [st, seq, A, R, dl, hp, pc, b] = await Promise.all([
    ctx.publicClient.readContract({ ...c, functionName: "state" }),
    ctx.publicClient.readContract({ ...c, functionName: "seq" }),
    ctx.publicClient.readContract({ ...c, functionName: "cumulativeAmount" }),
    ctx.publicClient.readContract({ ...c, functionName: "receiptsRoot" }),
    ctx.publicClient.readContract({ ...c, functionName: "deadline" }),
    ctx.publicClient.readContract({ ...c, functionName: "hasProof" }),
    ctx.publicClient.readContract({ ...c, functionName: "payToClient" }),
    ctx.publicClient.readContract({ ...c, functionName: "budget" }),
  ]);
  return { state: CHANNEL_STATE[Number(st)], seq: Number(seq), cumulativeAmount: A, receiptsRoot: BigInt(R), deadline: Number(dl), hasProof: hp, payToClient: pc, budget: b };
}

async function write(ctx: ChainCtx, channel: Address, functionName: any, args: any[]) {
  const hash = await ctx.walletClient.writeContract({ address: channel, abi: channelAbi, functionName, args });
  const receipt = await waitTx(ctx, hash);
  return { hash, gasUsed: receipt.gasUsed };
}
export const submitCheckpointTx = (ctx: ChainCtx, ch: Address, cp: Checkpoint, sigC: Hex, sigP: Hex) =>
  write(ctx, ch, "submitCheckpoint", [BigInt(cp.seq), cp.cumulativeAmount, rootHex(cp.receiptsRoot), sigC, sigP]);
export const claimPenaltyTx = (ctx: ChainCtx, ch: Address, cd: ProofCalldata) =>
  write(ctx, ch, "claimPenalty", [cd.proof, cd.inputs[5]]);
export const settleTx = (ctx: ChainCtx, ch: Address) => write(ctx, ch, "settle", []);
export const sweepTx = (ctx: ChainCtx, ch: Address) => write(ctx, ch, "sweep", []);
export const closeCooperativeTx = (ctx: ChainCtx, ch: Address, seq: number, toProvider: bigint, sigC: Hex, sigP: Hex) =>
  write(ctx, ch, "closeCooperative", [BigInt(seq), toProvider, sigC, sigP]);

export async function erc20Transfer(ctx: ChainCtx, token: Address, to: Address, amount: bigint) {
  const hash = await ctx.walletClient.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  const receipt = await waitTx(ctx, hash);
  return { hash, gasUsed: receipt.gasUsed };
}
export const erc20Balance = (ctx: ChainCtx, token: Address, who: Address) =>
  ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
```

`sdk/src/index.ts`:
```ts
export * from "./core/index.js";
export * from "./core/typedData.js";
export * from "./core/prover.js";
export * from "./chain/abi.js";
export * from "./chain/channel.js";
```
Ubah `sdk/package.json` → `"exports": { ".": "./src/index.ts" }`, dan `sdk/src/core/index.ts` tetap (core saja).

- [ ] **Step 4: Jalankan test SDK + circuits**

Run: `pnpm --filter @aegisclear/sdk test && pnpm --filter @aegisclear/circuits test`
Expected: semua PASS (prover test ±10–30 s).

- [ ] **Step 5: Commit**

```bash
git add sdk circuits/scripts/prove.ts
git commit -m "feat(sdk): EIP-712 signing, prover wrapper, contract ABIs and channel helpers"
```

---
### Task 14: Provider middleware (Hono) + klien agen + deploy lokal + test integrasi Anvil

**Files:**
- Create: `contracts/script/DeployLocal.s.sol`, `sdk/src/provider/server.ts`, `sdk/src/client/agent.ts`
- Modify: `sdk/src/index.ts` (ekspor provider/client)
- Test: `sdk/test/integration.test.ts`

**Interfaces:**
- Consumes: Task 13 seluruhnya; artefak sirkuit (Task 5)
- Produces:
  - `createProviderApp(opts: ProviderOptions) → { app: Hono, sessions }` dengan rute `GET /job` (402 + `extra.aegis{config, sigProvider, terms}`), `POST /job` (header `Aegis-Client`, `Aegis-Terms-Signature` [pertama], `Aegis-Ack`), `POST /ack`, `POST /close`, `GET /state`
  - `class AegisClient { start(); requestUnit(); finalAck(); closeCooperative(); dispute(); settle(); view(); txs; provingMs }`
  - `contracts/deployments/local.json` `{ usdg, verifier, factory, chainId }`

- [ ] **Step 1: Skrip deploy lokal**

`contracts/script/DeployLocal.s.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";

/// forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///   --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
contract DeployLocal is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant CLIENT_A = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // anvil #1
    address constant CLIENT_B = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // anvil #3

    function run() external {
        vm.startBroadcast();
        MockUSDG usdg = new MockUSDG();
        SLASettlementVerifier verifier = new SLASettlementVerifier();
        AegisChannelFactory factory = new AegisChannelFactory(address(verifier), PERMIT2, 60); // factory demo (D5)
        usdg.mint(CLIENT_A, 100e6);
        usdg.mint(CLIENT_B, 100e6);
        vm.stopBroadcast();
        string memory j = "deploy";
        vm.serializeAddress(j, "usdg", address(usdg));
        vm.serializeAddress(j, "verifier", address(verifier));
        vm.serializeAddress(j, "factory", address(factory));
        string memory out = vm.serializeUint(j, "chainId", block.chainid);
        vm.writeJson(out, "deployments/local.json");
    }
}
```
```bash
# terminal 1
anvil --chain-id 31337 --silent &
# terminal 2
cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 && cat deployments/local.json && cd ..
```
Expected: JSON dengan 3 alamat dan `chainId: 31337`.

- [ ] **Step 2: Test integrasi (gagal dulu)**

`sdk/test/integration.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp } from "../src/provider/server.js";
import { AegisClient } from "../src/client/agent.js";
import { randomNonce, defaultArtifacts, erc20Balance, type ChainCtx } from "../src/index.js";

const DEPLOY = new URL("../../contracts/deployments/local.json", import.meta.url).pathname;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PK = {
  provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex, // anvil #2
  clientA: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,  // anvil #1
  clientB: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex,  // anvil #3
};
const art = defaultArtifacts(new URL("../..", import.meta.url).pathname);

describe.skipIf(!existsSync(DEPLOY))("integrasi Anvil: provider ↔ klien ↔ AegisChannel", () => {
  let d: { usdg: Address; factory: Address };
  let server: ReturnType<typeof serve>;
  const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
  const ctxOf = (pk: Hex): ChainCtx => ({
    publicClient, chainId: 31337, factory: d.factory,
    walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }),
  });
  const mkClient = (pk: Hex) => new AegisClient({ ctx: ctxOf(pk), account: privateKeyToAccount(pk), providerUrl: "http://127.0.0.1:4020", usdg: d.usdg, artifacts: art });
  const bal = (who: Address) => erc20Balance(ctxOf(PK.provider), d.usdg, who);
  const providerAddr = privateKeyToAccount(PK.provider).address;

  beforeAll(async () => {
    d = JSON.parse(readFileSync(DEPLOY, "utf8"));
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app } = createProviderApp({
      ctx: ctxOf(PK.provider), account: privateKeyToAccount(PK.provider), usdg: d.usdg, terms,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 120, responseWindow: 60,
      metrics: (seq) => ({ m1: seq === 3 ? 1200n : 300n, m2: 95n }),   // satu pelanggaran latensi di seq 3
    });
    server = serve({ fetch: app.fetch, port: 4020 });
  });
  afterAll(() => { server?.close(); });

  it("kooperatif: 10 unit → provider +200.000, sisa 800.000 kembali", async () => {
    const c = mkClient(PK.clientA); const me = privateKeyToAccount(PK.clientA).address;
    const c0 = await bal(me); const p0 = await bal(providerAddr);
    await c.start();
    for (let i = 0; i < 10; i++) await c.requestUnit();
    await c.finalAck();
    await c.closeCooperative();
    expect((await c.view()).state).toBe("SETTLED");
    expect((await bal(providerAddr)) - p0).toBe(200_000n);
    expect(c0 - (await bal(me))).toBe(200_000n);
  });

  it("sengketa: 1 pelanggaran → bukti → 190.000 / refund 810.000", async () => {
    const c = mkClient(PK.clientB); const me = privateKeyToAccount(PK.clientB).address;
    const c0 = await bal(me); const p0 = await bal(providerAddr);
    await c.start();
    for (let i = 0; i < 10; i++) await c.requestUnit();
    await c.finalAck();
    const { payToClient } = await c.dispute();
    expect(payToClient).toBe(10_000n);
    expect((await c.view()).hasProof).toBe(true);
    await publicClient.request({ method: "evm_increaseTime", params: [121] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);
    await c.settle();
    expect((await bal(providerAddr)) - p0).toBe(190_000n);
    expect(c0 - (await bal(me))).toBe(190_000n);
    expect(c.provingMs).toBeGreaterThan(0);
    console.table(c.txs.map((t) => ({ label: t.label, gasUsed: t.gasUsed.toString() })));
  });
});
```
Run: `pnpm --filter @aegisclear/sdk test -- integration`
Expected: FAIL — modul provider/client belum ada.

- [ ] **Step 3: Provider middleware**

`sdk/src/provider/server.ts`:
```ts
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import type { Address, Hex, PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, commitTerms, makeReceipt, MAX_SEQ } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, signCheckpoint, verifyCheckpointSig,
  signChannelTerms, verifyChannelTermsSig, signClose, rootHex,
} from "../core/typedData.js";
import { type ChainCtx, predictChannel, openChannel, erc20Balance } from "../chain/channel.js";

export interface ProviderOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; usdg: Address; terms: Terms;
  unitQty: bigint; deposit: bigint; challengeWindow: number; responseWindow: number;
  /** metrik per unit (demo: injeksi pelanggaran) */
  metrics: (seq: number) => { m1: bigint; m2: bigint };
}
export interface CoSigned { cp: Checkpoint; sigProvider: Hex; sigClient?: Hex }
export interface Session {
  cfg: ChannelConfig; predicted: Address; channel?: Address; termsSigProvider: Hex;
  tree: ReceiptTree; cumulativeAmount: bigint; checkpoints: Map<number, CoSigned>;
}
const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export function createProviderApp(o: ProviderOptions) {
  const app = new Hono();
  const sessions = new Map<string, Session>();
  const chainId = o.ctx.chainId;

  async function session(client: Address): Promise<Session> {
    const key = client.toLowerCase();
    const found = sessions.get(key);
    if (found) return found;
    const cfg: ChannelConfig = {
      client, provider: o.account.address, token: o.usdg, termsCommitment: rootHex(await commitTerms(o.terms)),
      challengeWindow: o.challengeWindow, responseWindow: o.responseWindow,
      payoutClient: client, payoutProvider: o.account.address, salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
    };
    const predicted = await predictChannel(o.ctx, cfg);
    const s: Session = {
      cfg, predicted, termsSigProvider: await signChannelTerms(o.account, predicted, chainId, cfg),
      tree: new ReceiptTree(), cumulativeAmount: 0n, checkpoints: new Map(),
    };
    sessions.set(key, s);
    return s;
  }

  // 402 x402-compatible: payTo = alamat channel (§10.2). Terms dikirim ke klien saja — privat dari chain, bukan dari lawan.
  const challenge = (s: Session) => ({
    x402Version: 1,
    accepts: [{
      scheme: "exact", network: `eip155:${chainId}`, asset: o.usdg, payTo: s.predicted, maxAmountRequired: o.deposit.toString(),
      extra: { aegis: { config: j(s.cfg), sigProvider: s.termsSigProvider, terms: j(o.terms) } },
    }],
  });
  const clientOf = (c: any) => c.req.header("Aegis-Client") as Address | undefined;

  app.get("/job", async (c) => {
    const client = clientOf(c);
    if (!client) return c.json({ error: "Aegis-Client header required" }, 400);
    const body = challenge(await session(client));
    c.header("PAYMENT-REQUIRED", JSON.stringify(body));
    return c.json(body, 402);
  });

  app.post("/job", async (c) => {
    const client = clientOf(c);
    if (!client) return c.json({ error: "Aegis-Client header required" }, 400);
    const s = sessions.get(client.toLowerCase());
    if (!s) return c.json({ error: "no session; GET /job first" }, 409);

    // (1) buka channel saat ack pertama membawa tanda tangan ChannelTerms klien (D7)
    if (!s.channel) {
      const sigClient = c.req.header("Aegis-Terms-Signature") as Hex | undefined;
      if (!sigClient || !(await verifyChannelTermsSig(client, s.predicted, chainId, s.cfg, sigClient)))
        return c.json({ error: "terms-signature-required" }, 402);
      const { channel } = await openChannel(o.ctx, s.cfg, sigClient, "0x"); // provider = msg.sender
      s.channel = channel;
    }
    // (2) ack checkpoint sebelumnya (§6.2, FR-24)
    const n = s.tree.size;
    if (n > 0) {
      const pending = s.checkpoints.get(n)!;
      if (!pending.sigClient) {
        const hdr = c.req.header("Aegis-Ack");
        const ack = hdr ? (JSON.parse(hdr) as { seq: number; signature: Hex }) : undefined;
        if (!ack || ack.seq !== n || !(await verifyCheckpointSig(client, s.channel, chainId, pending.cp, ack.signature)))
          return c.json({ error: "ack-required", seq: n }, 409);
        pending.sigClient = ack.signature;
      }
    }
    if (n >= MAX_SEQ) return c.json({ error: "epoch-full" }, 409);
    // (3) tidak melayani melebihi deposit (FR-24)
    const due = o.unitQty * o.terms.unitPrice;
    if ((await erc20Balance(o.ctx, o.usdg, s.channel)) < s.cumulativeAmount + due) return c.json(challenge(s), 402);
    // (4) layani unit n; receipt + checkpoint n+1 ditandatangani provider
    const { m1, m2 } = o.metrics(n);
    const r: Receipt = makeReceipt(n, o.unitQty, m1, m2, o.terms.unitPrice);
    await s.tree.append(r);
    s.cumulativeAmount += due;
    const cp: Checkpoint = { seq: n + 1, cumulativeAmount: s.cumulativeAmount, receiptsRoot: await s.tree.root() };
    const sigProvider = await signCheckpoint(o.account, s.channel, chainId, cp);
    s.checkpoints.set(n + 1, { cp, sigProvider });
    return c.json({ result: `unit-${n}`, receipt: j(r), checkpoint: j(cp), sigProvider, channel: s.channel });
  });

  app.post("/ack", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const { seq, signature } = (await c.req.json()) as { seq: number; signature: Hex };
    const pending = s.checkpoints.get(seq);
    if (!pending || !(await verifyCheckpointSig(client!, s.channel, chainId, pending.cp, signature))) return c.json({ error: "bad-ack" }, 400);
    pending.sigClient = signature;
    return c.json({ ok: true });
  });

  app.post("/close", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const { seq } = (await c.req.json()) as { seq: number };
    const cs = s.checkpoints.get(seq);
    if (seq !== 0 && !cs?.sigClient) return c.json({ error: "checkpoint-not-acked", seq }, 409);
    const toProvider = seq === 0 ? 0n : cs!.cp.cumulativeAmount;
    const sigProvider = await signClose(o.account, s.channel, chainId, { seq, toProvider });
    return c.json({ seq, toProvider: toProvider.toString(), sigProvider });
  });

  app.get("/state", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s) return c.json({ error: "no session" }, 404);
    return c.json(j({ channel: s.channel, predicted: s.predicted, seq: s.tree.size, cumulativeAmount: s.cumulativeAmount }));
  });

  return { app, sessions };
}
```

- [ ] **Step 4: Klien agen**

`sdk/src/client/agent.ts`:
```ts
import type { Address, Hex, PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, settle, buildCircuitInput, commitTerms } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, signCheckpoint, verifyCheckpointSig, signChannelTerms, verifyChannelTermsSig,
  signClose, verifyCloseSig, rootHex,
} from "../core/typedData.js";
import { type ChainCtx, erc20Transfer, submitCheckpointTx, claimPenaltyTx, settleTx, closeCooperativeTx, readChannel } from "../chain/channel.js";
import { prove, toCalldata, type Artifacts } from "../core/prover.js";

export interface ClientOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; providerUrl: string; usdg: Address; artifacts: Artifacts;
  /** kebijakan ack: false = tolak unit (tidak dibayar). Default: terima semua metrik yang provider laporkan. */
  accept?: (r: Receipt) => boolean;
}
export interface TxLog { label: string; hash: Hex; gasUsed: bigint }
const bi = (x: string | number | bigint) => BigInt(x);

export class AegisClient {
  cfg!: ChannelConfig; channel!: Address; terms!: Terms; deposit = 0n;
  readonly tree = new ReceiptTree();
  readonly checkpoints = new Map<number, { cp: Checkpoint; sigProvider: Hex; sigClient: Hex }>();
  readonly txs: TxLog[] = [];
  provingMs = 0;
  private termsSig?: Hex;
  private pendingAck?: { seq: number; signature: Hex };

  constructor(private readonly o: ClientOptions) {}
  private hdr(extra: Record<string, string> = {}) {
    return { "Aegis-Client": this.o.account.address, "content-type": "application/json", ...extra };
  }
  private get chainId() { return this.o.ctx.chainId; }

  /** GET /job → 402 → verifikasi sigProvider(ChannelTerms) (T19) → danai → siapkan tanda tangan ChannelTerms */
  async start(): Promise<void> {
    const res = await fetch(`${this.o.providerUrl}/job`, { headers: this.hdr() });
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    const offer = ((await res.json()) as any).accepts[0];
    const a = offer.extra.aegis;
    const cfg: ChannelConfig = { ...a.config, challengeWindow: Number(a.config.challengeWindow), responseWindow: Number(a.config.responseWindow) };
    if (cfg.client.toLowerCase() !== this.o.account.address.toLowerCase()) throw new Error("config.client mismatch");
    if (cfg.token.toLowerCase() !== this.o.usdg.toLowerCase()) throw new Error("config.token mismatch");
    const terms: Terms = { unitPrice: bi(a.terms.unitPrice), maxM1: bi(a.terms.maxM1), minM2: bi(a.terms.minM2), penaltyBps: bi(a.terms.penaltyBps), capBps: bi(a.terms.capBps), nonce: bi(a.terms.nonce) };
    if (rootHex(await commitTerms(terms)) !== cfg.termsCommitment) throw new Error("termsCommitment mismatch");
    const predicted = offer.payTo as Address;
    if (!(await verifyChannelTermsSig(cfg.provider, predicted, this.chainId, cfg, a.sigProvider))) throw new Error("bad provider terms signature (T19)");
    this.cfg = cfg; this.channel = predicted; this.terms = terms; this.deposit = bi(offer.maxAmountRequired);
    // MVP: transfer langsung ke alamat channel. Rel x402/Permit2 menghasilkan efek identik (Task 11).
    this.txs.push({ label: "fund", ...(await erc20Transfer(this.o.ctx, this.o.usdg, predicted, this.deposit)) });
    this.termsSig = await signChannelTerms(this.o.account, predicted, this.chainId, cfg);
  }

  /** POST /job dengan ack sebelumnya; verifikasi receipt, root, jumlah, tanda tangan provider; tanda tangani checkpoint baru */
  async requestUnit(): Promise<Receipt> {
    const headers = this.hdr();
    if (this.termsSig) { headers["Aegis-Terms-Signature"] = this.termsSig; }
    if (this.pendingAck) headers["Aegis-Ack"] = JSON.stringify(this.pendingAck);
    const res = await fetch(`${this.o.providerUrl}/job`, { method: "POST", headers });
    if (res.status !== 200) throw new Error(`POST /job ${res.status}: ${await res.text()}`);
    this.termsSig = undefined;
    const b = (await res.json()) as any;
    const r: Receipt = { seq: Number(b.receipt.seq), qty: bi(b.receipt.qty), m1: bi(b.receipt.m1), m2: bi(b.receipt.m2), due: bi(b.receipt.due) };
    if (r.seq !== this.tree.size) throw new Error("seq mismatch");
    if (r.due !== r.qty * this.terms.unitPrice) throw new Error("due mismatch");
    if (this.o.accept && !this.o.accept(r)) throw new Error(`receipt ${r.seq} rejected by policy`);
    await this.tree.append(r);
    const cp: Checkpoint = { seq: Number(b.checkpoint.seq), cumulativeAmount: bi(b.checkpoint.cumulativeAmount), receiptsRoot: bi(b.checkpoint.receiptsRoot) };
    const local = settle(this.tree.receipts, this.terms);
    if (cp.seq !== this.tree.size || cp.receiptsRoot !== (await this.tree.root()) || cp.cumulativeAmount !== local.cumulativeAmount) throw new Error("checkpoint mismatch");
    if (!(await verifyCheckpointSig(this.cfg.provider, this.channel, this.chainId, cp, b.sigProvider))) throw new Error("bad provider checkpoint signature");
    const sigClient = await signCheckpoint(this.o.account, this.channel, this.chainId, cp);
    this.checkpoints.set(cp.seq, { cp, sigProvider: b.sigProvider, sigClient });
    this.pendingAck = { seq: cp.seq, signature: sigClient };
    return r;
  }

  async finalAck(): Promise<void> {
    if (!this.pendingAck) return;
    const res = await fetch(`${this.o.providerUrl}/ack`, { method: "POST", headers: this.hdr(), body: JSON.stringify(this.pendingAck) });
    if (res.status !== 200) throw new Error(`POST /ack ${res.status}`);
    this.pendingAck = undefined;
  }

  async closeCooperative(): Promise<void> {
    const seq = this.tree.size;
    const res = await fetch(`${this.o.providerUrl}/close`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ seq }) });
    if (res.status !== 200) throw new Error(`POST /close ${res.status}: ${await res.text()}`);
    const b = (await res.json()) as any;
    const toProvider = bi(b.toProvider);
    if (toProvider !== settle(this.tree.receipts, this.terms).cumulativeAmount) throw new Error("close amount mismatch");
    if (!(await verifyCloseSig(this.cfg.provider, this.channel, this.chainId, { seq, toProvider }, b.sigProvider))) throw new Error("bad provider close signature");
    const sigClient = await signClose(this.o.account, this.channel, this.chainId, { seq, toProvider });
    this.txs.push({ label: "closeCooperative", ...(await closeCooperativeTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
  }

  /** Unilateral: checkpoint co-signed terakhir, lalu bukti penalti bila ada (§6.4) */
  async dispute(): Promise<{ payToClient: bigint }> {
    const seq = this.tree.size;
    const cs = this.checkpoints.get(seq);
    if (!cs) throw new Error("no co-signed checkpoint");
    this.txs.push({ label: "submitCheckpoint", ...(await submitCheckpointTx(this.o.ctx, this.channel, cs.cp, cs.sigClient, cs.sigProvider)) });
    const s = settle(this.tree.receipts, this.terms);
    if (s.payToClient > 0n) {
      const input = await buildCircuitInput(this.channel, this.terms, this.tree.receipts);
      const { proof, publicSignals, provingMs } = await prove(input, this.o.artifacts.wasm, this.o.artifacts.zkey);
      this.provingMs = provingMs;
      this.txs.push({ label: "claimPenalty", ...(await claimPenaltyTx(this.o.ctx, this.channel, await toCalldata(proof, publicSignals))) });
    }
    return { payToClient: s.payToClient };
  }

  async settle(): Promise<void> { this.txs.push({ label: "settle", ...(await settleTx(this.o.ctx, this.channel)) }); }
  view() { return readChannel(this.o.ctx, this.channel); }
}
```
Tambahkan ke `sdk/src/index.ts`: `export * from "./provider/server.js"; export * from "./client/agent.js";`

- [ ] **Step 5: Jalankan test integrasi (anvil + deploy dari Step 1 harus hidup)**

Run: `pnpm --filter @aegisclear/sdk test -- integration`
Expected: 2 PASS; tabel gas tercetak (`fund`, `submitCheckpoint`, `claimPenalty`, `settle`, `closeCooperative`). Salin `gasUsed` ke §8.7 spec (kolom "Terukur").

- [ ] **Step 6: Commit**

```bash
git add contracts/script/DeployLocal.s.sol sdk/src/provider sdk/src/client sdk/src/index.ts sdk/test/integration.test.ts prd-arsitektur.md
git commit -m "feat(sdk): x402-style provider middleware, client agent with ack protocol, Anvil integration test"
```

---
### Task 15: Watcher / settler bot (§11.4)

**Files:**
- Create: `sdk/src/watcher/watcher.ts`, `sdk/src/watcher/cli.ts`
- Test: `sdk/test/watcher.test.ts`

**Interfaces:**
- Consumes: `factoryAbi`, `readChannel`, `settleTx`, `sweepTx` (Task 13)
- Produces: `class Watcher { scan(); tick() → { settled, swept }; start(); stop(); channels }`; CLI `tsx sdk/src/watcher/cli.ts` (env `RPC_URL`, `FACTORY`, `PRIVATE_KEY`, `CHAIN_ID`).

- [ ] **Step 1: Test (gagal dulu)**

`sdk/test/watcher.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { Watcher } from "../src/watcher/watcher.js";
import { predictChannel, openChannel, submitCheckpointTx, erc20Transfer, erc20Balance, signChannelTerms, signCheckpoint, readChannel, type ChainCtx, type ChannelConfig } from "../src/index.js";

const DEPLOY = new URL("../../contracts/deployments/local.json", import.meta.url).pathname;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PK_C = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const PK_P = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;

describe.skipIf(!existsSync(DEPLOY))("watcher", () => {
  it("settle setelah deadline, lalu sweep dana yang masuk belakangan", async () => {
    const d = JSON.parse(readFileSync(DEPLOY, "utf8")) as { usdg: Address; factory: Address };
    const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
    const ctx = (pk: Hex): ChainCtx => ({ publicClient, chainId: 31337, factory: d.factory, walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }) });
    const client = privateKeyToAccount(PK_C), provider = privateKeyToAccount(PK_P);
    const cfg: ChannelConfig = { client: client.address, provider: provider.address, token: d.usdg, termsCommitment: ("0x" + "42".padStart(64, "0")) as Hex,
      challengeWindow: 60, responseWindow: 30, payoutClient: client.address, payoutProvider: provider.address, salt: ("0x" + Date.now().toString(16).padStart(64, "0")) as Hex };
    const predicted = await predictChannel(ctx(PK_C), cfg);
    const sigP = await signChannelTerms(provider, predicted, 31337, cfg);
    const { channel } = await openChannel(ctx(PK_C), cfg, "0x", sigP);   // klien membuka, provider menandatangani
    await erc20Transfer(ctx(PK_C), d.usdg, channel, 500_000n);
    const cp = { seq: 3, cumulativeAmount: 60_000n, receiptsRoot: 5n };
    await submitCheckpointTx(ctx(PK_P), channel, cp, await signCheckpoint(client, channel, 31337, cp), await signCheckpoint(provider, channel, 31337, cp));

    const w = new Watcher({ ctx: ctx(PK_P) });
    expect((await w.tick()).settled).not.toContain(channel);            // belum deadline
    await publicClient.request({ method: "evm_increaseTime", params: [61] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);
    expect((await w.tick()).settled).toContain(channel);
    expect((await readChannel(ctx(PK_P), channel)).state).toBe("SETTLED");
    await erc20Transfer(ctx(PK_C), d.usdg, channel, 1_000n);              // dana terlambat
    const c0 = await erc20Balance(ctx(PK_C), d.usdg, client.address);
    expect((await w.tick()).swept).toContain(channel);
    expect((await erc20Balance(ctx(PK_C), d.usdg, client.address)) - c0).toBe(1_000n);
  });
});
```

- [ ] **Step 2: Implementasi**

`sdk/src/watcher/watcher.ts`:
```ts
import type { Address } from "viem";
import { factoryAbi } from "../chain/abi.js";
import { type ChainCtx, readChannel, settleTx, sweepTx } from "../chain/channel.js";

export interface WatcherOptions { ctx: ChainCtx; fromBlock?: bigint; intervalMs?: number; log?: (s: string) => void }

/** Mengindeks ChannelOpened; settle() setelah deadline; sweep() sisa setelah SETTLED. Permissionless — siapa pun boleh menjalankannya. */
export class Watcher {
  readonly channels = new Set<Address>();
  private timer?: NodeJS.Timeout;
  constructor(private readonly o: WatcherOptions) {}

  async scan(): Promise<void> {
    const logs = await this.o.ctx.publicClient.getContractEvents({
      address: this.o.ctx.factory, abi: factoryAbi, eventName: "ChannelOpened", fromBlock: this.o.fromBlock ?? 0n,
    });
    for (const l of logs) if (l.args.channel) this.channels.add(l.args.channel);
  }

  async tick(): Promise<{ settled: Address[]; swept: Address[] }> {
    await this.scan();
    const now = Number((await this.o.ctx.publicClient.getBlock()).timestamp);
    const settled: Address[] = [], swept: Address[] = [];
    for (const ch of this.channels) {
      const v = await readChannel(this.o.ctx, ch);
      if (v.state === "CLOSING" && now >= v.deadline) { await settleTx(this.o.ctx, ch); settled.push(ch); this.o.log?.(`settled ${ch}`); }
      else if (v.state === "SETTLED" && v.budget > 0n) { await sweepTx(this.o.ctx, ch); swept.push(ch); this.o.log?.(`swept ${ch}`); }
    }
    return { settled, swept };
  }

  start(): void { this.timer = setInterval(() => this.tick().catch((e) => this.o.log?.(String(e))), this.o.intervalMs ?? 5_000); }
  stop(): void { if (this.timer) clearInterval(this.timer); }
}
```

`sdk/src/watcher/cli.ts`:
```ts
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Watcher } from "./watcher.js";

const RPC = process.env.RPC_URL!; const FACTORY = process.env.FACTORY as Address; const PK = process.env.PRIVATE_KEY as Hex; const CHAIN_ID = Number(process.env.CHAIN_ID ?? 46630);
const chain = defineChain({ id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account: privateKeyToAccount(PK), chain, transport: http(RPC) });
new Watcher({ ctx: { publicClient, walletClient, factory: FACTORY, chainId: CHAIN_ID }, log: console.log, intervalMs: 10_000 }).start();
console.log(`watcher: factory ${FACTORY} on ${CHAIN_ID}`);
```
Tambahkan `export * from "./watcher/watcher.js";` ke `sdk/src/index.ts`.

- [ ] **Step 3: Jalankan & commit**

Run: `pnpm --filter @aegisclear/sdk test -- watcher`
Expected: 1 PASS.
```bash
git add sdk/src/watcher sdk/src/index.ts sdk/test/watcher.test.ts
git commit -m "feat(sdk): permissionless watcher that settles after deadline and sweeps late funds"
```

---

### Task 16: Kontrol `SimpleJobEscrow`, demo harness A-vs-B, `leak-check` (§14, G2)

**Files:**
- Create: `contracts/src/SimpleJobEscrow.sol`, `contracts/test/SimpleJobEscrow.t.sol`
- Modify: `contracts/script/DeployLocal.s.sol` (deploy escrow kontrol, tulis `escrow`)
- Create: `demo/package.json`, `demo/run.ts`, `demo/leak-check.ts`

**Interfaces:**
- Produces: `SimpleJobEscrow { createJob(provider, evaluator) → id; fund(id, amount); submit(id, bytes32); complete(id, bytes32); reject(id, bytes32) }` (ERC-8183-style, biner, evaluator = klien di demo); `demo/out/result.json` `{ channelB, txs: Hex[], private: string[], table }`; `leak-check` keluar dengan kode 1 jika ada nilai privat di calldata/log channel.

- [ ] **Step 1: Escrow kontrol + test**

`contracts/src/SimpleJobEscrow.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Kontrol demo (Pasar A): escrow job gaya ERC-8183 — evaluator tunggal, complete/reject biner, syarat di calldata.
contract SimpleJobEscrow {
    using SafeERC20 for IERC20;
    enum Status { Open, Funded, Submitted, Completed, Rejected }
    struct Job { address client; address provider; address evaluator; uint256 amount; Status status; }

    IERC20 public immutable TOKEN;
    uint256 public nextId;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address client, address provider, address evaluator, string description);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address rejector, bytes32 reason);

    constructor(address token) { TOKEN = IERC20(token); }

    /// @dev `description` membawa syarat komersial dalam teks — inilah yang bocor di Pasar A.
    function createJob(address provider, address evaluator, string calldata description) external returns (uint256 id) {
        id = nextId++;
        jobs[id] = Job(msg.sender, provider, evaluator, 0, Status.Open);
        emit JobCreated(id, msg.sender, provider, evaluator, description);
    }
    function fund(uint256 id, uint256 amount) external {
        Job storage j = jobs[id];
        require(msg.sender == j.client && j.status == Status.Open, "bad state");
        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        j.amount = amount; j.status = Status.Funded;
        emit JobFunded(id, msg.sender, amount);
    }
    function submit(uint256 id, bytes32 deliverable) external {
        Job storage j = jobs[id];
        require(msg.sender == j.provider && j.status == Status.Funded, "bad state");
        j.status = Status.Submitted;
        emit JobSubmitted(id, msg.sender, deliverable);
    }
    function complete(uint256 id, bytes32 reason) external {
        Job storage j = jobs[id];
        require(msg.sender == j.evaluator && j.status == Status.Submitted, "bad state");
        j.status = Status.Completed;
        TOKEN.safeTransfer(j.provider, j.amount);
        emit JobCompleted(id, msg.sender, reason);
    }
    function reject(uint256 id, bytes32 reason) external {
        Job storage j = jobs[id];
        require(msg.sender == j.evaluator && (j.status == Status.Submitted || j.status == Status.Funded), "bad state");
        j.status = Status.Rejected;
        TOKEN.safeTransfer(j.client, j.amount);
        emit JobRejected(id, msg.sender, reason);
    }
}
```

`contracts/test/SimpleJobEscrow.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";
import {MockUSDG} from "../src/MockUSDG.sol";

contract SimpleJobEscrowTest is Test {
    MockUSDG usdg; SimpleJobEscrow e; address client = address(0xC1); address provider = address(0xB1);

    function setUp() public { usdg = new MockUSDG(); e = new SimpleJobEscrow(address(usdg)); usdg.mint(client, 10e6); vm.prank(client); usdg.approve(address(e), type(uint256).max); }

    function _job() internal returns (uint256 id) {
        vm.startPrank(client); id = e.createJob(provider, client, "100 units @ 0.02 USDG, maxLatency 800ms"); e.fund(id, 2_000_000); vm.stopPrank();
        vm.prank(provider); e.submit(id, bytes32(uint256(1)));
    }
    function test_complete_is_all_to_provider() public { uint256 id = _job(); vm.prank(client); e.complete(id, "ok"); assertEq(usdg.balanceOf(provider), 2_000_000); }
    function test_reject_is_all_to_client() public { uint256 id = _job(); vm.prank(client); e.reject(id, "sla"); assertEq(usdg.balanceOf(client), 10e6); assertEq(usdg.balanceOf(provider), 0); }
    function test_only_evaluator() public { uint256 id = _job(); vm.prank(provider); vm.expectRevert(); e.complete(id, "x"); }
}
```
Jalankan: `cd contracts && forge test --match-contract SimpleJobEscrowTest && cd ..` → 3 PASS.

Modifikasi `DeployLocal.s.sol`: tambah `import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";`, di dalam broadcast `SimpleJobEscrow escrow = new SimpleJobEscrow(address(usdg));`, dan sebelum `serializeUint` tambah `vm.serializeAddress(j, "escrow", address(escrow));`. Deploy ulang ke Anvil (perintah Task 14 Step 1).

- [ ] **Step 2: Paket demo & `run.ts`**

```bash
cat > demo/package.json <<'EOF'
{
  "name": "@aegisclear/demo", "private": true, "type": "module",
  "scripts": { "demo": "tsx run.ts", "leak-check": "tsx leak-check.ts" },
  "dependencies": { "@aegisclear/sdk": "workspace:*", "@hono/node-server": "^2.1.1", "viem": "^2.56.8" },
  "devDependencies": { "tsx": "^4.23.13", "typescript": "^5.9.3" }
}
EOF
pnpm install
```

`demo/run.ts`:
```ts
// Demo §14: Pasar A (SimpleJobEscrow, evaluator = klien, biner) vs Pasar B (AegisClear). Prasyarat: anvil + DeployLocal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp, AegisClient, randomNonce, defaultArtifacts, erc20Balance, settle, type ChainCtx, type Terms } from "@aegisclear/sdk";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const d = JSON.parse(readFileSync(new URL("../contracts/deployments/local.json", import.meta.url), "utf8")) as { usdg: Address; factory: Address; escrow: Address };
const PK = { provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex, a: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex, b: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex };
const BREACHES = new Set([3, 17, 29, 44, 58, 71, 90]);           // EX1
const TERMS: Terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
const ctx = (pk: Hex): ChainCtx => ({ publicClient, chainId: 31337, factory: d.factory, walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }) });
const art = defaultArtifacts(new URL("..", import.meta.url).pathname);
const escrowAbi = parseAbi(["function nextId() view returns (uint256)", "function createJob(address provider, address evaluator, string description) returns (uint256)", "function fund(uint256 id, uint256 amount)", "function submit(uint256 id, bytes32 d)", "function complete(uint256 id, bytes32 r)", "function reject(uint256 id, bytes32 r)", "function approve(address,uint256) returns (bool)"]);
const provider = privateKeyToAccount(PK.provider);
const gas = async (hash: Hex) => (await publicClient.waitForTransactionReceipt({ hash })).gasUsed;

async function marketB(pk: Hex, dispute: boolean) {
  const c = new AegisClient({ ctx: ctx(pk), account: privateKeyToAccount(pk), providerUrl: "http://127.0.0.1:4021", usdg: d.usdg, artifacts: art });
  const me = privateKeyToAccount(pk).address; const c0 = await erc20Balance(ctx(pk), d.usdg, me); const p0 = await erc20Balance(ctx(pk), d.usdg, provider.address);
  await c.start();
  for (let i = 0; i < 100; i++) await c.requestUnit();
  await c.finalAck();
  if (dispute) {
    await c.dispute();
    await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any);
    await c.settle();
  } else await c.closeCooperative();
  const gasTotal = c.txs.reduce((s, t) => s + t.gasUsed, 0n);
  return { channel: c.channel, txs: c.txs, gasTotal, provingMs: c.provingMs, clientDelta: c0 - (await erc20Balance(ctx(pk), d.usdg, me)), providerDelta: (await erc20Balance(ctx(pk), d.usdg, provider.address)) - p0, local: settle(c.tree.receipts, c.terms) };
}

async function marketA(pk: Hex, accept: boolean) {
  const w = ctx(pk).walletClient; const me = privateKeyToAccount(pk).address; let g = 0n;
  g += await gas(await w.writeContract({ address: d.usdg, abi: escrowAbi, functionName: "approve", args: [d.escrow, 2_000_000n] }));
  const desc = "100 units @ 0.02 USDG; maxLatency 800ms; minQuality 90; penalty 50%; cap 30%";  // syarat bocor di calldata
  const id = await publicClient.readContract({ address: d.escrow, abi: escrowAbi, functionName: "nextId" });   // id job yang akan dibuat
  g += await gas(await w.writeContract({ address: d.escrow, abi: escrowAbi, functionName: "createJob", args: [provider.address, me, desc] }));
  g += await gas(await w.writeContract({ address: d.escrow, abi: escrowAbi, functionName: "fund", args: [id, 2_000_000n] }));
  g += await gas(await ctx(PK.provider).walletClient.writeContract({ address: d.escrow, abi: escrowAbi, functionName: "submit", args: [id, ("0x" + "1".padStart(64, "0")) as Hex] }));
  g += await gas(await w.writeContract({ address: d.escrow, abi: escrowAbi, functionName: accept ? "complete" : "reject", args: [id, ("0x" + "0".padStart(64, "0")) as Hex] }));
  return { gasTotal: g, result: accept ? "0 / 2.00" : "2.00 / 0" };
}

async function main() {
  const { app } = createProviderApp({ ctx: ctx(PK.provider), account: provider, usdg: d.usdg, terms: TERMS, unitQty: 1n, deposit: 5_000_000n, challengeWindow: 120, responseWindow: 60, metrics: (seq) => ({ m1: BREACHES.has(seq) ? 1200n : 300n, m2: 95n }) });
  const server = serve({ fetch: app.fetch, port: 4021 });
  try {
    const bCoop = await marketB(PK.a, false);
    const bDisp = await marketB(PK.b, true);
    const aOk = await marketA(PK.a, true);
    const aRej = await marketA(PK.b, false);
    const fmt = (x: bigint) => (Number(x) / 1e6).toFixed(2);
    const table = [
      { pasar: "A: evaluator biner (complete)", klien_provider: aOk.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: aOk.gasTotal.toString(), proving_ms: "-" },
      { pasar: "A: evaluator biner (reject)", klien_provider: aRej.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: aRej.gasTotal.toString(), proving_ms: "-" },
      { pasar: "B: AegisClear kooperatif", klien_provider: `${fmt(0n)} / ${fmt(bCoop.providerDelta)}`, penentu: "dua tanda tangan", terlihat: "T, R, jumlah", gas: bCoop.gasTotal.toString(), proving_ms: "-" },
      { pasar: "B: AegisClear sengketa (bukti)", klien_provider: `${fmt(bDisp.local.payToClient)} / ${fmt(bDisp.providerDelta)}`, penentu: "bukti Groth16", terlihat: "T, R, jumlah, payToClient", gas: bDisp.gasTotal.toString(), proving_ms: String(bDisp.provingMs) },
    ];
    console.table(table);
    mkdirSync(new URL("./out", import.meta.url), { recursive: true });
    const priv = [TERMS.unitPrice, TERMS.maxM1, TERMS.minM2, TERMS.penaltyBps, TERMS.capBps, TERMS.nonce, 1200n, 300n, 95n].map(String);
    writeFileSync(new URL("./out/result.json", import.meta.url), JSON.stringify({ channelB: bDisp.channel, txs: bDisp.txs.map((t) => t.hash), private: priv, table }, null, 2));
    console.log("ditulis: demo/out/result.json");
  } finally { server.close(); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```
> Angka pembagian Pasar B kooperatif: deposit 5,00 − refund − 3,00 sisa = yang dibayar klien (2,00). Jika `providerDelta` ≠ 2.000.000 atau sengketa ≠ 1.930.000 / 0,07, demo gagal — jangan "membulatkan" di tabel.

- [ ] **Step 3: `leak-check.ts` (G2)**

`demo/leak-check.ts`:
```ts
// Memindai calldata & log setiap tx channel Pasar B: tidak boleh ada kata 32-byte yang sama dengan nilai privat.
import { readFileSync } from "node:fs";
import { createPublicClient, http, type Hex } from "viem";
import { foundry } from "viem/chains";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const r = JSON.parse(readFileSync(new URL("./out/result.json", import.meta.url), "utf8")) as { channelB: string; txs: Hex[]; private: string[] };
const pc = createPublicClient({ chain: foundry, transport: http(RPC) });
const priv = new Set(r.private.map((x) => BigInt(x)));
const words = (hex: string): bigint[] => { const h = hex.replace(/^0x/, ""); const out: bigint[] = []; for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64))); return out; };

let leaks = 0, ambiguous = 0;
for (const hash of r.txs) {
  const tx = await pc.getTransaction({ hash }); const rc = await pc.getTransactionReceipt({ hash });
  const ws = [...words("0x" + tx.input.slice(10)), ...rc.logs.flatMap((l) => [...l.topics.map((t) => BigInt(t)), ...words(l.data)])];
  for (const w of ws) if (priv.has(w)) {
    if (w < 4096n && w % 32n === 0n) { ambiguous++; console.log(`ambigu (kelipatan 32, bisa offset ABI): ${w} di ${hash}`); }
    else { leaks++; console.log(`BOCOR: nilai privat ${w} muncul di ${hash}`); }
  }
}
console.log(`tx diperiksa: ${r.txs.length}, bocor: ${leaks}, ambigu: ${ambiguous}`);
process.exit(leaks ? 1 : 0);
```
> `maxM1 = 800` adalah kelipatan 32 → jika muncul, ditandai "ambigu" (offset ABI), bukan bocor. Semua nilai privat lain (20000, 90, 5000, 3000, nonce, 1200, 300, 95) harus **nol** kemunculan.

- [ ] **Step 4: Jalankan demo + leak-check, commit**

```bash
pnpm --filter @aegisclear/demo demo        # ±2–5 menit (200 unit + proving)
pnpm --filter @aegisclear/demo leak-check  # exit 0, "bocor: 0"
git add contracts/src/SimpleJobEscrow.sol contracts/test/SimpleJobEscrow.t.sol contracts/script/DeployLocal.s.sol demo/package.json demo/run.ts demo/leak-check.ts pnpm-lock.yaml
git commit -m "feat(demo): market A (binary evaluator) vs market B (AegisClear) harness with on-chain leak check"
```
Salin tabel hasil ke §14 spec (kolom "terukur") dan `docs/TOOLCHAIN.md`.

---
### Task 17: Deploy testnet 46630 (+ verifikasi Blockscout), README, artefak rilis

**Files:**
- Create: `contracts/script/DeployTestnet.s.sol`, `contracts/deployments/testnet-46630.json`, `README.md`, `.env.example`
- Modify: `sdk/test/integration.test.ts` (parametrisasi `DEPLOY_FILE`/`RPC_URL`/`PK_*`/`CHAIN_ID`)

**Interfaces:**
- Produces: alamat `usdg` (Mock), `verifier`, `factoryDemo` (min 60 s), `factoryProd` (min 21.600 s), `escrow` di 46630; README dengan matriks peran §8.6, tabel kebocoran §6.7, pernyataan T4, cara regenerasi zkey.

- [ ] **Step 1: Skrip deploy testnet**

`contracts/script/DeployTestnet.s.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";
import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";

/// Robinhood Chain testnet 46630. ETH uji: faucet.quicknode.com/robinhood/testnet atau faucets.chain.link/robinhood-testnet.
/// forge script script/DeployTestnet.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast --private-key $PK \
///   --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
contract DeployTestnet is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external {
        require(block.chainid == 46630, "wrong chain");
        vm.startBroadcast();
        MockUSDG usdg = new MockUSDG();
        SLASettlementVerifier verifier = new SLASettlementVerifier();
        AegisChannelFactory factoryDemo = new AegisChannelFactory(address(verifier), PERMIT2, 60);
        AegisChannelFactory factoryProd = new AegisChannelFactory(address(verifier), PERMIT2, 6 hours);
        SimpleJobEscrow escrow = new SimpleJobEscrow(address(usdg));
        usdg.mint(msg.sender, 1_000e6);
        vm.stopBroadcast();
        string memory j = "deploy";
        vm.serializeAddress(j, "usdg", address(usdg));
        vm.serializeAddress(j, "verifier", address(verifier));
        vm.serializeAddress(j, "factory", address(factoryDemo));
        vm.serializeAddress(j, "factoryProd", address(factoryProd));
        vm.serializeAddress(j, "escrow", address(escrow));
        string memory out = vm.serializeUint(j, "chainId", block.chainid);
        vm.writeJson(out, "deployments/testnet-46630.json");
    }
}
```
```bash
cat > .env.example <<'EOF'
# Robinhood Chain testnet
RPC_URL=https://rpc.testnet.chain.robinhood.com
CHAIN_ID=46630
PK_DEPLOYER=0x...
PK_PROVIDER=0x...
PK_CLIENT_A=0x...
PK_CLIENT_B=0x...
EOF
set -a; source .env; set +a
cd contracts && forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --private-key $PK_DEPLOYER \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ && cat deployments/testnet-46630.json && cd ..
```
Expected: 5 alamat; halaman explorer menampilkan source terverifikasi. Jika `--verify` gagal, ulangi dengan `forge verify-contract <addr> <Contract> --verifier blockscout --verifier-url ... --chain-id 46630`.

- [ ] **Step 2: Test integrasi bisa menyasar testnet**

Di `sdk/test/integration.test.ts` ganti konstanta:
```ts
const DEPLOY = process.env.DEPLOY_FILE ?? new URL("../../contracts/deployments/local.json", import.meta.url).pathname;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);
const chain = CHAIN_ID === 31337 ? foundry : defineChain({ id: CHAIN_ID, name: "robinhood-testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const PK = {
  provider: (process.env.PK_PROVIDER ?? "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as Hex,
  clientA: (process.env.PK_CLIENT_A ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex,
  clientB: (process.env.PK_CLIENT_B ?? "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6") as Hex,
};
```
(tambahkan `defineChain` ke impor viem; ganti semua `foundry` → `chain`, `31337` → `CHAIN_ID`), dan ganti dua baris `evm_increaseTime`/`evm_mine` dengan:
```ts
if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
else await new Promise((r) => setTimeout(r, 125_000));   // jendela demo 120 s nyata di testnet
```
Di testnet, akun klien/provider perlu ETH uji dan klien perlu MockUSDG: `cast send $USDG "mint(address,uint256)" $CLIENT 100000000 --rpc-url $RPC_URL --private-key $PK_DEPLOYER`.
```bash
DEPLOY_FILE=contracts/deployments/testnet-46630.json CHAIN_ID=46630 RPC_URL=$RPC_URL pnpm --filter @aegisclear/sdk test -- integration
```
Expected: 2 PASS di 46630 (±3–4 menit karena jendela nyata). Tx hash channel B = bukti liveness untuk submission.

- [ ] **Step 3: README & artefak**

`README.md` (root) wajib memuat, dalam urutan ini: satu paragraf produk (dari §0 spec); tabel alamat 46630 (dari `deployments/testnet-46630.json`) + tautan explorer; cara menjalankan (`anvil` → `DeployLocal` → `pnpm test` → `pnpm --filter @aegisclear/demo demo`); **matriks peran & kendali** (salin §8.6 spec); **tabel kebocoran** (salin §6.7); **pernyataan trusted setup** (§9.4: satu kontributor, transkrip di `circuits/ptau/` dan `circuits/build/`, `payToClient ≤ A` di kontrak); cara regenerasi zkey (`circuits/scripts/setup.sh`) beserta peringatan bahwa zkey baru = verifier baru; prior art (§1). Unggah `sla_final.zkey` + `verification_key.json` + `SLASettlementVerifier.sol` sebagai GitHub Release `v0.1.0-zkey` dan tautkan dari README (zkey tidak di-commit).

```bash
git add contracts/script/DeployTestnet.s.sol contracts/deployments/testnet-46630.json README.md .env.example sdk/test/integration.test.ts
git commit -m "chore: testnet 46630 deployment, verified contracts, README with role matrix and leakage table"
```

---

### Task 18: Gerbang D2 — benchmark Poseidon Yul vs Stylus (Hari 4 di spec; tidak memblokir Task 7–17)

**Files:**
- Create: `contracts/test/PoseidonBench.t.sol`, `stylus/poseidon-bench/{Cargo.toml,rust-toolchain.toml,src/lib.rs,src/main.rs}`, `docs/benchmarks/poseidon.md`
- Modify: `contracts/remappings.txt`, `prd-arsitektur.md` (§20 D2 → keputusan)

**Interfaces:**
- Produces: angka gas terukur `PoseidonT3.hash` (Yul, circomlib-compatible) & `PoseidonT6.hash`, rantai 7 hash; angka gas `hash(uint256[2])` & `hashChain7` Stylus (Poseidon2 OZ) di testnet 46630; keputusan D2 tercatat. **Catatan jujur:** OZ = Poseidon2, Yul = Poseidon v1 — pengukuran ini membandingkan *kelas biaya*, port v1 ke Rust adalah pekerjaan Plan 2 jika gerbang lolos.

- [ ] **Step 1: Yul benchmark + cek kompatibilitas circomlib (D3)**

```bash
cd contracts && forge install chancehudson/poseidon-solidity --no-commit && echo "poseidon-solidity/=lib/poseidon-solidity/contracts/" >> remappings.txt && cd ..
```
`contracts/test/PoseidonBench.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

contract PoseidonBenchTest is Test {
    /// circomlibjs: poseidon([1, 2]) — vektor kompatibilitas Yul ↔ sirkuit (D3)
    uint256 constant POSEIDON_1_2 = 7853200120776062878684798364095072458815029376092732009249414926327459813530;

    function test_T3_matches_circomlib_and_gas() public {
        uint256 g0 = gasleft();
        uint256 h = PoseidonT3.hash([uint256(1), uint256(2)]);
        uint256 used = g0 - gasleft();
        assertEq(h, POSEIDON_1_2, "Yul Poseidon != circomlib");
        emit log_named_uint("PoseidonT3.hash gas", used);
    }

    function test_T6_gas() public {
        uint256 g0 = gasleft();
        PoseidonT6.hash([uint256(3), 1, 300, 95, 20000]);
        emit log_named_uint("PoseidonT6.hash gas", g0 - gasleft());
    }

    function test_chain7_gas() public {
        uint256 g0 = gasleft();
        uint256 x = 5;
        for (uint256 i; i < 7; i++) x = PoseidonT3.hash([x, uint256(i)]);
        emit log_named_uint("7x PoseidonT3 (anchored ack path) gas", g0 - gasleft());
    }
}
```
Run: `cd contracts && forge test --match-contract PoseidonBenchTest -vv && cd ..`
Expected: `test_T3_matches_circomlib_and_gas` PASS (jika `assertEq` gagal, vektor konstanta di atas harus dicek ulang dengan `node -e` memakai `circomlibjs` — jangan lanjut sebelum Yul == circomlibjs); tiga angka gas tercatat (ekspektasi T3 ≈ 19–22k).

- [ ] **Step 2: Kontrak Stylus benchmark (OZ Poseidon2)**

```bash
mkdir -p stylus && cd stylus && cargo stylus new poseidon-bench && cd poseidon-bench
cat > Cargo.toml <<'EOF'
[package]
name = "poseidon-bench"
version = "0.1.0"
edition = "2021"

[dependencies]
stylus-sdk = "0.10.9"
alloy-primitives = { version = "1", default-features = false }
openzeppelin-crypto = { version = "0.3.0", features = ["ruint"] }

[lib]
crate-type = ["lib", "cdylib"]

[features]
export-abi = ["stylus-sdk/export-abi"]

[profile.release]
codegen-units = 1
strip = true
lto = true
panic = "abort"
opt-level = "s"
EOF
cat > src/lib.rs <<'EOF'
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloy_primitives::U256;
use openzeppelin_crypto::{arithmetic::uint::U256 as CU256, field::instance::FpBN256, poseidon2::{instance::bn256::BN256Params, Poseidon2}};
use stylus_sdk::prelude::*;

#[entrypoint]
#[storage]
struct PoseidonBench;

fn h2(a: U256, b: U256) -> U256 {
    let mut hasher = Poseidon2::<BN256Params, FpBN256>::new();
    hasher.absorb(&FpBN256::from_bigint(CU256::from(a)));
    hasher.absorb(&FpBN256::from_bigint(CU256::from(b)));
    hasher.squeeze().into_bigint().into()
}

#[public]
impl PoseidonBench {
    /// hash(uint256[2]) — padanan PoseidonT3
    fn hash(&self, inputs: [U256; 2]) -> U256 { h2(inputs[0], inputs[1]) }
    /// 7 hash berantai — padanan jalur ack anchored (kedalaman 7)
    fn hash_chain7(&self, seed: U256) -> U256 {
        let mut x = seed;
        for i in 0..7u64 { x = h2(x, U256::from(i)); }
        x
    }
}
EOF
cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com
```
Expected: `cargo stylus check` sukses (mencetak ukuran WASM terkompresi; catat). Jika `main.rs` bawaan template tidak cocok, isi `src/main.rs` dengan:
```rust
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#[cfg(feature = "export-abi")]
fn main() { poseidon_bench::print_abi("MIT", "pragma solidity ^0.8.24;"); }
#[cfg(not(feature = "export-abi"))]
fn main() {}
```
dan tambahkan `pub fn print_abi` sesuai template `cargo stylus new`. Jika API `openzeppelin-crypto` 0.3.0 berbeda dari cuplikan (nama modul `arithmetic::uint::U256`, `FpBN256::from_bigint`, `absorb/squeeze`), ikuti `examples/poseidon/src/lib.rs` di repo `OpenZeppelin/rust-contracts-stylus` pada tag yang cocok dengan versi crate — itu sumber cuplikan ini.

- [ ] **Step 3: Deploy ke testnet & ukur apple-to-apple dengan `cast estimate`**

```bash
set -a; source ../../.env; set +a
cargo stylus deploy --endpoint $RPC_URL --private-key $PK_DEPLOYER --no-verify   # catat alamat → $STYLUS
cast estimate $STYLUS "hash(uint256[2])(uint256)" "[1,2]" --rpc-url $RPC_URL
cast estimate $STYLUS "hashChain7(uint256)(uint256)" 5 --rpc-url $RPC_URL
cast call     $STYLUS "hash(uint256[2])(uint256)" "[1,2]" --rpc-url $RPC_URL     # ≠ POSEIDON_1_2 (Poseidon2 ≠ v1) — dicatat, bukan bug
cd ../../contracts
# Yul di testnet yang sama (linking otomatis): deploy PoseidonT3 lalu caller kecil
forge create lib/poseidon-solidity/contracts/PoseidonT3.sol:PoseidonT3 --rpc-url $RPC_URL --private-key $PK_DEPLOYER --broadcast   # → $YUL_T3
cast estimate $YUL_T3 "hash(uint256[2])(uint256)" "[1,2]" --rpc-url $RPC_URL
cd ..
```
Kurangi biaya intrinsik tx (21.000 + calldata) dari kedua estimasi sebelum membandingkan; catat pula biaya `cast estimate` **kedua** untuk Stylus (program ter-cache: init 352 vs 8.832 gas).

- [ ] **Step 4: Catat keputusan D2**

`docs/benchmarks/poseidon.md`:
```markdown
# Benchmark Poseidon — gerbang D2 (tanggal: ISI)

| Implementasi | Fungsi | Gas (Foundry) | Gas (testnet 46630, cast estimate − intrinsik) | Catatan |
|---|---|---|---|---|
| Yul `poseidon-solidity` T3 | hash([1,2]) | ISI | ISI | == circomlibjs (D3 ✅) |
| Yul T6 | hash(5 input) | ISI | – | leaf |
| Yul 7× T3 | anchored ack | ISI | – | |
| Stylus OZ Poseidon2 | hash([1,2]) | – | ISI (cache: ISI) | Poseidon2 ≠ v1 |
| Stylus OZ Poseidon2 | hashChain7 | – | ISI | |

Rasio Yul/Stylus (hash tunggal): ISI ; (rantai 7): ISI.
**Keputusan D2:** ≥ 1,5× → Plan 2 memasukkan `AegisPoseidon.rs` (port Poseidon v1, konstanta circomlib) + anchored mode di Stylus; < 1,5× → anchored mode memakai Yul, Stylus dihapus dari scope.
Ukuran WASM terkompresi: ISI KB (batas kode Robinhood Chain 96 KB).
```
Isi semua `ISI`, lalu perbarui baris D2 di §20 spec dengan keputusan dan angkanya.

```bash
git add contracts/test/PoseidonBench.t.sol contracts/remappings.txt contracts/lib/poseidon-solidity stylus/poseidon-bench docs/benchmarks/poseidon.md prd-arsitektur.md .gitmodules
git commit -m "bench: Poseidon Yul vs Stylus gate (D2) with circomlib compatibility check"
```

---

## Self-Review

**Spec coverage.** FR-1..FR-6 → Task 7/9/11; FR-7..FR-9 → Task 3/4/8; FR-10 (rollover) → **Plan 2 (P1)**; FR-11 → Task 9; FR-12/13/16/17 → Task 8; FR-14/15/18 → Task 10; FR-19/20/21 → Task 4/16 (`leak-check`)/17 (README); FR-22 → Task 6/14/17; FR-23 → Task 11 (on-chain) + Task 14 (402 `payTo`, `extra.aegis`); FR-24 → Task 14 (provider budget check); FR-25 (anchored) → gerbang Task 18, implementasi Plan 2; FR-26 (`payoutClient/Provider` bebas) → Task 7 (`Config`); router → Plan 2; FR-27 → Task 8 (`JobFunded/PaymentReleased/Refunded`); FR-28 → roadmap. INV-1/2/5/9 → Task 12; INV-3/4 → Task 10; INV-6/7/8 → Task 8/9/10; INV-10 → Task 4; INV-11 → Plan 2; INV-12 → Task 12 (fuzz). Skenario §13 nomor 1–10, 13–14 tercakup Task 8–14/16; 11–12 Plan 2. §19 V8 (facilitator Mesh menerima `payTo` arbitrer) **belum** punya task — tambahkan sebagai langkah manual sebelum submission: kirim `POST /verify` ke `https://facilitator.meshgateway.co` dengan payload skema `exact` dan `payTo = predict(cfg)` di mainnet 4663; catat hasil di §19. Deploy mainnet (D1) juga manual setelah Task 17 memakai `DeployTestnet.s.sol` yang di-copy menjadi `DeployMainnet.s.sol` dengan `USDG` asli (`0x5fc5…d168`) menggantikan `MockUSDG` dan `require(block.chainid == 4663)`.

**Placeholder scan.** Tidak ada TBD/TODO. `ISI` di Task 18 Step 4 adalah sel tabel yang diisi dari pengukuran langkah sebelumnya, bukan placeholder desain. Cuplikan Rust Task 18 memakai API `openzeppelin-crypto` per contoh resmi OZ (`examples/poseidon/src/lib.rs`, dibaca 19 Sep 2026); jika versi crate mengubah nama, sumber acuannya disebut eksplisit.

**Type consistency.** `Checkpoint { seq: number; cumulativeAmount: bigint; receiptsRoot: bigint }` dipakai identik di Task 13/14/15; kontrak menerima `(uint64, uint128, bytes32)` dan helper `submitCheckpointTx` mengonversi (`BigInt(seq)`, `rootHex`). `ProofCalldata { proof: bigint[]; inputs: bigint[] }` (Task 13) ↔ `claimPenalty(uint256[8], uint128)` dengan `inputs[5]` = `payToClient` (Task 10/13/14). `ChannelConfig` TS ↔ `AegisChannel.Config` Solidity: urutan & tipe field sama (9 field), `salt = keccak256(abi.encode(c))` di factory ↔ `predictChannel` membaca `predict()` on-chain (tidak dihitung ulang di TS). Nama fungsi `openChannel/readChannel/settleTx/sweepTx/closeCooperativeTx/submitCheckpointTx/claimPenaltyTx/erc20Transfer/erc20Balance` konsisten di Task 13–16. Vektor `EX1_7_latency_breaches` dipakai dengan nama file yang sama di Task 2/3/4/5/10/13.
