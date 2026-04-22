import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Divider, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconLink } from '@tabler/icons-react';
import { format, formatDistanceToNow } from 'date-fns';
import StackCount from '../StackCount';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import { PreviewCardType } from '../../types/PostType';
import InteractionControl from '../InteractionControl';
import { useHighlightStore } from '../../utils/highlightStore';
import type { Relation } from '../../types/PostType';

// ─── Focus post cross-highlight helpers ──────────────────────────────────────

/** Strip all HTML tags to get plain text for matching */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

const CROSS_HIGHLIGHT_CATEGORY_COLORS: Record<string, { bg: string; border: string }> = {
  agree:              { bg: "#d4f9d3", border: "#4caf50" },
  disagree:           { bg: "#ffe0e0", border: "#f44336" },
  predictions:        { bg: "#fff3cd", border: "#ff9800" },
  evidence_public:    { bg: "#e3f2fd", border: "#2196f3" },
  evidence_personal:  { bg: "#f3e5f5", border: "#9c27b0" },
  connections:        { bg: "#e0f2f1", border: "#009688" },
  questions:          { bg: "#fce4ec", border: "#e91e63" },
  humor:              { bg: "#fff8e1", border: "#ffc107" },
  values:             { bg: "#ede7f6", border: "#673ab7" },
  framing:            { bg: "#e0f7fa", border: "#00bcd4" },
  proposals:          { bg: "#e8eaf6", border: "#3f51b5" },
  pointers:           { bg: "#e8eaf6", border: "#3f51b5" },
};

/** Convert hex color to rgba string */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Render multi-range focus highlights into HTML using offset-based Relations.
 *  Each relation's focus range gets its category color.
 *  Level 2: when hoveredRangeIndex is set, non-active highlights dim their BACKGROUND only. */
function renderMultiHighlightHtml(
  displayHtml: string,
  focusPlainText: string,
  relations: Relation[],
  hoveredRangeIndex: number | null,
): string {
  if (relations.length === 0) return displayHtml;

  const entries = relations.map((r, i) => {
    const catColors = CROSS_HIGHLIGHT_CATEGORY_COLORS[r.category];
    if (!catColors) return null;

    const snippet = focusPlainText.slice(r.focusStart, r.focusEnd);
    const bgAlpha = (hoveredRangeIndex === null || hoveredRangeIndex === i) ? 1 : 0.2;
    const bgColor = bgAlpha < 1 ? hexToRgba(catColors.bg, bgAlpha) : catColors.bg;

    // focusComment substring to bold — only when this specific highlight is hovered (Level 2)
    const isThisRangeHovered = hoveredRangeIndex === i;
    const focusComment = (isThisRangeHovered && r.focusCommentStart < r.focusCommentEnd)
      ? focusPlainText.slice(r.focusCommentStart, r.focusCommentEnd)
      : undefined;

    return { snippet, bgColor, focusComment, index: i };
  }).filter(Boolean) as Array<{ snippet: string; bgColor: string; focusComment?: string; index: number }>;

  // Sort by longest snippet first to avoid partial matches
  entries.sort((a, b) => b.snippet.length - a.snippet.length);

  let result = displayHtml;
  const usedPositions = new Set<number>();

  for (const entry of entries) {
    const escaped = entry.snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(result)) !== null) {
      if (!usedPositions.has(match.index)) {
        usedPositions.add(match.index);
        let innerHtml = entry.snippet;
        if (entry.focusComment && entry.snippet.includes(entry.focusComment)) {
          const ci = entry.snippet.indexOf(entry.focusComment);
          const before = entry.snippet.slice(0, ci);
          const bold = `<span style="text-shadow:0 0 0.7px currentColor,0 0 0.7px currentColor">${entry.focusComment}</span>`;
          const after = entry.snippet.slice(ci + entry.focusComment.length);
          innerHtml = before + bold + after;
        }
        const markHtml = `<mark style="background:${entry.bgColor};padding:1px 0;color:inherit;border-radius:3px;transition:background 200ms ease">${innerHtml}</mark>`;
        result = result.slice(0, match.index) + markHtml + result.slice(match.index + entry.snippet.length);
        break;
      }
    }
  }

  return result;
}

