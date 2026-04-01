import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Anchor } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconThumbUp, IconThumbDown, IconChevronRight } from '@tabler/icons-react';
import { Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import StackPostsModal from './StackPostsModal';
import InteractionControl from './InteractionControl';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
import { setHoveredSidebarPost, setHoveredHighlightRangeIndex, toggleReRankAnchor, clearReRankAnchors, toggleFilterCategory, useHighlightStore } from '../utils/highlightStore';
import type { HighlightMeta } from '../types/PostType';
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
  content_highlight: string;
  /** Focus post text with ⌊bracket⌋ markers — which parts of the focus post this response addresses */
  focus_highlight?: string;
  /** Per-range metadata: i-th entry = i-th bracket pair in content_highlight / focus_highlight */
  highlights_meta?: HighlightMeta[];
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

// ─── Highlight helpers ───────────────────────────────────────────────────────

interface HighlightRange { start: number; end: number }

/** Strip bracket markers, return plain text + highlight ranges.
 *  Supports overlapping ranges via different bracket types:
 *  ⌊...⌋ = range 0, ⌈...⌉ = range 1, ⟦...⟧ = range 2.
 *  Each type is tracked independently so they can nest/overlap. */
function parseHighlightRanges(text: string | null | undefined): { plain: string; ranges: HighlightRange[] } {
  if (!text) return { plain: '', ranges: [] };
  let plain = '';
  const ranges: HighlightRange[] = [];
  const openStarts: Record<string, number> = {};
  const closerToOpener: Record<string, string> = { '⌋': '⌊', '⌉': '⌈', '⟧': '⟦' };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '⌊' || ch === '⌈' || ch === '⟦') {
      openStarts[ch] = plain.length;
    } else if (ch === '⌋' || ch === '⌉' || ch === '⟧') {
      const opener = closerToOpener[ch];
      if (opener in openStarts) {
        ranges.push({ start: openStarts[opener], end: plain.length });
        delete openStarts[opener];
      }
    } else {
      plain += ch;
    }
  }
  return { plain, ranges };
}

// ─── Overlap detection for multi-range highlights ────────────────────────────

interface TaggedRange { start: number; end: number; rangeIndex: number; category: string; topic?: string; comment?: string; focusComment?: string }

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
 *  Supports 3 visual levels: default (always-on, dimmed), card-hover (bright), substring-hover (one bright, rest dim). */
