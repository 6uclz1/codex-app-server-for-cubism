import { useEffect, useRef, useState } from "react";
import type { CharacterEmotion, CharacterState } from "@cubism/shared-types";
import type { GazePoint, Live2DCapabilities, Live2DRuntimePort, ModelManifest } from "@cubism/live2d-domain";
import { PixiLive2DRuntime } from "@cubism/live2d-renderer-pixi";
import cubismCoreUrl from "live2dcubismcore/live2dcubismcore.min.js?url";

export interface UseLive2DRuntimeOptions {
  hostRef: React.RefObject<HTMLDivElement | null>;
  modelPath: string | null;
  modelId?: string | null;
  modelRuntimeUrl?: string | null;
  manifest?: ModelManifest | null;
  state: CharacterState;
  emotion: CharacterEmotion;
  lipSync: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  onLoadStatus?: (status: string) => void;
}

export interface Live2DRuntimeViewState {
  mode: "fallback" | "live2d";
  error: string | null;
  gaze: GazePoint;
  capabilities: Live2DCapabilities | null;
  runtimeRef: React.RefObject<Live2DRuntimePort | null>;
}

export function useLive2DRuntime(options: UseLive2DRuntimeOptions): Live2DRuntimeViewState {
  const runtimeRef = useRef<Live2DRuntimePort | null>(null);
  const fitRef = useRef({ scale: options.scale, offsetX: options.offsetX, offsetY: options.offsetY });
  const gazeRef = useRef<GazePoint>({ x: 0, y: 0 });
  const [mode, setMode] = useState<"fallback" | "live2d">("fallback");
  const [error, setError] = useState<string | null>(null);
  const [gaze, setGaze] = useState<GazePoint>({ x: 0, y: 0 });
  const [capabilities, setCapabilities] = useState<Live2DCapabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      setMode("fallback");
      setError(null);
      setCapabilities(null);
      if (!options.modelPath || !options.hostRef.current) {
        options.onLoadStatus?.("No model selected");
        return;
      }
      if (!options.manifest) {
        setError("Model manifest is not imported yet.");
        options.onLoadStatus?.("Model manifest is not imported yet");
        return;
      }
      if (!options.modelRuntimeUrl) {
        setError("Local Live2D asset URL is not ready yet.");
        options.onLoadStatus?.("Preparing local Live2D asset URL");
        return;
      }
      fitRef.current.scale = options.scale;
      fitRef.current.offsetX = options.offsetX;
      fitRef.current.offsetY = options.offsetY;
      const runtime = new PixiLive2DRuntime({
        host: options.hostRef.current,
        ensureCubismCore: ensureCubismCoreScript,
        onStatus: options.onLoadStatus,
        fit: fitRef.current
      });
      runtimeRef.current = runtime;
      const result = await runtime.loadModel({ modelId: options.modelId ?? undefined, entryPath: options.modelPath, runtimeUrl: options.modelRuntimeUrl ?? undefined, manifest: options.manifest });
      if (cancelled) {
        runtime.dispose();
        return;
      }
      if (result.ok) {
        setMode("live2d");
        setCapabilities(result.capabilities ?? runtime.getCapabilities());
      } else {
        setError(result.reason ?? "Live2D model could not be loaded.");
        setMode("fallback");
      }
    }
    void load();
    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [options.hostRef, options.manifest, options.modelId, options.modelPath, options.modelRuntimeUrl, options.onLoadStatus]);

  useEffect(() => {
    fitRef.current.scale = options.scale;
    fitRef.current.offsetX = options.offsetX;
    fitRef.current.offsetY = options.offsetY;
    const runtime = runtimeRef.current;
    if (runtime instanceof PixiLive2DRuntime) {
      runtime.setFit(fitRef.current);
    } else {
      runtime?.resize({ width: options.hostRef.current?.clientWidth ?? 1, height: options.hostRef.current?.clientHeight ?? 1 });
    }
  }, [options.hostRef, options.offsetX, options.offsetY, options.scale]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || mode !== "live2d") return;
    const semantic = options.state === "thinking" ? "thinking" : options.state === "speaking" ? "speaking" : options.state === "error" ? "error" : options.state === "interrupted" ? "interrupted" : null;
    if (semantic) {
      void runtime.playMotion({ semantic, priority: semantic === "interrupted" ? "force" : "normal" });
    }
  }, [mode, options.state]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && mode === "live2d") {
      void runtime.setExpression({ semantic: options.emotion, intensity: options.emotion === "neutral" ? 0.4 : 0.85 });
    }
  }, [mode, options.emotion]);

  useEffect(() => {
    runtimeRef.current?.setLipSync(options.lipSync, "assistant");
  }, [options.lipSync]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || mode !== "live2d") return;
    let blink = 1;
    const timer = window.setInterval(() => {
      blink = blink === 1 ? 0 : 1;
      runtime.setBlink(blink);
      runtime.setBreath((Math.sin(Date.now() / 700) + 1) / 2);
      if (Math.random() > 0.72) {
        void runtime.playMotion({ semantic: "idle", priority: "idle" });
      }
    }, 2400);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    const host = options.hostRef.current;
    if (!host) return;
    const handlePointerMove = (event: PointerEvent) => {
      const nextGaze = normalizePointerToGaze(event.clientX, event.clientY, host.getBoundingClientRect());
      gazeRef.current = nextGaze;
      setGaze(nextGaze);
      runtimeRef.current?.setGaze(nextGaze);
    };
    const resetGaze = () => {
      const nextGaze = { x: 0, y: 0 };
      gazeRef.current = nextGaze;
      setGaze(nextGaze);
      runtimeRef.current?.setGaze(nextGaze);
    };
    const handleTap = async (event: PointerEvent) => {
      const hits = await runtimeRef.current?.hitTest({ x: event.offsetX, y: event.offsetY });
      const area = hits?.[0]?.name ?? "body";
      await runtimeRef.current?.playMotion({ semantic: area.toLowerCase() === "head" ? "happy" : "tapBody", priority: "normal" });
    };
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerleave", resetGaze);
    host.addEventListener("pointerdown", handleTap);
    return () => {
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", resetGaze);
      host.removeEventListener("pointerdown", handleTap);
    };
  }, [options.hostRef]);

  return { mode, error, gaze, capabilities, runtimeRef };
}

function normalizePointerToGaze(clientX: number, clientY: number, rect: DOMRect): GazePoint {
  const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
  const y = ((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y))
  };
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
