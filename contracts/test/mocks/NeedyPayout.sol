// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Hook sah yang BUTUH hampir seluruh stipend (komputasi murni `ITERS` keccak, lalu satu SSTORE). Bila diberi
///      gas kurang ia kehabisan gas secara alami (bukan revert sengaja) — persis hook produksi yang berat.
contract NeedyPayout {
    uint256 public immutable ITERS;
    uint256 public served;
    constructor(uint256 iters) { ITERS = iters; }
    function onPayout(address, address, uint256) external {
        bytes32 x;
        for (uint256 i; i < ITERS; i++) x = keccak256(abi.encode(x, i));
        assembly { mstore(0, x) }
        served++;
    }
}
