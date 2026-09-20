// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Poseidon (circomlib v1, t=3) untuk pohon inkremental anchored mode (FR-25). Dua implementasi dengan
///         keluaran identik: AegisPoseidon (Stylus, Robinhood Chain) dan PoseidonPathYul (poseidon-solidity; Foundry/Anvil/Plan B).
interface IPoseidonPath {
    function hash2(uint256 a, uint256 b) external view returns (uint256);
    /// @dev cur = leaf; untuk level i = 0..6: bit i dari `index` 0 → (cur, zeros[i]) dan nodes[i] = cur;
    ///      bit 1 → (filled[i], cur) dan nodes[i] = filled[i]; cur = H(kiri, kanan). Kembalikan root (= cur) dan nodes.
    ///      Pemanggil menyimpan nodes[i] sebagai filledSubtrees[i] hanya untuk level dengan bit 0. Revert bila input ≥ p atau index ≥ 128.
    function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled) external view returns (uint256 root, uint256[7] memory nodes);
}
