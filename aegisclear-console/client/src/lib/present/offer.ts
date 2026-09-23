// Safe narrowing of the provider's x402 402 challenge (API_CONTRACT §8). Returns null for anything unexpected.

export interface OfferTerms { unitPrice: string; maxM1: string; minM2: string; penaltyBps: string; capBps: string; nonce?: string }
export interface OfferAnatomy {
  x402Version: number;
  scheme: string;
  network: string;
  chainId: number;
  asset: string;
  /** CREATE2-predicted channel address: not deployed until the provider's first ack */
  payTo: string;
  deposit: bigint;
  anchored: boolean;
  terms: OfferTerms;
  config: Record<string, unknown>;
  sigProvider?: string;
  exitSig?: string;
  unitQty?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function offerAnatomy(body: unknown): OfferAnatomy | null {
  if (!isObj(body) || !Array.isArray(body.accepts) || !isObj(body.accepts[0])) return null;
  const a = body.accepts[0];
  const network = a.network;
  if (!isStr(network) || !/^eip155:\d+$/.test(network)) return null;
  if (!isStr(a.asset) || !ADDRESS.test(a.asset) || !isStr(a.payTo) || !ADDRESS.test(a.payTo)) return null;
  if (!isStr(a.maxAmountRequired) || !/^\d+$/.test(a.maxAmountRequired)) return null;
  const aegis = isObj(a.extra) && isObj(a.extra.aegis) ? a.extra.aegis : null;
  if (!aegis || !isObj(aegis.terms) || !isObj(aegis.config)) return null;
  const t = aegis.terms;
  if (![t.unitPrice, t.maxM1, t.minM2, t.penaltyBps, t.capBps].every(isStr)) return null;
  return {
    x402Version: typeof body.x402Version === "number" ? body.x402Version : 0,
    scheme: isStr(a.scheme) ? a.scheme : "",
    network,
    chainId: Number(network.split(":")[1]),
    asset: a.asset,
    payTo: a.payTo,
    deposit: BigInt(a.maxAmountRequired),
    anchored: aegis.anchored === true,
    terms: t as unknown as OfferTerms,
    config: aegis.config,
    sigProvider: isStr(aegis.sigProvider) ? aegis.sigProvider : undefined,
    exitSig: isStr(aegis.exitSig) ? aegis.exitSig : undefined,
    unitQty: isStr(aegis.unitQty) ? aegis.unitQty : undefined,
  };
}
