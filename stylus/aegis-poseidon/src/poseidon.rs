//! Poseidon v1 circomlib (BN254 Fr, t = 3, 8 full + 57 partial round, S-box x^5) — port 1:1 dari
//! circomlibjs `poseidon_opt.js` (algoritma teroptimasi neptune: konstanta round dilipat, partial round memakai
//! matriks jarang S alih-alih MDS penuh; keluaran identik dengan `poseidon_reference.js`) — plus penyisipan pohon
//! inkremental kedalaman 7 (satu panggilan = 7 hash).
use alloy_primitives::U256;
use ark_bn254::{Fr, FrConfig};
use ark_ff::{BigInt, Field, MontConfig, Zero};

use crate::constants::{C_OPT, DEPTH, M_OPT, N_ROUNDS_F, N_ROUNDS_P, P_OPT, S_OPT, T, ZEROS};

/// U256 → Fr; None bila ≥ p (input harus elemen field, sama seperti sirkuit/SDK). Sama dengan `Fr::from_bigint`
/// (cek < p, lalu ×R² lewat perkalian Montgomery) tetapi memakai `fmul` bersama, bukan salinan `mul` inline (−3 KB).
pub fn to_fr(x: U256) -> Option<Fr> {
    let r = Fr::new_unchecked(BigInt::<4>(x.into_limbs()));
    if r.is_geq_modulus() { None } else { Some(fmul(&r, &Fr::new_unchecked(<FrConfig as MontConfig<4>>::R2))) }
}
/// Fr → U256 kanonis: f·1·R⁻¹ lewat `fmul` dengan 1 mentah (= `into_bigint`, tanpa salinan reduksi Montgomery terpisah).
pub fn to_u256(f: Fr) -> U256 { let canon: BigInt<4> = fmul(&f, &Fr::new_unchecked(BigInt::<4>::one())).0; U256::from_limbs(canon.0) }

/// Perkalian, kuadrat, dot product, campur, dan full round sebagai SATU salinan kode (`#[inline(never)]`): tubuh
/// `Fr::mul` ≈ 600 instruksi wasm, dan pada `opt-level = 3` LLVM menyalinnya ke setiap titik panggil (hash2 sendiri
/// ≈ 20 KB) sehingga program melewati batas 24 KB terkompresi (konstanta teroptimasi = 12,3 KB data yang tak
/// terkompresi). Biaya per panggilan hanya beberapa instruksi dibanding ≈ 600 di dalamnya (+0,7 % instruksi per hash,
/// terukur dengan wasmi).
#[inline(never)]
fn fmul(a: &Fr, b: &Fr) -> Fr { *a * b }
#[inline(never)]
fn fsq(a: &Fr) -> Fr { a.square() }

#[inline]
fn pow5(x: Fr) -> Fr { let x2 = fsq(&x); fmul(&fsq(&x2), &x) }

/// Σ_j a[j]·b[j] dengan SATU reduksi Montgomery (ark-ff `sum_of_products`, Algoritma 2 zkcrypto/bls12_381#84;
/// BN254 Fr punya 2 bit cadangan → chunk 3 pasangan): ≈ 64 mac, bukan 3 × 32 + 2 penjumlahan.
#[inline(never)]
fn dot3(a: &[Fr; T], b: &[Fr; T]) -> Fr { Fr::sum_of_products(a, b) }

/// Campur linear persis seperti JS (`poseidon_opt.js:74-76`): keluaran[i] = Σ_j m[j][i] · state[j].
#[inline(never)]
fn mix(m: &[[Fr; T]; T], state: &[Fr; T]) -> [Fr; T] {
    let mut out = [Fr::zero(); T];
    for i in 0..T { out[i] = dot3(&[m[0][i], m[1][i], m[2][i]], state); }
    out
}

/// Satu full round (:71-77, :78-82, :96-102, :103-106): S-box semua, ARK dengan `c[0..t)` bila ada, campur `m`.
/// Satu salinan kode yang dipanggil 8× per hash (bukan 8 salinan unrolled ≈ 6 KB).
#[inline(never)]
fn full_round(state: &mut [Fr; T], c: Option<&[Fr]>, m: &[[Fr; T]; T]) {
    for s in state.iter_mut() { *s = pow5(*s); }
    if let Some(c) = c { for (s, c) in state.iter_mut().zip(c) { *s += *c; } }
    *state = mix(m, state);
}

