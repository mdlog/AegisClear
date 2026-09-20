//! Oracle independen dari pohon Merkle fixture: hash2(leaves[i], leaves[i+1]) untuk 20 daun pertama anchored_ex1.json,
//! nilai dihitung sekali oleh circomlibjs (scripts/pairwise_vectors.mjs → tests/pairwise.json, di-commit).
use aegis_poseidon::poseidon::{hash2, to_fr, to_u256};
use alloy_primitives::U256;
use std::str::FromStr;

#[test]
fn hash2_pairwise_leaves_match_circomlibjs() {
    let raw = include_str!("pairwise.json");
    let v: serde_json::Value = serde_json::from_str(raw).unwrap();
    let vectors = v["vectors"].as_array().unwrap();
    assert_eq!(vectors.len(), 19, "20 daun → 19 pasangan berurutan");
    let u = |x: &serde_json::Value| U256::from_str(x.as_str().unwrap()).unwrap();
    for (i, vec) in vectors.iter().enumerate() {
        let (a, b, h) = (u(&vec["a"]), u(&vec["b"]), u(&vec["h"]));
        assert_ne!(a, b, "pasangan {i}: input identik tidak menguji apa pun");
        let got = to_u256(hash2(to_fr(a).unwrap(), to_fr(b).unwrap()));
        assert_eq!(got, h, "hash2(leaves[{i}], leaves[{}])", i + 1);
        // Poseidon tidak komutatif — urutan argumen harus berpengaruh (menangkap tukar kiri/kanan di insert_path).
        assert_ne!(to_u256(hash2(to_fr(b).unwrap(), to_fr(a).unwrap())), h, "pasangan {i}: hash2 komutatif?");
    }
}
