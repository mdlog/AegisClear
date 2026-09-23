// Pure formatters (API_CONTRACT §2, README §6.5). Money is 6-decimal base units and is only ever BigInt.

const UNIT = 1_000_000n;
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const toBig = (v: string | bigint | number) => (typeof v === "bigint" ? v : BigInt(v));

/** 6-decimal base units → "1,234.57" (2 decimals, half-up rounding). */
export function usdg(base: string | bigint): string {
  const v = toBig(base);
  const neg = v < 0n;
  const cents = ((neg ? -v : v) + 5_000n) / 10_000n;
  const text = `${group((cents / 100n).toString())}.${(cents % 100n).toString().padStart(2, "0")}`;
  return neg && cents !== 0n ? `-${text}` : text;
}

/** 6-decimal base units → "0.070000" (full precision, for hover and copy). */
export function usdgFull(base: string | bigint): string {
  const v = toBig(base);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  return `${neg ? "-" : ""}${(abs / UNIT).toString()}.${(abs % UNIT).toString().padStart(6, "0")}`;
}

/** Middle ellipsis: "0x4B6F…bBd1" (4 + 4) by default, 8 + 8 in detail views. */
export function shortHex(hex: string, keep = 4): string {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length <= keep * 2 + 1) return hex;
  return `${hex.startsWith("0x") ? "0x" : ""}${body.slice(0, keep)}…${body.slice(-keep)}`;
}

export const gas = (g: string | number | bigint): string => group(toBig(g).toString());

/** Any integer with en-US thousands separators (block numbers, unit counts). */
export const int = (n: string | number | bigint): string => group(toBig(n).toString());

/** A scenario's expected duration: minutes with one decimal from 90 s up, whole seconds below. */
export function approxDuration(seconds: number): string {
  if (seconds < 1) return "under 1 s";
  if (seconds < 90) return `≈ ${Math.round(seconds)} s`;
  return `≈ ${(seconds / 60).toFixed(1)} min`;
}

/** Challenge and response windows: whole hours as "6 h", anything else in seconds. */
export const windowLength = (seconds: number): string => (seconds >= 3600 && seconds % 3600 === 0 ? `${seconds / 3600} h` : `${int(seconds)} s`);

/** "0.07" → 70000n. For the fixed-format decimals of result rows; anything else is undefined. */
export function parseUsdg(text: string): bigint | undefined {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  return m ? BigInt(m[1]) * UNIT + BigInt((m[2] ?? "").padEnd(6, "0")) : undefined;
}

/** Seconds left until a chain-time deadline: "59 s", "2 m 5 s", "1 h 1 m", or "expired". */
export function countdown(deadline: number, now: number): string {
  const s = deadline - now;
  if (s <= 0) return "expired";
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} m`;
  if (s >= 60) return `${Math.floor(s / 60)} m ${s % 60} s`;
  return `${s} s`;
}

/** Step.t (ms since the run started) as mm:ss.s. */
export function elapsed(ms: number): string {
  const tenths = Math.round(ms / 100); // round the total first so 59,960 ms carries to 01:00.0
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

export function relativeTime(then: number, now: number): string {
  const s = Math.floor((now - then) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export const bps = (v: string | number): string => `${Number(v) / 100} %`;

export function explorerUrl(base: string | undefined, kind: "address" | "tx", value: string): string | undefined {
  return base ? `${base}/${kind}/${value}` : undefined;
}
