import { describe, it, expect } from "vitest";
import { fmtUsdg, shortAddr, countdown, explorer } from "../src/format.js";

describe("format", () => {
  it("fmtUsdg: 6 desimal → 2 desimal", () => { expect(fmtUsdg("70000")).toBe("0.07"); expect(fmtUsdg(2_000_000n)).toBe("2.00"); expect(fmtUsdg("0")).toBe("0.00"); });
  it("shortAddr", () => { expect(shortAddr("0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3")).toBe("0x0922…4ED3"); });
  it("countdown", () => { expect(countdown(100, 100)).toBe("lewat"); expect(countdown(159, 100)).toBe("59 s"); expect(countdown(100 + 125, 100)).toBe("2 m 5 s"); expect(countdown(100 + 3660, 100)).toBe("1 j 1 m"); });
  it("explorer: undefined tanpa base", () => { expect(explorer(undefined, "tx", "0x1")).toBeUndefined(); expect(explorer("https://e", "address", "0x1")).toBe("https://e/address/0x1"); });
});
