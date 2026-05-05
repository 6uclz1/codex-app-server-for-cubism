import { describe, expect, it } from "vitest";
import { analyzePcmLevel, AudioLevelEnvelope, LipSyncEnvelope, VoiceActivityDetector } from "./index.js";

describe("media-core audio pipeline", () => {
  it("calculates RMS, peak, smoothed lip sync envelope, and voice activity", () => {
    const level = analyzePcmLevel(new Float32Array([0, 0.5, -1, 0.25]));
    expect(level.rms).toBeCloseTo(0.5728, 3);
    expect(level.peak).toBe(1);

    const envelope = new AudioLevelEnvelope({ attack: 0.8, release: 0.2, silenceThreshold: 0.05 });
    expect(envelope.next(0.8)).toBeCloseTo(0.64);
    expect(envelope.next(0)).toBeCloseTo(0.512);

    const lipSync = new LipSyncEnvelope({ gain: 1.5, attack: 1, release: 0.3, silenceThreshold: 0.04 });
    expect(lipSync.next({ rms: 0.5, peak: 0.9 })).toBe(0.75);
    expect(lipSync.next({ rms: 0, peak: 0 })).toBeCloseTo(0.525);

    const vad = new VoiceActivityDetector({ startThreshold: 0.2, stopThreshold: 0.08, holdFrames: 2 });
    expect(vad.next(0.3)).toEqual({ active: true, changed: true });
    expect(vad.next(0.01)).toEqual({ active: true, changed: false });
    expect(vad.next(0.01)).toEqual({ active: false, changed: true });
  });
});
