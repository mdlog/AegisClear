#!/usr/bin/env python3
"""AegisClear — referensi penyelesaian (§6.3 prd-arsitektur.md) & generator vektor uji.

Semantik di file ini adalah SUMBER KEBENARAN untuk tiga implementasi:
  - sirkuit  circuits/sla_settlement.circom   (constraint C1..C10, §9.2)
  - SDK      @aegisclear/core  Prover.settlement()
  - kontrak  AegisChannel.settle()            (memakai payToClient dari bukti)
Semua aritmetika integer; satuan atomik USDG (6 desimal).

Pakai:  python3 tools/settlement_vectors.py            # cetak EX1–EX3 + kasus tepi
        python3 tools/settlement_vectors.py --json out/ # tulis vektor JSON untuk snarkjs/Foundry
"""
import json, os, random, sys

BPS = 10_000
MAX_SEQ = 128


def settle(receipts, terms):
    """receipts: list of dict(seq, qty, m1, m2, due); terms: dict(unitPrice, maxM1, minM2, penaltyBps, capBps).
    Mengembalikan (cumulativeAmount, breaches, penRaw, cap, payToClient, payToProvider)."""
    p, L, Q, pen_bps, cap_bps = (terms[k] for k in ("unitPrice", "maxM1", "minM2", "penaltyBps", "capBps"))
    assert 0 <= pen_bps <= BPS and 0 <= cap_bps <= BPS and len(receipts) <= MAX_SEQ
    for i, r in enumerate(receipts):
        assert r["seq"] == i, "seq harus 0..n-1 berurutan"
        assert r["due"] == r["qty"] * p, "C3: due == qty * unitPrice"
        assert max(r["qty"], r["m1"], r["m2"]) < 2**32 and r["due"] < 2**64, "C10 range"
    cum = sum(r["due"] for r in receipts)                              # C6
    breaches = [(r["m1"] > L) or (r["m2"] < Q) for r in receipts]       # C7
    pen_raw = sum(r["due"] * pen_bps // BPS for r, b in zip(receipts, breaches) if b)  # C8
    cap = cum * cap_bps // BPS                                          # C9
    pay_client = min(pen_raw, cap)
    assert pay_client <= cum                                            # FR-18
    return cum, sum(breaches), pen_raw, cap, pay_client, cum - pay_client


def mk(n, qty=1, m1=300, m2=95, p=20_000, breach_idx=(), breach_m1=1200, breach_m2=None):
    rs = []
    for i in range(n):
        b = i in breach_idx
        rs.append({"seq": i, "qty": qty,
                   "m1": (breach_m1 if b and breach_m1 is not None else m1),
                   "m2": (breach_m2 if b and breach_m2 is not None else m2),
                   "due": qty * p})
    return rs


TERMS = {"unitPrice": 20_000, "maxM1": 800, "minM2": 90, "penaltyBps": 5_000, "capBps": 3_000, "nonce": 0}

VECTORS = {
    "EX1_7_latency_breaches": (mk(100, breach_idx=(3, 17, 29, 44, 58, 71, 90)), TERMS),
    "EX2_cap_binds_80_breaches": (mk(100, breach_idx=range(80)), TERMS),
    "EX3_qty5_2_quality_breaches": (mk(20, qty=5, breach_idx=(0, 10), breach_m1=None, breach_m2=70), TERMS),
    "EDGE_seq0": ([], TERMS),
    "EDGE_seq128_all_breach": (mk(128, breach_idx=range(128)), TERMS),
    "EDGE_cap0": (mk(10, breach_idx=(0,)), {**TERMS, "capBps": 0}),
    "EDGE_cap100_pen100": (mk(10, breach_idx=range(10)), {**TERMS, "capBps": BPS, "penaltyBps": BPS}),
    "EDGE_qty0_slot": (mk(3, qty=0), TERMS),
}


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
    for v in out.values():
        v["terms"] = {**v["terms"], "nonce": str(v["terms"]["nonce"])}
    if "--json" in args:
        d = args[args.index("--json") + 1]
        os.makedirs(d, exist_ok=True)
        for name, v in out.items():
            with open(os.path.join(d, f"{name}.json"), "w") as f:
                json.dump(v, f)
        print(f"{len(out)} vektor ditulis ke {d}/")


if __name__ == "__main__":
    main()
