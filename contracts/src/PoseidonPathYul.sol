// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {IPoseidonPath} from "./interfaces/IPoseidonPath.sol";

/// @title PoseidonPathYul — IPoseidonPath di atas poseidon-solidity (Yul, circomlib v1). Dipakai Foundry, Anvil, dan
///        sebagai Rencana B bila program Stylus tidak tersedia. Zeros = subtree kosong: zeros[0]=0, zeros[i+1]=H(zeros[i],zeros[i]).
contract PoseidonPathYul is IPoseidonPath {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant Z1 = 14744269619966411208579211824598458697587494354926760081771325075741142829156;
    uint256 internal constant Z2 = 7423237065226347324353380772367382631490014989348495481811164164159255474657;
    uint256 internal constant Z3 = 11286972368698509976183087595462810875513684078608517520839298933882497716792;
    uint256 internal constant Z4 = 3607627140608796879659380071776844901612302623152076817094415224584923813162;
    uint256 internal constant Z5 = 19712377064642672829441595136074946683621277828620209496774504837737984048981;
    uint256 internal constant Z6 = 20775607673010627194014556968476266066927294572720319469184847051418138353016;

    error NotField();
    error BadIndex();

    function hash2(uint256 a, uint256 b) external pure returns (uint256) {
        if (a >= P || b >= P) revert NotField();
        return PoseidonT3.hash([a, b]);
    }

    function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled)
        external pure returns (uint256 root, uint256[7] memory nodes)
    {
        if (leaf >= P) revert NotField();
        if (index >= 128) revert BadIndex();
        uint256 cur = leaf;
        for (uint256 i; i < 7; i++) {
            if (filled[i] >= P) revert NotField();
            uint256 l; uint256 r;
            if ((index >> i) & 1 == 0) { l = cur; r = _zero(i); nodes[i] = cur; }
            else { l = filled[i]; r = cur; nodes[i] = filled[i]; }
            cur = PoseidonT3.hash([l, r]);
        }
        root = cur;
    }

    function _zero(uint256 level) internal pure returns (uint256) {
        if (level == 0) return 0;
        if (level == 1) return Z1;
        if (level == 2) return Z2;
        if (level == 3) return Z3;
        if (level == 4) return Z4;
        if (level == 5) return Z5;
        return Z6;
    }
}
