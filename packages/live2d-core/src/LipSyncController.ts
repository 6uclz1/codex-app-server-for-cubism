export function calculateLipSyncValue(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0;
  }
  const sum = samples.reduce((total, sample) => total + sample, 0);
  const average = sum / samples.length;
  return Math.max(0, Math.min(1, average / 255));
}
