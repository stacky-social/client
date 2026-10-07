import React from 'react';
import {
  IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconArrowRight,
  IconMoodSmile, IconFrame, IconUser, IconHeartHandshake, IconThumbUp, IconThumbDown,
  IconStack2,
} from '@tabler/icons-react';

// Single source of truth for contribution-category presentation. RelatedStacks,
// Post (focus cross-highlight), reply badges, and the experiment panel all read
// from here — do not re-declare these tables locally.

export interface CategoryStyle { bg: string; border: string; text: string }

// Each contribution type gets its own hue so readers can tell them apart at a
// glance. Borders were optimised in OKLCH for a normal-vision ΔE >= 15 between
// every pair (and >= 32° hue gap); text colours keep >= 5:1 contrast on their
// tint. Icons and labels stay the secondary encoding for colour-blind readers.
const NEUTRAL: CategoryStyle = { bg: "#eceef1", border: "#8a919c", text: "#4a515c" };

export const CATEGORY_COLORS: Record<string, CategoryStyle> = {
  agree: { bg: "#c3f3ca", border: "#1b7f3b", text: "#03712f" },
  disagree: { bg: "#fedbd9", border: "#d7263d", text: "#a12e36" },
  predictions: { bg: "#f7e3ab", border: "#f2c200", text: "#735a00" },
  evidence_public: { bg: "#d6e6fe", border: "#1e6fd9", text: "#1b5bb0" },
  evidence_personal: { bg: "#ecddfe", border: "#5b2a86", text: "#72429f" },
  connections: { bg: "#ffddc8", border: "#f57c00", text: "#904702" },
  questions: { bg: "#b9efff", border: "#7fd8f0", text: "#00697d" },
  humor: { bg: "#fed7f5", border: "#ec6fd6", text: "#8d357f" },
  values: { bg: "#a8f5f4", border: "#00a3a3", text: "#066b6b" },
  framing: { bg: "#e9e0d6", border: "#8d5a2b", text: "#6b4420" },
  proposals: { bg: "#fed7f5", border: "#ec6fd6", text: "#8d357f" },
  pointers: NEUTRAL,
  uncategorized: NEUTRAL,
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
  uncategorized: <IconStack2 size={14} />, predictions: <IconArrowRight size={14} />,
  evidence_public: <IconQuote size={14} />, evidence_personal: <IconUser size={14} />,
  connections: <IconLink size={14} />, pointers: <IconPointer size={14} />,
  proposals: <IconBulb size={14} />, humor: <IconMoodSmile size={14} />,
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
