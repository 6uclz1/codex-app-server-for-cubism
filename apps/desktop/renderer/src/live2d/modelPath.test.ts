import { describe, expect, it } from "vitest";
import { modelPathToFileUrl } from "./modelPath.js";

describe("modelPathToFileUrl", () => {
  it("converts absolute model paths to file URLs with escaped segments", () => {
    expect(modelPathToFileUrl("/Users/me/Downloads/hiyori free/runtime/model.model3.json")).toBe(
      "file:///Users/me/Downloads/hiyori%20free/runtime/model.model3.json"
    );
  });
});
