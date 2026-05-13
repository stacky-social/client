import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Anchor } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconThumbUp, IconThumbDown, IconChevronRight } from '@tabler/icons-react';
import { Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import StackPostsModal from './StackPostsModal';
import InteractionControl from './InteractionControl';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
import { setHoveredSidebarPost, setHoveredHighlightRangeIndex, setHoveredCategory, setTapped, clearTapped, toggleReRankAnchor, clearReRankAnchors, toggleFilterCategory, useHighlightStore } from '../utils/highlightStore';
import type { Relation } from '../types/PostType';
import { showTooltip, hideTooltip, type TooltipColors } from './HoverTooltip';
import './RelatedStacks.css';

interface PostType {
  id: string;
  created_at: string;
  replies_count: number;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  content: string;
  account: {
    avatar: string;
    display_name: string;
    acct?: string;
    username?: string;
  };
  content_rewritten: string;
  rewrite: { content: string; significant: boolean };
  /** Offset-based relations between this post and the focus post */
  relations?: Relation[];
}

interface RelatedStackType {
  stackId: string;
  rel: string;
  size: number;
  topPost: PostType;
}

interface RelatedStacksProps {
  relatedStacks: RelatedStackType[];
  cardWidth?: number | string;
  onStackClick: (stackId: string) => void;
  showupdate: boolean;
  onOpenModalWithStackId?: (stackId: string) => void;
  /** When provided, intercepts post navigation instead of routing to /posts/{id} */
  onPostNavigate?: (postId: string) => void;
}

// ─── Category colors ─────────────────────────────────────────────────────────

interface CategoryStyle { bg: string; border: string; text: string }

const CATEGORY_COLORS: Record<string, CategoryStyle> = {
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
  pointers:           { bg: "#e8eaf6", border: "#3f51b5", text: "#1a237e" },
  uncategorized:      { bg: "#f5f5f5", border: "#9e9e9e", text: "#424242" },
};

const CATEGORY_LABELS: Record<string, string> = {
  agree: "Agree", disagree: "Disagree", predictions: "Predictions",
  evidence_public: "Evidence (Public)", evidence_personal: "Evidence (Personal)",
  connections: "Connections", questions: "Questions", humor: "Humor",
  values: "Values", framing: "Framing", proposals: "Proposals",
  pointers: "Pointers", uncategorized: "Uncategorized",
};

const iconMapping: Record<string, JSX.Element> = {
  uncategorized: <Layers size={14} />, predictions: <IconBulb size={14} />,
  evidence_public: <IconQuote size={14} />, evidence_personal: <IconUser size={14} />,
  connections: <IconLink size={14} />, pointers: <IconPointer size={14} />,
  proposals: <IconBook size={14} />, humor: <IconMoodSmile size={14} />,
  values: <IconHeart size={14} />, framing: <IconFrame size={14} />,
  questions: <IconQuestionMark size={14} />, default: <Layers size={14} />,
  agree: <IconThumbUp size={14} />, disagree: <IconThumbDown size={14} />,
};

function getCategoryColors(rel: string): CategoryStyle {
  return CATEGORY_COLORS[rel] ?? CATEGORY_COLORS.uncategorized;
}

// ─── Eye cursor — indicates "click to see more like this" ───────────────────
// Small 20x20 SVG eye, encoded inline as the cursor image. Fallback: pointer.
const EYE_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z'/><circle cx='12' cy='12' r='3'/></svg>") 11 11, pointer`;

// ─── Group connector line ───────────────────────────────────────────────────
// A single continuous vertical line spans from the topic label below the
// anchor, through all claimed cards, down to the "MORE [topic]" pagination
// link. Each item in the group renders its own line segment that extends into
// the flex gap above so the segments visually connect across the gaps. The
// line is colored with the anchor's category color so the group reads as one
// thread rather than per-card border segments.
const GROUP_LINE_WIDTH = 2;
const GROUP_GAP_PX = 12; // matches the parent's `gap: '0.75rem'`

// ─── Missing-topic diagnostic (rate-limited) ─────────────────────────────────
// Surface data-integrity issues (relations with no `topic`) in study logs
// without spamming the console. One warning per (stackId, rangeIndex) pair
// per session; the tooltip and "X more" button are suppressed in that case.
const warnedMissingTopic = new Set<string>();
function warnMissingTopic(stackId: string, rangeIndex: number): void {
  const key = `${stackId}:${rangeIndex}`;
  if (warnedMissingTopic.has(key)) return;
  warnedMissingTopic.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    '[stacky] missing topic on relation; tooltip/button suppressed',
    { stackId, rangeIndex },
  );
}

// ─── Tooltip label renderer ───────────────────────────────────────────────────
// "N more <Topic>" with the topic bolded in the category color. Returns null
// when topic is absent, so callers can short-circuit without rendering.
function buildTooltipLabel(
  topic: string | undefined,
  otherCount: number | undefined,
  textColor: string,
): React.ReactNode | null {
  if (!topic) return null;
  const count = otherCount ?? 0;
  return (
    <>
      {count} more <strong style={{ color: textColor }}>{topic}</strong>
    </>
  );
}

// ─── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({ category, count, active, onClick }: {
  category: string; count: number; active: boolean; onClick: () => void;
}) {
  const colors = getCategoryColors(category);
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <button
      onClick={onClick}
      aria-label={`${active ? "Remove" : "Show"} ${label} filter`}
      aria-pressed={active}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        background: active ? colors.bg : "#f8f9fa",
        border: `1.5px solid ${active ? colors.border : "#e2e8f0"}`,
        borderRadius: "16px", padding: "3px 10px 3px 7px",
        cursor: "pointer", transition: "all 150ms ease", outline: "none", flexShrink: 0,
      }}
    >
      {React.cloneElement(iconMapping[category] ?? iconMapping['default'], { color: active ? colors.text : "#64748b", size: 13 })}
      <Text size="xs" fw={active ? 700 : 500} c={active ? colors.text : "#64748b"} style={{ fontSize: "11px", lineHeight: 1, whiteSpace: "nowrap" }}>{label}</Text>
      <Text size="xs" c={active ? colors.text : "#94a3b8"} style={{ fontSize: "10px", lineHeight: 1 }}>{count}</Text>
    </button>
  );
}

// ─── Highlight helpers (offset-based) ────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface HighlightRange { start: number; end: number }

// ─── Overlap detection for multi-range highlights ────────────────────────────

interface TaggedRange { start: number; end: number; rangeIndex: number; category: string; topic?: string; comment?: string }

/** Split overlapping ranges into non-overlapping segments, each tagged with contributing ranges */
interface Segment { start: number; end: number; contributors: TaggedRange[] }

function buildSegments(tagged: TaggedRange[]): Segment[] {
  if (tagged.length === 0) return [];
  // Collect all boundary points
  const points = new Set<number>();
  for (const r of tagged) { points.add(r.start); points.add(r.end); }
  const sorted = Array.from(points).sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i], e = sorted[i + 1];
    if (s === e) continue;
    const contributors = tagged.filter(r => r.start <= s && r.end >= e);
    if (contributors.length > 0) {
      segments.push({ start: s, end: e, contributors });
    }
  }
  return segments;
}

