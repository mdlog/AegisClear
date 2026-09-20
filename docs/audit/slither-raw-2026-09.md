# Slither raw output — 2026-09 (AegisClear `contracts/`)

Raw `--checklist` output of Slither 0.11.5 (solc 0.8.28 via Foundry), trimmed only as follows: the 59 `naming-convention`
results are compacted to one line each (links stripped), and the Foundry build log lines are removed. Everything else
is verbatim. Triage and verdicts live in [`slither-2026-09.md`](./slither-2026-09.md).

Command (run from `contracts/`):

```sh
slither . --filter-paths "lib/|test/|script/" --exclude-dependencies --checklist
slither . --filter-paths "lib/|test/|script/" --exclude-dependencies --print human-summary
```

Line numbers in the "before" run refer to commit `4144d3d` (branch `feat/aegisclear-p1-ship`); the "after" run refers to
the tree with the fixes of this audit applied (`AegisChannel._send` gas check, `AegisChannelFactory` zero-address checks),
which shifts `AegisChannel.sol` lines by +1 (error) / +11 (`_send` docs) and `AegisChannelFactory.sol` by +3/+4.

---

## BEFORE fixes (commit 4144d3d) — 77 results

```text
**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [incorrect-return](#incorrect-return) (3 results) (High)
 - [incorrect-equality](#incorrect-equality) (1 results) (Medium)
 - [reentrancy-no-eth](#reentrancy-no-eth) (1 results) (Medium)
 - [missing-zero-check](#missing-zero-check) (3 results) (Low)
 - [reentrancy-events](#reentrancy-events) (1 results) (Low)
 - [timestamp](#timestamp) (2 results) (Low)
 - [assembly](#assembly) (4 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [missing-inheritance](#missing-inheritance) (1 results) (Informational)
 - [naming-convention](#naming-convention) (59 results) (Informational)
```

### incorrect-return

```text
Impact: High
Confidence: Medium
 - [ ] ID-0
[SLASettlementVerifier.verifyProof.asm_0.checkPairing()](src/SLASettlementVerifier.sol#L109-L176) calls [SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC()](src/SLASettlementVerifier.sol#L84-L107) which halt the execution [return(uint256,uint256)(0,0x20)](src/SLASettlementVerifier.sol#L105)

src/SLASettlementVerifier.sol#L109-L176


 - [ ] ID-1
[SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])](src/SLASettlementVerifier.sol#L74-L202) calls [SLASettlementVerifier.verifyProof.asm_0.checkField()](src/SLASettlementVerifier.sol#L76-L81) which halt the execution [return(uint256,uint256)(0,0x20)](src/SLASettlementVerifier.sol#L79)

src/SLASettlementVerifier.sol#L74-L202


 - [ ] ID-2
[SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])](src/SLASettlementVerifier.sol#L74-L202) calls [SLASettlementVerifier.verifyProof.asm_0.checkPairing()](src/SLASettlementVerifier.sol#L109-L176) which halt the execution [return(uint256,uint256)(0,0x20)](src/SLASettlementVerifier.sol#L105)

src/SLASettlementVerifier.sol#L74-L202
```

### incorrect-equality

```text
Impact: Medium
Confidence: High
 - [ ] ID-3
[AegisChannel._send(address,address,uint256)](src/AegisChannel.sol#L311-L317) uses a dangerous strict equality:
	- [amount == 0](src/AegisChannel.sol#L312)

src/AegisChannel.sol#L311-L317
```

### reentrancy-no-eth

