import { useEffect, useRef, useState } from "react";
import type { CharacterEmotion, CharacterState } from "@cubism/shared-types";
import cubismCoreUrl from "live2dcubismcore/live2dcubismcore.min.js?url";
import { applyLive2DParameters, type CubismCoreModelLike } from "./live2dParameters.js";
import { expressionCandidatesForEmotion } from "./expressionMapping.js";
import { modelPathToFileUrl, readableModelError } from "./modelPath.js";
import { normalizePointerToGaze, type GazePoint } from "./pointerGaze.js";

interface Live2DStageProps {
  modelPath: string | null;
  state: CharacterState;
  emotion: CharacterEmotion;
  lipSync: number;
  onLoadStatus?: (status: string) => void;
}

type Live2DModelLike = {
  width: number;
  height: number;
  x: number;
  y: number;
  scale: { set(value: number): void };
  getLocalBounds?: () => { x: number; y: number; width: number; height: number };
  motion?: (group: string, index?: number) => Promise<boolean>;
  expression?: (id?: number | string) => Promise<boolean>;
  internalModel?: {
    coreModel?: CubismCoreModelLike;
  };
  destroy?: (options?: unknown) => void;
};

type PixiApplicationLike = {
  view: HTMLCanvasElement;
  stage: { addChild(child: unknown): void; removeChildren(): void };
  renderer: { resize(width: number, height: number): void };
  ticker: { add(callback: () => void): void; remove(callback: () => void): void };
  destroy(removeView?: boolean, options?: unknown): void;
};

export function Live2DStage({ modelPath, state, emotion, lipSync, onLoadStatus }: Live2DStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PixiApplicationLike | null>(null);
  const modelRef = useRef<Live2DModelLike | null>(null);
  const gazeRef = useRef<GazePoint>({ x: 0, y: 0 });
  const [mode, setMode] = useState<"fallback" | "live2d">("fallback");
  const [error, setError] = useState<string | null>(null);
  const [fallbackGaze, setFallbackGaze] = useState<GazePoint>({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;

    async function loadLive2D() {
      destroyLive2D(appRef.current, modelRef.current);
      appRef.current = null;
      modelRef.current = null;
      setError(null);
      setMode("fallback");

      if (!modelPath || !hostRef.current) {
        onLoadStatus?.("No model selected");
        return;
      }

      try {
        onLoadStatus?.("Loading Live2D model");
        await ensureCubismCoreScript();
        const PIXI = await import("pixi.js");
        const { install } = await import("@pixi/unsafe-eval");
        install({ ShaderSystem: PIXI.ShaderSystem });
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        window.PIXI = PIXI;

        const host = hostRef.current;
        const app = new PIXI.Application({
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
          resizeTo: host
        }) as unknown as PixiApplicationLike;
        app.view.className = "live2dCanvas";
        host.appendChild(app.view);

        const model = (await Live2DModel.from(modelPathToFileUrl(modelPath), { autoInteract: false })) as Live2DModelLike;
        if (cancelled) {
          destroyLive2D(app, model);
          return;
        }

        app.stage.addChild(model);
        appRef.current = app;
        modelRef.current = model;
        fitModelToHost(app, model, host);
        const observer = new ResizeObserver(() => fitModelToHost(app, model, host));
        observer.observe(host);

        const idleTimer = window.setInterval(() => {
          void model.motion?.("Idle");
        }, 15000);
        void model.motion?.("Idle", 0);

        setMode("live2d");
        onLoadStatus?.("Live2D model loaded");

        return () => {
          observer.disconnect();
          window.clearInterval(idleTimer);
        };
      } catch (loadError) {
        const message = readableModelError(loadError);
        setError(message);
        setMode("fallback");
        onLoadStatus?.(`Live2D load failed: ${message}`);
      }
    }

    let cleanup: void | (() => void);
    void loadLive2D().then((value) => {
      cleanup = value;
    });

    return () => {
      cancelled = true;
      cleanup?.();
      destroyLive2D(appRef.current, modelRef.current);
      appRef.current = null;
      modelRef.current = null;
    };
  }, [modelPath, onLoadStatus]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || mode !== "live2d") {
      return;
    }
    if (state === "thinking") {
      void model.motion?.("FlickDown", 0);
    } else if (state === "speaking") {
      void model.motion?.("Tap", 0);
    }
  }, [mode, state]);

  useEffect(() => {
    const model = modelRef.current;
    if (model) {
      void applyExpression(model, emotion);
    }
  }, [emotion]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || mode !== "live2d") {
      return;
    }
    const update = () => {
      const gaze = gazeRef.current;
      const coreModel = model.internalModel?.coreModel;
      if (coreModel) {
        applyLive2DParameters(coreModel, gaze, lipSync);
      }
    };
    appRef.current?.ticker.add(update);
    return () => appRef.current?.ticker.remove(update);
  }, [lipSync, mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const gaze = normalizePointerToGaze(event.clientX, event.clientY, host.getBoundingClientRect());
      gazeRef.current = gaze;
      if (mode === "fallback") {
        setFallbackGaze(gaze);
      }
    };
    const resetGaze = () => {
      const gaze = { x: 0, y: 0 };
      gazeRef.current = gaze;
      if (mode === "fallback") {
        setFallbackGaze(gaze);
      }
    };
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerleave", resetGaze);
    return () => {
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", resetGaze);
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "live2d") {
      return;
    }
    const canvas = fallbackRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      drawAvatar(canvas, state, emotion, lipSync, fallbackGaze);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [emotion, fallbackGaze, lipSync, mode, state]);

  return (
    <div ref={hostRef} className="live2dStage">
      {mode === "fallback" ? <canvas ref={fallbackRef} className="avatarCanvas" /> : null}
      {error ? <div className="stageError">{error}</div> : null}
    </div>
  );
}

