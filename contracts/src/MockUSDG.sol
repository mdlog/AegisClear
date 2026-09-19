// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Pengganti USDG untuk testnet/Anvil. 6 desimal seperti USDG asli (FR-22). Hanya untuk uji.
contract MockUSDG is ERC20 {
    constructor() ERC20("Mock Global Dollar", "USDG") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