```text
Impact: Medium
Confidence: Medium
 - [ ] ID-4
Reentrancy in [AegisTreasuryRouter.onPayout(address,address,uint256)](src/AegisTreasuryRouter.sol#L48-L59):
	External calls:
	- [ok = _tryTransfer(token,dest,amount)](src/AegisTreasuryRouter.sol#L53)
		- [(success,ret) = token.call(abi.encodeCall(IERC20.transfer,(to,amount)))](src/AegisTreasuryRouter.sol#L75)
	State variables written after the call(s):
	- [credit[party][token] -= amount](src/AegisTreasuryRouter.sol#L55)
	[AegisTreasuryRouter.credit](src/AegisTreasuryRouter.sol#L16) can be used in cross function reentrancies:
	- [AegisTreasuryRouter.credit](src/AegisTreasuryRouter.sol#L16)
	- [totalCredit[token] -= amount](src/AegisTreasuryRouter.sol#L56)
	[AegisTreasuryRouter.totalCredit](src/AegisTreasuryRouter.sol#L17) can be used in cross function reentrancies:
	- [AegisTreasuryRouter.totalCredit](src/AegisTreasuryRouter.sol#L17)

src/AegisTreasuryRouter.sol#L48-L59
```

### missing-zero-check

```text
Impact: Low
Confidence: Medium
 - [ ] ID-5
[AegisChannelFactory.constructor(address,address,uint32,address).verifier](src/AegisChannelFactory.sol#L19) lacks a zero-check on :
		- [IMPLEMENTATION = address(new AegisChannel(verifier,permit2,poseidonPath))](src/AegisChannelFactory.sol#L20)
		- [VERIFIER = verifier](src/AegisChannelFactory.sol#L21)

src/AegisChannelFactory.sol#L19


 - [ ] ID-6
[AegisChannelFactory.constructor(address,address,uint32,address).poseidonPath](src/AegisChannelFactory.sol#L19) lacks a zero-check on :
		- [IMPLEMENTATION = address(new AegisChannel(verifier,permit2,poseidonPath))](src/AegisChannelFactory.sol#L20)
		- [POSEIDON = poseidonPath](src/AegisChannelFactory.sol#L21)

src/AegisChannelFactory.sol#L19


 - [ ] ID-7
[AegisChannelFactory.constructor(address,address,uint32,address).permit2](src/AegisChannelFactory.sol#L19) lacks a zero-check on :
		- [IMPLEMENTATION = address(new AegisChannel(verifier,permit2,poseidonPath))](src/AegisChannelFactory.sol#L20)
		- [PERMIT2 = permit2](src/AegisChannelFactory.sol#L21)

src/AegisChannelFactory.sol#L19
```

### reentrancy-events

```text
Impact: Low
Confidence: Medium
 - [ ] ID-8
Reentrancy in [AegisChannelFactory.open(AegisChannel.Config,bytes,bytes)](src/AegisChannelFactory.sol#L31-L39):
	External calls:
	- [AegisChannel(channel).initialize(c,msg.sender,sigClient,sigProvider)](src/AegisChannelFactory.sol#L37)
	Event emitted after the call(s):
	- [ChannelOpened(channel,c.client,c.provider,c.termsCommitment)](src/AegisChannelFactory.sol#L38)

src/AegisChannelFactory.sol#L31-L39
```

### timestamp

```text
Impact: Low
Confidence: Medium
 - [ ] ID-9
[AegisChannel.submitCheckpoint(uint64,uint128,bytes32,bytes,bytes)](src/AegisChannel.sol#L162-L183) uses timestamp for comparisons
	Dangerous comparisons:
	- [ext > deadline](src/AegisChannel.sol#L180)

src/AegisChannel.sol#L162-L183


 - [ ] ID-10
[AegisChannel.settle()](src/AegisChannel.sol#L233-L238) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < deadline](src/AegisChannel.sol#L235)

src/AegisChannel.sol#L233-L238
```

### assembly

```text
Impact: Informational
Confidence: High
 - [ ] ID-11
[SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])](src/SLASettlementVerifier.sol#L74-L202) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L75-L201)

src/SLASettlementVerifier.sol#L74-L202


 - [ ] ID-12
[SLASettlementVerifier.verifyProof.asm_0.checkPairing()](src/SLASettlementVerifier.sol#L109-L176) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L109-L176)

src/SLASettlementVerifier.sol#L109-L176


 - [ ] ID-13
[SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC()](src/SLASettlementVerifier.sol#L84-L107) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L84-L107)

src/SLASettlementVerifier.sol#L84-L107


 - [ ] ID-14
[SLASettlementVerifier.verifyProof.asm_0.checkField()](src/SLASettlementVerifier.sol#L76-L81) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L76-L81)

src/SLASettlementVerifier.sol#L76-L81
```

