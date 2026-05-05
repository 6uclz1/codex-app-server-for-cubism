import type { CharacterDirective, CharacterDirectiveV2, CharacterEmotion, SpeakingStyle } from "@cubism/shared-types";

const emotionPatterns: Array<[CharacterEmotion, RegExp]> = [
  ["fun", /\b(fun|enjoy|playful|delightful)\b|楽しい|楽しみ|愉快|面白い/i],
  ["joy", /\b(happy|glad|great|wonderful|excellent|nice|pleased)\b|うれしい|嬉しい|喜び|喜ばしい/i],
  ["sorrow", /\b(sad|sorry|unfortunate|lonely|painful)\b|つらい|辛い|悲しい|哀しい|残念/i],
  ["anger", /\b(angry|frustrated|upset|annoyed|irritated)\b|怒り|怒る|腹立/i],
  ["surprised", /(\?|!){2,}|\b(surprise|surprised|unexpected|wait|驚|びっくり)\b/i],
  ["thinking", /\b(think|consider|tradeoff|analyze|hmm|考え|検討)\b/i]
];

const expressionByEmotion: Record<CharacterEmotion, string> = {
  neutral: "neutral",
  joy: "joy",
  anger: "anger",
  sorrow: "sorrow",
  fun: "fun",
  surprised: "surprised",
  thinking: "thinking"
};

const explicitEmotionPattern = /^\s*\[emotion:\s*(neutral|joy|anger|sorrow|fun|surprised|thinking|happy|sad|angry)\]\s*/i;
const explicitMotionPattern = /^\s*\[motion:\s*([a-z0-9_-]+)\]\s*/i;

const legacyEmotionAliases: Partial<Record<string, CharacterEmotion>> = {
  happy: "joy",
  sad: "sorrow",
  angry: "anger"
};

function normalizeEmotion(value: string): CharacterEmotion {
  const normalized = value.toLowerCase();
  return legacyEmotionAliases[normalized] ?? (normalized as CharacterEmotion);
}

function parseExplicitEmotion(text: string): { emotion: CharacterEmotion; text: string } | null {
  const match = text.match(explicitEmotionPattern);
  if (!match?.[1]) {
    return null;
  }
  return {
    emotion: normalizeEmotion(match[1]),
    text: text.slice(match[0].length).trim()
  };
}

export function mapEmotionFromText(text: string): CharacterEmotion {
  const explicit = parseExplicitEmotion(text);
  if (explicit) {
    return explicit.emotion;
  }
  for (const [emotion, pattern] of emotionPatterns) {
    if (pattern.test(text)) {
      return emotion;
    }
  }
  return "neutral";
}

export function buildCharacterDirective(text: string): CharacterDirective {
  const explicit = parseExplicitEmotion(text);
  const directiveText = explicit?.text ?? text;
  const emotion = explicit?.emotion ?? mapEmotionFromText(directiveText);
  return {
    text: directiveText,
    emotion,
    speakingStyle: "normal",
    expression: expressionByEmotion[emotion]
  };
}

export function buildCharacterDirectiveV2(text: string): CharacterDirectiveV2 {
  const json = parseJsonDirective(text);
  if (json) {
    return json;
  }
  let workingText = text;
  const explicit = parseExplicitEmotion(workingText);
  const emotion = explicit?.emotion ?? mapEmotionFromText(workingText);
  if (explicit) {
    workingText = explicit.text;
  }
  const motion = parseExplicitMotion(workingText);
  if (motion) {
    workingText = motion.text;
  }
  const intensity = emotion === "neutral" ? 0.45 : emotion === "thinking" ? 0.65 : 0.75;
  return {
    text: workingText.trim(),
    emotion,
    intensity,
    speakingStyle: "normal",
    expression: { semantic: emotion, intensity },
    motion: { semantic: motion?.semantic ?? motionSemanticForEmotion(emotion), priority: "normal" }
  };
}

function parseExplicitMotion(text: string): { semantic: string; text: string } | null {
  const match = text.match(explicitMotionPattern);
  if (!match?.[1]) {
    return null;
  }
  return {
    semantic: match[1],
    text: text.slice(match[0].length).trim()
  };
}

function parseJsonDirective(text: string): CharacterDirectiveV2 | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const value = JSON.parse(trimmed) as Partial<CharacterDirectiveV2>;
    const emotion = normalizeEmotionValue(value.emotion);
    if (!value.text || !emotion) {
      return null;
    }
    const intensity = clamp01(value.intensity ?? 0.75);
    const speakingStyle = normalizeSpeakingStyle(value.speakingStyle);
    return {
      text: value.text,
      emotion,
      intensity,
      speakingStyle,
      expression: value.expression ?? { semantic: emotion, intensity },
      motion: value.motion,
      gaze: value.gaze,
      timing: value.timing
    };
  } catch {
    return null;
  }
}

function normalizeEmotionValue(value: unknown): CharacterEmotion | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeEmotion(value);
  return ["neutral", "joy", "anger", "sorrow", "fun", "surprised", "thinking"].includes(normalized) ? normalized : null;
}

function normalizeSpeakingStyle(value: unknown): SpeakingStyle {
  return value === "soft" || value === "energetic" || value === "normal" ? value : "normal";
}

function motionSemanticForEmotion(emotion: CharacterEmotion): string {
  if (emotion === "joy" || emotion === "fun") return "happy";
  if (emotion === "sorrow") return "sad";
  if (emotion === "anger") return "angry";
  return emotion;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.75;
}
