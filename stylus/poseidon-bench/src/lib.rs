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
