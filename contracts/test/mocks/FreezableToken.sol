// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev USDG-like token dengan freeze per alamat (transfer KE alamat beku revert) — simulasi Paxos freeze (T8).
contract FreezableToken is ERC20 {
    mapping(address => bool) public frozen;
    constructor() ERC20("Freezable", "FRZ") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function freeze(address a, bool f) external { frozen[a] = f; }
    function _update(address from, address to, uint256 value) internal override {
        require(!frozen[to] && !frozen[from], "frozen");
        super._update(from, to, value);
    }
}
