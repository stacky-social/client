export type EmotionKey =
  | 'angry'
  | 'cracked'
  | 'default'
  | 'haha'
  | 'love'
  | 'queasy'
  | 'sad'
  | 'sweet';

export const AVATAR_BY_EMOTION: Record<EmotionKey, string> = {
  angry: '/avatar/stacky_angry.PNG',
  cracked: '/avatar/stacky_cracked.PNG',
  default: '/avatar/stacky_default.PNG',
  haha: '/avatar/stacky_haha.PNG',
  love: '/avatar/stacky_love.PNG',
  queasy: '/avatar/stacky_queasy.PNG',
  sad: '/avatar/stacky_sad.PNG',
  sweet: '/avatar/stacky_sweet.PNG',
};

const KEYWORDS: Record<Exclude<EmotionKey, 'default'>, readonly string[]> = {
  angry: ['angry', 'hate', 'awful', 'terrible', 'worst', 'stupid', 'ridiculous', 'furious', 'mad', 'outrage', 'wrong', 'bad', 'no', 'never'],
  cracked: ['crazy', 'insane', 'wild', 'bizarre', 'weird', 'whoa', 'wow', 'unbelievable', 'mind-blown'],
  haha: ['haha', 'lol', 'lmao', 'rofl', 'funny', 'hilarious', 'joke', 'laugh', 'lmfao'],
  love: ['love', 'amazing', 'brilliant', 'wonderful', 'perfect', 'fantastic', 'beautiful', 'incredible', 'awesome', '❤'],
  queasy: ['gross', 'ew', 'ugh', 'yuck', 'nasty', 'vile', 'disgusting', 'eww'],
  sad: ['sad', 'sorry', 'unfortunately', 'disappointed', 'regret', 'miss', 'lonely', 'hurt', 'cry'],
  sweet: ['sweet', 'nice', 'kind', 'thanks', 'thank', 'appreciate', 'glad', 'happy', 'lovely', 'agree', 'good'],
};

const PRIORITY: readonly EmotionKey[] = ['love', 'angry', 'haha', 'sad', 'queasy', 'cracked', 'sweet', 'default'];

function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = /^[a-z0-9]+$/.test(keyword)
    ? new RegExp(`\\b${escaped}\\b`, 'g')
    : new RegExp(escaped, 'g');
  return (text.match(pattern) ?? []).length;
}

export function pickAvatarForText(text: string): string {
  const normalized = normalize(text);
  if (!normalized) return AVATAR_BY_EMOTION.default;

  const scores: Partial<Record<EmotionKey, number>> = {};
  let max = 0;
  (Object.keys(KEYWORDS) as Exclude<EmotionKey, 'default'>[]).forEach((emotion) => {
    const words = KEYWORDS[emotion];
    let score = 0;
    for (const w of words) score += countMatches(normalized, w);
    if (score > 0) {
      scores[emotion] = score;
      if (score > max) max = score;
    }
  });

  if (max === 0) return AVATAR_BY_EMOTION.default;

  for (const emotion of PRIORITY) {
    if (scores[emotion] === max) return AVATAR_BY_EMOTION[emotion];
  }
  return AVATAR_BY_EMOTION.default;
}
