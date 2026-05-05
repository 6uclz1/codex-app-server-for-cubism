import { describe, expect, it } from "vitest";
import { buildCharacterDirective, buildCharacterDirectiveV2, mapEmotionFromText } from "./EmotionMapper.js";

describe("EmotionMapper", () => {
  it("maps conversational text to stable character emotions for joy, anger, sorrow, and fun", () => {
    expect(mapEmotionFromText("That is wonderful, I am happy for you!")).toBe("joy");
    expect(mapEmotionFromText("I am sorry, that sounds sad.")).toBe("sorrow");
    expect(mapEmotionFromText("This is frustrating and makes me angry.")).toBe("anger");
    expect(mapEmotionFromText("楽しい時間になりそうです。")).toBe("fun");
    expect(mapEmotionFromText("喜びを感じます。")).toBe("joy");
    expect(mapEmotionFromText("怒りを感じます。")).toBe("anger");
    expect(mapEmotionFromText("哀しい知らせです。")).toBe("sorrow");
    expect(mapEmotionFromText("Wait, what happened?!")).toBe("surprised");
    expect(mapEmotionFromText("Let me think about the tradeoffs.")).toBe("thinking");
    expect(mapEmotionFromText("Plain response.")).toBe("neutral");
  });

  it("builds a directive without requiring structured model output", () => {
    expect(buildCharacterDirective("Great, I can help with that.")).toEqual({
      text: "Great, I can help with that.",
      emotion: "joy",
      speakingStyle: "normal",
      expression: "joy"
    });
  });

  it("accepts explicit response emotion markers and removes them from displayed text", () => {
    expect(buildCharacterDirective("[emotion: anger] That should not happen again.")).toEqual({
      text: "That should not happen again.",
      emotion: "anger",
      speakingStyle: "normal",
      expression: "anger"
    });
  });

  it("builds CharacterDirectiveV2 from marker text and JSON directive payloads", () => {
    expect(buildCharacterDirectiveV2("[emotion: happy] Great.")).toEqual({
      text: "Great.",
      emotion: "joy",
      intensity: 0.75,
      speakingStyle: "normal",
      expression: { semantic: "joy", intensity: 0.75 },
      motion: { semantic: "happy", priority: "normal" }
    });
    expect(buildCharacterDirectiveV2('{"text":"Wait","emotion":"surprised","intensity":0.9,"motion":{"semantic":"tapBody","priority":"force"}}')).toEqual(
      expect.objectContaining({
        text: "Wait",
        emotion: "surprised",
        intensity: 0.9,
        motion: { semantic: "tapBody", priority: "force" }
      })
    );
  });
});
