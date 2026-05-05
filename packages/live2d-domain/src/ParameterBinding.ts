import type { ParameterUpdate } from "./Live2DRuntimePort.js";

export function normalizeParameterValue(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function bindLipSyncParameters(parameterIds: readonly string[], value: number, weight = 1): ParameterUpdate[] {
  const ids = parameterIds.length > 0 ? parameterIds : ["ParamMouthOpenY"];
  const normalized = normalizeParameterValue(value);
  return ids.map((id) => ({ id, value: normalized, weight }));
}

export function bindEyeBlinkParameters(parameterIds: readonly string[], value: number, weight = 1): ParameterUpdate[] {
  const ids = parameterIds.length > 0 ? parameterIds : ["ParamEyeLOpen", "ParamEyeROpen"];
  const normalized = normalizeParameterValue(value);
  return ids.map((id) => ({ id, value: normalized, weight }));
}
