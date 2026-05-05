import type { GazePoint } from "./pointerGaze.js";

export interface CubismCoreModelLike {
  setParameterValueById(parameterId: string, value: number, weight?: number): void;
}

export function applyLive2DParameters(coreModel: CubismCoreModelLike, gaze: GazePoint, lipSync: number): void {
  coreModel.setParameterValueById("ParamMouthOpenY", lipSync, 1);
  coreModel.setParameterValueById("ParamEyeBallX", gaze.x, 1);
  coreModel.setParameterValueById("ParamEyeBallY", -gaze.y, 1);
}
