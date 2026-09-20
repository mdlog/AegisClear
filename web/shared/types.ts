import type { Address, Hex } from "viem";

export type Network = "local" | "testnet";
export type ScenarioId = "B-cooperative" | "B-dispute" | "A-complete" | "A-reject" | "all";
export const SCENARIOS: ScenarioId[] = ["B-cooperative", "B-dispute", "A-complete", "A-reject", "all"];
export type ChannelState = "UNINIT" | "OPEN" | "CLOSING" | "SETTLED";

export interface ConfigResponse {
  network: Network; chainId: number; rpcUrl: string; explorerBase?: string; deployBlock: string;
  addresses: Record<string, Address>;
  provider: Address; clients: { label: "A" | "B"; address: Address }[];
  windows: { challenge: number; response: number };
  /** nilai privat off-chain (ditampilkan sebagai "hanya diketahui kedua pihak"); nonce sesi tidak pernah dikirim */
  terms: { unitPrice: string; maxM1: string; minM2: string; penaltyBps: string; capBps: string };
  breaches: number[]; deposit: string;
}
export interface Step {
  i: number; t: number; phase: string; label: string; detail?: string; txHash?: Hex; gasUsed?: string; channel?: Address;
  progress?: { done: number; total: number };
}
export interface Row { pasar: string; klien_provider: string; penentu: string; terlihat: string; gas: string; proving_ms: string; txs: { label: string; hash: Hex }[] }
export type RunStatus = "running" | "done" | "error";
export interface RunSnapshot {
  id: string; scenario: ScenarioId; status: RunStatus; startedAt: number; endedAt?: number;
  steps: Step[]; result?: Row[]; error?: string; channels: Address[];
}
export interface ChannelSummary {
  channel: Address; factory: Address; factoryName: string; client: Address; provider: Address; termsCommitment: Hex;
  state: ChannelState; seq: number; cumulativeAmount: string; budget: string; deadline: number; hasProof: boolean; payToClient: string;
  openedTx: Hex; openedBlock: string; runId?: string;
}
export interface ChannelEvent { name: string; args: Record<string, string>; txHash: Hex; blockNumber: string; gasUsed: string }
export interface ChannelDetail extends ChannelSummary {
  cfg: { client: Address; provider: Address; token: Address; termsCommitment: Hex; challengeWindow: number; responseWindow: number; payoutClient: Address; payoutProvider: Address; salt: Hex };
  events: ChannelEvent[];
}
export interface LeakResponse { channel: Address; txs: Hex[]; leaks: number; ambiguous: number; details: { txHash: Hex; word: string; kind: "leak" | "ambiguous" }[] }
export type SseEvent = { type: "step"; data: Step } | { type: "done"; data: RunSnapshot } | { type: "error"; data: RunSnapshot };
