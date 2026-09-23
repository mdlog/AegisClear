// A guilloche seal drawn from a public hash (DESIGN_BRIEF §5 "Seals"): a recognition aid, not a verification.
// Each band holds m copies of the rosette r(θ) = Rb·(1 + a·sin(nθ + φ + 2πk/m)); the hash bytes set n (9–23 lobes),
// a (0.06–0.14), φ and m (6–12). Pure client-side SVG, memoised, never animated.
import { memo } from "react";
import styles from "./Seal.module.css";

interface Band { n: number; a: number; phi: number; m: number; r: number }

export function sealBands(hash: string, count: 1 | 3): Band[] {
  const hex = hash.replace(/^0x/, "").padStart(64, "0");
  const byte = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
  const radii = count === 3 ? [0.9, 0.64, 0.4] : [0.78];
  return radii.map((r, b) => ({
    n: 9 + (byte(b * 4) % 15),
    a: 0.06 + (byte(b * 4 + 1) / 255) * 0.08,
    phi: (byte(b * 4 + 2) / 255) * 2 * Math.PI,
    m: 6 + (byte(b * 4 + 3) % 7),
    r,
  }));
}

function rosette(band: Band, k: number, copies: number, steps: number): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const radius = band.r * (1 + band.a * Math.sin(band.n * t + band.phi + (2 * Math.PI * k) / copies));
    parts.push(`${i ? "L" : "M"}${(radius * Math.cos(t)).toFixed(3)} ${(radius * Math.sin(t)).toFixed(3)}`);
  }
  return `${parts.join("")}Z`;
}

export interface SealProps {
  hash: string;
  /** "T" (terms commitment) or "R" (receipts root); omitted at registry size. */
  letter?: "T" | "R";
  size: number;
  /** 3 bands for the slip and the record, 1 band at registry size. */
  bands?: 1 | 3;
}

export const Seal = memo(function Seal({ hash, letter, size, bands = 3 }: SealProps) {
  const drawn = sealBands(hash, bands);
  // At 20 px a full band of 6–12 copies prints as a solid ring. The registry seal keeps the same lobes but draws
  // two mirrored copies with a deeper swing, a braid the eye can still tell apart from its neighbours.
  const paths = drawn.flatMap((band, b) => {
    const small = bands === 1;
    const copies = small ? 2 : band.m;
    const shape = small ? { ...band, a: band.a * 2.4 } : band;
    return Array.from({ length: copies }, (_, k) => (
      <path key={`${b}-${k}`} d={rosette(shape, k, copies, small ? 120 : 240)} vectorEffect="non-scaling-stroke" />
    ));
  });
  return (
    <svg className={styles.seal} width={size} height={size} viewBox="-1.12 -1.12 2.24 2.24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round">{paths}</g>
      {letter && <text className={styles.letter} x="0" y="0.02" textAnchor="middle" dominantBaseline="middle">{letter}</text>}
    </svg>
  );
});
