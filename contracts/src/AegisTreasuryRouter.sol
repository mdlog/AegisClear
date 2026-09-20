// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAegisPayoutHook} from "./interfaces/IAegisPayoutHook.sol";

/// @title AegisTreasuryRouter — memetakan agen → treasury per armada (FR-26, spec §8.4). Tanpa owner, tanpa custody
///        yang disengaja: onPayout meneruskan dalam tx yang sama; bila transfer ke tujuan gagal (mis. alamat dibekukan
///        USDG) jumlahnya tercatat sebagai kredit yang bisa ditarik agen lewat claim(). Invarian: Σcredit[token] ≤ saldo.
contract AegisTreasuryRouter is IAegisPayoutHook, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(address agent => address treasury) public treasuryOf;
    mapping(address agent => mapping(address token => uint256)) public credit;
    mapping(address token => uint256) public totalCredit;

    event TreasurySet(address indexed agent, address indexed treasury);
    event PayoutRouted(address indexed party, address indexed token, address indexed dest, uint256 amount, bool forwarded);
    event Claimed(address indexed party, address indexed token, address indexed to, uint256 amount);

    error Unbacked();
    error NothingToClaim();

    /// @notice Agen (EOA, Safe, akun 4337 — msg.sender) mengatur treasury-nya sendiri; address(0) menghapus.
    function setTreasury(address treasury) external {
        treasuryOf[msg.sender] = treasury;
        emit TreasurySet(msg.sender, treasury);
    }

    function destinationOf(address agent) public view returns (address) {
        address t = treasuryOf[agent];
        return t == address(0) ? agent : t;
    }

    /// @notice Dipanggil channel setelah mentransfer `amount` token ke router. Siapa pun boleh memanggil,
    ///         tetapi kredit hanya diberikan bila saldo router benar-benar menutupinya (Σcredit ≤ saldo).
    /// @dev PERINGATAN (I2, final-fix brief): fungsi ini permissionless DAN mengasumsikan hanya `party`
    ///      sebenarnya (via hook channel, `AegisChannel._send`) yang mentransfer token ke router TEPAT
    ///      SEBELUM memanggil `onPayout`. Token yang mendarat di alamat router DI LUAR jalur itu (mis.
    ///      transfer ERC-20 langsung ke router, bukan lewat channel) TIDAK diatribusikan ke siapa pun
    ///      secara otomatis — saldo itu hanya menambah "slack" (Σcredit < saldo) yang bisa diklaim oleh
    ///      PEMANGGIL MANA PUN lewat `onPayout(party, token, amount)` dengan `party` pilihannya sendiri,
    ///      karena kontrak ini tidak (dan tidak bisa) membedakan token yang baru masuk dari hook channel
    ///      versus token yang sudah lama nongkrong di saldo. JANGAN PERNAH mengirim token langsung ke
    ///      alamat router — channel (lewat hook `_send`) adalah satu-satunya pengirim yang dimaksud.
    function onPayout(address party, address token, uint256 amount) external nonReentrant {
        if (IERC20(token).balanceOf(address(this)) < totalCredit[token] + amount) revert Unbacked();
        address dest = destinationOf(party);
        credit[party][token] += amount;
        totalCredit[token] += amount;
        bool ok = _tryTransfer(token, dest, amount);
        if (ok) {
            credit[party][token] -= amount;
            totalCredit[token] -= amount;
        }
        emit PayoutRouted(party, token, dest, amount, ok);
    }

    /// @notice Tarik kredit yang gagal diteruskan (mis. treasury sempat dibekukan) ke alamat pilihan agen.
    function claim(address token, address to) external nonReentrant {
        uint256 a = credit[msg.sender][token];
        if (a == 0) revert NothingToClaim();
        credit[msg.sender][token] = 0;
        totalCredit[token] -= a;
        IERC20(token).safeTransfer(to, a);
        emit Claimed(msg.sender, token, to, a);
    }

    /// @dev Decode kembalian HANYA bila persis 32 byte (bool ABI standar); selain itu (kosong ATAU sampah dengan
    ///      panjang lain) tidak boleh membuat abi.decode revert — itu akan menggagalkan seluruh onPayout dan
    ///      men-dampar token yang sudah nyata masuk router tanpa jejak kredit (Task 8 Step 3c).
    function _tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool success, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!success) return false;
        if (ret.length == 0) return true;
        if (ret.length != 32) return false;
        return abi.decode(ret, (bool));
    }
}
