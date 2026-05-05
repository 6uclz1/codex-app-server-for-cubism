import type { TextConversationRequest } from "@cubism/shared-types";

export interface BuildTextConversationRequestInput {
  model: string;
  personaPrompt: string;
  userInput: string;
  previousResponseId?: string;
}

export function buildTextConversationRequest(input: BuildTextConversationRequestInput): TextConversationRequest {
  return {
    model: input.model,
    instructions: [
      input.personaPrompt.trim(),
      "Respond as a Live2D character. Keep the answer conversational and safe for local transcript storage.",
      "Prefix every answer with exactly one emotion marker chosen from [emotion: joy|anger|sorrow|fun|neutral], then continue with the answer text."
    ]
      .filter(Boolean)
      .join("\n\n"),
    input: input.userInput,
    previous_response_id: input.previousResponseId
  };
}
