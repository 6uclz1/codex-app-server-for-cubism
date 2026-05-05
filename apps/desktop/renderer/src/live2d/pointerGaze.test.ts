import { describe, expect, it } from "vitest";
import { normalizePointerToGaze } from "./pointerGaze.js";

describe("normalizePointerToGaze", () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };

  it("maps the stage center to a neutral gaze", () => {
    expect(normalizePointerToGaze(300, 200, rect)).toEqual({ x: 0, y: 0 });
  });

  it("maps pointer direction from the stage center into a clamped -1..1 range", () => {
    expect(normalizePointerToGaze(500, 50, rect)).toEqual({ x: 1, y: -1 });
    expect(normalizePointerToGaze(-100, 500, rect)).toEqual({ x: -1, y: 1 });
  });
});
