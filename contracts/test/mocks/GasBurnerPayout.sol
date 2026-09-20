// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Payee kontrak yang menghabiskan seluruh gas yang diberikan — hook dibatasi stipend, settle tetap sukses.
contract GasBurnerPayout {
    uint256 public sink;
    function onPayout(address, address, uint256) external { while (true) { sink++; } }
}