function buildMultiHighlightNodes(
  plain: string,
  ranges: HighlightRange[],
  meta: HighlightMeta[] | undefined,
  primaryColors: CategoryStyle,
  opts: {
    isCardHovered: boolean;
    anyCardHovered: boolean;
    hoveredRangeIndex: number | null;
    onRangeHover: (index: number | null) => void;
  },
): React.ReactNode[] {
  if (ranges.length === 0) return [plain];

  // Build tagged ranges with per-range category and comment substrings
  const tagged: TaggedRange[] = ranges.map((r, i) => {
    const m = meta?.[i];
    return {
      start: r.start, end: r.end, rangeIndex: i,
      category: m?.category ?? primaryColors.text,
      topic: m?.topic,
      comment: m?.contentComment,     // key phrase within related post highlight to bold
      focusComment: m?.focusComment,  // passed through for focus post side
    };
  });

  // Detect overlaps by building segments
  const segments = buildSegments(tagged);
  if (segments.length === 0) return [plain];

  const nodes: React.ReactNode[] = [];
  let lastEnd = 0;

  // Helper: merge adjacent segments that share the same single contributor
  for (const seg of segments) {
    // Add plain text before this segment
    if (seg.start > lastEnd) {
      nodes.push(plain.slice(lastEnd, seg.start));
    }

    const isOverlap = seg.contributors.length > 1;
    const segText = plain.slice(seg.start, seg.end);

    if (isOverlap) {
      // Overlapping region — layered gradient + tooltip
      const cats = seg.contributors.map(c => {
        const cc = getCategoryColors(c.category);
        return { ...c, colors: cc };
      });
      const gradientStops = cats.map((c, i) => {
        const pct1 = (i / cats.length) * 100;
        const pct2 = ((i + 1) / cats.length) * 100;
        return `${c.colors.bg} ${pct1}%, ${c.colors.bg} ${pct2}%`;
      }).join(', ');
      const tooltipLines = cats.map(c =>
        `${CATEGORY_LABELS[c.category] ?? c.category}${c.topic ? `: ${c.topic}` : ''}`
      ).join('\n');

      const anyHovered = seg.contributors.some(c => opts.hoveredRangeIndex === c.rangeIndex);
      const opacity = opts.isCardHovered
        ? (opts.hoveredRangeIndex !== null ? (anyHovered ? 1 : 0.25) : 1)
        : opts.anyCardHovered ? 0.3 : 0.75;

      nodes.push(
        <mark
          key={`seg-${seg.start}`}
          title={tooltipLines}
          style={{
            background: `linear-gradient(180deg, ${gradientStops})`,
            color: 'inherit', borderRadius: '3px', padding: '1px 0',
            border: '1px dashed rgba(0,0,0,0.2)',
            opacity,
            transition: 'opacity 200ms ease',
            cursor: 'pointer',
          }}
        >
          {segText}
        </mark>
      );
    } else {
      // Single-contributor segment
      const c = seg.contributors[0];
      const colors = getCategoryColors(c.category);
      const isThisRangeHovered = opts.hoveredRangeIndex === c.rangeIndex;

      // 3-level opacity with cross-card dimming
      let opacity: number;
      let pseudoBold: boolean;
      if (opts.isCardHovered) {
        if (opts.hoveredRangeIndex === null) {
          opacity = 1; pseudoBold = true; // Level 1: this card hovered, all its highlights bright
        } else {
          opacity = isThisRangeHovered ? 1 : 0.25; // Level 2: specific range hovered
          pseudoBold = isThisRangeHovered;
        }
      } else if (opts.anyCardHovered) {
        opacity = 0.3; pseudoBold = false; // Another card is hovered — dim these highlights
      } else {
        opacity = 0.75; pseudoBold = false; // Level 0: no hover anywhere — readable default
      }

      // Bold the contentComment phrase only on card hover (Level 1+)
      const commentPhrase = c.comment;
      let markContent: React.ReactNode;
      if (opts.isCardHovered && commentPhrase && segText.includes(commentPhrase)) {
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
        <mark
          key={`r${c.rangeIndex}-${seg.start}`}
          title={c.topic || undefined}
          onMouseEnter={() => opts.onRangeHover(c.rangeIndex)}
          onMouseLeave={() => opts.onRangeHover(null)}
          style={{
            background: colors.bg, color: 'inherit', borderRadius: '3px', padding: '1px 0',
            opacity,
            transition: 'opacity 200ms ease',
            cursor: 'pointer',
          }}
        >
          {markContent}
        </mark>
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

function windowContent(plain: string, ranges: HighlightRange[], expanded: boolean): {
  text: string; adjustedRanges: HighlightRange[]; hasPrefix: boolean; hasSuffix: boolean;
} {
  const totalChars = WINDOW_CHARS * 2;
  if (expanded || ranges.length === 0 || plain.length <= totalChars) {
    return { text: plain, adjustedRanges: ranges, hasPrefix: false, hasSuffix: false };
  }
  // Center on the first range
  const first = ranges[0];
  const center = Math.floor((first.start + first.end) / 2);
  const start = Math.max(0, center - WINDOW_CHARS);
  const end = Math.min(plain.length, center + WINDOW_CHARS);
  const text = plain.slice(start, end);
  const adjustedRanges = ranges
    .map((r) => ({ start: r.start - start, end: r.end - start }))
    .filter((r) => r.end > 0 && r.start < text.length)
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(text.length, r.end) }));
  return { text, adjustedRanges, hasPrefix: start > 0, hasSuffix: end < plain.length };
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
  const { filterCategory, hoveredHighlightRangeIndex, reRankAnchorIds } = useHighlightStore();
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

  const SIMILARITY_THRESHOLD = 0.15;

  /** Nested re-ranking: process anchors in order, each pulling unclaimed similar posts after itself. */
  const { displayStacks, claimedBy, anchorSet } = useMemo(() => {
    let stacks = relatedStacks;
    if (filterCategory) {
      stacks = stacks.filter((s) => s.rel === filterCategory);
    }

    if (reRankAnchorIds.length === 0) {
      return { displayStacks: stacks, claimedBy: new Map<string, string>(), anchorSet: new Set<string>() };
    }

    const anchorSet = new Set(reRankAnchorIds);
    const claimedBy = new Map<string, string>(); // postId -> anchorId that claimed it
    let result = [...stacks];

    for (const anchorId of reRankAnchorIds) {
      const anchorIdx = result.findIndex(s => s.topPost.id === anchorId);
      if (anchorIdx === -1) continue;

      const anchor = result[anchorIdx];
      const anchorContent = anchor.topPost.content;

      // Find similar posts: not self, not another anchor (anchors are pinned)
      // No claimedBy check — later anchors re-claim, last anchor wins
      const similar: { stack: RelatedStackType; score: number }[] = [];
      for (const s of result) {
        if (s.topPost.id === anchorId) continue;
        if (anchorSet.has(s.topPost.id)) continue;
        const score = similarityScore(s.topPost.content, anchorContent);
        if (score > SIMILARITY_THRESHOLD) {
          similar.push({ stack: s, score });
        }
      }
      similar.sort((a, b) => b.score - a.score);

      if (similar.length === 0) continue;

      // Mark as claimed
      for (const { stack } of similar) {
        claimedBy.set(stack.topPost.id, anchorId);
      }

      // Remove similar posts from current positions
      const similarIds = new Set(similar.map(s => s.stack.topPost.id));
      result = result.filter(s => !similarIds.has(s.topPost.id));

      // Re-find anchor position (shifted after removals)
      const newAnchorIdx = result.findIndex(s => s.topPost.id === anchorId);

      // Insert similar right after anchor
      result.splice(newAnchorIdx + 1, 0, ...similar.map(s => s.stack));
    }

    return { displayStacks: result, claimedBy, anchorSet };
  }, [relatedStacks, filterCategory, reRankAnchorIds]);

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
    show: { opacity: 1, transition: { staggerChildren: 0.2 } },
  };

  const itemVariants = (index: number) => ({
    hidden: showupdate ? { opacity: 0, x: -200, y: -200 * (index + 1) } : { opacity: 0, y: 200 },
    show: { opacity: 1, x: 0, y: 0, transition: { duration: 0.5 } },
  });

  const handleOpenStackModal = (stackId: string) => {
    setCurrentStackId(stackId);
    setStackPostsModalOpen(true);
  };

  const handleMouseUp = (postId: string, stackId: string) => {
    const selection = window.getSelection();
    if (selection && selection.toString().length === 0) {
      handleNavigate(postId, stackId);
    }
  };

  // hoveredIndex: for the stacked-card bottom-edge layer effect only
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // hoveredCardIndex: tracks which card the mouse is actually over (for highlight marks + cross-highlighting)
  const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);

  // Reset stale hover state when stacks change (prevents dim→bright blink on focus post switch)
  useEffect(() => {
    setHoveredCardIndex(null);
    setHoveredIndex(null);
  }, [relatedStacks]);

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
              return (
                <span key={id} style={{
                  background: '#dce4f5', borderRadius: '4px', padding: '1px 6px',
                  fontSize: '10px', fontWeight: 600, color: '#3b5998', cursor: 'pointer',
                }} onClick={() => toggleReRankAnchor(id)} title="Click to remove this anchor">
                  {a?.topPost.account.display_name ?? id} ×
                </span>
              );
            })}
            <button
              onClick={() => clearReRankAnchors()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: '11px', fontWeight: 600, padding: '0 2px', marginLeft: 'auto',
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Cards — no inner scroll, the aside's own scrollbar handles everything */}
      <motion.div
        variants={containerVariants} initial="hidden" animate="show"
        style={{
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
          paddingBottom: '1rem',
        }}
      >
        {displayStacks.map((stack, index) => {
          const isCardHovered = hoveredCardIndex === index;
          const colors = getCategoryColors(stack.rel);
          const isExpanded = !!expandedCards[stack.stackId];

          // Parse highlights from content_highlight (supports multiple ⌊...⌋ ranges)
          const { plain, ranges } = parseHighlightRanges(stack.topPost.content_highlight);
          // Use plain content as fallback if no highlight markers
          const plainContent = plain || stack.topPost.content;
          const effectiveRanges = plain ? ranges : [];
          const meta = stack.topPost.highlights_meta;

          // Smart windowing: show only the highlighted portion unless expanded
          const { text: visibleText, adjustedRanges, hasPrefix, hasSuffix } =
            windowContent(plainContent, effectiveRanges, isExpanded);
          const isTruncated = hasPrefix || hasSuffix;

          // "More like this" visual state
          const isAnchor = anchorSet.has(stack.topPost.id);
          const isReRanked = claimedBy.has(stack.topPost.id);

          // Card-level dim/bright: when any card is hovered, non-hovered cards dim
          const anyCardHovered = hoveredCardIndex !== null;
          const cardDimStyle = anyCardHovered && !isCardHovered
            ? { opacity: 0.45, filter: 'grayscale(0.3)' }
            : { opacity: 1, filter: 'none' };

          // Build React content nodes with multi-range + 3-level hover
          const contentNodes = buildMultiHighlightNodes(
            visibleText, adjustedRanges, meta, colors,
            {
              isCardHovered,
              anyCardHovered,
              hoveredRangeIndex: isCardHovered ? hoveredHighlightRangeIndex : null,
              onRangeHover: (idx) => setHoveredHighlightRangeIndex(idx),
            },
          );

          return (
            <motion.div
              key={stack.stackId}
              variants={itemVariants(index)}
              style={{
                position: 'relative', width: '100%', borderRadius: '10px',
                ...cardDimStyle,
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
              onMouseLeave={() => { setHoveredIndex(null); setHoveredCardIndex(null); setHoveredSidebarPost(null); setHoveredHighlightRangeIndex(null); }}
            >
              <Paper
                ref={(el) => { paperRefs.current[index] = el; }}
                onMouseEnter={() => {
                  setHoveredIndex(null);
                  setHoveredCardIndex(index);
                  setHoveredSidebarPost(stack.topPost.id, stack.topPost.content_highlight, stack.rel, stack.topPost.focus_highlight, stack.topPost.highlights_meta);
                }}
                onMouseLeave={() => { setHoveredCardIndex(null); setHoveredSidebarPost(null); setHoveredHighlightRangeIndex(null); }}
                style={{
                  position: 'relative', width: '100%', backgroundColor: '#ffffff', zIndex: 5,
                  borderRadius: '10px', margin: '0 auto', paddingTop: '40px',
                  border: isAnchor ? '2px solid #3b5998' : isReRanked ? '2px solid #b0c4e8' : `2px solid ${colors.border}`,
                  boxShadow: stack.size > 1 ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                  cursor: 'pointer',
                  ...(isReRanked ? { borderLeft: '4px solid #3b5998' } : {}),
                }}
              >
                {/* Category badge + re-ranked indicator */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px', alignItems: 'center', zIndex: 10 }}>
                  <div style={{
                    background: colors.bg, color: colors.text, borderRadius: '5px',
                    padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '5px',
                    border: `1px solid ${colors.border}`,
                  }}>
                    {React.cloneElement(iconMapping[stack.rel] || iconMapping['default'], { color: colors.text, size: 14 })}
                    <Text size="xs" c={colors.text} fw={700} style={{ fontSize: '11px' }}>
                      {CATEGORY_LABELS[stack.rel] ?? stack.rel}
                    </Text>
                  </div>
                  {isReRanked && (
                    <div style={{
                      background: '#eef2fb', borderRadius: '5px', padding: '2px 7px',
                      border: '1px solid #b0c4e8',
                      display: 'flex', alignItems: 'center', gap: '3px',
                    }}>
                      <Text size="xs" c="#3b5998" fw={600} style={{ fontSize: '10px' }}>Similar</Text>
                    </div>
                  )}
                  {isAnchor && (
                    <div style={{
                      background: '#3b5998', borderRadius: '5px', padding: '2px 7px',
                      display: 'flex', alignItems: 'center', gap: '3px',
                    }}>
                      <Text size="xs" c="#fff" fw={600} style={{ fontSize: '10px' }}>Anchor</Text>
                    </div>
                  )}
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
                  onMouseUp={() => handleMouseUp(stack.topPost.id, stack.stackId)}
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
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleReRankAnchor(stack.topPost.id); }}
                      onMouseUp={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label="More like this"
                      style={{
                        background: isAnchor ? '#e8edf5' : 'none',
                        border: 'none', cursor: 'pointer', borderRadius: '4px',
                        padding: '4px 8px', fontSize: '11px', fontWeight: 600,
                        color: isAnchor ? '#3b5998' : '#8899a6',
                        transition: 'color 150ms ease, background 150ms ease',
                      }}
                    >
                      {isAnchor ? 'Ungroup' : 'More like this'}
                    </button>
                  </Group>
                </div>
                {stack.size !== null && stack.size > 1 && (
                  <RelatedStackCount count={stack.size} onClick={() => handleOpenStackModal(stack.stackId)} />
                )}
              </Paper>

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
        })}
      </motion.div>

      <StackPostsModal
        isOpen={stackPostsModalOpen} onClose={() => setStackPostsModalOpen(false)}
        apiUrl={currentStackId ? `https://beta.stacky.social:3002/stacks/${currentStackId}/posts` : ''}
        stackId={currentStackId}
      />
    </div>
  );
};

export default RelatedStacks;
