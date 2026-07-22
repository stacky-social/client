export type EmotionKey =
  | 'angry'
  | 'cracked'
  | 'default'
  | 'haha'
  | 'love'
  | 'queasy'
  | 'sad'
  | 'sweet';

// Circularized Stacky avatar set (Gemini image generation, 2026-07): each
// icon is the ORIGINAL stacky_*.PNG character — same face, colors, and
// hand-drawn outline — regenerated with its original as the image reference,
// reshaped into a full-bleed circle with the sticky-note page curl removed,
// so the circular avatar crop shows it cleanly. Originals kept alongside.
export const AVATAR_BY_EMOTION: Record<EmotionKey, string> = {
  angry: '/avatar/robot_angry.png',
  cracked: '/avatar/robot_cracked.png',
  default: '/avatar/robot_default.png',
  haha: '/avatar/robot_haha.png',
  love: '/avatar/robot_love.png',
  queasy: '/avatar/robot_queasy.png',
  sad: '/avatar/robot_sad.png',
  sweet: '/avatar/robot_sweet.png',
};

// ─── Keyword library ────────────────────────────────────────────────────────
// Two tiers: single-word keywords (matched with word boundaries) and phrases
// (substring match). Phrases get a higher weight because multi-word patterns
// are stronger evidence than isolated words. Tuned for the robot-feedback
// domain ("constructive", "doesn't add much", "alienating", etc.) — the prior
// keyword set only knew everyday emotion words, so polite formal robot text
// matched none of them and everything fell through to the default avatar.

interface EmotionLexicon {
  words: readonly string[];
  phrases: readonly string[];
}

const LEXICON: Record<Exclude<EmotionKey, 'default'>, EmotionLexicon> = {
  angry: {
    words: ['angry', 'hate', 'awful', 'terrible', 'worst', 'stupid', 'ridiculous',
      'furious', 'mad', 'outrage', 'wrong', 'inappropriate', 'offensive', 'screw',
      'fail', 'fails', 'failed', 'failure', 'alienating', 'harmful', 'damaging'],
    phrases: ["doesn't add", "doesn't contribute", 'doesn\'t help', 'runs the risk',
      'risk of alienating', 'lacks substance', 'no value', 'never engage',
      'completely wrong', 'absolutely not'],
  },
  cracked: {
    words: ['crazy', 'insane', 'wild', 'bizarre', 'weird', 'whoa', 'wow',
      'unbelievable', 'unclear', 'confusing', 'elaborate', 'clarify', 'huh',
      'really'],
    phrases: ['can you elaborate', 'what do you mean', "i'm not sure", 'not clear',
      'could you explain', 'wait, what', 'how does that', 'how can'],
  },
  haha: {
    words: ['haha', 'lol', 'lmao', 'rofl', 'funny', 'hilarious', 'joke', 'laugh',
      'lmfao', 'jk', 'kidding'],
    phrases: ['that\'s funny', 'made me laugh', 'too funny'],
  },
  love: {
    words: ['love', 'amazing', 'brilliant', 'wonderful', 'perfect', 'fantastic',
      'beautiful', 'incredible', 'awesome', 'excellent', '❤'],
    phrases: ['well said', 'great point', 'spot on', 'couldn\'t agree more',
      'love this'],
  },
  queasy: {
    words: ['gross', 'ew', 'ugh', 'yuck', 'nasty', 'vile', 'disgusting', 'eww',
      'troubling', 'concerning', 'uncomfortable', 'problematic', 'biased',
      'oversimplified', 'shallow', 'emotional', 'reactionary'],
    phrases: ['why blame', 'emotional response', 'seems like more', 'rather than',
      'instead of', 'the real problem', 'have you considered', 'oversimplifies',
      'misses the point'],
  },
  sad: {
    words: ['sad', 'sorry', 'unfortunately', 'disappointed', 'regret', 'miss',
      'lonely', 'hurt', 'cry', 'unfortunate', 'pity', 'shame', 'tragic'],
    phrases: ['that\'s unfortunate', 'i\'m sorry', 'feel bad', 'so sad'],
  },
  sweet: {
    words: ['sweet', 'nice', 'kind', 'thanks', 'thank', 'appreciate', 'glad',
      'happy', 'lovely', 'agree', 'good', 'constructive', 'helpful', 'thoughtful',
      'fair', 'reasonable', 'consider'],
    phrases: ['good point', 'fair point', 'thanks for sharing', 'i appreciate',
      'consider addressing', 'more impactful', 'contribute to', 'might consider',
      'worth thinking', 'try to'],
  },
};

