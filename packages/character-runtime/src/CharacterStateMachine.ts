import type { CharacterDirectiveV2, CharacterEmotion, CharacterRuntimeState } from "@cubism/shared-types";
import type { GazePoint, MotionRequest, ParameterUpdate } from "@cubism/live2d-domain";

export type CharacterEvent =
  | { type: "model.loaded" }
  | { type: "user.message.started" }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.completed"; directive: CharacterDirectiveV2 }
  | { type: "voice.input.started" }
  | { type: "voice.output.audio"; level: number }
  | { type: "pointer.hover"; point: GazePoint }
  | { type: "hitarea.tap"; area: string }
  | { type: "runtime.error"; error: string }
  | { type: "sleep" }
  | { type: "wake" };

export type Live2DCommand =
  | { type: "expression.set"; semantic: CharacterEmotion | string; intensity?: number }
  | { type: "motion.play"; request: MotionRequest }
  | { type: "parameter.set"; id: string; value: number; weight?: number }
  | { type: "parameters.set"; updates: ParameterUpdate[] }
  | { type: "lipSync.set"; value: number }
  | { type: "gaze.set"; point: GazePoint };

type GazeTarget = "user" | "away" | "down" | "screen";

export class CharacterStateMachine {
  private currentState: CharacterRuntimeState = "booting";

  get state(): CharacterRuntimeState {
    return this.currentState;
  }

  dispatch(event: CharacterEvent): Live2DCommand[] {
    switch (event.type) {
      case "model.loaded":
        this.currentState = "idle";
        return [{ type: "motion.play", request: { semantic: "idle", priority: "idle" } }];
      case "user.message.started":
        this.currentState = "thinking";
        return [
          { type: "expression.set", semantic: "thinking", intensity: 0.7 },
          { type: "motion.play", request: { semantic: "thinking", priority: "normal" } }
        ];
      case "assistant.delta":
        this.currentState = "speaking";
        return [{ type: "lipSync.set", value: Math.min(1, 0.2 + event.text.length / 80) }];
      case "assistant.completed":
        this.currentState = "speaking";
        return [
          { type: "expression.set", semantic: event.directive.expression?.semantic ?? event.directive.emotion, intensity: event.directive.expression?.intensity ?? event.directive.intensity },
          { type: "motion.play", request: { semantic: event.directive.motion?.semantic ?? "speaking", priority: event.directive.motion?.priority ?? "normal" } },
          { type: "gaze.set", point: gazeTarget(event.directive.gaze?.target ?? "user") }
        ];
      case "voice.input.started":
        this.currentState = this.currentState === "speaking" ? "interrupted" : "listening";
        return [
          { type: "expression.set", semantic: "surprised", intensity: 0.75 },
          { type: "motion.play", request: { semantic: "interrupted", priority: "force" } }
        ];
      case "voice.output.audio":
        this.currentState = "speaking";
        return [{ type: "lipSync.set", value: event.level }];
      case "pointer.hover":
        return [{ type: "gaze.set", point: event.point }];
      case "hitarea.tap":
        this.currentState = "reacting";
        return [
          { type: "motion.play", request: { semantic: event.area.toLowerCase() === "head" ? "happy" : "tapBody", priority: "normal" } },
          { type: "expression.set", semantic: "fun", intensity: 0.8 }
        ];
      case "runtime.error":
        this.currentState = "error";
        return [
          { type: "expression.set", semantic: "sorrow", intensity: 1 },
          { type: "motion.play", request: { semantic: "error", priority: "force" } }
        ];
      case "sleep":
        this.currentState = "sleeping";
        return [{ type: "expression.set", semantic: "neutral", intensity: 0.3 }];
      case "wake":
        this.currentState = "idle";
        return [{ type: "motion.play", request: { semantic: "greet", priority: "normal" } }];
    }
  }
}

function gazeTarget(target: GazeTarget): GazePoint {
  switch (target) {
    case "away":
      return { x: -0.65, y: 0.05 };
    case "down":
      return { x: 0, y: 0.6 };
    case "screen":
      return { x: 0.25, y: -0.1 };
    case "user":
    default:
      return { x: 0, y: 0 };
  }
}
