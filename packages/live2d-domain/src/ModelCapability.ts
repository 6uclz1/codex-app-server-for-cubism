import type { ModelManifest } from "./ModelManifest.js";

export interface Live2DCapabilities {
  hasPhysics: boolean;
  hasPose: boolean;
  hasUserData: boolean;
  hasExpressions: boolean;
  hasMotions: boolean;
  motionGroups: string[];
  expressionNames: string[];
  lipSyncParameters: string[];
  eyeBlinkParameters: string[];
  hitAreas: Array<{ id: string; name: string }>;
}

export function detectCapabilities(manifest: ModelManifest): Live2DCapabilities {
  return {
    hasPhysics: Boolean(manifest.physics),
    hasPose: Boolean(manifest.pose),
    hasUserData: Boolean(manifest.userData),
    hasExpressions: manifest.expressions.length > 0,
    hasMotions: manifest.motions.length > 0,
    motionGroups: unique(manifest.motions.map((motion) => motion.group)),
    expressionNames: unique(manifest.expressions.map((expression) => expression.name)),
    lipSyncParameters: groupIds(manifest, "LipSync"),
    eyeBlinkParameters: groupIds(manifest, "EyeBlink"),
    hitAreas: manifest.hitAreas
  };
}

function groupIds(manifest: ModelManifest, name: string): string[] {
  return unique(manifest.groups.filter((group) => group.name.toLowerCase() === name.toLowerCase()).flatMap((group) => group.ids));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