### solc-version

```text
Impact: Informational
Confidence: High
 - [ ] ID-15
Version constraint >=0.7.0<0.9.0 is too complex.
It is used by:
	- [>=0.7.0<0.9.0](src/SLASettlementVerifier.sol#L21)

src/SLASettlementVerifier.sol#L21
```

### low-level-calls

```text
Impact: Informational
Confidence: High
 - [ ] ID-16
Low level call in [AegisTreasuryRouter._tryTransfer(address,address,uint256)](src/AegisTreasuryRouter.sol#L74-L80):
	- [(success,ret) = token.call(abi.encodeCall(IERC20.transfer,(to,amount)))](src/AegisTreasuryRouter.sol#L75)

src/AegisTreasuryRouter.sol#L74-L80
```

### missing-inheritance

```text
Impact: Informational
Confidence: High
 - [ ] ID-17
[SLASettlementVerifier](src/SLASettlementVerifier.sol#L23-L203) should inherit from [ISLASettlementVerifier](src/interfaces/ISLASettlementVerifier.sol#L6-L9)

src/SLASettlementVerifier.sol#L23-L203
```

### naming-convention (compacted: one line per result, links stripped)

- ID-18: Variable AegisChannel.POSEIDON is not in mixedCase
- ID-19: Variable AegisChannelFactory.POSEIDON is not in mixedCase
- ID-20: Constant SLASettlementVerifier.IC3x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-21: Constant SLASettlementVerifier.deltax2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-22: Constant SLASettlementVerifier.IC6x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-23: Constant SLASettlementVerifier.gammay2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-24: Constant SLASettlementVerifier.IC5y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-25: Variable AegisChannel.PERMIT2 is not in mixedCase
- ID-26: Variable AegisChannelFactory.VERIFIER is not in mixedCase
- ID-27: Constant SLASettlementVerifier.gammax2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-28: Constant SLASettlementVerifier.deltay1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-29: Constant SLASettlementVerifier.pLastMem is not in UPPER_CASE_WITH_UNDERSCORES
- ID-30: Constant SLASettlementVerifier.IC1y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-31: Constant SLASettlementVerifier.IC6y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-32: Function SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC() is not in mixedCase
- ID-33: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pB_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-34: Constant SLASettlementVerifier.deltax1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-35: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pA_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-36: Variable AegisChannelFactory.IMPLEMENTATION is not in mixedCase
- ID-37: Constant SLASettlementVerifier.pVk is not in UPPER_CASE_WITH_UNDERSCORES
- ID-38: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pubSignals](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-39: Constant SLASettlementVerifier.betax1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-40: Constant SLASettlementVerifier.IC4y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-41: Constant SLASettlementVerifier.alphay is not in UPPER_CASE_WITH_UNDERSCORES
- ID-42: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pC](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-43: Constant SLASettlementVerifier.IC0x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-44: Constant SLASettlementVerifier.alphax is not in UPPER_CASE_WITH_UNDERSCORES
- ID-45: Variable AegisChannel.FACTORY is not in mixedCase
- ID-46: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().y_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-47: Constant SLASettlementVerifier.deltay2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-48: Constant SLASettlementVerifier.IC4x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-49: Constant SLASettlementVerifier.gammay1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-50: Variable AegisChannel.ANCHORED is not in mixedCase
- ID-51: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pB](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-52: Constant SLASettlementVerifier.IC3y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-53: Variable AegisChannelFactory.MIN_CHALLENGE_WINDOW is not in mixedCase
- ID-54: Constant SLASettlementVerifier.IC2y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-55: Variable AegisChannel.VERIFIER is not in mixedCase
- ID-56: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pMem_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-57: Constant SLASettlementVerifier.betay2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-58: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pA](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-59: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().x_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-60: Constant SLASettlementVerifier.gammax1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-61: Constant SLASettlementVerifier.IC5x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-62: Variable SimpleJobEscrow.TOKEN is not in mixedCase
- ID-63: Constant SLASettlementVerifier.betax2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-64: Variable AegisChannelFactory.PERMIT2 is not in mixedCase
- ID-65: Parameter SLASettlementVerifier.verifyProof.asm_0.checkField().v_verifyProof_asm_0_checkField is not in mixedCase
- ID-66: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pubSignals_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-67: Constant SLASettlementVerifier.IC0y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-68: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pC_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-69: Constant SLASettlementVerifier.r is not in UPPER_CASE_WITH_UNDERSCORES
- ID-70: Constant SLASettlementVerifier.betay1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-71: Constant SLASettlementVerifier.q is not in UPPER_CASE_WITH_UNDERSCORES
- ID-72: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().pR_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-73: Constant SLASettlementVerifier.pPairing is not in UPPER_CASE_WITH_UNDERSCORES
- ID-74: Constant SLASettlementVerifier.IC2x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-75: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().s_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-76: Constant SLASettlementVerifier.IC1x is not in UPPER_CASE_WITH_UNDERSCORES


### human-summary (before)

```text
INFO:Printers:
Compiled with Foundry
Total number of contracts in source files: 9
Number of contracts in dependencies: 27
Number of contracts in tests       : 1
Source lines of code (SLOC) in source files: 574
Source lines of code (SLOC) in dependencies: 2365
Number of  assembly lines: 0
Number of optimization issues: 0
Number of informational issues: 66
Number of low issues: 6
Number of medium issues: 2
Number of high issues: 3
ERCs: ERC165, ERC20, ERC1363

+------------------------+-------------+------+------------+--------------+--------------------+
| Name                   | # functions | ERCS | ERC20 info | Complex code | Features           |
+------------------------+-------------+------+------------+--------------+--------------------+
| AegisChannel           | 30          |      |            | Yes          | Ecrecover          |
|                        |             |      |            |              | Tokens interaction |
| AegisChannelFactory    | 4           |      |            | No           |                    |
| AegisTreasuryRouter    | 12          |      |            | No           | Tokens interaction |
| PoseidonPathYul        | 6           |      |            | No           |                    |
| SLASettlementVerifier  | 5           |      |            | No           | Assembly           |
| SimpleJobEscrow        | 6           |      |            | No           |                    |
| ISLASettlementVerifier | 1           |      |            | No           |                    |
+------------------------+-------------+------+------------+--------------+--------------------+
INFO:Slither:. analyzed (37 contracts)
```


---

## AFTER fixes — 75 results

```text
**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [incorrect-return](#incorrect-return) (3 results) (High)
 - [incorrect-equality](#incorrect-equality) (1 results) (Medium)
 - [reentrancy-no-eth](#reentrancy-no-eth) (1 results) (Medium)
 - [missing-zero-check](#missing-zero-check) (1 results) (Low)
 - [reentrancy-events](#reentrancy-events) (1 results) (Low)
 - [timestamp](#timestamp) (2 results) (Low)
 - [assembly](#assembly) (4 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [missing-inheritance](#missing-inheritance) (1 results) (Informational)
 - [naming-convention](#naming-convention) (59 results) (Informational)
```

### incorrect-return

```text
Impact: High
Confidence: Medium
 - [ ] ID-0
[SLASettlementVerifier.verifyProof.asm_0.checkPairing()](src/SLASettlementVerifier.sol#L109-L176) calls [SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC()](src/SLASettlementVerifier.sol#L84-L107) which halt the execution [return(uint256,uint256)(0,0x20)](src/SLASettlementVerifier.sol#L105)

src/SLASettlementVerifier.sol#L109-L176


 - [ ] ID-1
[SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])](src/SLASettlementVerifier.sol#L74-L202) calls [SLASettlementVerifier.verifyProof.asm_0.checkField()](src/SLASettlementVerifier.sol#L76-L81) which halt the execution [return(uint256,uint256)(0,0x20)](src/SLASettlementVerifier.sol#L79)

src/SLASettlementVerifier.sol#L74-L202


 - [ ] ID-2
[SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])](src/SLASettlementVerifier.sol#L74-L202) calls [SLASettlementVerifier.verifyProof.asm_0.checkPairing()](src/SLASettlementVerifier.sol#L109-L176) which halt the execution [return(uint256,uint256)(0,0x20)](src/SLASettlementVerifier.sol#L95)

src/SLASettlementVerifier.sol#L74-L202
```

### incorrect-equality

```text
Impact: Medium
Confidence: High
 - [ ] ID-3
[AegisChannel._send(address,address,uint256)](src/AegisChannel.sol#L322-L329) uses a dangerous strict equality:
	- [amount == 0](src/AegisChannel.sol#L323)

src/AegisChannel.sol#L322-L329
```

### reentrancy-no-eth

```text
Impact: Medium
Confidence: Medium
 - [ ] ID-4
Reentrancy in [AegisTreasuryRouter.onPayout(address,address,uint256)](src/AegisTreasuryRouter.sol#L48-L59):
	External calls:
	- [ok = _tryTransfer(token,dest,amount)](src/AegisTreasuryRouter.sol#L53)
		- [(success,ret) = token.call(abi.encodeCall(IERC20.transfer,(to,amount)))](src/AegisTreasuryRouter.sol#L75)
	State variables written after the call(s):
	- [credit[party][token] -= amount](src/AegisTreasuryRouter.sol#L55)
	[AegisTreasuryRouter.credit](src/AegisTreasuryRouter.sol#L16) can be used in cross function reentrancies:
	- [AegisTreasuryRouter.credit](src/AegisTreasuryRouter.sol#L16)
	- [totalCredit[token] -= amount](src/AegisTreasuryRouter.sol#L56)
	[AegisTreasuryRouter.totalCredit](src/AegisTreasuryRouter.sol#L17) can be used in cross function reentrancies:
	- [AegisTreasuryRouter.totalCredit](src/AegisTreasuryRouter.sol#L17)

src/AegisTreasuryRouter.sol#L48-L59
```

### missing-zero-check

```text
Impact: Low
Confidence: Medium
 - [ ] ID-5
[AegisChannelFactory.constructor(address,address,uint32,address).poseidonPath](src/AegisChannelFactory.sol#L22) lacks a zero-check on :
		- [IMPLEMENTATION = address(new AegisChannel(verifier,permit2,poseidonPath))](src/AegisChannelFactory.sol#L24)
		- [POSEIDON = poseidonPath](src/AegisChannelFactory.sol#L25)

src/AegisChannelFactory.sol#L22
```

### reentrancy-events

```text
Impact: Low
Confidence: Medium
 - [ ] ID-6
Reentrancy in [AegisChannelFactory.open(AegisChannel.Config,bytes,bytes)](src/AegisChannelFactory.sol#L35-L43):
	External calls:
	- [AegisChannel(channel).initialize(c,msg.sender,sigClient,sigProvider)](src/AegisChannelFactory.sol#L41)
	Event emitted after the call(s):
	- [ChannelOpened(channel,c.client,c.provider,c.termsCommitment)](src/AegisChannelFactory.sol#L42)

src/AegisChannelFactory.sol#L35-L43
```

### timestamp

```text
Impact: Low
Confidence: Medium
 - [ ] ID-7
[AegisChannel.settle()](src/AegisChannel.sol#L234-L239) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < deadline](src/AegisChannel.sol#L236)

src/AegisChannel.sol#L234-L239


 - [ ] ID-8
[AegisChannel.submitCheckpoint(uint64,uint128,bytes32,bytes,bytes)](src/AegisChannel.sol#L163-L184) uses timestamp for comparisons
	Dangerous comparisons:
	- [ext > deadline](src/AegisChannel.sol#L181)

src/AegisChannel.sol#L163-L184
```

### assembly

```text
Impact: Informational
Confidence: High
 - [ ] ID-9
[SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])](src/SLASettlementVerifier.sol#L74-L202) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L75-L201)

src/SLASettlementVerifier.sol#L74-L202


 - [ ] ID-10
[SLASettlementVerifier.verifyProof.asm_0.checkPairing()](src/SLASettlementVerifier.sol#L109-L176) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L109-L176)

src/SLASettlementVerifier.sol#L109-L176


 - [ ] ID-11
[SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC()](src/SLASettlementVerifier.sol#L84-L107) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L84-L107)

src/SLASettlementVerifier.sol#L84-L107


 - [ ] ID-12
[SLASettlementVerifier.verifyProof.asm_0.checkField()](src/SLASettlementVerifier.sol#L76-L81) uses assembly
	- [INLINE ASM](src/SLASettlementVerifier.sol#L76-L81)

src/SLASettlementVerifier.sol#L76-L81
```

### solc-version

```text
Impact: Informational
Confidence: High
 - [ ] ID-13
Version constraint >=0.7.0<0.9.0 is too complex.
It is used by:
	- [>=0.7.0<0.9.0](src/SLASettlementVerifier.sol#L21)

src/SLASettlementVerifier.sol#L21
```

### low-level-calls

```text
Impact: Informational
Confidence: High
 - [ ] ID-14
Low level call in [AegisTreasuryRouter._tryTransfer(address,address,uint256)](src/AegisTreasuryRouter.sol#L74-L80):
	- [(success,ret) = token.call(abi.encodeCall(IERC20.transfer,(to,amount)))](src/AegisTreasuryRouter.sol#L75)

src/AegisTreasuryRouter.sol#L74-L80
```

### missing-inheritance

```text
Impact: Informational
Confidence: High
 - [ ] ID-15
[SLASettlementVerifier](src/SLASettlementVerifier.sol#L23-L203) should inherit from [ISLASettlementVerifier](src/interfaces/ISLASettlementVerifier.sol#L6-L9)

src/SLASettlementVerifier.sol#L23-L203
```

### naming-convention (compacted: one line per result, links stripped)

- ID-16: Variable AegisChannel.POSEIDON is not in mixedCase
- ID-17: Variable AegisChannelFactory.POSEIDON is not in mixedCase
- ID-18: Constant SLASettlementVerifier.IC3x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-19: Constant SLASettlementVerifier.deltax2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-20: Constant SLASettlementVerifier.IC6x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-21: Constant SLASettlementVerifier.gammay2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-22: Constant SLASettlementVerifier.IC5y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-23: Variable AegisChannel.PERMIT2 is not in mixedCase
- ID-24: Variable AegisChannelFactory.VERIFIER is not in mixedCase
- ID-25: Constant SLASettlementVerifier.gammax2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-26: Constant SLASettlementVerifier.deltay1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-27: Constant SLASettlementVerifier.pLastMem is not in UPPER_CASE_WITH_UNDERSCORES
- ID-28: Constant SLASettlementVerifier.IC1y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-29: Constant SLASettlementVerifier.IC6y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-30: Function SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC() is not in mixedCase
- ID-31: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pB_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-32: Constant SLASettlementVerifier.deltax1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-33: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pA_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-34: Variable AegisChannelFactory.IMPLEMENTATION is not in mixedCase
- ID-35: Constant SLASettlementVerifier.pVk is not in UPPER_CASE_WITH_UNDERSCORES
- ID-36: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pubSignals](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-37: Constant SLASettlementVerifier.betax1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-38: Constant SLASettlementVerifier.IC4y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-39: Constant SLASettlementVerifier.alphay is not in UPPER_CASE_WITH_UNDERSCORES
- ID-40: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pC](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-41: Constant SLASettlementVerifier.IC0x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-42: Constant SLASettlementVerifier.alphax is not in UPPER_CASE_WITH_UNDERSCORES
- ID-43: Variable AegisChannel.FACTORY is not in mixedCase
- ID-44: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().y_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-45: Constant SLASettlementVerifier.deltay2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-46: Constant SLASettlementVerifier.IC4x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-47: Constant SLASettlementVerifier.gammay1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-48: Variable AegisChannel.ANCHORED is not in mixedCase
- ID-49: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pB](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-50: Constant SLASettlementVerifier.IC3y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-51: Variable AegisChannelFactory.MIN_CHALLENGE_WINDOW is not in mixedCase
- ID-52: Constant SLASettlementVerifier.IC2y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-53: Variable AegisChannel.VERIFIER is not in mixedCase
- ID-54: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pMem_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-55: Constant SLASettlementVerifier.betay2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-56: Parameter [SLASettlementVerifier.verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[6])._pA](src/SLASettlementVerifier.sol#L74) is not in mixedCase
- ID-57: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().x_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-58: Constant SLASettlementVerifier.gammax1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-59: Constant SLASettlementVerifier.IC5x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-60: Variable SimpleJobEscrow.TOKEN is not in mixedCase
- ID-61: Constant SLASettlementVerifier.betax2 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-62: Variable AegisChannelFactory.PERMIT2 is not in mixedCase
- ID-63: Parameter SLASettlementVerifier.verifyProof.asm_0.checkField().v_verifyProof_asm_0_checkField is not in mixedCase
- ID-64: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pubSignals_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-65: Constant SLASettlementVerifier.IC0y is not in UPPER_CASE_WITH_UNDERSCORES
- ID-66: Parameter SLASettlementVerifier.verifyProof.asm_0.checkPairing().pC_verifyProof_asm_0_checkPairing is not in mixedCase
- ID-67: Constant SLASettlementVerifier.r is not in UPPER_CASE_WITH_UNDERSCORES
- ID-68: Constant SLASettlementVerifier.betay1 is not in UPPER_CASE_WITH_UNDERSCORES
- ID-69: Constant SLASettlementVerifier.q is not in UPPER_CASE_WITH_UNDERSCORES
- ID-70: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().pR_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-71: Constant SLASettlementVerifier.pPairing is not in UPPER_CASE_WITH_UNDERSCORES
- ID-72: Constant SLASettlementVerifier.IC2x is not in UPPER_CASE_WITH_UNDERSCORES
- ID-73: Parameter SLASettlementVerifier.verifyProof.asm_0.g1_mulAccC().s_verifyProof_asm_0_g1_mulAccC is not in mixedCase
- ID-74: Constant SLASettlementVerifier.IC1x is not in UPPER_CASE_WITH_UNDERSCORES


### human-summary (after)

```text
INFO:Printers:
Compiled with Foundry
Total number of contracts in source files: 9
Number of contracts in dependencies: 27
Number of contracts in tests       : 1
Source lines of code (SLOC) in source files: 578
Source lines of code (SLOC) in dependencies: 2365
Number of  assembly lines: 0
Number of optimization issues: 0
Number of informational issues: 66
Number of low issues: 4
Number of medium issues: 2
Number of high issues: 3
ERCs: ERC1363, ERC165, ERC20

+------------------------+-------------+------+------------+--------------+--------------------+
| Name                   | # functions | ERCS | ERC20 info | Complex code | Features           |
+------------------------+-------------+------+------------+--------------+--------------------+
| AegisChannel           | 30          |      |            | Yes          | Ecrecover          |
|                        |             |      |            |              | Tokens interaction |
| AegisChannelFactory    | 4           |      |            | No           |                    |
| AegisTreasuryRouter    | 12          |      |            | No           | Tokens interaction |
| PoseidonPathYul        | 6           |      |            | No           |                    |
| SLASettlementVerifier  | 5           |      |            | No           | Assembly           |
| SimpleJobEscrow        | 6           |      |            | No           |                    |
| ISLASettlementVerifier | 1           |      |            | No           |                    |
+------------------------+-------------+------+------------+--------------+--------------------+
INFO:Slither:. analyzed (37 contracts)
```

