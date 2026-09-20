// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Payee kontrak yang mencatat gas yang diterimanya di onPayout dan (bila `burn`) menghabiskan hampir
///      semuanya TANPA revert — supaya nilai yang dicatat tetap ada setelah panggilan.
contract GasProbePayout {
    uint256 public seen;
    bool public burn;
    function setBurn(bool b) external { burn = b; }
    function onPayout(address, address, uint256) external {
        seen = gasleft();
        if (burn) {
            bytes32 x;
            while (gasleft() > 600) { x = keccak256(abi.encode(x)); }
            assembly { mstore(0, x) }   // sink murah agar loop tidak dioptimalkan
        }
    }
}
