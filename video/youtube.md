# YouTube listing for the demo video

Copy as-is. Chapters follow `out/timeline.json` for the take of 23 Sep 2026; re-derive them after a re-shoot.

## Title

AegisClear: escrow at the x402 payTo, settled by a Groth16 proof

Alternatives:
- AegisClear: recourse for machine payments, without opening the books
- AegisClear: proportional SLA refunds for x402 agent payments, proved with Groth16

## Description

Agents on Robinhood Chain already pay each other in USDG over x402, and the exact scheme has no recourse. AegisClear puts an escrow state channel at the x402 payTo address. Service runs on co-signed receipts with zero transactions per unit. If the SLA is breached, the client proves the proportional refund with a Groth16 proof that the contract verifies, and the price, thresholds and metrics never reach the chain.

Built for the Arbitrum Open House Singapore: Online Buildathon.

▶ Source:        https://github.com/mdlog/AegisClear
▶ Proving key:   https://github.com/mdlog/AegisClear/releases/tag/v0.1.0-zkey
▶ Live run in this video, its channel:  https://explorer.testnet.chain.robinhood.com/address/0x996853c390E5da217Fe609C32518bBaC105974c0
▶ Its penalty claim:                    https://explorer.testnet.chain.robinhood.com/tx/0x86323841e2b5d8cc5f06478b934229cb8afa337734df2e923b0bd6253c335d63
▶ Stylus AegisPoseidon program:          https://explorer.testnet.chain.robinhood.com/address/0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34

Chapters
0:00  One job, three rails: x402 exact, a binary escrow, AegisClear
0:28  The offer: payTo is the escrow's CREATE2 address
0:44  A live dispute on testnet: fund, open, 100 units with zero transactions
1:02  The proof: Groth16 inside claimPenalty, then the challenge window
1:23  The verdict: 1.93 to the provider, 0.07 back, and zero leaks
1:42  On chain: the channel record and the penalty claim on Blockscout
1:55  Anchored mode: Poseidon on Stylus, 1.75x cheaper than Yul
2:17  Rollover: one deposit, 133 units
2:28  The honest limits

What you are looking at
- Every screen is the AegisClear operator console on localhost, talking to Robinhood Chain testnet (chain 46630) at the time of recording.
- The dispute is one real run, started on camera. The cuts skip the waiting (100 units of service, the 60-second challenge window); nothing is replayed.
- The anchored and rollover runs were run minutes before the recording, on the same deployment.
- The Blockscout pages are screenshots of the real explorer pages for this run's transaction and for the Stylus program.

Narrated with a synthetic voice. Testnet only: MockUSDG, no real funds. Mainnet is not deployed; the trusted setup has a single contributor; the audit is a self-audit.

#Arbitrum #RobinhoodChain #x402 #ZeroKnowledge #Groth16 #Stylus #AIAgents #Hackathon
