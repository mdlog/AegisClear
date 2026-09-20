// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AegisTreasuryRouter} from "../../src/AegisTreasuryRouter.sol";
/// @dev Token jahat: saat router memanggil transfer() dari dalam onPayout, ia mencoba re-enter router.claim()
///      (jalur reentrancy lintas-fungsi yang ditandai Slither ID-4). Hasil percobaan dicatat, transfer tetap jalan.
contract ReenteringToken is ERC20 {
    AegisTreasuryRouter public router;
    address public beneficiary;
    bool public reenterOk;
    bytes public reenterErr;
    constructor() ERC20("Reenter", "RE") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function arm(AegisTreasuryRouter r, address b) external { router = r; beneficiary = b; }
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (msg.sender == address(router)) {
            try router.claim(address(this), beneficiary) { reenterOk = true; } catch (bytes memory e) { reenterErr = e; }
        }
        return super.transfer(to, amount);
    }
}
