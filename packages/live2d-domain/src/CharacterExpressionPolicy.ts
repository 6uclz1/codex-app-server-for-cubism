import type { CharacterEmotion } from "@cubism/shared-types";
import type { ExpressionRequest } from "./Live2DRuntimePort.js";
import type { ModelManifest } from "./ModelManifest.js";

const expressionAliases: Record<CharacterEmotion, readonly string[]> = {
  neutral: ["neutral", "default", "normal"],
  joy: ["joy", "happy", "fun"],
  anger: ["anger", "angry"],
  sorrow: ["sorrow", "sad"],
  fun: ["fun", "joy", "happy"],
  surprised: ["surprised", "surprise"],
  thinking: ["thinking", "think", "neutral"]
};

export interface ExpressionResolution {
  name: string;
  intensity: number;
}

export function expressionCandidatesForEmotion(emotion: CharacterEmotion | string): string[] {
  return [...(expressionAliases[emotion as CharacterEmotion] ?? [emotion])];
}

export function resolveExpressionRequest(manifest: ModelManifest, request: ExpressionRequest): ExpressionResolution | null {
  if (request.name && manifest.expressions.some((entry) => entry.name === request.name)) {
    return { name: request.name, intensity: request.intensity ?? 1 };
  }
  const candidates = expressionCandidatesForEmotion(request.semantic);
  for (const candidate of candidates) {
    const expression = manifest.expressions.find((entry) => entry.name.toLowerCase() === candidate.toLowerCase());
    if (expression) {
      return { name: expression.name, intensity: request.intensity ?? 1 };
    }
  }
  return manifest.expressions[0] ? { name: manifest.expressions[0].name, intensity: request.intensity ?? 1 } : null;
}
