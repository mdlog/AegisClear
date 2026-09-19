// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

contract PoseidonBenchTest is Test {
    /// circomlibjs: poseidon([1, 2]) — vektor kompatibilitas Yul ↔ sirkuit (D3)
    uint256 constant POSEIDON_1_2 = 7853200120776062878684798364095072458815029376092732009249414926327459813530;

    function test_T3_matches_circomlib_and_gas() public {
        uint256 g0 = gasleft();
        uint256 h = PoseidonT3.hash([uint256(1), uint256(2)]);
        uint256 used = g0 - gasleft();
        assertEq(h, POSEIDON_1_2, "Yul Poseidon != circomlib");
        emit log_named_uint("PoseidonT3.hash gas", used);
    }

    function test_T6_gas() public {
        uint256 g0 = gasleft();
        PoseidonT6.hash([uint256(3), 1, 300, 95, 20000]);
        emit log_named_uint("PoseidonT6.hash gas", g0 - gasleft());
    }

    function test_chain7_gas() public {
        uint256 g0 = gasleft();
        uint256 x = 5;
        for (uint256 i; i < 7; i++) x = PoseidonT3.hash([x, uint256(i)]);
        emit log_named_uint("7x PoseidonT3 (anchored ack path) gas", g0 - gasleft());
    }
}
