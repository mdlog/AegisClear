// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Smart account minimal: sah jika ditandatangani owner (pola SimpleAccount 4337).
contract Mock1271Wallet is IERC1271 {
    address public immutable owner;
    constructor(address o) { owner = o; }
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (address rec,,) = ECDSA.tryRecover(hash, sig);
        return rec == owner ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}
