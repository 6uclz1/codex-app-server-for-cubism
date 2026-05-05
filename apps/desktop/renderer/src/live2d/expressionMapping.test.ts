import { describe, expect, it } from "vitest";
import { expressionCandidatesForEmotion } from "./expressionMapping.js";

describe("expressionCandidatesForEmotion", () => {
  it("maps joy, anger, sorrow, and fun to canonical expressions with legacy fallbacks", () => {
    expect(expressionCandidatesForEmotion("joy")).toEqual(["joy", "happy"]);
    expect(expressionCandidatesForEmotion("anger")).toEqual(["anger", "angry"]);
    expect(expressionCandidatesForEmotion("sorrow")).toEqual(["sorrow", "sad"]);
    expect(expressionCandidatesForEmotion("fun")).toEqual(["fun", "joy", "happy"]);
  });
});
