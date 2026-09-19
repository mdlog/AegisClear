pragma circom 2.1.6;
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Constraint set of DivBps with (x, q, r) as inputs — shared by the main circuit AND the probe test.
template DivBpsConstraints() {
    signal input x;
    signal input q;
    signal input r;
    x === q * 10000 + r;
    component rb = Num2Bits(14);      // ikat r ke [0, 2^14) sebelum komparator (soundness LessThan)
    rb.in <== r;
    component rlt = LessThan(14);
    rlt.in[0] <== r;
    rlt.in[1] <== 10000;
    rlt.out === 1;
    component qb = Num2Bits(64);
    qb.in <== q;
}

// floor(x / 10000) dengan witness (q, r), semua constraint di DivBpsConstraints
template DivBps() {
    signal input x;
    signal output q;
    signal r;
    q <-- x \ 10000;
    r <-- x % 10000;
    component c = DivBpsConstraints();
    c.x <== x;
    c.q <== q;
    c.r <== r;
}