/// Permutasi Poseidon atas state [0, a, b]; keluaran = state[0]. Nomor baris merujuk circomlibjs `src/poseidon_opt.js`.
pub fn hash2(a: Fr, b: Fr) -> Fr {
    const HALF_F: usize = N_ROUNDS_F / 2; // 4
    let mut state = [Fr::zero(), a, b];
    // :69 — ARK awal dengan C[0..t)
    for i in 0..T { state[i] += C_OPT[i]; }
    // :71-77 — nRoundsF/2 − 1 = 3 full round: S-box semua, ARK C[(r+1)·t + i], campur M
    for r in 0..(HALF_F - 1) { full_round(&mut state, Some(&C_OPT[(r + 1) * T..(r + 2) * T]), &M_OPT); }
    // :78-82 — full round ke-4: S-box semua, ARK C[(nRoundsF/2)·t + i], campur dengan P (pra-jarang)
    full_round(&mut state, Some(&C_OPT[HALF_F * T..(HALF_F + 1) * T]), &P_OPT);
    // :83-95 — 57 partial round: S-box hanya state[0], SATU konstanta C[(nRoundsF/2+1)·t + r], lalu matriks jarang S:
    //   state[0]' = Σ_j S[5r + j]·state[j];  state[k] += state[0]·S[5r + t + k − 1] (k = 1, 2; memakai state[0] pra-campur)
    for r in 0..N_ROUNDS_P {
        state[0] = pow5(state[0]);
        state[0] += C_OPT[(HALF_F + 1) * T + r];
        let s = &S_OPT[(2 * T - 1) * r..(2 * T - 1) * (r + 1)];
        let s0 = dot3(&[s[0], s[1], s[2]], &state);
        for k in 1..T { state[k] += fmul(&state[0], &s[T + k - 1]); }
        state[0] = s0;
    }
    // :96-102 — 3 full round terakhir: S-box semua, ARK C[(nRoundsF/2+1)·t + nRoundsP + r·t + i], campur M
    for r in 0..(HALF_F - 1) {
        let c0 = (HALF_F + 1) * T + N_ROUNDS_P + r * T;
        full_round(&mut state, Some(&C_OPT[c0..c0 + T]), &M_OPT);
    }
    // :103-106 — round terakhir: S-box semua lalu campur M, tanpa ARK
    full_round(&mut state, None, &M_OPT);
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

#[cfg(test)]
mod tests {
    //! `dot3` (ark-ff `sum_of_products`, satu reduksi) harus sama dengan tiga perkalian + dua penjumlahan biasa —
    //! termasuk representasi internal ekstrem (0, 1, p−1, limb penuh) yang tidak tersentuh fixture.
    use super::*;
    use ark_ff::PrimeField;

    fn naive(a: &[Fr; T], b: &[Fr; T]) -> Fr { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

    #[test]
    fn dot3_equals_naive_products_on_random_and_extremal_inputs() {
        let p = Fr::MODULUS;
        let mut p_minus_1 = p; p_minus_1.0[0] -= 1;
        // Representasi internal (Montgomery) apa pun < p sah — new_unchecked mencakup seluruh ruang representasi.
        let extremes: [Fr; 5] = [
            Fr::new_unchecked(BigInt::<4>::zero()),
            Fr::new_unchecked(BigInt::<4>::one()),
            Fr::new_unchecked(p_minus_1),
            Fr::new_unchecked(BigInt::<4>([u64::MAX, u64::MAX, u64::MAX, 0])),
            Fr::new_unchecked(BigInt::<4>([u64::MAX, u64::MAX, u64::MAX, p.0[3] - 1])),
        ];
        for a0 in extremes { for a1 in extremes { for a2 in extremes { for b in extremes {
            let a = [a0, a1, a2]; let bb = [b, a2, a0];
            assert_eq!(dot3(&a, &bb), naive(&a, &bb));
            assert_eq!(dot3(&bb, &a), naive(&bb, &a));
        }}}}
        // xorshift64* deterministik → 20.000 triple acak (elemen kanonis via from_bigint dengan limb teratas dipangkas).
        let mut x = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = || { x ^= x >> 12; x ^= x << 25; x ^= x >> 27; x.wrapping_mul(0x2545_F491_4F6C_DD1D) };
        let mut rand_fr = || loop {
            let limbs = [next(), next(), next(), next() >> 2];
            if let Some(f) = Fr::from_bigint(BigInt::<4>(limbs)) { return f; }
        };
        for _ in 0..20_000 {
            let a = [rand_fr(), rand_fr(), rand_fr()]; let b = [rand_fr(), rand_fr(), rand_fr()];
            assert_eq!(dot3(&a, &b), naive(&a, &b));
        }
    }
}