type PreviewCard = PreviewCardType;

const MastodonInstanceUrl = 'https://beta.stacky.social';

interface CleanedPost {
  html: string;
  publishedDate: string | null;
  articleUrl: string | null;
}

/** Strip external URLs and extract "Published" date from post HTML.
 *  Only strips URLs when a preview card exists to preserve legitimate links in conversational posts. */
function cleanPostHtml(html: string, card: PreviewCard | null | undefined): CleanedPost {
  let cleaned = html;
  let publishedDate: string | null = null;

  if (card) {
    // Remove all <a> tags linking to external URLs (entire tag + contents)
    cleaned = cleaned.replace(/<a[^>]*href=["']https?:\/\/[^"']+["'][^>]*>[\s\S]*?<\/a>/gi, '');

    // Remove bare URLs in text (not inside tags)
    cleaned = cleaned.replace(/https?:\/\/[^\s<]+/g, '');
  }

  // Extract "Published: DATE" and remove from text
  cleaned = cleaned.replace(/Published:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/g, (_match, iso) => {
    try {
      publishedDate = format(new Date(iso), 'MMM d, yyyy');
    } catch {
      publishedDate = iso;
    }
    return '';
  });
  // Also handle already-formatted "Published: Mon DD, YYYY"
  if (!publishedDate) {
    cleaned = cleaned.replace(/Published:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/g, (_match, date) => {
      publishedDate = date;
      return '';
    });
  }

  // Collapse leftover empty <p></p> tags
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');

  return { html: cleaned, publishedDate, articleUrl: card?.url ?? null };
}



