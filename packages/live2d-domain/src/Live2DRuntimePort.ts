import type { CharacterEmotion } from "@cubism/shared-types";
import type { ModelManifest } from "./ModelManifest.js";
import type { Live2DCapabilities } from "./ModelCapability.js";

export type MotionSemantic = "idle" | "greet" | "tapBody" | "thinking" | "speaking" | "happy" | "sad" | "angry" | "success" | "error" | "interrupted" | string;
export type MotionLayer = "idle" | "reaction" | "speaking" | "force";
export type MotionPriority = "idle" | "normal" | "force";

export interface Live2DModelSource {
  modelId?: string;
  entryPath: string;
  runtimeUrl?: string;
  manifest?: ModelManifest;
}

export interface MotionRequest {
  semantic: MotionSemantic;
  group?: string;
  index?: number;
  priority: MotionPriority;
  fadeInMs?: number;
  fadeOutMs?: number;
  layer?: MotionLayer;
}

export interface MotionResult {
  ok: boolean;
  group?: string;
  index?: number;
  semantic: MotionSemantic;
  reason?: string;
}

export interface ExpressionRequest {
  semantic: CharacterEmotion | string;
  name?: string;
  intensity?: number;
  durationMs?: number;
}

export interface ExpressionResult {
  ok: boolean;
  name?: string;
  semantic: CharacterEmotion | string;
  reason?: string;
}

export interface ParameterUpdate {
  id: string;
  value: number;
  weight?: number;
}

export interface GazePoint {
  x: number;
  y: number;
}

export interface StagePoint {
  x: number;
  y: number;
}

export interface StageRect {
  width: number;
  height: number;
}

export interface HitAreaResult {
  id: string;
  name: string;
  score: number;
}

export type LipSyncSource = "assistant" | "microphone" | "tts" | "realtime" | "manual";

export interface Live2DCurrentSnapshot {
  loaded: boolean;
  modelId?: string;
  entryPath?: string;
  state?: string;
  expression?: string | null;
  motion?: { semantic: string; group?: string; index?: number } | null;
  lipSync: number;
  gaze: GazePoint;
  parameters: Record<string, number>;
}

export interface Live2DLoadResult {
  ok: boolean;
  modelId?: string;
  manifest?: ModelManifest;
  capabilities?: Live2DCapabilities;
  reason?: string;
}

export interface Live2DRuntimePort {
  loadModel(source: Live2DModelSource): Promise<Live2DLoadResult>;
  unloadModel(): Promise<void>;
  getCapabilities(): Live2DCapabilities | null;
  getSnapshot(): Live2DCurrentSnapshot;
  playMotion(request: MotionRequest): Promise<MotionResult>;
  stopMotion(layer?: MotionLayer): Promise<void>;
  setExpression(request: ExpressionRequest): Promise<ExpressionResult>;
  setParameters(request: ParameterUpdate[]): void;
  setGaze(point: GazePoint): void;
  setLipSync(value: number, source?: LipSyncSource): void;
  setBreath(value: number): void;
  setBlink(value: number): void;
  hitTest(point: StagePoint): Promise<HitAreaResult[]>;
  resize(rect: StageRect): void;
  dispose(): void;
}
