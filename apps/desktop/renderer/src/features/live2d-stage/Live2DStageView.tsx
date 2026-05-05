import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import type { CharacterEmotion, CharacterState } from "@cubism/shared-types";
import type { ModelManifest } from "@cubism/live2d-domain";
import { drawFallbackAvatar } from "./fallbackAvatar.js";
import { useLive2DRuntime } from "./useLive2DRuntime.js";

export interface Live2DStageViewProps {
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
  onScaleChange?: (scale: number) => void;
  onOffsetChange?: (offset: { x: number; y: number }) => void;
  onLoadStatus?: (status: string) => void;
}

const minScale = 0.4;
const maxScale = 9.9;

export function Live2DStageView(props: Live2DStageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const runtime = useLive2DRuntime({ ...props, hostRef });
  const scale = props.scale ?? 0.9;
  const offsetX = props.offsetX ?? 0;
  const offsetY = props.offsetY ?? 0;

  function updateScale(nextScale: number): void {
    props.onScaleChange?.(clampScale(nextScale));
  }

  function scaleStepFor(currentScale: number): number {
    if (currentScale >= 5) return 0.5;
    if (currentScale >= 2) return 0.25;
    return 0.08;
  }

  useEffect(() => {
    if (runtime.mode === "live2d") return;
    const canvas = fallbackRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * window.devicePixelRatio;
      canvas.height = canvas.clientHeight * window.devicePixelRatio;
      drawFallbackAvatar(canvas, props.state, props.emotion, props.lipSync, runtime.gaze, scale, offsetX, offsetY);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [props.emotion, props.lipSync, props.state, runtime.gaze, runtime.mode, scale, offsetX, offsetY]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !props.onScaleChange) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      updateScale(scale + direction * scaleStepFor(scale));
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, [props.onScaleChange, scale]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !props.onOffsetChange) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isZoomControlTarget(event.target)) return;
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offsetX, originY: offsetY };
      host.setPointerCapture(event.pointerId);
      host.classList.add("isDraggingStage");
      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const limit = panLimitForHost(host, scale);
      props.onOffsetChange?.({
        x: clampOffset(drag.originX + event.clientX - drag.startX, limit),
        y: clampOffset(drag.originY + event.clientY - drag.startY, limit)
      });
    };
    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      host.classList.remove("isDraggingStage");
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };
    host.addEventListener("pointerdown", handlePointerDown);
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerup", finishDrag);
    host.addEventListener("pointercancel", finishDrag);
    return () => {
      host.removeEventListener("pointerdown", handlePointerDown);
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerup", finishDrag);
      host.removeEventListener("pointercancel", finishDrag);
      host.classList.remove("isDraggingStage");
    };
  }, [offsetX, offsetY, props.onOffsetChange]);

  return (
    <div ref={hostRef} className="live2dStage" data-mode={runtime.mode}>
      {runtime.mode === "fallback" ? <canvas ref={fallbackRef} className="avatarCanvas" /> : null}
      <div className="stageZoomControls" aria-label="Model zoom controls" data-stage-control="true">
        <button type="button" className="stageZoomButton" onClick={() => updateScale(scale - scaleStepFor(scale))} disabled={scale <= minScale} title="Zoom out">
          <Minus size={18} />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" className="stageZoomButton" onClick={() => updateScale(scale + scaleStepFor(scale))} disabled={scale >= maxScale} title="Zoom in">
          <Plus size={18} />
        </button>
      </div>
      {runtime.error ? <div className="stageError">{runtime.error}</div> : null}
    </div>
  );
}

function clampScale(scale: number): number {
  return Math.min(maxScale, Math.max(minScale, Number(scale.toFixed(2))));
}

function clampOffset(offset: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, Math.round(offset)));
}

function panLimitForHost(host: HTMLElement, scale: number): number {
  const rect = host.getBoundingClientRect();
  const viewportSize = Math.max(rect.width, rect.height, 1);
  const zoomTravel = viewportSize * Math.max(1, scale);
  const overscrollMargin = Math.max(240, Math.min(900, viewportSize * 0.45));
  return Math.round(zoomTravel + overscrollMargin);
}

function isZoomControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-stage-control='true']"));
}
