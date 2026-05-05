import { describe, expect, it } from "vitest";
import { buildTextConversationRequest } from "./PromptBuilder.js";

describe("PromptBuilder", () => {
  it("keeps persona and conversation continuation explicit", () => {
    const request = buildTextConversationRequest({
      model: "gpt-4.1-mini",
      personaPrompt: "You are a concise Live2D assistant.",
      userInput: "Hello",
      previousResponseId: "resp_123"
    });

    expect(request.model).toBe("gpt-4.1-mini");
    expect(request.instructions).toContain("Live2D");
    expect(request.input).toBe("Hello");
    expect(request.previous_response_id).toBe("resp_123");
  });
});
