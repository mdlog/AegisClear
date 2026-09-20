// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Token "berhasil" mentransfer (tidak revert) tetapi transfer() mengembalikan 1 byte sampah — bukan bool
///      ABI 32-byte standar, dan bukan pula kembalian kosong (gaya USDT lama). `AegisTreasuryRouter._tryTransfer`
///      harus memperlakukan ini sebagai KEGAGALAN (kredit tetap tersimpan) tanpa revert abi.decode (Task 8 Step 3c).
///      Saldo sengaja tidak dipindahkan supaya assersi test tetap sederhana: hanya bentuk kembalian yang diuji di sini.
contract GarbageReturnToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address, uint256) external pure returns (bool) {
        assembly {
            mstore(0x00, 1)
            return(0x00, 1)
        }
    }
}