// Subscribes to the highlight store — only mounted for the *active* post so
// inactive posts don't re-render on every sidebar hover.
const ActiveHighlightedContent = React.forwardRef<HTMLDivElement, {
  displayText: string;
  rawText: string;
  style: React.CSSProperties;
  isTextExpanded: boolean;
  className?: string;
}>(function ActiveHighlightedContent({ displayText, rawText, style, isTextExpanded, className }, ref) {
  const { hoveredPostId, hoveredRelations, hoveredHighlightRangeIndex } = useHighlightStore();
  const showCrossHighlight = !!hoveredPostId && !!hoveredRelations;
  const html = useMemo(() => {
    if (!showCrossHighlight || !hoveredRelations) return displayText;
    return renderMultiHighlightHtml(
      displayText,
      stripHtml(rawText),
      hoveredRelations,
      hoveredHighlightRangeIndex,
    );
  }, [displayText, rawText, showCrossHighlight, hoveredRelations, hoveredHighlightRangeIndex]);

  const innerRef = useRef<HTMLDivElement | null>(null);
  // Expose innerRef both to the parent forwarded ref and our scroll logic
  const setRefs = (el: HTMLDivElement | null) => {
    innerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  // ── Lock the container height ──────────────────────────────────────────────
  // Measure the element's height ONCE in the non-hover, non-expanded state
  // (when `-webkit-line-clamp` produces the authoritative clamped height).
  // Use this exact pixel value in BOTH hover and non-hover modes so that
  // switching display modes on hover doesn't visibly resize the container.
  const [clampedHeight, setClampedHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (isTextExpanded) return;
    if (hoveredPostId) return; // only measure when not hovering (that's the true clamped size)
    if (clampedHeight !== null) return;
    const el = innerRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    if (h > 0) setClampedHeight(h);
  }, [isTextExpanded, hoveredPostId, clampedHeight, html]);

  // Re-measure if the post content changes significantly (displayText is stable
  // per post, but reset if it changes so we don't retain a stale height).
  useEffect(() => {
    setClampedHeight(null);
  }, [displayText]);

  // ── Scroll logic ───────────────────────────────────────────────────────────
  // When a related post is hovered and its matching highlight is outside the
  // visible clamped region, scroll the box the MINIMUM amount needed to bring
  // the mark fully into view. Restore on hover-out.
  //
  // KEY INSIGHT: `html` changes when hoveredHighlightRangeIndex updates
  // (debounced ~200ms after hover). React replaces innerHTML via
  // dangerouslySetInnerHTML, which RESETS scrollTop to 0. We use a
  // useLayoutEffect to restore scrollTop before the browser paints, so the
  // user never sees a flash.
  const savedScrollTopRef = useRef<number | null>(null);
  const prevHoveredIdRef = useRef<string | null>(null);
  const pendingRafRef = useRef<number[]>([]);
  const targetScrollTopRef = useRef(0);

  // Restore scrollTop after innerHTML replacement (runs before paint).
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || !scrollMode) return;
    // If we have a target scrollTop and the element's scrollTop was reset
    // (innerHTML replacement resets it to 0), restore it immediately.
    if (targetScrollTopRef.current > 0 && el.scrollTop === 0) {
      el.scrollTop = targetScrollTopRef.current;
    }
  });

  useEffect(() => {
    const el = innerRef.current;
    if (!el || isTextExpanded) {
      prevHoveredIdRef.current = hoveredPostId;
      return;
    }

    // Cancel any in-flight rAFs from a previous hover so we don't double-scroll
    pendingRafRef.current.forEach((id) => cancelAnimationFrame(id));
    pendingRafRef.current = [];

    if (hoveredPostId && hoveredPostId !== prevHoveredIdRef.current) {
      // Remember the current scroll offset so we can return when hover ends.
      if (savedScrollTopRef.current === null) savedScrollTopRef.current = el.scrollTop;
      targetScrollTopRef.current = 0;

      const PADDING = 12;

      const doScroll = (attempt = 0) => {
        const box = innerRef.current;
        if (!box) return;

        // Find the first mark that's NOT fully visible. querySelector('mark')
        // returns the first in DOM order, but that mark might already be on-screen.
        // We need the one the user can't see.
        const allMarks = Array.from(box.querySelectorAll('mark'));
        if (allMarks.length === 0) {
          if (attempt < 5) {
            const id = requestAnimationFrame(() => doScroll(attempt + 1));
            pendingRafRef.current.push(id);
          }
          return;
        }

        const boxRect = box.getBoundingClientRect();
        // A mark counts as "not visible" if its top or bottom is clipped by
        // more than SLIVER_PX. This catches marks that are technically "in" the
        // box but only showing the top/bottom 5% of a character line.
        const SLIVER_PX = 8;
        let targetMark: Element | null = null;
        for (const m of allMarks) {
          const r = m.getBoundingClientRect();
          if (r.bottom > boxRect.bottom + SLIVER_PX || r.top < boxRect.top - SLIVER_PX) {
            // Fully hidden — definitely needs scroll
            targetMark = m as HTMLElement;
            break;
          }
          if (r.bottom > boxRect.bottom - SLIVER_PX && r.top < boxRect.bottom) {
            // Bottom-clipped (only a sliver showing) — treat as not visible
            targetMark = m as HTMLElement;
            break;
          }
          if (r.top < boxRect.top + SLIVER_PX && r.bottom > boxRect.top) {
            // Top-clipped sliver
            targetMark = m as HTMLElement;
            break;
          }
        }
        // If all marks are visible, no scroll needed
        if (!targetMark) return;

        const mRect = targetMark.getBoundingClientRect();
        const topGap = mRect.top - boxRect.top;
        const bottomGap = mRect.bottom - boxRect.bottom;
        const markHeight = mRect.bottom - mRect.top;
        const boxHeight = boxRect.bottom - boxRect.top;

        let delta = 0;
        if (markHeight > boxHeight - PADDING * 2) {
          delta = topGap - PADDING;
        } else if (topGap < 0) {
          delta = topGap - PADDING;
        } else if (bottomGap > 0) {
          delta = bottomGap + PADDING;
        }

        if (Math.abs(delta) > 1) {
          const target = Math.max(0, box.scrollTop + delta);
          box.scrollTop = target;
          targetScrollTopRef.current = target;
        }
      };

      // Double rAF ensures layout has settled after the display-mode switch
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => doScroll(0));
        pendingRafRef.current.push(r2);
      });
      pendingRafRef.current.push(r1);
    } else if (!hoveredPostId && prevHoveredIdRef.current) {
      // Hover ended — restore scroll position
      const back = savedScrollTopRef.current ?? 0;
      savedScrollTopRef.current = null;
      targetScrollTopRef.current = 0;
      el.scrollTo({ top: back, behavior: 'smooth' });
    }
    prevHoveredIdRef.current = hoveredPostId;
  }, [hoveredPostId, isTextExpanded]);

  // Clean up any pending rAFs on unmount
  useEffect(() => {
    return () => {
      pendingRafRef.current.forEach((id) => cancelAnimationFrame(id));
      pendingRafRef.current = [];
    };
  }, []);

  // ── Merged style ───────────────────────────────────────────────────────────
  // Key goals:
  //   1. Non-hover: keep `-webkit-line-clamp` so we get the ellipsis.
  //   2. Hover: switch to block+overflow so scrollTop works reliably.
  //   3. BOTH modes share the exact same pixel height, so no visible size jitter.
  const scrollMode = !isTextExpanded && !!hoveredPostId;
  const lockedHeight = clampedHeight !== null && !isTextExpanded
    ? `${clampedHeight}px`
    : undefined;
  const mergedStyle: React.CSSProperties = scrollMode
    ? {
        ...style,
        display: 'block',
        WebkitLineClamp: undefined,
        WebkitBoxOrient: undefined,
        overflow: 'hidden',
        height: lockedHeight ?? `calc(1.5em * 5)`,
        maxHeight: lockedHeight ?? `calc(1.5em * 5)`,
      }
    : lockedHeight
      ? { ...style, height: lockedHeight, maxHeight: lockedHeight }
      : style;

  return <div ref={setRefs} className={className} style={mergedStyle} dangerouslySetInnerHTML={{ __html: html }} />;
});