async function applyExpression(model: Live2DModelLike, emotion: CharacterEmotion): Promise<void> {
  for (const expression of expressionCandidatesForEmotion(emotion)) {
    try {
      if (await model.expression?.(expression)) {
        return;
      }
    } catch {
      // Try the next known alias because expression ids differ by model.
    }
  }
}

function ensureCubismCoreScript(): Promise<void> {
  if (window.Live2DCubismCore) {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>("script[data-cubism-core]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load live2dcubismcore.min.js")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.cubismCore = "true";
    script.src = cubismCoreUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load live2dcubismcore.min.js"));
    document.head.appendChild(script);
  });
}

function fitModelToHost(app: PixiApplicationLike, model: Live2DModelLike, host: HTMLElement): void {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  app.renderer.resize(width, height);
  const bounds = model.getLocalBounds?.() ?? { x: 0, y: 0, width: model.width, height: model.height };
  const scale = Math.min(width / Math.max(bounds.width, 1), height / Math.max(bounds.height, 1)) * 0.9;
  model.scale.set(scale);
  model.x = width / 2 - (bounds.x + bounds.width / 2) * scale;
  model.y = height / 2 - (bounds.y + bounds.height / 2) * scale;
}

function destroyLive2D(app: PixiApplicationLike | null, model: Live2DModelLike | null): void {
  model?.destroy?.({ children: true, texture: true, baseTexture: true });
  app?.stage.removeChildren();
  app?.destroy(true, { children: true, texture: true, baseTexture: true });
}

function drawAvatar(canvas: HTMLCanvasElement, state: CharacterState, emotion: CharacterEmotion, lipSync: number, gaze: GazePoint): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const radius = Math.min(width, height) * 0.28;
  const stateColor = state === "speaking" ? "#2f9e8f" : state === "listening" ? "#8b6f47" : state === "thinking" ? "#5668a6" : "#49515c";
  const blush = emotion === "joy" || emotion === "fun" ? "#e98a8a" : emotion === "surprised" ? "#f5b35a" : "#9bb0bd";

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#e7f1ed");
  gradient.addColorStop(0.55, "#f7f3ea");
  gradient.addColorStop(1, "#d9e3f2");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#343a40";
  context.beginPath();
  context.arc(centerX, centerY - 12, radius + 28, Math.PI, 0);
  context.quadraticCurveTo(centerX + radius + 48, centerY + radius, centerX, centerY + radius + 32);
  context.quadraticCurveTo(centerX - radius - 48, centerY + radius, centerX - radius - 28, centerY - 12);
  context.fill();

  context.fillStyle = "#f4d0be";
  context.beginPath();
  context.ellipse(centerX, centerY, radius, radius * 1.08, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = blush;
  context.globalAlpha = emotion === "neutral" || emotion === "thinking" ? 0.25 : 0.5;
  context.beginPath();
  context.ellipse(centerX - radius * 0.48, centerY + 14, 26, 12, 0, 0, Math.PI * 2);
  context.ellipse(centerX + radius * 0.48, centerY + 14, 26, 12, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  const eyeOffsetX = gaze.x * 7;
  const eyeOffsetY = gaze.y * 5;
  context.fillStyle = "#1f2933";
  context.beginPath();
  const happyEyeHeight = emotion === "joy" || emotion === "fun" ? 4 : 13;
  context.ellipse(centerX - radius * 0.36 + eyeOffsetX, centerY - 30 + eyeOffsetY, 9, happyEyeHeight, 0, 0, Math.PI * 2);
  context.ellipse(centerX + radius * 0.36 + eyeOffsetX, centerY - 30 + eyeOffsetY, 9, happyEyeHeight, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = stateColor;
  context.lineWidth = 6;
  context.beginPath();
  if (emotion === "sorrow") {
    context.arc(centerX, centerY + 52, 28, Math.PI * 1.1, Math.PI * 1.9);
  } else if (emotion === "anger") {
    context.moveTo(centerX - 36, centerY + 44);
    context.lineTo(centerX + 36, centerY + 44);
  } else if (emotion === "surprised") {
    context.ellipse(centerX, centerY + 44, 15, 18 + lipSync * 18, 0, 0, Math.PI * 2);
  } else if (emotion === "fun") {
    context.arc(centerX, centerY + 34, 34, 0.1, Math.PI - 0.1);
  } else {
    context.ellipse(centerX, centerY + 42, 34, 6 + lipSync * 22, 0, 0, Math.PI);
  }
  context.stroke();

  if (emotion === "anger") {
    context.strokeStyle = "#8f2f2f";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(centerX - radius * 0.48, centerY - 58);
    context.lineTo(centerX - radius * 0.22, centerY - 46);
    context.moveTo(centerX + radius * 0.48, centerY - 58);
    context.lineTo(centerX + radius * 0.22, centerY - 46);
    context.stroke();
  }

  context.fillStyle = stateColor;
  context.font = "600 14px Inter, system-ui";
  context.textAlign = "center";
  context.fillText(state.toUpperCase(), centerX, height - 26);
}
