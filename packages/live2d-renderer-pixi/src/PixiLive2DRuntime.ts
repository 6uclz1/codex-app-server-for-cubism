import {
  bindEyeBlinkParameters,
  bindLipSyncParameters,
  detectCapabilities,
  motionResultFromResolution,
  normalizeParameterValue,
  resolveExpressionRequest,
  resolveMotionRequest,
  type ExpressionRequest,
  type ExpressionResult,
  type GazePoint,
  type HitAreaResult,
  type LipSyncSource,
  type Live2DCapabilities,
  type Live2DCurrentSnapshot,
  type Live2DLoadResult,
  type Live2DModelSource,
  type Live2DRuntimePort,
  type ModelManifest,
  type MotionLayer,
  type MotionRequest,
  type MotionResult,
  type ParameterUpdate,
  type StagePoint,
  type StageRect
} from "@cubism/live2d-domain/browser";
import { fitModelToHost, type PixiApplicationLike, type PixiLive2DModelLike } from "./PixiModelFitter.js";
import { readableModelError } from "./PixiAssetResolver.js";

type PixiAppRuntimeLike = PixiApplicationLike & {
  view: HTMLCanvasElement;
  stage: { addChild(child: unknown): void; removeChildren(): void };
  ticker: { add(callback: () => void): void; remove(callback: () => void): void };
  destroy(removeView?: boolean, options?: unknown): void;
};

type Live2DModelLike = PixiLive2DModelLike & {
  motion?: (group: string, index?: number) => Promise<boolean>;
  expression?: (id?: number | string) => Promise<boolean>;
  internalModel?: {
    coreModel?: {
      setParameterValueById(id: string, value: number, weight?: number): void;
    };
  };
  hitTest?: (x: number, y: number) => string[];
  destroy?: (options?: unknown) => void;
};

export interface PixiLive2DRuntimeOptions {
  host: HTMLElement;
  ensureCubismCore?: () => Promise<void>;
  onStatus?: (status: string) => void;
  fit?: PixiLive2DFitOptions;
}

export interface PixiLive2DFitOptions {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export class PixiLive2DRuntime implements Live2DRuntimePort {
  private app: PixiAppRuntimeLike | null = null;
  private model: Live2DModelLike | null = null;
  private manifest: ModelManifest | null = null;
  private capabilities: Live2DCapabilities | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly snapshot: Live2DCurrentSnapshot = {
    loaded: false,
    lipSync: 0,
    gaze: { x: 0, y: 0 },
    parameters: {},
    expression: null,
    motion: null
  };
  private tickerUpdate = () => this.applyFrameParameters();

  constructor(private readonly options: PixiLive2DRuntimeOptions) {}

  async loadModel(source: Live2DModelSource): Promise<Live2DLoadResult> {
    await this.unloadModel();
    try {
      this.options.onStatus?.("Loading Live2D model");
      await this.options.ensureCubismCore?.();
      const PIXI = await import("pixi.js");
      const { install } = await import("@pixi/unsafe-eval");
      const unsafeInstall = install as unknown as (options: { ShaderSystem: unknown }) => void;
      unsafeInstall({ ShaderSystem: (PIXI as { ShaderSystem: unknown }).ShaderSystem });
      const { Live2DModel } = await import("pixi-live2d-display/cubism4");
      (globalThis as { PIXI?: unknown }).PIXI = PIXI;

      const app = new (PIXI as { Application: new (options: unknown) => unknown }).Application({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        resizeTo: this.options.host
      }) as PixiAppRuntimeLike;
      app.view.className = "live2dCanvas";
      this.options.host.appendChild(app.view);

      if (!source.runtimeUrl) {
        throw new Error("A local Live2D asset URL is required by the Pixi browser runtime.");
      }
      const modelUrl = source.runtimeUrl;
      const model = (await (Live2DModel as { from(path: string, options: unknown): Promise<unknown> }).from(modelUrl, { autoInteract: false })) as Live2DModelLike;
      app.stage.addChild(model);
      this.app = app;
      this.model = model;
      if (!source.manifest) {
        throw new Error("A normalized Live2D manifest is required by the Pixi browser runtime.");
      }
      this.manifest = source.manifest;
      this.capabilities = detectCapabilities(this.manifest);
      this.snapshot.loaded = true;
      this.snapshot.modelId = source.modelId;
      this.snapshot.entryPath = source.entryPath;
      fitModelToHost(app, model, this.options.host, this.options.fit);
      this.resizeObserver = new ResizeObserver(() => this.resize({ width: this.options.host.clientWidth, height: this.options.host.clientHeight }));
      this.resizeObserver.observe(this.options.host);
      app.ticker.add(this.tickerUpdate);
      await this.playMotion({ semantic: "idle", priority: "idle" });
      this.options.onStatus?.("Live2D model loaded");
      return { ok: true, modelId: source.modelId, manifest: this.manifest, capabilities: this.capabilities };
    } catch (error) {
      await this.unloadModel();
      const reason = readableModelError(error);
      this.options.onStatus?.(`Live2D load failed: ${reason}`);
      return { ok: false, modelId: source.modelId, reason };
    }
  }

