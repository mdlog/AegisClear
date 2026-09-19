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
    component rb = Num2Bits(14);
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
    component penB = Num2Bits(14); penB.in <== penaltyBps;
    component penLe = LessEqThan(14); penLe.in[0] <== penaltyBps; penLe.in[1] <== 10000; penLe.out === 1;
    component capB = Num2Bits(14); capB.in <== capBps;
    component capLe = LessEqThan(14); capLe.in[0] <== capBps;     capLe.in[1] <== 10000; capLe.out === 1;
    component seqB = Num2Bits(8); seqB.in <== seq;
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