// Higher in PRIORITY = wins ties. Strong emotions over mild ones; angry/queasy
// over sweet so a critical robot reply that also says "consider" still reads
// as critique rather than warmth.
const PRIORITY: readonly EmotionKey[] = [
  'love', 'angry', 'queasy', 'haha', 'sad', 'cracked', 'sweet', 'default',
];

const PHRASE_WEIGHT = 2;

// ─── Internals ──────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[‘’]/g, "'")     // smart quotes → straight
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWord(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = /^[a-z0-9]+$/.test(keyword)
    ? new RegExp(`\\b${escaped}\\b`, 'g')
    : new RegExp(escaped, 'g');
  return (text.match(pattern) ?? []).length;
}

function countPhrase(text: string, phrase: string): number {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(escaped, 'g')) ?? []).length;
}

export interface SentimentBreakdown {
  emotion: EmotionKey;
  avatar: string;
  scores: Partial<Record<EmotionKey, number>>;
  matched: Partial<Record<EmotionKey, string[]>>;
  normalized: string;
}

/** Full diagnostic: pick the emotion and return the score breakdown.
 *  Use `pickAvatarForText` for the common case (just the avatar). */
export function classifySentiment(text: string): SentimentBreakdown {
  const normalized = normalize(text);
  const scores: Partial<Record<EmotionKey, number>> = {};
  const matched: Partial<Record<EmotionKey, string[]>> = {};

  if (!normalized) {
    return { emotion: 'default', avatar: AVATAR_BY_EMOTION.default, scores, matched, normalized };
  }

  let max = 0;
  (Object.keys(LEXICON) as Exclude<EmotionKey, 'default'>[]).forEach((emotion) => {
    const lex = LEXICON[emotion];
    let score = 0;
    const hits: string[] = [];
    for (const w of lex.words) {
      const n = countWord(normalized, w);
      if (n > 0) { score += n; hits.push(w); }
    }
    for (const p of lex.phrases) {
      const n = countPhrase(normalized, p);
      if (n > 0) { score += n * PHRASE_WEIGHT; hits.push(`"${p}"`); }
    }
    if (score > 0) {
      scores[emotion] = score;
      matched[emotion] = hits;
      if (score > max) max = score;
    }
  });

  let emotion: EmotionKey = 'default';
  if (max > 0) {
    for (const e of PRIORITY) {
      if (scores[e] === max) { emotion = e; break; }
    }
  }

  return {
    emotion,
    avatar: AVATAR_BY_EMOTION[emotion],
    scores,
    matched,
    normalized,
  };
}

/** Pick the avatar URL for a given text. Returns the default Stacky face
 *  when no keywords match. Set `localStorage.debugSentiment = '1'` to see
 *  each classification's score breakdown in the console. */
export function pickAvatarForText(text: string): string {
  const result = classifySentiment(text);
  if (typeof window !== 'undefined' && window.localStorage?.getItem('debugSentiment') === '1') {
    // eslint-disable-next-line no-console
    console.debug('[sentimentAvatar]', {
      emotion: result.emotion,
      scores: result.scores,
      matched: result.matched,
      text: text.slice(0, 120),
    });
  }
  return result.avatar;
}

// Dev helper: expose to window so you can type
//   __debugSentiment("the robot text here")
// in the console and see what the classifier returns.
if (typeof window !== 'undefined') {
  (window as any).__debugSentiment = classifySentiment;
}
