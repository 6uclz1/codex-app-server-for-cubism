import type { CharacterDirectiveV2 } from "@cubism/shared-types";
import type { Live2DCommand } from "./CharacterStateMachine.js";

export class CharacterDirectiveRouter {
  route(directive: CharacterDirectiveV2): Live2DCommand[] {
    return [
      { type: "expression.set", semantic: directive.expression?.semantic ?? directive.emotion, intensity: directive.expression?.intensity ?? directive.intensity },
      { type: "motion.play", request: { semantic: directive.motion?.semantic ?? directive.emotion, priority: directive.motion?.priority ?? "normal" } },
      ...(directive.gaze ? [{ type: "gaze.set" as const, point: gazePoint(directive.gaze.target) }] : [])
    ];
  }
}

function gazePoint(target: NonNullable<CharacterDirectiveV2["gaze"]>["target"]) {
  if (target === "away") return { x: -0.65, y: 0.05 };
  if (target === "down") return { x: 0, y: 0.6 };
  if (target === "screen") return { x: 0.25, y: -0.1 };
  return { x: 0, y: 0 };
}
