// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Hook opsional yang dipanggil AegisChannel SETELAH token dikirim ke payee kontrak (FR-26).
///         Best-effort: channel memanggilnya dengan stipend gas terbatas di dalam try/catch — kegagalan diabaikan.
interface IAegisPayoutHook {
    function onPayout(address party, address token, uint256 amount) external;
}
