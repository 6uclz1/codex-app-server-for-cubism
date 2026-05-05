import type { CharacterDirective, CharacterEmotion } from "@cubism/shared-types";

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