interface PostProps {
  id: string;
  text: string;
  author: string;
  account: string;
  avatar: string;
  repliesCount: number;
  createdAt: string;
  stackCount: number | null;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
  mediaAttachments: string[];
  onStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  setIsExpandModalOpen: (isOpen: boolean) => void;
  relatedStacks: any[];
  activePostId: string | null;
  setActivePostId: (id: string | null) => void;
  initialCard?: PreviewCard | null;
  /** When provided, intercepts post navigation instead of routing to /posts/{id} */
  onNavigate?: (postId: string) => void;
}

export default function Post({
  id,
  text,
  author,
  account,
  avatar,
  repliesCount,
  createdAt,
  stackCount,
  favouritesCount,
  favourited,
  bookmarked,
  onStackIconClick,
  relatedStacks,
  activePostId,
  setActivePostId,
  initialCard,
  onNavigate,
}: PostProps) {
  const router = useRouter();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [replyCount, setReplyCount] = useState(repliesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [mediaAttachments, setMediaAttachments] = useState<string[]>([]);
  const isActive = activePostId === id;
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(initialCard ? [initialCard] : []);
  const [tempRelatedStacks, setTempRelatedStacks] = useState<any[]>(relatedStacks);
  const { html: displayText, publishedDate, articleUrl } = useMemo(
    () => cleanPostHtml(text, previewCards[0]),
    [text, previewCards],
  );

  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    if (isTextExpanded) {
      setIsOverflowing(false);
      return;
    }

    setIsOverflowing(element.scrollHeight > element.clientHeight);
  }, [text, isTextExpanded]);
  useEffect(() => {
    setTempRelatedStacks(relatedStacks);
  }, [relatedStacks]);

  useEffect(() => {
    if (initialCard) {
      setPreviewCards([initialCard]);
    }
  }, [initialCard]);

  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
    }
  }, [text, mediaAttachments, previewCards]);

  useEffect(() => {
    fetchPostData();
  }, []);

  useEffect(() => {
    // Sync isExpanded with isActive state
    setIsExpanded(isActive);
  }, [isActive]);


  const handleNavigate = () => {
    if (onNavigate) { onNavigate(id); return; }
    const url = `/posts/${id}`;
    localStorage.setItem('relatedStacks', JSON.stringify(tempRelatedStacks));
    localStorage.setItem('relatedStacksSize', JSON.stringify(stackCount));
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const handleReply = () => {
    if (onNavigate) { onNavigate(id); return; }
    const url = `/posts/${id}`;
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const getAccessToken = () => {
    return localStorage.getItem('accessToken');
  };

  const fetchPostData = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = response.data;
      const mediaAttachments = data.media_attachments.map((attachment: any) => attachment.url);
      setLikeCount(data.favourites_count);
      setReplyCount(data.replies_count);
      setLiked(data.favourited);
      setBookmarkedState(data.bookmarked);
      setMediaAttachments(mediaAttachments);

      const card = data.card;
      if (card) {
        const normalized: PreviewCard = {
          title: card.title || '',
          description: card.description || '',
          image: card.image || undefined,
          url: card.url,
        };
        setPreviewCards([normalized]);
      } else {
        setPreviewCards([]);
      }
    } catch (error) {
      console.error('Error fetching post data:', error);
    }
  };

  const handleNavigateToUser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!account) return;
    const url = `/user/${account}`;
    router.push(url);
  };

  const handleLike = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      if (liked) {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/unfavourite`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } else {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/favourite`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
      await fetchPostData();
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  const handleSave = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      if (bookmarkedState) {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/unbookmark`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } else {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/bookmark`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
      await fetchPostData();
    } catch (error) {
      console.error('Error bookmarking post:', error);
    }
  };

  const handleAnnotation = () => {
    setAnnotationModalOpen(true);
  };

  const handleOpenInNewTab = () => {
    const url = articleUrl || `${window.location.origin}/posts/${id}`;
    window.open(url, '_blank');
  };

  const handleStackCountClick = async () => {
    setIsExpanded(true);
    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };

    // Set active post first to lock the highlight
    setActivePostId(id);

    let stacks = tempRelatedStacks;
    // If stacks are missing, fetch them
    if (!Array.isArray(stacks) || stacks.length === 0) {
      try {
        const accessToken = getAccessToken();
        if (accessToken) {
          const response = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${id}/related`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          stacks = response.data.relatedStacks || [];
          setTempRelatedStacks(stacks);
        }
      } catch (error) {
        console.error('Failed to fetch related stacks on click:', error);
        notifications.show({
          color: 'red',
          title: 'Failed to load stacks',
          message: 'Please try again later.',
        });
      }
    }
    onStackIconClick(Array.isArray(stacks) ? stacks : [], id, adjustedPosition);
  };

  const handleStackClick = (index: number) => {
    const newRelatedStacks = [...tempRelatedStacks];
    const [clickedStack] = newRelatedStacks.splice(index, 1);
    newRelatedStacks.unshift(clickedStack);
    setTempRelatedStacks(newRelatedStacks);

    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
    onStackIconClick(newRelatedStacks, id, adjustedPosition);
  };

  const handleExpandText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsTextExpanded(true);
    setIsOverflowing(false);
  };

  const handleSingleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleNavigate();
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length === 0) {
      handleNavigate();
    }
  };

  return (
    <div style={{ position: 'relative', marginBottom: '3rem'}}>
      <Paper
        ref={paperRef}
        style={{
          position: 'relative',
          width: "100%",
          backgroundColor: '#fff',
          zIndex: 5,
          borderRadius: '10px',
          border: isActive ? '2px solid rgb(156, 184, 255)' : '2px solid #e7e7e7',
          boxShadow: isActive ? 'rgba(0, 0, 0, 0.18) 0px 12px 24px, rgba(0, 0, 0, 0.12) 0px 6px 12px' : 'none',
          transform: isActive ? 'translateY(-2px)' : 'none',
          transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1rem',
          cursor: 'pointer',
        }}
        onMouseEnter={() => { setHovered(true); }}
        onMouseLeave={() => { setHovered(false); }}
      >
{stackCount !== 0 && (
  <UnstyledButton
    onClick={(event) => {
      event.stopPropagation();
      handleStackCountClick();
    }}
    data-stack-count
  >
    <StackCount
      count={stackCount}
      onClick={handleStackCountClick}
      onStackClick={handleStackClick}
      relatedStacks={tempRelatedStacks}
      expanded={isExpanded}
      cardHeight={cardHeight}
    />
  </UnstyledButton>
)}

        <div
          onClick={handleSingleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNavigate();
            }
          }}
          role="button"
          tabIndex={0}
          style={{ width: '100%', cursor: 'pointer' }}
        >
          <Group>
            <UnstyledButton onClick={handleNavigateToUser} className="avatarHoverDim">
              <Avatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <div>
              <Anchor
                component="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleNavigateToUser(e);
                }}
                underline="hover"
                style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' }}
              >
                {author}
              </Anchor>
              <Text size="xs" c="dimmed">{formatDistanceToNow(new Date(createdAt))} ago</Text>
            </div>
          </Group>
        </div>

        <div
          style={{ paddingLeft: '3rem', paddingRight:'3rem', cursor: 'pointer'}}
          onMouseUp={handleMouseUp}
        >
          <div>
      {isActive ? (
        <ActiveHighlightedContent
          ref={textRef}
          displayText={displayText}
          rawText={text}
          isTextExpanded={isTextExpanded}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={{
            display: isTextExpanded ? 'block' : '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: isTextExpanded ? undefined : 5,
            overflow: isTextExpanded ? 'visible' : 'hidden',
            textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
            maxHeight: isTextExpanded ? undefined : 'calc(1.5em * 5)',
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445',
          }}
        />
      ) : (
        <div
          ref={textRef}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={{
            display: isTextExpanded ? 'block' : '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: isTextExpanded ? undefined : 5,
            overflow: isTextExpanded ? 'visible' : 'hidden',
            textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
            maxHeight: isTextExpanded ? undefined : 'calc(1.5em * 5)',
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445'
          }}
          dangerouslySetInnerHTML={{ __html: displayText }}
        />
      )}
      {isOverflowing && (
        <Anchor
          component="button"
          type="button"
          size="sm"
          underline="hover"
          styles={(theme) => ({
            root: {
              padding: 0,
              background: 'none',
              color: '#5a71a8',
              fontWeight: 600,
              cursor: 'pointer',
              '&:hover': {
                color: theme.colors.blue[7],
              },
            },
          })}
          onClick={handleExpandText}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          Read more
        </Anchor>
      )}
    </div>
          {mediaAttachments.length > 0 && (
            <div style={{ paddingLeft: '3rem', paddingRight: '4rem', paddingTop: '1rem' }}>
              {mediaAttachments.map((url, index) => (
                <img key={index} src={url} alt={`Attachment ${index + 1}`} style={{ width: '100%', marginBottom: '10px' }} />
              ))}
            </div>
          )}

          {previewCards.slice(0, 1).map((card, index) =>
            card.image ? (
              <a
                key={index}
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                style={{ display: 'block', marginTop: '0.5rem', marginRight: '0.5rem' }}
              >
                <img
                  src={card.image}
                  alt={card.title}
                  style={{ width: '100%', borderRadius: '8px', display: 'block' }}
                />
              </a>
            ) : null
          )}
          {publishedDate && (
            <Text size="xs" c="dimmed" style={{ marginTop: '0.5rem' }}>
              Published: {publishedDate}
            </Text>
          )}
        </div>

        <Divider style={{ marginTop:'1.5rem'}}/>
        <div style={{ paddingLeft: '3rem', paddingRight: '3rem' }}>
          <Group style={{ display: 'flex', justifyContent: 'space-between', paddingTop:'0.1rem', paddingBottom:'0.1rem', marginBottom: stackCount !== null && stackCount > 1 ? '0px' : '0px' }}>
            <InteractionControl
              icon={<IconMessageCircle size={20} />}
              label={replyCount}
              ariaLabel="Reply"
              onClick={handleReply}
            />
            <InteractionControl
              icon={liked ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
              label={likeCount}
              ariaLabel="Like"
            onClick={handleLike}
            active={liked}
            />
            <InteractionControl
              icon={bookmarkedState ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
              ariaLabel="Bookmark"
            onClick={handleSave}
            active={bookmarkedState}
            />
            <InteractionControl
              icon={<IconNote size={20} />}
              ariaLabel="Annotate"
              onClick={handleAnnotation}
            />
            <InteractionControl
              icon={<IconLink size={20} />}
              ariaLabel="Open in new tab"
              onClick={handleOpenInNewTab}
            />
          </Group>
        </div>
      </Paper>
      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={id}
      />
    </div>
  );
}
