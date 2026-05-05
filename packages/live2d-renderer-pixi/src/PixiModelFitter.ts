export interface PixiApplicationLike {
  renderer: { resize(width: number, height: number): void };
}

export interface PixiLive2DModelLike {
  width: number;
  height: number;
  x: number;
  y: number;
  scale: { set(value: number): void };
  getLocalBounds?: () => { x: number; y: number; width: number; height: number };
}

export interface ModelFitOptions {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export function fitModelToHost(app: PixiApplicationLike, model: PixiLive2DModelLike, host: HTMLElement, options: ModelFitOptions = {}): void {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  app.renderer.resize(width, height);
  const bounds = model.getLocalBounds?.() ?? { x: 0, y: 0, width: model.width, height: model.height };
  const fitScale = Math.min(width / Math.max(bounds.width, 1), height / Math.max(bounds.height, 1)) * (options.scale ?? 0.9);
  model.scale.set(fitScale);
  model.x = width / 2 - (bounds.x + bounds.width / 2) * fitScale + (options.offsetX ?? 0);
  model.y = height / 2 - (bounds.y + bounds.height / 2) * fitScale + (options.offsetY ?? 0);
}