/** Build React nodes for multi-range highlights with overlap support.
 *  Uses offset-based Relation[] — no bracket parsing needed.
 *  Supports 3 visual levels: default (always-on, dimmed), card-hover (bright), substring-hover (one bright, rest dim). */
function buildMultiHighlightNodes(
  plain: string,
  relations: Relation[] | undefined,
  primaryColors: CategoryStyle,
  opts: {
    isCardHovered: boolean;
    anyCardHovered: boolean;
    hoveredRangeIndex: number | null;
    hoveredCategory: string | null;
    anchoredRangeIndex: number | null;
    onRangeHover: (index: number | null) => void;
    onRangeClick?: (index: number) => void;
    /** topic → number of OTHER posts (excluding current) that share this topic */
    otherCountByTopic?: (topic: string) => number;
    stackId: string;
  },
): React.ReactNode[] {
  if (!relations || relations.length === 0) return [plain];

  // Build tagged ranges from relations (content side)
  const tagged: TaggedRange[] = relations.map((r, i) => ({
    start: r.contentStart, end: r.contentEnd, rangeIndex: i,
    category: r.category,
    topic: r.topic,
    // contentComment is the substring plain[contentCommentStart:contentCommentEnd]
    comment: (r.contentCommentStart < r.contentCommentEnd)
      ? plain.slice(r.contentCommentStart, r.contentCommentEnd)
      : undefined,
  }));

  // Detect overlaps by building segments
  const segments = buildSegments(tagged);
  if (segments.length === 0) return [plain];

  const nodes: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const seg of segments) {
    // Add plain text before this segment
    if (seg.start > lastEnd) {
      nodes.push(plain.slice(lastEnd, seg.start));
    }

    const isOverlap = seg.contributors.length > 1;
    const segText = plain.slice(seg.start, seg.end);

    if (isOverlap) {
      // Overlapping region — per-band alpha: the hovered band is bright, others dim.
      // Hover band is detected via mouseMove Y within the mark.
      const cats = seg.contributors.map(c => {
        const cc = getCategoryColors(c.category);
        return { ...c, colors: cc };
      });

      const isBandActive = (c: { rangeIndex: number; category: string }) =>
        opts.hoveredRangeIndex === c.rangeIndex ||
        (opts.hoveredCategory !== null && opts.hoveredCategory === c.category);
      const anyDirected = opts.hoveredRangeIndex !== null || opts.hoveredCategory !== null;
      const baseAlpha =
        opts.isCardHovered ? 1 :
        opts.anyCardHovered ? 0.25 :
        0.7;
      const gradientStops = cats.map((c, i) => {
        let a = baseAlpha;
        if (anyDirected) a = isBandActive(c) ? 1 : 0.18;
        const pct1 = (i / cats.length) * 100;
        const pct2 = ((i + 1) / cats.length) * 100;
        const rgba = hexToRgba(c.colors.bg, a);
        return `${rgba} ${pct1}%, ${rgba} ${pct2}%`;
      }).join(', ');

      // Pointer + mouse handlers run side-by-side so an extension that blocks one
      // event family still leaves the other working (Chrome on Win/Linux hover bug).
      const overlapHover = (clientX: number, clientY: number, currentTarget: HTMLElement) => {
        const rect = currentTarget.getBoundingClientRect();
        const rel = (clientY - rect.top) / rect.height;
        const bandIdx = Math.max(0, Math.min(cats.length - 1, Math.floor(rel * cats.length)));
        const band = cats[bandIdx];
        opts.onRangeHover(band.rangeIndex);

        if (!band.topic) {
          warnMissingTopic(opts.stackId, band.rangeIndex);
          hideTooltip();
          return;
        }
        const count = opts.otherCountByTopic ? opts.otherCountByTopic(band.topic) : undefined;
        const colors: TooltipColors = { text: band.colors.text, border: band.colors.border };
        showTooltip({
          content: buildTooltipLabel(band.topic, count, band.colors.text),
          colors,
          x: clientX,
          y: clientY,
        });
      };
      nodes.push(
        <span key={`seg-${seg.start}`} style={{ position: 'relative', display: 'inline' }}>
          <mark
            data-overlap-bands={cats.length}
            data-overlap-range-ids={cats.map(c => c.rangeIndex).join(',')}
            tabIndex={-1}
            onMouseMove={(e) => overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement)}
            onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}
            onPointerMove={(e) => { if (e.pointerType === 'mouse') overlapHover(e.clientX, e.clientY, e.currentTarget as HTMLElement); }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); hideTooltip(); } }}
            onClick={(e) => {
              if (!opts.onRangeClick) return;
              const el = e.currentTarget as HTMLElement;
              const rect = el.getBoundingClientRect();
              const rel = (e.clientY - rect.top) / rect.height;
              const bandIdx = Math.max(0, Math.min(cats.length - 1, Math.floor(rel * cats.length)));
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              opts.onRangeClick(cats[bandIdx].rangeIndex);
            }}
            style={{
              background: `linear-gradient(180deg, ${gradientStops})`,
              color: 'inherit', borderRadius: '3px', padding: '1px 0',
              transition: 'background 200ms ease',
              cursor: EYE_CURSOR,
              outline: 'none',
              border: 'none',
              pointerEvents: 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {segText}
          </mark>
        </span>
      );
    } else {
      // Single-contributor segment
      const c = seg.contributors[0];
      const colors = getCategoryColors(c.category);
      const isThisRangeHovered =
        opts.hoveredRangeIndex === c.rangeIndex ||
        (opts.hoveredCategory !== null && opts.hoveredCategory === c.category);
      const anyDirected = opts.hoveredRangeIndex !== null || opts.hoveredCategory !== null;

      // 3-level background alpha — dims highlight background only, text stays readable
      const isAnchored = opts.anchoredRangeIndex === c.rangeIndex;
      let bgAlpha: number;
      if (isAnchored) {
        bgAlpha = 1; // Anchored range always stays bright
      } else if (opts.anchoredRangeIndex !== null && !opts.isCardHovered) {
        bgAlpha = 0.2; // Another range in this card is anchored — dim this one
      } else if (opts.isCardHovered) {
        if (!anyDirected) {
          bgAlpha = 1; // Level 1: this card hovered, all its highlights bright
        } else {
          bgAlpha = isThisRangeHovered ? 1 : 0.2; // Level 2: specific range or category hovered
        }
      } else if (opts.anyCardHovered) {
        bgAlpha = 0.25; // Another card is hovered — dim these highlights
      } else {
        bgAlpha = opts.anchoredRangeIndex !== null ? 0.2 : 0.7; // default
      }
      const bgColor = bgAlpha < 1 ? hexToRgba(colors.bg, bgAlpha) : colors.bg;

      // Bold the contentComment phrase only on card hover (Level 1+)
      const commentPhrase = c.comment;
      let markContent: React.ReactNode;
      if (isThisRangeHovered && commentPhrase && segText.includes(commentPhrase)) {
        const ci = segText.indexOf(commentPhrase);
        markContent = (
          <>
            {ci > 0 && segText.slice(0, ci)}
            <span style={{ textShadow: '0 0 0.7px currentColor, 0 0 0.7px currentColor' }}>{commentPhrase}</span>
            {ci + commentPhrase.length < segText.length && segText.slice(ci + commentPhrase.length)}
          </>
        );
      } else {
        markContent = segText;
      }

      nodes.push(
        <span key={`r${c.rangeIndex}-${seg.start}`} style={{ position: 'relative', display: 'inline' }}>
          <mark
            data-range-id={c.rangeIndex}
            tabIndex={-1}
            onMouseEnter={(e) => {
              opts.onRangeHover(c.rangeIndex);
              if (!c.topic) {
                warnMissingTopic(opts.stackId, c.rangeIndex);
                hideTooltip();
                return;
              }
              const count = opts.otherCountByTopic ? opts.otherCountByTopic(c.topic) : undefined;
              showTooltip({
                content: buildTooltipLabel(c.topic, count, colors.text),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseLeave={() => { opts.onRangeHover(null); hideTooltip(); }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              opts.onRangeHover(c.rangeIndex);
              if (!c.topic) {
                warnMissingTopic(opts.stackId, c.rangeIndex);
                hideTooltip();
                return;
              }
              const count = opts.otherCountByTopic ? opts.otherCountByTopic(c.topic) : undefined;
              showTooltip({
                content: buildTooltipLabel(c.topic, count, colors.text),
                colors: { text: colors.text, border: colors.border },
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') { opts.onRangeHover(null); hideTooltip(); } }}
            onClick={(e) => {
              if (!opts.onRangeClick) return;
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              opts.onRangeClick(c.rangeIndex);
            }}
            style={{
              background: bgColor, color: 'inherit', borderRadius: '3px', padding: '1px 0',
              transition: 'background 200ms ease',
              cursor: EYE_CURSOR,
              outline: 'none',
              border: 'none',
              pointerEvents: 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {markContent}
          </mark>
        </span>
      );

    }

    lastEnd = seg.end;
  }

  // Trailing plain text
  if (lastEnd < plain.length) {
    nodes.push(plain.slice(lastEnd));
  }

  return nodes;
}

// ─── Smart windowing: show only the highlighted portion if content is long ───

const WINDOW_CHARS = 140;

/** Window content around the first relation's content range. Returns adjusted relations with shifted offsets. */
function windowContent(plain: string, relations: Relation[] | undefined, expanded: boolean): {
  text: string; adjustedRelations: Relation[] | undefined; hasPrefix: boolean; hasSuffix: boolean;
} {
  if (!relations || relations.length === 0) {
    return { text: plain, adjustedRelations: relations, hasPrefix: false, hasSuffix: false };
  }
  const totalChars = WINDOW_CHARS * 2;
  if (expanded || plain.length <= totalChars) {
    return { text: plain, adjustedRelations: relations, hasPrefix: false, hasSuffix: false };
  }
  const first = relations[0];
  const center = Math.floor((first.contentStart + first.contentEnd) / 2);
  const start = Math.max(0, center - WINDOW_CHARS);
  const end = Math.min(plain.length, center + WINDOW_CHARS);
  const text = plain.slice(start, end);
  const adjustedRelations = relations.map(r => ({
    ...r,
    contentStart: Math.max(0, r.contentStart - start),
    contentEnd: Math.min(text.length, r.contentEnd - start),
    contentCommentStart: Math.max(0, r.contentCommentStart - start),
    contentCommentEnd: Math.min(text.length, r.contentCommentEnd - start),
  })).filter(r => r.contentEnd > 0 && r.contentStart < text.length);
  return { text, adjustedRelations, hasPrefix: start > 0, hasSuffix: end < plain.length };
}

// ─── offsetTop utility (immune to CSS transforms) ──────────────────────────
// Walks the offsetParent chain to compute the element's absolute vertical
// position in the document. Unlike getBoundingClientRect(), this is NOT
// affected by CSS transforms (e.g. framer-motion FLIP animations), so it
// always returns the element's true resting DOM position.

function absoluteOffsetTop(el: HTMLElement): number {
  let top = 0;
  let cur: HTMLElement | null = el;
  while (cur) {
    top += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return top;
}

// ─── "More like this" word overlap scoring ──────────────────────────────────

const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","shall","can","need","to","of","in","for","on","with","at","by","from","as","into","through","during","before","after","above","below","between","out","off","over","under","again","further","then","once","that","this","these","those","it","its","and","but","or","nor","not","so","very","just","about","also","than","too","only","same","both","each","all","any","few","more","most","other","some","such","no","up","if","we","they","i","you","he","she","who","which","what","when","where","how","why"]);

function getSignificantWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function similarityScore(textA: string, textB: string): number {
  const wordsA = getSignificantWords(textA);
  const wordsB = getSignificantWords(textB);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
  return overlap / Math.min(wordsA.size, wordsB.size);
}

// ─── Main component ──────────────────────────────────────────────────────────

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth = "100%", onStackClick, showupdate, onOpenModalWithStackId, onPostNavigate }) => {
  const router = useRouter();
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [favouritedOverride, setFavouritedOverride] = useState<Record<string, boolean>>({});
  const [bookmarkedOverride, setBookmarkedOverride] = useState<Record<string, boolean>>({});
  const [favouritesCountOverride, setFavouritesCountOverride] = useState<Record<string, number>>({});
  const { filterCategory, hoveredHighlightRangeIndex, hoveredCategory, tappedCardPostId, tappedRangeIndex, reRankAnchorIds, anchoredRangeByPost } = useHighlightStore();
  // Touch device detection (cached on mount). Touch devices use tap-to-activate behavior.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch(('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  }, []);
  // Per-card expanded state, keyed by stackId
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const isFavourited = (postId: string, initial: boolean) =>
    favouritedOverride[postId] !== undefined ? favouritedOverride[postId] : initial;
  const isBookmarked = (postId: string, initial: boolean) =>
    bookmarkedOverride[postId] !== undefined ? bookmarkedOverride[postId] : initial;
  const getFavouritesCount = (postId: string, initial: number) =>
    favouritesCountOverride[postId] !== undefined ? favouritesCountOverride[postId] : initial;

  const handleToggleFavourite = async (postId: string, current: boolean, initialCount: number) => {
    const next = await toggleFavourite(postId, current);
    setFavouritedOverride(prev => ({ ...prev, [postId]: next }));
    setFavouritesCountOverride(prev => {
      const effectivePrev = prev[postId] !== undefined ? prev[postId] : initialCount;
      const newCount = next ? effectivePrev + (current ? 0 : 1) : effectivePrev - (current ? 1 : 0);
      return { ...prev, [postId]: Math.max(0, newCount) };
    });
  };

  const handleToggleBookmark = async (postId: string, current: boolean) => {
    const next = await toggleBookmark(postId, current);
    setBookmarkedOverride(prev => ({ ...prev, [postId]: next }));
  };

  const [currentStackId, setCurrentStackId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const stack of relatedStacks) {
      const cat = stack.rel || 'uncategorized';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [relatedStacks]);

  // Category prevalence — counts stacks that contain ANY relation with the given
  // category (one stack contributes at most 1 per category, even if it has
  // multiple relations of the same category). Used for tag-hover tooltips.
  const categoryStackCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const stack of relatedStacks) {
      const seen = new Set<string>();
      for (const r of stack.topPost.relations ?? []) {
        seen.add(r.category);
      }
      seen.forEach(c => m.set(c, (m.get(c) ?? 0) + 1));
    }
    return m;
  }, [relatedStacks]);

  // Topic prevalence — used by tooltip ("7 more Contract reform") and for pagination.
  const { postTopics, topicTotal } = useMemo(() => {
    const postTopics = new Map<string, Set<string>>();
    const topicTotal = new Map<string, number>();
    for (const stack of relatedStacks) {
      const topics = new Set<string>();
      for (const r of stack.topPost.relations ?? []) {
        if (r.topic) topics.add(r.topic);
      }
      postTopics.set(stack.topPost.id, topics);
      topics.forEach(t => topicTotal.set(t, (topicTotal.get(t) ?? 0) + 1));
    }
    return { postTopics, topicTotal };
  }, [relatedStacks]);

  const SIMILARITY_THRESHOLD = 0.15;
  const SHOWN_INCREMENT = 3;

  // Per-anchor "show this many claims" count. Defaults to SHOWN_INCREMENT when an
  // anchor is created; bumped by SHOWN_INCREMENT each time the user clicks the
  // "MORE [topic]" link. Synced to reRankAnchorIds via the effect below.
  const [shownByAnchor, setShownByAnchor] = useState<Record<string, number>>({});

  useEffect(() => {
    setShownByAnchor(prev => {
      const next: Record<string, number> = {};
      let changed = Object.keys(prev).length !== reRankAnchorIds.length;
      for (const id of reRankAnchorIds) {
        if (id in prev) next[id] = prev[id];
        else { next[id] = SHOWN_INCREMENT; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [reRankAnchorIds]);

  /** Nested re-ranking: process anchors in order, each pulling unclaimed similar posts after itself.
   *  Re-ranking runs on the FULL set so groupings stay stable; the active filter
   *  is applied AFTER re-ranking and only hides non-matching cards. This keeps
   *  filtering from changing the order or breaking groups. */
  const { displayStacks, claimedBy, anchorSet, anchorParent, groupTotal, groupShown } = useMemo(() => {
    const anchorSet = new Set(reRankAnchorIds);
    const claimedBy = new Map<string, string>(); // postId -> anchorId
    const anchorParent = new Map<string, string>(); // anchorId -> parent anchorId
    const groupTotal = new Map<string, number>(); // anchorId -> total similar count
    const groupShown = new Map<string, number>(); // anchorId -> shown similar count
    let result = [...relatedStacks];

    if (reRankAnchorIds.length > 0) {
      for (let ai = 0; ai < reRankAnchorIds.length; ai++) {
        const anchorId = reRankAnchorIds[ai];
        const anchorIdx = result.findIndex(s => s.topPost.id === anchorId);
        if (anchorIdx === -1) continue;

        // Determine if this anchor sits inside another anchor's group
        for (let k = anchorIdx - 1; k >= 0; k--) {
          const prevId = result[k].topPost.id;
          if (anchorSet.has(prevId)) { anchorParent.set(anchorId, prevId); break; }
          if (!claimedBy.has(prevId)) break;
        }

        const anchor = result[anchorIdx];
        const anchorContent = anchor.topPost.content;

        // Topic-based when the anchor was created by clicking a specific highlight
        // (so it matches the "N more <topic>" tooltip exactly). Falls back to
        // content word-similarity when the anchor has no specific range/topic.
        const anchorRangeIdx = anchoredRangeByPost[anchorId];
        const anchorTopic = anchorRangeIdx !== undefined
          ? anchor.topPost.relations?.[anchorRangeIdx]?.topic
          : undefined;

        const similar: { stack: RelatedStackType; score: number }[] = [];
        for (const s of result) {
          if (s.topPost.id === anchorId) continue;
          // Skip anchors that were added BEFORE this one — they're senior, don't move them
          const sAnchorOrder = reRankAnchorIds.indexOf(s.topPost.id);
          if (sAnchorOrder >= 0 && sAnchorOrder < ai) continue;

          if (anchorTopic) {
            const hasTopic = s.topPost.relations?.some(r => r.topic === anchorTopic) ?? false;
            if (hasTopic) similar.push({ stack: s, score: 1 });
          } else {
            const score = similarityScore(s.topPost.content, anchorContent);
            if (score > SIMILARITY_THRESHOLD) similar.push({ stack: s, score });
          }
        }
        // Topic-based: keep original order (all scores equal). Similarity-based: sort by score.
        if (!anchorTopic) similar.sort((a, b) => b.score - a.score);
        groupTotal.set(anchorId, similar.length);
        if (similar.length === 0) { groupShown.set(anchorId, 0); continue; }

        // Take only the first N — pagination via "MORE [topic]" link.
        const shown = shownByAnchor[anchorId] ?? SHOWN_INCREMENT;
        const visible = similar.slice(0, shown);
        groupShown.set(anchorId, visible.length);

        for (const { stack } of visible) {
          claimedBy.set(stack.topPost.id, anchorId);
        }

        const similarIds = new Set(visible.map(s => s.stack.topPost.id));
        result = result.filter(s => !similarIds.has(s.topPost.id));
        const newAnchorIdx = result.findIndex(s => s.topPost.id === anchorId);
        result.splice(newAnchorIdx + 1, 0, ...visible.map(s => s.stack));
      }
    }

    if (filterCategory) {
      result = result.filter((s) => s.rel === filterCategory);
    }

    return { displayStacks: result, claimedBy, anchorSet, anchorParent, groupTotal, groupShown };
  }, [relatedStacks, filterCategory, reRankAnchorIds, shownByAnchor]);

  const handleShowMore = (anchorId: string) => {
    setShownByAnchor(prev => ({ ...prev, [anchorId]: (prev[anchorId] ?? SHOWN_INCREMENT) + SHOWN_INCREMENT }));
  };

  /** Set of anchor IDs that actually pulled in at least one claimed post. */
  const anchorsWithClaims = useMemo(() => {
    const s = new Set<string>();
    claimedBy.forEach((anchorId) => s.add(anchorId));
    return s;
  }, [claimedBy]);

  const EDGE_HOVER_HEIGHT = 28;

  const handleNavigate = (postId: string, newStackId: string) => {
    if (onPostNavigate) { onPostNavigate(postId); return; }
    const url = `/posts/${postId}?stackId=${newStackId || ''}`;
    sessionStorage.setItem(`previousPath:/posts/${postId}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const handleNavigateToUser = (e: React.MouseEvent, account: { acct?: string; username?: string; display_name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const profileHandle = account.acct || account.username || account.display_name;
    router.push(`/user/${profileHandle}`);
  };

  const containerVariants = {
    hidden: { opacity: 1 },
    show: { opacity: 1, transition: { staggerChildren: 0.15 } },
  };

  // Per-item enter / exit / layout-change variants.
  // `layout` on motion.div handles reordering (up/down) smoothly.
  // AnimatePresence handles enter/exit (vanish) when a post appears/disappears.
  const itemVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.96 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] as any },
    },
    exit: {
      opacity: 0, scale: 0.97,
      transition: { duration: 0.2, ease: "easeIn" },
    },
  };

  const handleOpenStackModal = (stackId: string) => {
    setCurrentStackId(stackId);
    setStackPostsModalOpen(true);
  };

  // ── Scroll-pinning state for anchor toggle ─────────────────────────────────
  // When toggling an anchor, we:
  //   1. Disable `layout` on the pinned card (no FLIP transform → it snaps to new DOM position).
  //   2. Compensate scrollTop in useLayoutEffect BEFORE paint so the card never visually moves.
  //   Other cards keep `layout` and animate smoothly around the pinned one.
  const pinnedPostIdRef = useRef<string | null>(null);
  const pinnedPrevTopRef = useRef<number | null>(null);

  /** Toggle an anchor. The interacted card stays visually pinned while other
   *  cards animate around it. */
  const handleToggleAnchor = (postId: string, rangeIndex?: number) => {
    // Clear hover state — card indices shift after reorder, so old
    // hoveredCardIndex would point at a different card → everything dims.
    setHoveredCardIndex(null);
    setHoveredSidebarPost(null);
    setHoveredHighlightRangeIndex(null);
    setHoveredCategory(null);
    clearTapped();

    // Capture position BEFORE the reorder
    const cardEl = document.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    pinnedPostIdRef.current = postId;
    pinnedPrevTopRef.current = cardEl ? absoluteOffsetTop(cardEl) : null;

    toggleReRankAnchor(postId, rangeIndex);
  };

  // Compensate scroll BEFORE paint — runs after React commits the DOM update
  // but before the browser paints, so the card never visually moves.
  useLayoutEffect(() => {
    const postId = pinnedPostIdRef.current;
    const prevTop = pinnedPrevTopRef.current;
    if (!postId || prevTop === null) return;

    // Clear refs so future renders don't re-compensate
    pinnedPostIdRef.current = null;
    pinnedPrevTopRef.current = null;

    const cardEl = document.querySelector(`[data-post-id="${postId}"]`) as HTMLElement | null;
    if (!cardEl) return;
    const newTop = absoluteOffsetTop(cardEl);
    const delta = newTop - prevTop;
    if (Math.abs(delta) > 1) {
      const aside = document.querySelector('.mantine-AppShell-aside');
      if (aside) aside.scrollTop += delta;
    }
  });

  /** Ref-based guard: set when a touch tap just "activated" a card/range so the
   *  synthetic click that follows doesn't also navigate. */
  const skipNextClickRef = useRef(false);

  /** Card-level click: navigate, unless click originated on a highlight <mark> (those handle their own onClick),
   *  or we're suppressing the click after a touch tap that activated something. */
  const handleCardClick = (e: React.MouseEvent, postId: string, stackId: string) => {
    if (skipNextClickRef.current) { skipNextClickRef.current = false; return; }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('mark')) return;
    handleNavigate(postId, stackId);
  };

  /** Touch tap on card body. First tap activates; tap again on same active card with no range triggers rerank (top range). */
  const handleCardTap = (e: React.PointerEvent, postId: string, _stackId: string) => {
    if (e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement | null;
    const markEl = target?.closest('mark') as HTMLElement | null;
    if (markEl) {
      // Resolve range id from the mark
      const singleId = markEl.getAttribute('data-range-id');
      let rangeIdx: number | null = null;
      if (singleId !== null) {
        rangeIdx = parseInt(singleId, 10);
      } else {
        const ids = markEl.getAttribute('data-overlap-range-ids');
        if (ids) {
          const bands = ids.split(',').map(n => parseInt(n, 10));
          const rect = markEl.getBoundingClientRect();
          const rel = (e.clientY - rect.top) / rect.height;
          const bandIdx = Math.max(0, Math.min(bands.length - 1, Math.floor(rel * bands.length)));
          rangeIdx = bands[bandIdx];
        }
      }
      if (rangeIdx === null || Number.isNaN(rangeIdx)) return;
      // Second tap on the same active range → rerank
      if (tappedCardPostId === postId && tappedRangeIndex === rangeIdx) {
        skipNextClickRef.current = true;
        handleToggleAnchor(postId, rangeIdx);
        clearTapped();
        return;
      }
      skipNextClickRef.current = true;
      setTapped(postId, rangeIdx);
      setHoveredSidebarPost(postId, relatedStacks.find(s => s.topPost.id === postId)?.topPost.relations);
      setHoveredHighlightRangeIndex(rangeIdx);
      return;
    }
    // Non-mark tap: toggle card-level active, don't navigate on the first tap.
    if (tappedCardPostId === postId && tappedRangeIndex === null) {
      // Second tap on already-active card (no range) → clear and allow click to navigate
      clearTapped();
      return;
    }
    skipNextClickRef.current = true;
    setTapped(postId, null);
    setHoveredSidebarPost(postId, relatedStacks.find(s => s.topPost.id === postId)?.topPost.relations);
    setHoveredHighlightRangeIndex(null);
  };

  // hoveredIndex: for the stacked-card bottom-edge layer effect only
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // hoveredCardIndex: tracks which card the mouse is actually over (for highlight marks + cross-highlighting)
  const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);

  // Debounced range hover — prevents Level 2 from firing immediately on card enter
  const rangeHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRangeHover = useRef((idx: number | null) => {
    if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
    if (idx === null) {
      setHoveredHighlightRangeIndex(null);
    } else {
      rangeHoverTimer.current = setTimeout(() => setHoveredHighlightRangeIndex(idx), 200);
    }
  }).current;

  // Reset stale hover + anchors when stacks change (new focus post)
  useEffect(() => {
    setHoveredCardIndex(null);
    setHoveredIndex(null);
    hideTooltip();
    if (rangeHoverTimer.current) clearTimeout(rangeHoverTimer.current);
    clearReRankAnchors();
    clearTapped();
  }, [relatedStacks]);

  // Touch: tap-outside clears the active state so highlights/sidebar reset.
  useEffect(() => {
    if (!isTouch) return;
    if (tappedCardPostId === null) return;
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const target = e.target as HTMLElement | null;
      // If the tap is on one of our cards, the per-card onPointerDown handles it.
      if (target && target.closest('[data-related-card]')) return;
      clearTapped();
      setHoveredSidebarPost(null);
      setHoveredHighlightRangeIndex(null);
      setHoveredCategory(null);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true } as any);
  }, [isTouch, tappedCardPostId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header: title + filter chips + count — stays visible while scrolling */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#FCFBF5', paddingBottom: '0.5rem',
      }}>
        <Text size="sm" fw={700} c="#374151" mb={6}>Related responses</Text>
        <Text size="xs" c="dimmed" mb="xs">Hover a post to highlight the relevant parts</Text>

        {categories.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "0.75rem" }}>
            {categories.map(([category, count]) => (
              <FilterChip key={category} category={category} count={count} active={filterCategory === category} onClick={() => toggleFilterCategory(category)} />
            ))}
          </div>
        )}

        <Text size="xs" c="dimmed" mb={4}>
          {filterCategory
            ? `${displayStacks.length} ${CATEGORY_LABELS[filterCategory] ?? filterCategory} post${displayStacks.length !== 1 ? 's' : ''}`
            : `${displayStacks.length} posts across all categories`}
        </Text>

        {/* "More like this" active indicator — shows all anchors */}
        {reRankAnchorIds.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
            background: '#f0f4ff', borderRadius: '6px', marginBottom: '0.5rem', flexWrap: 'wrap',
          }}>
            <Text size="xs" c="#5a71a8" fw={600} style={{ fontSize: '11px' }}>
              Grouped by:
            </Text>
            {reRankAnchorIds.map(id => {
              const a = relatedStacks.find(s => s.topPost.id === id);
              const rangeIdx = anchoredRangeByPost[id];
              const topic = a?.topPost.relations?.[rangeIdx]?.topic
                ?? a?.topPost.relations?.[0]?.topic
                ?? a?.topPost.account.display_name
                ?? id;
              return (
                <span key={id} style={{
                  background: '#dce4f5', borderRadius: '4px', padding: '1px 6px',
                  fontSize: '10px', fontWeight: 600, color: '#3b5998', cursor: 'pointer',
                }} onClick={() => handleToggleAnchor(id)} title="Click to remove this anchor">
                  {topic} ×
                </span>
              );
            })}
            {reRankAnchorIds.length > 1 && (
              <button
                onClick={() => clearReRankAnchors()}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', fontSize: '11px', fontWeight: 600, padding: '0 2px', marginLeft: 'auto',
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cards — no inner scroll, the aside's own scrollbar handles everything */}
      <LayoutGroup>
      <motion.div
        variants={containerVariants} initial="hidden" animate="show"
        style={{
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          paddingBottom: '1rem',
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
        {displayStacks.flatMap((stack, index) => {
          const isCardHovered = hoveredCardIndex === index;
          const colors = getCategoryColors(stack.rel);
          const isExpanded = !!expandedCards[stack.stackId];

          const plainContent = stack.topPost.content;
          const rels = stack.topPost.relations;

          // Smart windowing: show only the highlighted portion unless expanded
          const { text: visibleText, adjustedRelations, hasPrefix, hasSuffix } =
            windowContent(plainContent, rels, isExpanded);
          const isTruncated = hasPrefix || hasSuffix;

          // "More like this" visual state + nesting depth for indentation
          const isAnchor = anchorSet.has(stack.topPost.id);
          const isReRanked = claimedBy.has(stack.topPost.id);
          // Calculate indent depth by walking the anchor chain. Per-level indent
          // is small (8px) so deep nesting doesn't overflow the right pane.
          let indentDepth = 0;
          if (isReRanked) {
            // Claimed post: depth = 1 (for its claimer) + claimer's own depth
            let aid = claimedBy.get(stack.topPost.id);
            while (aid) {
              indentDepth++;
              aid = anchorParent.get(aid); // walk anchor's parent chain
            }
          } else if (isAnchor) {
            // Anchor itself: depth from its parent chain
            let aid = anchorParent.get(stack.topPost.id);
            while (aid) {
              indentDepth++;
              aid = anchorParent.get(aid);
            }
          }
          const indentPx = indentDepth * 8;

          // Card-level dim/bright: when any card is hovered OR tapped, non-active cards dim.
          const isCardTapped = tappedCardPostId === stack.topPost.id;
          const isCardActive = isCardHovered || isCardTapped;
          const anyCardHovered = hoveredCardIndex !== null || tappedCardPostId !== null;
          const cardDimStyle = anyCardHovered && !isCardActive
            ? { opacity: 0.45, filter: 'grayscale(0.3)' }
            : { opacity: 1, filter: 'none' };

          // Build React content nodes with multi-range + 3-level hover
          const contentNodes = buildMultiHighlightNodes(
            visibleText, adjustedRelations, colors,
            {
              isCardHovered: isCardActive,
              anyCardHovered,
              hoveredRangeIndex: isCardActive ? (isCardTapped ? tappedRangeIndex : hoveredHighlightRangeIndex) : null,
              hoveredCategory: isCardActive ? hoveredCategory : null,
              anchoredRangeIndex: anchoredRangeByPost[stack.topPost.id] ?? null,
              onRangeHover: debouncedRangeHover,
              onRangeClick: (ri) => handleToggleAnchor(stack.topPost.id, ri),
              otherCountByTopic: (topic: string) => {
                const total = topicTotal.get(topic) ?? 0;
                const hasSelf = postTopics.get(stack.topPost.id)?.has(topic) ? 1 : 0;
                return Math.max(0, total - hasSelf);
              },
              stackId: stack.stackId,
            },
          );

          // ── Anchor-group topic ─────────────────────────────────────────────
          // The "Trial results ×" topic label appears between the anchor and its
          // first claim. Claims get a thin left border + small indent to indicate
          // nesting under the anchor. The anchor itself is rendered like any
          // ungrouped card.
          const anchorOf = (s: RelatedStackType | undefined): string | undefined => {
            if (!s) return undefined;
            if (claimedBy.has(s.topPost.id)) return claimedBy.get(s.topPost.id);
            if (anchorSet.has(s.topPost.id) && anchorsWithClaims.has(s.topPost.id)) return s.topPost.id;
            return undefined;
          };
          const anchorForThisCard = anchorOf(stack);
          const anchorForPrev = index > 0 ? anchorOf(displayStacks[index - 1]) : undefined;
          const anchorForNext = index + 1 < displayStacks.length ? anchorOf(displayStacks[index + 1]) : undefined;

          const isClaim = isReRanked; // this card was pulled in under an anchor
          // First claim of a group: previous card is the anchor of the same group
          const isFirstClaim = isClaim && index > 0
            && displayStacks[index - 1].topPost.id === claimedBy.get(stack.topPost.id);
          const isLastInGroup = !!anchorForThisCard && anchorForThisCard !== anchorForNext;

          const anchorStack = anchorForThisCard
            ? relatedStacks.find(s => s.topPost.id === anchorForThisCard)
            : undefined;
          const anchorRangeIdx = anchorForThisCard
            ? (anchoredRangeByPost[anchorForThisCard] ?? 0)
            : undefined;
          const anchorTopic =
            anchorStack?.topPost.relations?.[anchorRangeIdx ?? 0]?.topic
            ?? anchorStack?.topPost.account.display_name
            ?? undefined;
          const anchorColors = anchorStack
            ? getCategoryColors(
                anchorStack.topPost.relations?.[anchorRangeIdx ?? 0]?.category ?? anchorStack.rel
              )
            : colors;

          // Pagination metadata for "MORE [topic]" link rendered after the last claim of a group
          const groupTotalForThis = anchorForThisCard ? (groupTotal.get(anchorForThisCard) ?? 0) : 0;
          const groupShownForThis = anchorForThisCard ? (groupShown.get(anchorForThisCard) ?? 0) : 0;
          const groupRemaining = Math.max(0, groupTotalForThis - groupShownForThis);
          const canShowMore = isClaim && isLastInGroup && groupRemaining > 0;
          if (canShowMore && !anchorTopic && anchorForThisCard) {
            warnMissingTopic(anchorForThisCard, anchorRangeIdx ?? -1);
          }
          const showMoreLink = canShowMore && !!anchorTopic;

          // "MORE [topic]" pagination — caps the bottom of the group connector
          // line. Rendered inside the last claim's motion.div (below the Paper)
          // so its lifecycle is tied to the card. Kept out of the parent
          // AnimatePresence's flatMap because popLayout mode strands such
          // children at opacity:0 forever when their key disappears.
          const buttonHover = (clientX: number, clientY: number) => {
            if (!anchorTopic) return;
            showTooltip({
              content: buildTooltipLabel(anchorTopic, groupRemaining, anchorColors.text),
              colors: { text: anchorColors.text, border: anchorColors.border },
              x: clientX,
              y: clientY,
            });
          };
          const moreEl = showMoreLink && anchorForThisCard ? (
            <div
              style={{
                position: 'relative',
                marginLeft: `${indentPx}px`,
                paddingLeft: '8px',
                marginTop: GROUP_GAP_PX,
              }}
            >
              <div aria-hidden style={{
                position: 'absolute',
                left: 0,
                top: -GROUP_GAP_PX,
                bottom: '50%',
                width: GROUP_LINE_WIDTH,
                background: anchorColors.border,
                borderRadius: GROUP_LINE_WIDTH,
              }} />
              <button
                type="button"
                className="show-more-link"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowMore(anchorForThisCard);
                }}
                onMouseEnter={(e) => buttonHover(e.clientX, e.clientY)}
                onMouseLeave={() => hideTooltip()}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') buttonHover(e.clientX, e.clientY); }}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                style={{ color: anchorColors.text }}
              >
                {groupRemaining} more <strong style={{ color: anchorColors.text }}>{anchorTopic}</strong>
              </button>
            </div>
          ) : null;

          // Label (between anchor and first claim) — rendered as its own animated row.
          // The chip + × button cap the top of the connector line; the line itself
          // begins just below the chip and bridges into the gap before the first claim.
          const chipHover = (clientX: number, clientY: number) => {
            if (!anchorTopic) return;
            showTooltip({
              content: buildTooltipLabel(anchorTopic, groupRemaining, anchorColors.text),
              colors: { text: anchorColors.text, border: anchorColors.border },
              x: clientX,
              y: clientY,
            });
          };
          const labelEl = isFirstClaim && anchorForThisCard ? (
            <motion.div
              key={`label-${anchorForThisCard}`}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: '6px',
                marginLeft: `${indentPx}px`,
                padding: '2px 0 4px 2px',
              }}
            >
              <div aria-hidden style={{
                position: 'absolute',
                left: 0,
                top: '100%',
                bottom: -GROUP_GAP_PX,
                width: GROUP_LINE_WIDTH,
                background: anchorColors.border,
                borderRadius: GROUP_LINE_WIDTH,
              }} />
              <span
                onMouseEnter={(e) => chipHover(e.clientX, e.clientY)}
                onMouseLeave={() => hideTooltip()}
                onPointerEnter={(e) => { if (e.pointerType === 'mouse') chipHover(e.clientX, e.clientY); }}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                style={{
                  fontSize: '11px', fontWeight: 600, color: anchorColors.text,
                  background: anchorColors.bg, border: `1px solid ${anchorColors.border}55`,
                  borderRadius: '4px', padding: '1px 6px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '220px',
                }}
              >
                {anchorTopic ?? 'Related'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAnchor(anchorForThisCard);
                }}
                aria-label={`Dismiss ${anchorTopic ?? 'group'}`}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', fontSize: '14px', lineHeight: 1, padding: '0 2px',
                }}
              >
                ×
              </button>
            </motion.div>
          ) : null;

          const cardEl = (
            <motion.div
              key={stack.stackId}
              layout={pinnedPostIdRef.current !== stack.topPost.id}
              variants={itemVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              data-related-card
              style={{
                position: 'relative', width: '100%', borderRadius: '10px',
                ...cardDimStyle,
                // Claims sit alongside a continuous group connector line (rendered
                // as an absolute child below). The padding leaves room for it; the
                // line itself bridges the flex gap above so the group reads as one
                // continuous thread rather than per-card border segments.
                paddingLeft: isClaim ? '8px' : undefined,
                marginLeft: indentPx > 0 ? `${indentPx}px` : undefined,
                transition: 'filter 200ms ease',
              }}
              onMouseMove={(e) => {
                const el = paperRefs.current[index];
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const x = e.clientX, y = e.clientY;
                const withinX = x >= rect.left && x <= rect.right;
                const inBottomEdge = y >= rect.bottom && y <= rect.bottom + EDGE_HOVER_HEIGHT;
                const insideMain = y >= rect.top && y <= rect.bottom;
                if (withinX && inBottomEdge) setHoveredIndex(index);
                else if (withinX && insideMain) setHoveredIndex(null);
                else setHoveredIndex(null);
              }}
              onMouseLeave={() => {
                if (isTouch) return;
                // Only clear bottom-edge hoveredIndex here. Cross-highlight state
                // (hoveredCardIndex, hoveredSidebarPost, etc.) is owned by the
                // inner Paper's onMouseEnter/Leave. Clearing it here races with
                // the next card's Paper.onMouseEnter because this motion.div
                // extends past the inter-card gap (via the bottom-edge hover
                // zone) — leaving motion.div A can fire AFTER Paper B has
                // already set the new highlight, wiping it.
                setHoveredIndex(null);
              }}
              onPointerDown={(e) => handleCardTap(e, stack.topPost.id, stack.stackId)}
            >
              {isClaim && (
                <div aria-hidden style={{
                  position: 'absolute',
                  left: 0,
                  top: -GROUP_GAP_PX,
                  bottom: 0,
                  width: GROUP_LINE_WIDTH,
                  background: anchorColors.border,
                  borderRadius: GROUP_LINE_WIDTH,
                  zIndex: 0,
                }} />
              )}
              <Paper
                ref={(el) => { paperRefs.current[index] = el; }}
                data-post-id={stack.topPost.id}
                onMouseEnter={() => {
                  if (isTouch) return;
                  setHoveredIndex(null);
                  setHoveredCardIndex(index);
                  setHoveredSidebarPost(stack.topPost.id, stack.topPost.relations);
                }}
                onMouseLeave={() => {
                  if (isTouch) return;
                  setHoveredCardIndex(null); setHoveredSidebarPost(null);
                  setHoveredHighlightRangeIndex(null); setHoveredCategory(null);
                }}
                style={{
                  position: 'relative', width: '100%', backgroundColor: '#ffffff', zIndex: 5,
                  borderRadius: '10px', margin: '0 auto', paddingTop: '40px',
                  border: `2px solid ${colors.border}`,
                  boxShadow: stack.size > 1 ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                  cursor: 'pointer',
                }}
              >
                {/* Category tags — one per unique relation category, dims/brightens with highlight hover */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '4px', alignItems: 'center', zIndex: 10, flexWrap: 'wrap' }}>
                  {(() => {
                    // Dedupe categories from relations, preserving order
                    const rels = stack.topPost.relations ?? [];
                    const seen = new Set<string>();
                    const tags: { cat: string; indices: number[] }[] = [];
                    for (let ri = 0; ri < rels.length; ri++) {
                      const cat = rels[ri].category;
                      if (!seen.has(cat)) { seen.add(cat); tags.push({ cat, indices: [ri] }); }
                      else { tags.find(t => t.cat === cat)?.indices.push(ri); }
                    }
                    const hri = isCardActive ? (isCardTapped ? tappedRangeIndex : hoveredHighlightRangeIndex) : null;
                    const hcat = isCardActive ? hoveredCategory : null;
                    return tags.map(({ cat, indices }) => {
                      const tc = getCategoryColors(cat);
                      const anyDirected = hri !== null || hcat !== null;
                      const tagBright = !anyDirected || indices.includes(hri ?? -1) || hcat === cat;
                      const categoryLabel = CATEGORY_LABELS[cat] ?? cat;
                      const otherCount = Math.max(0, (categoryStackCount.get(cat) ?? 0) - 1);
                      const tagHover = (clientX: number, clientY: number) => {
                        showTooltip({
                          content: buildTooltipLabel(categoryLabel, otherCount, tc.text),
                          colors: { text: tc.text, border: tc.border },
                          x: clientX,
                          y: clientY,
                        });
                      };
                      return (
                        <div
                          key={cat}
                          onMouseEnter={(e) => { if (!isTouch) setHoveredCategory(cat); tagHover(e.clientX, e.clientY); }}
                          onMouseLeave={() => { if (!isTouch) setHoveredCategory(null); hideTooltip(); }}
                          onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; tagHover(e.clientX, e.clientY); }}
                          onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideTooltip(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isTouch) {
                              // Touch: tap toggles category highlight; second tap on same category triggers rerank on first matching range
                              if (hoveredCategory === cat && tappedCardPostId === stack.topPost.id) {
                                handleToggleAnchor(stack.topPost.id, indices[0]);
                                setHoveredCategory(null);
                                clearTapped();
                              } else {
                                setTapped(stack.topPost.id, null);
                                setHoveredSidebarPost(stack.topPost.id, stack.topPost.relations);
                                setHoveredCategory(cat);
                              }
                            }
                          }}
                          style={{
                            background: tc.bg, color: tc.text, borderRadius: '5px',
                            padding: '2px 7px', display: 'flex', alignItems: 'center', gap: '4px',
                            border: `1px solid ${tc.border}`,
                            opacity: tagBright ? 1 : 0.3,
                            transition: 'opacity 200ms ease',
                            cursor: 'pointer',
                          }}
                        >
                          {React.cloneElement(iconMapping[cat] || iconMapping['default'], { color: tc.text, size: 12 })}
                          <Text size="xs" c={tc.text} fw={700} style={{ fontSize: '10px' }}>
                            {CATEGORY_LABELS[cat] ?? cat}
                          </Text>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div style={{ position: 'absolute', top: '12px', right: '10px', zIndex: 10 }}>
                  <IconChevronRight size={14} color="#94a3b8" />
                </div>

                <UnstyledButton onClick={() => handleNavigate(stack.topPost.id, stack.stackId)} style={{ width: '100%' }}>
                  <Group style={{ paddingLeft: '1rem' }}>
                    <UnstyledButton onClick={(e) => handleNavigateToUser(e, stack.topPost.account)} className="avatarHoverDim">
                      <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                    </UnstyledButton>
                    <div>
                      <Anchor component="button" onClick={(e) => handleNavigateToUser(e, stack.topPost.account)} underline="hover"
                        style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' }}>
                        {stack.topPost.account.display_name}
                      </Anchor>
                      <Text size="xs" c="dimmed">{formatDistanceToNow(new Date(stack.topPost.created_at))} ago</Text>
                    </div>
                  </Group>
                </UnstyledButton>

                {/* Content with smart windowing + highlight marks on hover */}
                <div
                  onClick={(e) => handleCardClick(e, stack.topPost.id, stack.stackId)}
                  style={{ paddingLeft: '54px', paddingRight: '1rem', cursor: 'pointer' }}
                >
                  <Text component="p" size="sm" lh={1.55} c="#011445" style={{ margin: '0 0 0.4rem 0' }}>
                    {hasPrefix && <span style={{ color: '#94a3b8', userSelect: 'none' }}>…</span>}
                    {contentNodes}
                    {hasSuffix && !isExpanded && <span style={{ color: '#94a3b8', userSelect: 'none' }}>…</span>}
                  </Text>

                  {/* Read more / See less */}
                  {(isTruncated || isExpanded) && (
                    <Anchor
                      component="button" type="button" size="sm" underline="hover"
                      styles={{ root: { padding: 0, background: 'none', color: '#5a71a8', fontWeight: 600, cursor: 'pointer', marginBottom: '0.4rem', display: 'block' } }}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        setExpandedCards(prev => ({ ...prev, [stack.stackId]: !isExpanded }));
                      }}
                      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                      onMouseUp={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      {isExpanded ? 'See less' : 'Read more'}
                    </Anchor>
                  )}

                </div>

                <Divider style={{ marginTop: '0.5rem', marginLeft: '1rem', marginRight: '1rem' }} />
                <div style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
                  <Group style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <InteractionControl icon={<IconMessageCircle size={20} />} label={stack.topPost.replies_count} ariaLabel="Replies"
                      onClick={() => handleNavigate(stack.topPost.id, stack.stackId)} />
                    <InteractionControl
                      icon={isFavourited(stack.topPost.id, stack.topPost.favourited) ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
                      label={getFavouritesCount(stack.topPost.id, stack.topPost.favourites_count)} ariaLabel="Favourites"
                      onClick={() => handleToggleFavourite(stack.topPost.id, isFavourited(stack.topPost.id, stack.topPost.favourited), getFavouritesCount(stack.topPost.id, stack.topPost.favourites_count))}
                      active={isFavourited(stack.topPost.id, stack.topPost.favourited)} />
                    <InteractionControl
                      icon={isBookmarked(stack.topPost.id, stack.topPost.bookmarked) ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
                      ariaLabel="Bookmark"
                      onClick={() => handleToggleBookmark(stack.topPost.id, isBookmarked(stack.topPost.id, stack.topPost.bookmarked))}
                      active={isBookmarked(stack.topPost.id, stack.topPost.bookmarked)} />
                    <InteractionControl icon={<IconShare size={20} />} ariaLabel="Share"
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/posts/${stack.topPost.id}?stackId=${stack.stackId}`).catch(() => {}); }} />
                  </Group>
                </div>
                {stack.size !== null && stack.size > 1 && (
                  <RelatedStackCount count={stack.size} onClick={() => handleOpenStackModal(stack.stackId)} />
                )}
              </Paper>

              {moreEl}

              {/* Bottom-edge hover zone */}
              <div aria-hidden style={{
                position: 'absolute', left: 0, right: 0, height: EDGE_HOVER_HEIGHT,
                bottom: -EDGE_HOVER_HEIGHT, zIndex: 2, pointerEvents: 'auto', background: 'transparent',
              }} onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} />

              {stack.size !== null && stack.size > 1 && (
                <>
                  {[...Array(2)].map((_, idx) => (
                    <div key={idx} aria-hidden style={{
                      position: 'absolute', inset: 0,
                      transform: `translate(${6 - 3 * idx}px, ${12 - 6 * idx + (isCardHovered ? 20 - (idx * 10) : 0)}px)`,
                      width: '100%', backgroundColor: '#ffffff', borderRadius: '10px',
                      zIndex: idx + 1, pointerEvents: 'none', border: `2px solid ${colors.border}`,
                      boxShadow: idx === 0 ? '0 12px 24px rgba(0,0,0,0.18), 0 6px 12px rgba(0,0,0,0.12)' : 'none',
                      transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 200ms ease',
                    }} />
                  ))}
                </>
              )}
            </motion.div>
          );

          return [labelEl, cardEl].filter(Boolean);
        })}
        </AnimatePresence>
      </motion.div>
      </LayoutGroup>

      <StackPostsModal
        isOpen={stackPostsModalOpen} onClose={() => setStackPostsModalOpen(false)}
        apiUrl={currentStackId ? `https://beta.stacky.social:3002/stacks/${currentStackId}/posts` : ''}
        stackId={currentStackId}
      />
    </div>
  );
};

export default RelatedStacks;
