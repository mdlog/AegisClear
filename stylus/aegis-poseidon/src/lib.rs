#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

pub mod constants;
pub mod poseidon;

use alloc::vec::Vec;
use alloy_primitives::U256;
use stylus_sdk::prelude::*;

use crate::poseidon::{hash2 as h2, insert_path as ip, to_fr, to_u256};

const ERR_NOT_FIELD: &[u8] = b"NotField";
const ERR_BAD_INDEX: &[u8] = b"BadIndex";

/// AegisPoseidon — IPoseidonPath untuk mode anchored AegisClear (FR-25). Stateless & view.
#[entrypoint]
#[storage]
struct AegisPoseidon;

#[public]
impl AegisPoseidon {
    /// hash2(uint256,uint256) → uint256 — Poseidon v1 circomlib, t = 3 (padanan PoseidonT3 / SDK `poseidon([a,b])`).
    fn hash2(&self, a: U256, b: U256) -> Result<U256, Vec<u8>> {
        let (fa, fb) = match (to_fr(a), to_fr(b)) { (Some(x), Some(y)) => (x, y), _ => return Err(ERR_NOT_FIELD.to_vec()) };
        Ok(to_u256(h2(fa, fb)))
    }
    /// insertPath(uint256,uint256,uint256[7]) → (uint256 root, uint256[7] nodes) — 7 hash dalam satu panggilan.
    fn insert_path(&self, leaf: U256, index: U256, filled: [U256; 7]) -> Result<(U256, [U256; 7]), Vec<u8>> {
        if index >= U256::from(128u64) { return Err(ERR_BAD_INDEX.to_vec()); }
        let fl = to_fr(leaf).ok_or_else(|| ERR_NOT_FIELD.to_vec())?;
        let mut ff = [ark_ff::Zero::zero(); 7];
        for i in 0..7 { ff[i] = to_fr(filled[i]).ok_or_else(|| ERR_NOT_FIELD.to_vec())?; }
        let (root, nodes) = ip(fl, index.to::<usize>(), &ff);
        let mut out = [U256::ZERO; 7];
        for i in 0..7 { out[i] = to_u256(nodes[i]); }
        Ok((to_u256(root), out))
    }
}

#[cfg(test)]
mod entrypoint_tests {
    //! Menguji pembungkus `#[public]` (batas index, penolakan ≥ p, bentuk keluaran) tanpa host Stylus — metodenya stateless.
    use super::*;
    use core::str::FromStr;

    const P: &str = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

    /// `#[storage]` menambahkan field host `__stylus_host` (stylus-sdk 0.10.9); metode kita tidak pernah menyentuhnya.
    fn contract() -> AegisPoseidon {
        AegisPoseidon { __stylus_host: stylus_sdk::host::VM { host: stylus_sdk::host::WasmVM::default() } }
    }

    #[test]
    fn hash2_wrapper_matches_reference_and_rejects_non_field() {
        let c = contract();
        let h = c.hash2(U256::from(1), U256::from(2)).unwrap();
        assert_eq!(h, U256::from_str("7853200120776062878684798364095072458815029376092732009249414926327459813530").unwrap());
        assert_eq!(c.hash2(U256::from_str(P).unwrap(), U256::ZERO), Err(ERR_NOT_FIELD.to_vec()));
        assert_eq!(c.hash2(U256::ZERO, U256::MAX), Err(ERR_NOT_FIELD.to_vec()));
    }

    #[test]
    fn insert_path_wrapper_bounds_and_nodes() {
        let c = contract();
        let zero7 = [U256::ZERO; 7];
        // index 0, leaf 0 pada pohon kosong: setiap bit 0 → nodes[i] = cur = zeros[i]; root = zeros[7].
        let (root, nodes) = c.insert_path(U256::ZERO, U256::ZERO, zero7).unwrap();
        let z = crate::constants::ZEROS.map(to_u256);
        assert_eq!(nodes, z, "bit-0 path stores the running node = zeros chain");
        assert_eq!(root, to_u256(h2(to_fr(z[6]).unwrap(), to_fr(z[6]).unwrap())), "root of empty depth-7 tree = zeros[7]");
        assert_eq!(c.insert_path(U256::ZERO, U256::from(128u64), zero7), Err(ERR_BAD_INDEX.to_vec()));
        assert!(c.insert_path(U256::ZERO, U256::from(127u64), zero7).is_ok());
        assert_eq!(c.insert_path(U256::from_str(P).unwrap(), U256::ZERO, zero7), Err(ERR_NOT_FIELD.to_vec()));
        let mut bad = zero7; bad[6] = U256::from_str(P).unwrap();
        assert_eq!(c.insert_path(U256::ZERO, U256::ZERO, bad), Err(ERR_NOT_FIELD.to_vec()));
    }

    /// Format kawat keluaran — jalur yang sama dengan router `#[public]` (AbiType::abi_encode_return):
    /// `(uint256, uint256[7])` statis → tepat 8 kata inline (root, nodes[0..7]), yang di-decode AegisChannel.ack.
    #[test]
    fn insert_path_return_encodes_as_eight_inline_words() {
        let c = contract();
        let (root, nodes) = c.insert_path(U256::from(7), U256::from(5), [U256::from(9); 7]).unwrap();
        let enc = <(U256, [U256; 7]) as stylus_sdk::abi::AbiType>::abi_encode_return(&(root, nodes));
        assert_eq!(enc.len(), 8 * 32);
        assert_eq!(U256::from_be_slice(&enc[0..32]), root);
        for i in 0..7 { assert_eq!(U256::from_be_slice(&enc[32 * (i + 1)..32 * (i + 2)]), nodes[i], "nodes[{i}]"); }
        assert_eq!(<(U256, [U256; 7]) as stylus_sdk::abi::AbiType>::ABI.as_str(), "(uint256,uint256[7])");
    }
}
