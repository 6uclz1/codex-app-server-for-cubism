import type { MotionRequest, MotionResult, MotionSemantic } from "./Live2DRuntimePort.js";
import type { ModelManifest, MotionManifestEntry } from "./ModelManifest.js";

const semanticGroupCandidates: Record<string, readonly string[]> = {
  idle: ["Idle", "idle"],
  greet: ["Greeting", "Greet", "TapBody", "Idle"],
  tapBody: ["TapBody", "Tap", "Body"],
  thinking: ["Thinking", "Think", "FlickDown", "Idle"],
  speaking: ["Speaking", "Talk", "TapBody", "Idle"],
  happy: ["Happy", "Joy", "TapBody", "Idle"],
  sad: ["Sad", "Sorrow", "Idle"],
  angry: ["Angry", "Anger", "Idle"],
  success: ["Success", "Happy", "TapBody", "Idle"],
  error: ["Error", "Sad", "Idle"],
  interrupted: ["FlickDown", "TapBody", "Idle"]
};

export interface MotionResolution {
  group: string;
  index: number;
  motion: MotionManifestEntry;
}

export function resolveMotionRequest(manifest: ModelManifest, request: MotionRequest): MotionResolution | null {
  if (request.group) {
    const motion = manifest.motions.find((entry) => entry.group === request.group && (request.index === undefined || entry.index === request.index));
    return motion ? { group: motion.group, index: motion.index, motion } : null;
  }
  const candidateGroups = semanticGroupCandidates[request.semantic] ?? [toPascalCase(request.semantic)];
  for (const group of candidateGroups) {
    const motion = manifest.motions.find((entry) => entry.group.toLowerCase() === group.toLowerCase());
    if (motion) {
      return { group: motion.group, index: request.index ?? motion.index, motion };
    }
  }
  return manifest.motions[0] ? { group: manifest.motions[0].group, index: manifest.motions[0].index, motion: manifest.motions[0] } : null;
}

export function motionResultFromResolution(request: MotionRequest, resolution: MotionResolution | null, ok: boolean): MotionResult {
  return resolution
    ? { ok, semantic: request.semantic, group: resolution.group, index: resolution.index, reason: ok ? undefined : "runtime_rejected" }
    : { ok: false, semantic: request.semantic, reason: "motion_not_found" };
}

function toPascalCase(value: MotionSemantic): string {
  return String(value).replace(/(^|[-_\s])([a-z])/g, (_match, _separator, character: string) => character.toUpperCase());
}
