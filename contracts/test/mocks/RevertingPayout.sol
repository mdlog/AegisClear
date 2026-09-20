// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Payee kontrak yang selalu revert di onPayout (dan fallback) — tidak boleh menyandera settle.
contract RevertingPayout {
    function onPayout(address, address, uint256) external pure { revert("nope"); }
    fallback() external payable { revert("nope"); }
}
