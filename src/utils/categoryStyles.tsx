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

// Category meaning remains icon- and label-specific, while color is deliberately
// constrained to the four lobes of the CrossWeave mark. Reusing these palettes
// makes highlights, filter chips, and relation tags feel like one system.
const BRAND_TEAL: CategoryStyle = { bg: "#e3f4f2", border: "#45a99e", text: "#246f68" };
const BRAND_CORAL: CategoryStyle = { bg: "#fbe8e6", border: "#e15c52", text: "#9e3d36" };
const BRAND_AMBER: CategoryStyle = { bg: "#fff3df", border: "#f0a83e", text: "#8a5a16" };
const BRAND_NAVY: CategoryStyle = { bg: "#e8edf5", border: "#1c2b4a", text: "#1c2b4a" };

export const CATEGORY_COLORS: Record<string, CategoryStyle> = {
  agree: BRAND_TEAL,
  disagree: BRAND_CORAL,
  predictions: BRAND_AMBER,
  evidence_public: BRAND_NAVY,
  evidence_personal: BRAND_CORAL,
  connections: BRAND_TEAL,
  questions: BRAND_CORAL,
  humor: BRAND_AMBER,
  values: BRAND_TEAL,
  framing: BRAND_NAVY,
  proposals: BRAND_NAVY,
  pointers: BRAND_AMBER,
  uncategorized: BRAND_NAVY,
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
