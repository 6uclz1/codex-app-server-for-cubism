import { describe, expect, it } from "vitest";
import { calculateLipSyncValue } from "./LipSyncController.js";

describe("LipSyncController", () => {
  it("normalizes analyser samples into a bounded mouth-open value", () => {
    expect(calculateLipSyncValue(new Uint8Array([0, 0, 0]))).toBe(0);
    expect(calculateLipSyncValue(new Uint8Array([255, 255, 255]))).toBe(1);
    expect(calculateLipSyncValue(new Uint8Array([128, 128, 128]))).toBeCloseTo(0.5, 1);
  });
});
