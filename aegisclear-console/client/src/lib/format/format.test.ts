import { describe, expect, it } from "vitest";
import { approxDuration, bps, countdown, elapsed, explorerUrl, gas, int, parseUsdg, relativeTime, shortHex, usdg, usdgFull, windowLength } from "./index";

const HERO = "0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1"; // testnet dispute channel (fixtures)

describe("usdg: 6-decimal base units to 2 decimals, BigInt only", () => {
  it.each([
    ["70000", "0.07"],
    ["1930000", "1.93"],
    ["0", "0.00"],
    ["5000", "0.01"], // rounds half up at the cent boundary
    ["4999", "0.00"],
    ["1999999", "2.00"],
    ["123456789012", "123,456.79"], // en-US thousands separators
  ])("%s → %s", (base, want) => {
    expect(usdg(base)).toBe(want);
  });

  it("accepts bigint without precision loss beyond Number.MAX_SAFE_INTEGER", () => {
    expect(usdg(9_007_199_254_740_993_000_000n)).toBe("9,007,199,254,740,993.00");
  });

  it("keeps the sign of negative deltas", () => {
    expect(usdg(-70000n)).toBe("-0.07");
  });
});

describe("usdgFull: all 6 decimals for hover and copy", () => {
  it.each([
    ["70000", "0.070000"],
    ["5000000", "5.000000"],
    ["1", "0.000001"],
  ])("%s → %s", (base, want) => {
    expect(usdgFull(base)).toBe(want);
  });
});

describe("shortHex: middle ellipsis", () => {
  it("keeps 4 + 4 characters after 0x by default (registry)", () => {
    expect(shortHex(HERO)).toBe("0x4B6F…bBd1");
  });
  it("keeps 8 + 8 in detail views", () => {
    expect(shortHex(HERO, 8)).toBe("0x4B6F3c6d…0f03bBd1");
  });
  it("returns short values unchanged", () => {
    expect(shortHex("0x1234")).toBe("0x1234");
  });
});

describe("gas: en-US thousands separators", () => {
  it.each([
    ["575544", "575,544"],
    [100077, "100,077"],
    ["0", "0"],
  ])("%s → %s", (g, want) => {
    expect(gas(g)).toBe(want);
  });
});

describe("countdown(deadline, now) in chain seconds", () => {
  it.each([
    [100, 100, "expired"],
    [90, 100, "expired"],
    [159, 100, "59 s"],
    [225, 100, "2 m 5 s"],
    [3760, 100, "1 h 1 m"],
  ])("deadline %i at now %i → %s", (deadline, now, want) => {
    expect(countdown(deadline, now)).toBe(want);
  });
});

describe("elapsed: Step.t milliseconds as mm:ss.s", () => {
  it.each([
    [4, "00:00.0"],
    [7229, "00:07.2"],
    [65064, "01:05.1"],
    [158000, "02:38.0"],
    [59960, "01:00.0"], // carries into the minute instead of showing 00:60.0
  ])("%i ms → %s", (ms, want) => {
    expect(elapsed(ms)).toBe(want);
  });
});

describe("relativeTime(then, now) in milliseconds", () => {
  const now = 1_790_128_200_000;
  it.each([
    [now - 5_000, "just now"],
    [now - 30_000, "30 s ago"],
    [now - 120_000, "2 min ago"],
    [now - 2 * 3_600_000, "2 h ago"],
    [now - 3 * 86_400_000, "3 d ago"],
  ])("%i → %s", (then, want) => {
    expect(relativeTime(then, now)).toBe(want);
  });
});

describe("bps as a percentage", () => {
  it.each([
    ["5000", "50 %"],
    ["3000", "30 %"],
    ["250", "2.5 %"],
  ])("%s → %s", (v, want) => {
    expect(bps(v)).toBe(want);
  });
});

describe("explorerUrl only when the network has an explorer", () => {
  it("returns undefined on local (no explorerBase)", () => {
    expect(explorerUrl(undefined, "tx", "0x1")).toBeUndefined();
  });
  it("builds address and tx links", () => {
    expect(explorerUrl("https://explorer.testnet.chain.robinhood.com", "address", HERO)).toBe(`https://explorer.testnet.chain.robinhood.com/address/${HERO}`);
    expect(explorerUrl("https://e", "tx", "0xab")).toBe("https://e/tx/0xab");
  });
});

describe("int: grouped integers such as block numbers", () => {
  it("groups the testnet v2 deploy block", () => {
    expect(int("122028843")).toBe("122,028,843");
  });
});

describe("parseUsdg: a result-row decimal back to 6-decimal base units (BigInt, no floats)", () => {
  it.each([
    ["0.07", 70_000n],
    ["1.93", 1_930_000n],
    ["2.00", 2_000_000n],
    ["0", 0n],
    ["2.66", 2_660_000n],
    ["0.000001", 1n],
  ])("%s → %s", (text, want) => {
    expect(parseUsdg(text)).toBe(want);
  });

  it.each(["4 rows", "", "1.2345678", "-0.07"])("refuses %j", (text) => {
    expect(parseUsdg(text)).toBeUndefined();
  });
});

describe("windowLength: challenge and response windows", () => {
  it.each([
    [60, "60 s"],
    [120, "120 s"],
    [21_600, "6 h"],
    [5_400, "5,400 s"],
  ])("%i s → %s", (s, want) => {
    expect(windowLength(s)).toBe(want);
  });
});

describe("approxDuration: a wait announced before it starts (README §7 scenario table)", () => {
  it.each([
    [158, "≈ 2.6 min"],
    [96, "≈ 1.6 min"],
    [280, "≈ 4.7 min"],
    [13, "≈ 13 s"],
    [7.3, "≈ 7 s"],
    [0.15, "under 1 s"],
  ])("%s s → %s", (s, want) => {
    expect(approxDuration(s)).toBe(want);
  });
});

