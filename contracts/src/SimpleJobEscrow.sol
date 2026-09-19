// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Kontrol demo (Pasar A): escrow job gaya ERC-8183 — evaluator tunggal, complete/reject biner, syarat di calldata.
contract SimpleJobEscrow {
    using SafeERC20 for IERC20;
    enum Status { Open, Funded, Submitted, Completed, Rejected }
    struct Job { address client; address provider; address evaluator; uint256 amount; Status status; }

    IERC20 public immutable TOKEN;
    uint256 public nextId;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address client, address provider, address evaluator, string description);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address rejector, bytes32 reason);

    constructor(address token) { TOKEN = IERC20(token); }

    /// @dev `description` membawa syarat komersial dalam teks — inilah yang bocor di Pasar A.
    function createJob(address provider, address evaluator, string calldata description) external returns (uint256 id) {
        id = nextId++;
        jobs[id] = Job(msg.sender, provider, evaluator, 0, Status.Open);
        emit JobCreated(id, msg.sender, provider, evaluator, description);
    }
    function fund(uint256 id, uint256 amount) external {
        Job storage j = jobs[id];
        require(msg.sender == j.client && j.status == Status.Open, "bad state");
        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        j.amount = amount; j.status = Status.Funded;
        emit JobFunded(id, msg.sender, amount);
    }
    function submit(uint256 id, bytes32 deliverable) external {
        Job storage j = jobs[id];
        require(msg.sender == j.provider && j.status == Status.Funded, "bad state");
        j.status = Status.Submitted;
        emit JobSubmitted(id, msg.sender, deliverable);
    }
    function complete(uint256 id, bytes32 reason) external {
        Job storage j = jobs[id];
        require(msg.sender == j.evaluator && j.status == Status.Submitted, "bad state");
        j.status = Status.Completed;
        TOKEN.safeTransfer(j.provider, j.amount);
        emit JobCompleted(id, msg.sender, reason);
    }
    function reject(uint256 id, bytes32 reason) external {
        Job storage j = jobs[id];
        require(msg.sender == j.evaluator && (j.status == Status.Submitted || j.status == Status.Funded), "bad state");
        j.status = Status.Rejected;
        TOKEN.safeTransfer(j.client, j.amount);
        emit JobRejected(id, msg.sender, reason);
    }
}
