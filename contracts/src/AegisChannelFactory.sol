// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AegisChannel} from "./AegisChannel.sol";

/// @title AegisChannelFactory — CREATE2 clone per Config; predict() sebelum open() (spec §8.5).
contract AegisChannelFactory {
    address public immutable IMPLEMENTATION;
    address public immutable VERIFIER;
    address public immutable PERMIT2;
    uint32 public immutable MIN_CHALLENGE_WINDOW;
    address public immutable POSEIDON;   // 0 = mode co-signed; kontrak IPoseidonPath = mode anchored (FR-25)

    event ChannelOpened(address indexed channel, address indexed client, address indexed provider, bytes32 termsCommitment);
    error WindowTooShort();

    constructor(address verifier, address permit2, uint32 minChallengeWindow, address poseidonPath) {
        IMPLEMENTATION = address(new AegisChannel(verifier, permit2, poseidonPath));
        VERIFIER = verifier; PERMIT2 = permit2; MIN_CHALLENGE_WINDOW = minChallengeWindow; POSEIDON = poseidonPath;
    }

    function salt(AegisChannel.Config calldata c) public pure returns (bytes32) { return keccak256(abi.encode(c)); }

    function predict(AegisChannel.Config calldata c) external view returns (address) {
        return Clones.predictDeterministicAddress(IMPLEMENTATION, salt(c), address(this));
    }

    /// @notice Tanda tangan boleh kosong untuk pihak yang == msg.sender.
    function open(AegisChannel.Config calldata c, bytes calldata sigClient, bytes calldata sigProvider)
        external returns (address channel)
    {
        if (c.challengeWindow < MIN_CHALLENGE_WINDOW) revert WindowTooShort();
        channel = Clones.cloneDeterministic(IMPLEMENTATION, salt(c));
        AegisChannel(channel).initialize(c, msg.sender, sigClient, sigProvider);
        emit ChannelOpened(channel, c.client, c.provider, c.termsCommitment);
    }
}
