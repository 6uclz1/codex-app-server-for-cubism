import { buildCharacterDirective } from "./EmotionMapper.js";
import { buildTextConversationRequest, type BuildTextConversationRequestInput } from "./PromptBuilder.js";

export interface ResponsesApiClient {
  createResponse(request: ReturnType<typeof buildTextConversationRequest>): Promise<{ text: string; responseId?: string }>;
}

export class CharacterAgent {
  constructor(private readonly client: ResponsesApiClient) {}

  async reply(input: BuildTextConversationRequestInput) {
    const response = await this.client.createResponse(buildTextConversationRequest(input));
    return {
      directive: buildCharacterDirective(response.text),
      responseId: response.responseId
    };
  }
}
