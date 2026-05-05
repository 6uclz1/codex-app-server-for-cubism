export interface GazePoint {
  x: number;
  y: number;
}

interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function normalizePointerToGaze(clientX: number, clientY: number, rect: StageRect): GazePoint {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const x = (clientX - centerX) / Math.max(rect.width / 2, 1);
  const y = (clientY - centerY) / Math.max(rect.height / 2, 1);
  return {
    x: clamp(x, -1, 1),
    y: clamp(y, -1, 1)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
