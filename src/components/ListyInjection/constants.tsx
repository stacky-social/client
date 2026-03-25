import React from "react";
import {
  IconThumbUp,
  IconThumbDown,
  IconBulb,
  IconQuote,
  IconUser,
  IconLink,
  IconQuestionMark,
  IconBook,
  IconMoodSmile,
  IconHeart,
  IconFrame,
  IconStack,
} from "@tabler/icons-react";
import type { CategoryKey } from "../../types/PostType";

// ─── Per-category color palette ───────────────────────────────────────────────

export interface CategoryStyle {
  /** Highlight background for <mark> spans */
  bg: string;
  /** Accent border / badge background */
  border: string;
  /** Text / icon color */
  text: string;
  /** Subtle card tint for active state */
  cardTint: string;
}

export const CATEGORY_COLORS: Record<CategoryKey, CategoryStyle> = {
  agree: {
    bg: "#d4f9d3",
    border: "#4caf50",
    text: "#1b5e20",
    cardTint: "#f0fdf0",
  },
  disagree: {
    bg: "#ffe0e0",
    border: "#f44336",
    text: "#b71c1c",
    cardTint: "#fff5f5",
  },
  predictions: {
    bg: "#fff3cd",
    border: "#ff9800",
    text: "#e65100",
    cardTint: "#fffbf0",
  },
  evidence_public: {
    bg: "#e3f2fd",
    border: "#2196f3",
    text: "#0d47a1",
    cardTint: "#f5faff",
  },
  evidence_personal: {
    bg: "#f3e5f5",
    border: "#9c27b0",
    text: "#4a148c",
    cardTint: "#fdf5ff",
  },
  connections: {
    bg: "#e0f2f1",
    border: "#009688",
    text: "#004d40",
    cardTint: "#f0faf9",
  },
  questions: {
    bg: "#fce4ec",
    border: "#e91e63",
    text: "#880e4f",
    cardTint: "#fff5f8",
  },
  humor: {
    bg: "#fff8e1",
    border: "#ffc107",
    text: "#ff6f00",
    cardTint: "#fffdf0",
  },
  values: {
    bg: "#ede7f6",
    border: "#673ab7",
    text: "#311b92",
    cardTint: "#f8f5ff",
  },
  framing: {
    bg: "#e0f7fa",
    border: "#00bcd4",
    text: "#006064",
    cardTint: "#f0fbfc",
  },
  proposals: {
    bg: "#e8eaf6",
    border: "#3f51b5",
    text: "#1a237e",
    cardTint: "#f5f6ff",
  },
  uncategorized: {
    bg: "#f5f5f5",
    border: "#9e9e9e",
    text: "#424242",
    cardTint: "#fafafa",
  },
};

// ─── Per-category icons ───────────────────────────────────────────────────────

export const CATEGORY_ICONS: Record<CategoryKey, React.ReactElement> = {
  agree: <IconThumbUp size={14} />,
  disagree: <IconThumbDown size={14} />,
  predictions: <IconBulb size={14} />,
  evidence_public: <IconQuote size={14} />,
  evidence_personal: <IconUser size={14} />,
  connections: <IconLink size={14} />,
  questions: <IconQuestionMark size={14} />,
  humor: <IconMoodSmile size={14} />,
  values: <IconHeart size={14} />,
  framing: <IconFrame size={14} />,
  proposals: <IconBook size={14} />,
  uncategorized: <IconStack size={14} />,
};

// ─── Per-category display labels ──────────────────────────────────────────────

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  agree: "Agree",
  disagree: "Disagree",
  predictions: "Predictions",
  evidence_public: "Evidence (Public)",
  evidence_personal: "Evidence (Personal)",
  connections: "Connections",
  questions: "Questions",
  humor: "Humor",
  values: "Values",
  framing: "Framing",
  proposals: "Proposals",
  uncategorized: "Uncategorized",
};

// ─── Rank ordinals ────────────────────────────────────────────────────────────

const ORDINALS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function rankOrdinal(rank: number): string {
  return ORDINALS[rank - 1] ?? `#${rank}`;
}
