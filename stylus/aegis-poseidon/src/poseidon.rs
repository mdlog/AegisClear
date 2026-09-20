//! Poseidon v1 circomlib (BN254 Fr, t = 3, 8 full + 57 partial round, S-box x^5) — port 1:1 dari
//! circomlibjs poseidon_reference.js — plus penyisipan pohon inkremental kedalaman 7 (satu panggilan = 7 hash).
use alloy_primitives::U256;
use ark_bn254::Fr;
use ark_ff::{BigInt, Field, PrimeField, Zero};

use crate::constants::{C, DEPTH, M, N_ROUNDS_F, N_ROUNDS_P, T, ZEROS};

/// U256 → Fr; None bila ≥ p (input harus elemen field, sama seperti sirkuit/SDK).
pub fn to_fr(x: U256) -> Option<Fr> { Fr::from_bigint(BigInt::<4>(x.into_limbs())) }
pub fn to_u256(f: Fr) -> U256 { U256::from_limbs(f.into_bigint().0) }

#[inline]
fn pow5(x: Fr) -> Fr { let x2 = x.square(); x2.square() * x }

/// Permutasi Poseidon atas state [0, a, b]; keluaran = state[0].
pub fn hash2(a: Fr, b: Fr) -> Fr {
    let mut state = [Fr::zero(), a, b];
    for r in 0..(N_ROUNDS_F + N_ROUNDS_P) {
        for i in 0..T { state[i] += C[r * T + i]; }
        if r < N_ROUNDS_F / 2 || r >= N_ROUNDS_F / 2 + N_ROUNDS_P {
            for s in state.iter_mut() { *s = pow5(*s); }
        } else {
            state[0] = pow5(state[0]);
        }
        let mut next = [Fr::zero(); T];
        for i in 0..T { let mut acc = Fr::zero(); for j in 0..T { acc += M[i][j] * state[j]; } next[i] = acc; }
        state = next;
    }
    state[0]
}

/// Penyisipan pohon inkremental (Semaphore/Tornado): lihat IPoseidonPath.insertPath.
pub fn insert_path(leaf: Fr, index: usize, filled: &[Fr; DEPTH]) -> (Fr, [Fr; DEPTH]) {
    let mut cur = leaf;
    let mut nodes = [Fr::zero(); DEPTH];
    for i in 0..DEPTH {
        let (l, r) = if (index >> i) & 1 == 0 { nodes[i] = cur; (cur, ZEROS[i]) } else { nodes[i] = filled[i]; (filled[i], cur) };
        cur = hash2(l, r);
    }
    (cur, nodes)
}