  async unloadModel(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app?.ticker.remove(this.tickerUpdate);
    this.model?.destroy?.({ children: true, texture: true, baseTexture: true });
    this.app?.stage.removeChildren();
    this.app?.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = null;
    this.model = null;
    this.manifest = null;
    this.capabilities = null;
    this.snapshot.loaded = false;
    this.snapshot.motion = null;
    this.snapshot.expression = null;
  }

  getCapabilities(): Live2DCapabilities | null {
    return this.capabilities;
  }

  getSnapshot(): Live2DCurrentSnapshot {
    return { ...this.snapshot, gaze: { ...this.snapshot.gaze }, parameters: { ...this.snapshot.parameters } };
  }

  async playMotion(request: MotionRequest): Promise<MotionResult> {
    if (!this.manifest || !this.model) {
      return { ok: false, semantic: request.semantic, reason: "model_not_loaded" };
    }
    const resolution = resolveMotionRequest(this.manifest, request);
    if (!resolution) {
      return motionResultFromResolution(request, null, false);
    }
    const ok = (await this.model.motion?.(resolution.group, request.index ?? resolution.index)) ?? false;
    this.snapshot.motion = { semantic: request.semantic, group: resolution.group, index: request.index ?? resolution.index };
    return motionResultFromResolution(request, resolution, ok);
  }

  async stopMotion(_layer?: MotionLayer): Promise<void> {
    this.snapshot.motion = null;
  }

  async setExpression(request: ExpressionRequest): Promise<ExpressionResult> {
    if (!this.manifest || !this.model) {
      return { ok: false, semantic: request.semantic, reason: "model_not_loaded" };
    }
    const resolution = resolveExpressionRequest(this.manifest, request);
    if (!resolution) {
      return { ok: false, semantic: request.semantic, reason: "expression_not_found" };
    }
    const ok = (await this.model.expression?.(resolution.name)) ?? false;
    this.snapshot.expression = resolution.name;
    return { ok, name: resolution.name, semantic: request.semantic, reason: ok ? undefined : "runtime_rejected" };
  }

  setParameters(requests: ParameterUpdate[]): void {
    const coreModel = this.model?.internalModel?.coreModel;
    for (const request of requests) {
      const value = normalizeParameterValue(request.value);
      this.snapshot.parameters[request.id] = value;
      coreModel?.setParameterValueById(request.id, value, request.weight ?? 1);
    }
  }

  setGaze(point: GazePoint): void {
    this.snapshot.gaze = { x: normalizeParameterValue(point.x, -1, 1), y: normalizeParameterValue(point.y, -1, 1) };
  }

  setLipSync(value: number, _source: LipSyncSource = "manual"): void {
    this.snapshot.lipSync = normalizeParameterValue(value);
    this.setParameters(bindLipSyncParameters(this.capabilities?.lipSyncParameters ?? [], this.snapshot.lipSync));
  }

  setBreath(value: number): void {
    this.setParameters([{ id: "ParamBreath", value, weight: 0.65 }]);
  }

  setBlink(value: number): void {
    this.setParameters(bindEyeBlinkParameters(this.capabilities?.eyeBlinkParameters ?? [], value));
  }

  async hitTest(point: StagePoint): Promise<HitAreaResult[]> {
    const names = this.model?.hitTest?.(point.x, point.y) ?? [];
    return names.map((name) => ({ id: name, name, score: 1 }));
  }

  resize(_rect: StageRect): void {
    if (this.app && this.model) {
      fitModelToHost(this.app, this.model, this.options.host, this.options.fit);
    }
  }

  setFit(options: PixiLive2DFitOptions): void {
    this.options.fit ??= {};
    this.options.fit.scale = options.scale;
    this.options.fit.offsetX = options.offsetX;
    this.options.fit.offsetY = options.offsetY;
    this.resize({ width: this.options.host.clientWidth, height: this.options.host.clientHeight });
  }

  dispose(): void {
    void this.unloadModel();
  }

  private applyFrameParameters(): void {
    const gaze = this.snapshot.gaze;
    this.setParameters([
      { id: "ParamEyeBallX", value: gaze.x, weight: 1 },
      { id: "ParamEyeBallY", value: gaze.y, weight: 1 }
    ]);
  }
}
