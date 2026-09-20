// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {PoseidonPathYul} from "../src/PoseidonPathYul.sol";
import {IPoseidonPath} from "../src/interfaces/IPoseidonPath.sol";

contract PoseidonPathYulTest is Test {
    using stdJson for string;
    IPoseidonPath p;
    string fx;

    function setUp() public {
        p = new PoseidonPathYul();
        fx = vm.readFile("test/fixtures/anchored_ex1.json");
    }
    function _arr(string memory key) internal view returns (uint256[] memory) { return fx.readUintArray(key); }

    function test_hash2_matches_circomlib() public view {
        assertEq(p.hash2(1, 2), 7853200120776062878684798364095072458815029376092732009249414926327459813530);
    }
    function test_zeros_chain() public view {
        uint256[] memory z = _arr(".zeros");
        for (uint256 i; i < 7; i++) assertEq(p.hash2(z[i], z[i]), z[i + 1]);
        assertEq(z[7], fx.readUint(".emptyRoot"));
    }
    function test_insertPath_128_leaves_incrementally_matches_sdk_roots() public view {
        uint256[] memory leaves = _arr(".leaves"); uint256[] memory roots = _arr(".roots");
        uint256[7] memory filled;
        for (uint256 i; i < leaves.length; i++) {
            (uint256 root, uint256[7] memory nodes) = p.insertPath(leaves[i], i, filled);
            for (uint256 l; l < 7; l++) if ((i >> l) & 1 == 0) filled[l] = nodes[l];
            assertEq(root, roots[i], "root mismatch");
        }
    }
    function test_insertPath_rejects_non_field_and_bad_index() public {
        uint256[7] memory filled;
        vm.expectRevert(PoseidonPathYul.NotField.selector);
        p.insertPath(21888242871839275222246405745257275088548364400416034343698204186575808495617, 0, filled);
        vm.expectRevert(PoseidonPathYul.BadIndex.selector);
        p.insertPath(1, 128, filled);
        vm.expectRevert(PoseidonPathYul.NotField.selector);
        p.hash2(21888242871839275222246405745257275088548364400416034343698204186575808495617, 0);
    }
    function test_insertPath_gas_report() public view {
        uint256[7] memory filled;
        uint256 g0 = gasleft();
        p.insertPath(1, 5, filled);
        console.log("PoseidonPathYul.insertPath (7 hash) gas:", g0 - gasleft());
    }
}
