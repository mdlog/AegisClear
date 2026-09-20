export const fmtUsdg = (x: string | bigint): string => (Number(BigInt(x)) / 1e6).toFixed(2);
export const shortAddr = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function countdown(deadline: number, now = Math.floor(Date.now() / 1000)): string {
  const s = deadline - now;
  if (s <= 0) return "lewat";
  if (s >= 3600) return `${Math.floor(s / 3600)} j ${Math.floor((s % 3600) / 60)} m`;
  if (s >= 60) return `${Math.floor(s / 60)} m ${s % 60} s`;
  return `${s} s`;
}
export const explorer = (base: string | undefined, kind: "address" | "tx", v: string): string | undefined => (base ? `${base}/${kind}/${v}` : undefined);
export const gasFmt = (g: string | number): string => Number(g).toLocaleString("id-ID");
