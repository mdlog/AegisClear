// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";
import {MockUSDG} from "../src/MockUSDG.sol";

contract SimpleJobEscrowTest is Test {
    MockUSDG usdg; SimpleJobEscrow e; address client = address(0xC1); address provider = address(0xB1);

    function setUp() public { usdg = new MockUSDG(); e = new SimpleJobEscrow(address(usdg)); usdg.mint(client, 10e6); vm.prank(client); usdg.approve(address(e), type(uint256).max); }

    function _job() internal returns (uint256 id) {
        vm.startPrank(client); id = e.createJob(provider, client, "100 units @ 0.02 USDG, maxLatency 800ms"); e.fund(id, 2_000_000); vm.stopPrank();
        vm.prank(provider); e.submit(id, bytes32(uint256(1)));
    }
    function test_complete_is_all_to_provider() public { uint256 id = _job(); vm.prank(client); e.complete(id, "ok"); assertEq(usdg.balanceOf(provider), 2_000_000); }
    function test_reject_is_all_to_client() public { uint256 id = _job(); vm.prank(client); e.reject(id, "sla"); assertEq(usdg.balanceOf(client), 10e6); assertEq(usdg.balanceOf(provider), 0); }
    function test_only_evaluator() public { uint256 id = _job(); vm.prank(provider); vm.expectRevert(); e.complete(id, "x"); }
}
