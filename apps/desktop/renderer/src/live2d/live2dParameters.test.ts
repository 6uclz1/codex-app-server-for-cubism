import { describe, expect, it, vi } from "vitest";
import { applyLive2DParameters, type CubismCoreModelLike } from "./live2dParameters.js";

describe("applyLive2DParameters", () => {
  it("drives lip sync and eyeball parameters directly", () => {
    const coreModel: CubismCoreModelLike = {
      setParameterValueById: vi.fn()
    };

    applyLive2DParameters(coreModel, { x: 0.5, y: -0.25 }, 0.8);

    expect(coreModel.setParameterValueById).toHaveBeenCalledWith("ParamMouthOpenY", 0.8, 1);
    expect(coreModel.setParameterValueById).toHaveBeenCalledWith("ParamEyeBallX", 0.5, 1);
    expect(coreModel.setParameterValueById).toHaveBeenCalledWith("ParamEyeBallY", 0.25, 1);
  });
});
