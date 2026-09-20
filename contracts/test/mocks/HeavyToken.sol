// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev ERC-20 yang transfer-nya mahal secara deterministik (komputasi murni `ITERS` putaran keccak per transfer,
///      tidak bergantung warm/cold storage Foundry) — meniru biaya proxy USDG bergaya Paxos (pausable + frozen +
///      delegatecall, ~115-120k untuk seluruh hook router) agar biaya hook router bisa diatur di test.
contract HeavyToken is ERC20 {
    uint256 public immutable ITERS;
    bytes32 public last;
    constructor(uint256 iters) ERC20("Heavy", "HVY") { ITERS = iters; }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function _update(address from, address to, uint256 value) internal override {
        bytes32 h = last;
        for (uint256 i; i < ITERS; i++) h = keccak256(abi.encode(h, i));
        last = h;
        super._update(from, to, value);
    }
}
