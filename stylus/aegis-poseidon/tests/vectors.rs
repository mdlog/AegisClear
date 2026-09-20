use aegis_poseidon::poseidon::{hash2, insert_path, to_fr, to_u256};
use alloy_primitives::U256;
use std::str::FromStr;

fn u(s: &str) -> U256 { U256::from_str(s).unwrap() }
fn fixture() -> serde_json::Value {
    let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../../contracts/test/fixtures/anchored_ex1.json");
    serde_json::from_str(&std::fs::read_to_string(p).expect("fixture (jalankan pnpm --filter @aegisclear/circuits fixture:anchored)")).unwrap()
}
fn arr(v: &serde_json::Value, key: &str) -> Vec<U256> { v[key].as_array().unwrap().iter().map(|x| u(x.as_str().unwrap())).collect() }

#[test]
fn hash2_matches_circomlib_1_2() {
    let h = hash2(to_fr(U256::from(1)).unwrap(), to_fr(U256::from(2)).unwrap());
    assert_eq!(to_u256(h), u("7853200120776062878684798364095072458815029376092732009249414926327459813530"));
}

#[test]
fn zeros_chain_matches_fixture() {
    let z = arr(&fixture(), "zeros");
    for i in 0..7 { assert_eq!(to_u256(hash2(to_fr(z[i]).unwrap(), to_fr(z[i]).unwrap())), z[i + 1], "zeros[{}]", i + 1); }
}

#[test]
fn insert_path_128_leaves_matches_sdk_roots() {
    let fx = fixture();
    let leaves = arr(&fx, "leaves"); let roots = arr(&fx, "roots");
    let mut filled = [to_fr(U256::ZERO).unwrap(); 7];
    for (i, leaf) in leaves.iter().enumerate() {
        let (root, nodes) = insert_path(to_fr(*leaf).unwrap(), i, &filled);
        for l in 0..7 { if (i >> l) & 1 == 0 { filled[l] = nodes[l]; } }
        assert_eq!(to_u256(root), roots[i], "root after leaf {}", i);
    }
}

#[test]
fn to_fr_rejects_non_field() {
    assert!(to_fr(u("21888242871839275222246405745257275088548364400416034343698204186575808495617")).is_none());
    assert!(to_fr(u("21888242871839275222246405745257275088548364400416034343698204186575808495616")).is_some());
}
