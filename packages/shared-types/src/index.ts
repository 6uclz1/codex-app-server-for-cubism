export type CharacterState = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "reacting" | "sleeping" | "error";

export type CharacterRuntimeState = "booting" | CharacterState;

export type CharacterEmotion = "neutral" | "joy" | "anger" | "sorrow" | "fun" | "surprised" | "thinking";

export type SpeakingStyle = "normal" | "soft" | "energetic";

export interface CharacterDirective {
  text: string;
  emotion: CharacterEmotion;
  motion?: string;
  expression?: string;
  speakingStyle: SpeakingStyle;
}

export interface CharacterDirectiveV2 {
  text: string;
  emotion: CharacterEmotion;
  intensity: number;
  speakingStyle: SpeakingStyle;
  expression?: {
    semantic: CharacterEmotion | string;
    intensity?: number;
    durationMs?: number;
  };
  motion?: {
    semantic: string;
    priority?: "idle" | "normal" | "force";
  };
  gaze?: {
    target: "user" | "away" | "down" | "screen";
  };
  timing?: {
    startDelayMs?: number;
    estimatedSpeechMs?: number;
  };
}

export interface CharacterProfile {
  id: string;
  name: string;
  modelPath: string;
  modelId?: string | null;
  personaPrompt: string;
  defaultVoice?: string | null;
  greeting?: string | null;
  ngTopicStyle?: string | null;
  memoryEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Live2DModelRecord {
  id: string;
  entryPath: string;
  baseDir: string;
  displayName?: string | null;
  modelHash: string;
  manifestJson: string;
  validationReportJson: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Live2DMotionMappingRecord {
  id: string;
  modelId: string;
  semantic: string;
  groupName: string;
  motionIndex?: number | null;
  priority: "idle" | "normal" | "force";
}

export interface Live2DExpressionMappingRecord {
  id: string;
  modelId: string;
  emotion: CharacterEmotion | string;
  expressionName: string;
}

export interface CharacterRuntimeSettingsRecord {
  characterId: string;
  modelId: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  idlePolicyJson: string;
  lipSyncPolicyJson: string;
  gazePolicyJson: string;
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
