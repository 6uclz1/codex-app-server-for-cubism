import { readFile } from "node:fs/promises";
import type { CharacterState } from "@cubism/shared-types";

export interface Live2DController {
  loadModel(model3JsonPath: string): Promise<void>;
  setState(state: CharacterState): void;
  playMotion(group: string, index?: number): void;
  setExpression(name: string): void;
  setLipSync(value: number): void;
  setGaze(x: number, y: number): void;
}

export interface Live2DModel3File {
  Version?: number;
  FileReferences?: {
    Moc?: string;
    Textures?: string[];
    Motions?: Record<string, Array<{ File: string }>>;
    Expressions?: Array<{ Name: string; File: string }>;
  };
}

export interface Live2DSnapshot {
  modelPath: string | null;
  model?: Live2DModel3File;
  state: CharacterState;
  expression: string | null;
  motion: { group: string; index?: number } | null;
  lipSync: number;
  gaze: { x: number; y: number };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export class FallbackLive2DController implements Live2DController {
  readonly snapshot: Live2DSnapshot = {
    modelPath: null,
    state: "idle",
    expression: null,
    motion: null,
    lipSync: 0,
    gaze: { x: 0, y: 0 }
  };

  async loadModel(model3JsonPath: string): Promise<void> {
    if (!model3JsonPath.endsWith(".model3.json")) {
      throw new Error("Live2D model entrypoint must be a .model3.json file.");
    }
    const raw = await readFile(model3JsonPath, "utf8");
    const model = JSON.parse(raw) as Live2DModel3File;
    if (!model.FileReferences?.Moc) {
      throw new Error("model3.json is missing FileReferences.Moc.");
    }
    this.snapshot.modelPath = model3JsonPath;
    this.snapshot.model = model;
  }

  setState(state: CharacterState): void {
    this.snapshot.state = state;
  }

  playMotion(group: string, index?: number): void {
    this.snapshot.motion = { group, index };
  }

  setExpression(name: string): void {
    this.snapshot.expression = name;
  }

  setLipSync(value: number): void {
    this.snapshot.lipSync = clamp01(value);
  }

  setGaze(x: number, y: number): void {
    this.snapshot.gaze = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y))
    };
  }
}
