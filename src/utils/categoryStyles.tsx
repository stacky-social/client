import React from 'react';
import {
  IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook,
  IconMoodSmile, IconFrame, IconUser, IconHeartHandshake, IconThumbUp, IconThumbDown,
  IconStack2,
} from '@tabler/icons-react';

// Single source of truth for contribution-category presentation. RelatedStacks,
// Post (focus cross-highlight), reply badges, and the experiment panel all read
// from here — do not re-declare these tables locally.

export interface CategoryStyle { bg: string; border: string; text: string }

export const CATEGORY_COLORS: Record<string, CategoryStyle> = {
  agree:              { bg: "#d4f9d3", border: "#4caf50", text: "#1b5e20" },
  disagree:           { bg: "#ffe0e0", border: "#f44336", text: "#b71c1c" },
  predictions:        { bg: "#fff3cd", border: "#ff9800", text: "#e65100" },
  evidence_public:    { bg: "#e3f2fd", border: "#2196f3", text: "#0d47a1" },
  evidence_personal:  { bg: "#f3e5f5", border: "#9c27b0", text: "#4a148c" },
  connections:        { bg: "#e0f2f1", border: "#009688", text: "#004d40" },
  questions:          { bg: "#fce4ec", border: "#e91e63", text: "#880e4f" },
  humor:              { bg: "#fff8e1", border: "#ffc107", text: "#ff6f00" },
  values:             { bg: "#ede7f6", border: "#673ab7", text: "#311b92" },
  framing:            { bg: "#e0f7fa", border: "#00bcd4", text: "#006064" },
  proposals:          { bg: "#e8eaf6", border: "#3f51b5", text: "#1a237e" },
  // Distinct from proposals (they were identical, a latent color-identity
  // confound for the cross-highlight condition the moment pointers appear).
  pointers:           { bg: "#efebe9", border: "#795548", text: "#3e2723" },
  uncategorized:      { bg: "#f5f5f5", border: "#9e9e9e", text: "#424242" },
};

export const CATEGORY_LABELS: Record<string, string> = {
  agree: "Agree", disagree: "Disagree", predictions: "Predictions",
  evidence_public: "Evidence (Public)", evidence_personal: "Evidence (Personal)",
  connections: "Connections", questions: "Questions", humor: "Humor",
  values: "Values", framing: "Framing", proposals: "Proposals",
  pointers: "Pointers", uncategorized: "Uncategorized",
};

export function getCategoryColors(rel: string): CategoryStyle {
  return CATEGORY_COLORS[rel] ?? CATEGORY_COLORS.uncategorized;
}

/** Element map kept for the existing React.cloneElement call sites in
 *  RelatedStacks. New code should prefer categoryIcon(). */
export const iconMapping: Record<string, JSX.Element> = {
  uncategorized: <IconStack2 size={14} />, predictions: <IconBulb size={14} />,
  evidence_public: <IconQuote size={14} />, evidence_personal: <IconUser size={14} />,
  connections: <IconLink size={14} />, pointers: <IconPointer size={14} />,
  proposals: <IconBook size={14} />, humor: <IconMoodSmile size={14} />,
  // values uses the handshake-heart, NOT the plain heart: the plain heart is the
  // Like action glyph, and a category badge must not read as a like indicator.
  values: <IconHeartHandshake size={14} />, framing: <IconFrame size={14} />,
  questions: <IconQuestionMark size={14} />, default: <IconStack2 size={14} />,
  agree: <IconThumbUp size={14} />, disagree: <IconThumbDown size={14} />,
};

export function categoryIcon(cat: string, size = 14, color?: string): JSX.Element {
  return React.cloneElement(iconMapping[cat] ?? iconMapping.default, { size, color });
}

/** Hex → rgba() string. */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Blend two hex colours by t (0..1) → OPAQUE rgb, so stacked/adjacent marks
 *  can never compound into darker bands. Level-1 faint = blend toward white;
 *  level-2 strong = blend the category bg toward its saturated border. */
export function blendHex(from: string, to: string, t: number): string {
  const a = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(a[0], b[0])},${m(a[1], b[1])},${m(a[2], b[2])})`;
}
