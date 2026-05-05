export type CharacterState = "idle" | "listening" | "thinking" | "speaking" | "error";

export type CharacterEmotion = "neutral" | "joy" | "anger" | "sorrow" | "fun" | "surprised" | "thinking";

export type SpeakingStyle = "normal" | "soft" | "energetic";

export interface CharacterDirective {
  text: string;
  emotion: CharacterEmotion;
  motion?: string;
  expression?: string;
  speakingStyle: SpeakingStyle;
}

export interface CharacterProfile {
  id: string;
  name: string;
  modelPath: string;
  personaPrompt: string;
  defaultVoice?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConversationRecord {
  id: string;
  characterId: string;
  title?: string | null;
  openaiConversationId?: string | null;
  previousResponseId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  emotion?: CharacterEmotion | null;
  createdAt?: string;
}

export interface Live2DAssetRecord {
  id: string;
  characterId: string;
  assetType: "model" | "motion" | "expression" | "texture" | "physics" | "userdata";
  name: string;
  path: string;
}

export interface RealtimeSessionRequest {
  model: string;
  voice?: string;
  instructions?: string;
  sdp?: string;
}

export interface TextConversationRequest {
  model: string;
  instructions: string;
  input: string;
  previous_response_id?: string;
}
