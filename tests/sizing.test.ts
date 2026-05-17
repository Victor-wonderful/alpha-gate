import { describe, expect, it } from "vitest";
import { sizePosition } from "@/lib/sizing";

describe("sizePosition", () => {
  it("computes quantity from risk budget", () => {
    const r = sizePosition({ accountSize: 10000, allowedLossPct: 1, entry: 100, stop: 95 });
    expect(r.maxLoss).toBe(100);
    expect(r.riskPerUnit).toBe(5);
    expect(r.quantity).toBe(20);
    expect(r.positionSize).toBe(2000);
    expect(r.valid).toBe(true);
  });

  it("rejects zero account size", () => {
    const r = sizePosition({ accountSize: 0, allowedLossPct: 1, entry: 100, stop: 95 });
    expect(r.valid).toBe(false);
  });

  it("rejects equal entry/stop", () => {
    const r = sizePosition({ accountSize: 10000, allowedLossPct: 1, entry: 100, stop: 100 });
    expect(r.valid).toBe(false);
  });
});
