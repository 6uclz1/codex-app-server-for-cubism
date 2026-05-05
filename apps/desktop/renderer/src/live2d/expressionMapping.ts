import type { CharacterEmotion } from "@cubism/shared-types";

const expressionCandidatesByEmotion: Record<CharacterEmotion, readonly string[]> = {
  neutral: ["neutral"],
  joy: ["joy", "happy"],
  anger: ["anger", "angry"],
  sorrow: ["sorrow", "sad"],
  fun: ["fun", "joy", "happy"],
  surprised: ["surprised"],
  thinking: ["thinking"]
};

export function expressionCandidatesForEmotion(emotion: CharacterEmotion): readonly string[] {
  return expressionCandidatesByEmotion[emotion];
}
