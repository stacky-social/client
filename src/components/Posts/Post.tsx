"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Group, Paper, UnstyledButton, Divider, Anchor, Button, Menu, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconShare, IconDots, IconTrash } from '@tabler/icons-react';
import { copyLink } from '../../utils/share';
import { format } from 'date-fns';
import { formatPostDate } from '../../utils/formatPostDate';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import { PreviewCardType, type AuthorStats, type QuotedPostMock } from '../../types/PostType';
import InteractionControl from '../InteractionControl';
import { toggleFavourite, toggleBookmark, deleteStatus } from '../../utils/mastoActions';
import { getMe, getPost, isLiked as storeIsLiked, isBookmarked as storeIsBookmarked } from '../../utils/localStore';
import { getCurrentUser } from '../../utils/getCurrentUser';
import { setPendingFocusTopic } from '../../utils/highlightStore';
import { CATEGORY_LABELS, categoryIcon, getCategoryColors } from '../../utils/categoryStyles';
import { type FocusTopicCandidate } from '../../utils/focusTopics.mjs';
import ReplyHighlightedContent from './ReplyHighlightedContent';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';
import type { Relation } from '../../types/PostType';
import { showUndoableAction } from '../../utils/actionNotifications';
import { extractMastodonLinks } from '../../utils/mastodonContent.mjs';
import { linkifyHtmlUrls, preserveInlineLinkOffsets } from '../../utils/inlineLinks.mjs';
import { saveFeedScrollSnapshot } from '../../utils/feedScrollRestoration';
import { postRouteFor } from '../../utils/postRoute';
import AuthorHoverInfo from '../AuthorHoverInfo';
import ProfileAvatar from '../ProfileAvatar';
import FocusTopicHighlightedContent from './FocusTopicHighlightedContent';

/** X-style left-pane indent (px): avatar (Mantine md = 38px) + the header row's
 *  `gap="xs"` (10px) = 48px, i.e. where the username's left edge sits. The post
 *  body, media, divider, and action row all indent by this so content aligns
 *  under the USERNAME (not the avatar), matching the aside's related cards. */
const BODY_INDENT_PX = 48;

// ─── Post text helpers ──────────────────────────────────────────────────────

/** Strip all HTML tags to get plain text for matching */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

type PreviewCard = PreviewCardType;

const MastodonInstanceUrl = 'https://beta.stacky.social';

// Temporary product decision: keep posts text-first on every surface. Mastodon
// link-preview images and media attachments made the same status look like two
// different posts between a feed and its detail route. Keeping this switch in
// the shared Post component guarantees Home, search, profiles, and both detail
// routes stay consistent while preserving the original source link in the text.
const POST_IMAGES_ENABLED = false;

interface CleanedPost {
  html: string;
  publishedDate: string | null;
  supplementalUrl: string | null;
}

function isSameArticleUrl(candidate: string, articleUrl: string): boolean {
  try {
    const candidateUrl = new URL(candidate.replace(/&amp;/gi, '&'));
    const targetUrl = new URL(articleUrl);
    candidateUrl.hash = '';
    targetUrl.hash = '';
    return candidateUrl.toString() === targetUrl.toString();
  } catch {
    return candidate === articleUrl;
  }
}

/** Keep authored URLs in place and expose a preview-card destination only when
 *  that URL was not already present in the post body. */
function cleanPostHtml(html: string, card: PreviewCard | null | undefined): CleanedPost {
  let cleaned = html;
  let publishedDate: string | null = null;
  const supplementalUrl = card?.url && !extractMastodonLinks(html)
    .some((candidate) => isSameArticleUrl(candidate, card.url))
    ? card.url
    : null;

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
  cleaned = linkifyHtmlUrls(cleaned);

  return { html: cleaned, publishedDate, supplementalUrl };
}



// Fixed-window focus post (decision 2026-07-06; supersedes the bounded-GROW
// reveal, which read as layout instability): the box NEVER changes height or
// line count on hover. While a cross-highlight/filter is active the clamped box
// becomes a programmatically-scrolled window AT THE SAME HEIGHT and scrolls to
// the whole span union. Scroll offsets snap to whole LINES so the window never
// shows a clipped half-line (a half-line's span was being mistaken for "shown",
// so semi-visible spans didn't scroll — the bug this replaces). Manual "Read
// more" still fully expands; that's the only way to grow the post.
const POST_LINE_HEIGHT_EM = 1.5;

type ClampEllipsisPosition = { left: number; top: number; lineHeight: number };

/**
 * Find the final visible glyph in a clamped (or internally scrolled) text box.
 * The browser's multiline ellipsis is not exposed as a DOM node, so the custom
 * marker must be anchored to the caret position on the final visible line.
 */
function measureClampEllipsis(element: HTMLElement): ClampEllipsisPosition | null {
  const shell = element.parentElement;
  if (!shell) return null;

  const elementRect = element.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const lineHeight = Number.parseFloat(computed.lineHeight)
    || Number.parseFloat(computed.fontSize) * POST_LINE_HEIGHT_EM;
  const sampleY = elementRect.bottom - lineHeight / 2;

  // Keep our existing overlay out of hit testing while finding the text caret.
  const marker = shell.querySelector<HTMLElement>('[data-testid="post-clamp-ellipsis"]');
  const previousDisplay = marker?.style.display ?? '';
  if (marker) marker.style.display = 'none';

  let anchorRect: DOMRect | null = null;
  try {
    const caretDocument = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caretPosition = caretDocument.caretPositionFromPoint?.(elementRect.right - 1, sampleY);
    const fallbackRange = caretPosition
      ? null
      : caretDocument.caretRangeFromPoint?.(elementRect.right - 1, sampleY);
    const node = caretPosition?.offsetNode ?? fallbackRange?.startContainer;
    let end = caretPosition?.offset ?? fallbackRange?.startOffset ?? 0;

    if (node?.nodeType === Node.TEXT_NODE && element.contains(node)) {
      const textNode = node as Text;
      end = Math.min(end, textNode.data.length);
      while (end > 0 && /\s/.test(textNode.data[end - 1])) end -= 1;
      if (end > 0) {
        const range = document.createRange();
        range.setStart(textNode, end - 1);
        range.setEnd(textNode, end);
        const candidate = range.getBoundingClientRect();
        const onFinalVisibleLine = candidate.bottom > elementRect.bottom - lineHeight - 2
          && candidate.top < elementRect.bottom
          && candidate.right <= elementRect.right + 1;
        if (onFinalVisibleLine) anchorRect = candidate;
      }
    }

    // Nested marks can occasionally make the caret API return an element
    // boundary. Fall back to a reverse text-node scan, stopping at the first
    // character that belongs to the final visible line.
    if (!anchorRect) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) textNodes.push(node as Text);

      outer: for (let nodeIndex = textNodes.length - 1; nodeIndex >= 0; nodeIndex -= 1) {
        const textNode = textNodes[nodeIndex];
        for (let offset = textNode.data.length; offset > 0; offset -= 1) {
          if (/\s/.test(textNode.data[offset - 1])) continue;
          const range = document.createRange();
          range.setStart(textNode, offset - 1);
          range.setEnd(textNode, offset);
          const candidate = range.getBoundingClientRect();
          if (
            candidate.width > 0
            && candidate.bottom > elementRect.bottom - lineHeight - 2
            && candidate.top < elementRect.bottom
            && candidate.left < elementRect.right
            && candidate.right > elementRect.left
          ) {
            anchorRect = candidate;
            break outer;
          }
        }
      }
    }
  } finally {
    if (marker) marker.style.display = previousDisplay;
  }

  if (!anchorRect) return null;
  const fontSize = Number.parseFloat(computed.fontSize) || 16;
  const markerWidth = Math.max(8, fontSize * 0.7);
  const nativeClampActive = computed.webkitLineClamp !== 'none';
  const markerLeft = Math.min(
    anchorRect.right - shellRect.left + 1,
    elementRect.right - shellRect.left - markerWidth,
  );
  return {
    // A WebKit line clamp paints an anonymous ellipsis immediately before our
    // marker. Start the opaque button one ellipsis-width earlier so it replaces
    // that native glyph instead of appearing beside it. The internally-scrolled
    // focus window has no native clamp, so its marker stays after the final
    // visible character.
    left: Math.round((markerLeft - (nativeClampActive ? markerWidth : 0)) * 100) / 100,
    top: Math.round((anchorRect.top - shellRect.top) * 100) / 100,
    lineHeight,
  };
}

interface PostProps {
  id: string;
  text: string;
  author: string;
  account: string;
  /** Stable Mastodon account id, used for exact owner-only action gating. */
  accountId?: string;
  authorStats?: AuthorStats;
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
  /** Embedded article/OP on a lifted quote-tweet root. */
  quotedPost?: QuotedPostMock | null;
  /** When provided, intercepts post navigation instead of routing to /posts/{id} */
  onNavigate?: (postId: string) => void;
  /** Relations for persistent semantic topic phrases in the post's own text. */
  focusRelations?: Relation[];
  /** Collapsed line-clamp before "Read more" (feed uses 5; the full-post view passes more, e.g. 10). */
  clampLines?: number;
  /** Related-card-style relations whose content offsets index THIS post's own
   *  text (replies in the thread view). Renders colored category spans. */
  contentRelations?: Relation[];
  /** Deduped contribution categories shown as a badge row under the header. */
  categoryBadges?: string[];
  /** A contribution span in this post was clicked (rangeIndex into contentRelations). */
  onContentSpanClick?: (rangeIndex: number) => void;
  /** Optional cross-pane count for the reply span tooltip ("N more <topic>"). */
  replyTopicCount?: (topic: string) => number;
  /** The reply pane's active grouping topic — threaded to the reply spans so an
   *  already-grouped topic's tooltip reads "(shown)" (R-REORDER-9 parity). */
  activeClusterTopic?: string | null;
  /** Count of THIS post's related posts linked to a span union — feeds the
   *  dwell tooltip on non-focused posts, whose stacks aren't in context. */
  relatedCountForSpans?: (ranges: Array<{ fs: number; fe: number }>) => number;
  /** Count of displayed replies linked to a span union — merged into the
   *  focused post's dwell tooltip on the thread view (honest two-pane counts). */
  replyCountForSpans?: (ranges: Array<{ fs: number; fe: number }>) => number;
  /** Parent account handle displayed as reply provenance in feed views. */
  replyingToAccount?: string | null;
}

function Post({
  id,
  text,
  author,
  account,
  accountId,
  authorStats,
  avatar,
  repliesCount,
  createdAt,
  stackCount,
  favouritesCount,
  favourited,
  bookmarked,
  mediaAttachments: initialMedia = [],
  onStackIconClick,
  relatedStacks,
  activePostId,
  setActivePostId,
  initialCard,
  quotedPost,
  onNavigate,
  focusRelations = [],
  clampLines = 5,
  contentRelations,
  categoryBadges,
  onContentSpanClick,
  replyTopicCount,
  activeClusterTopic = null,
  replyingToAccount = null,
}: PostProps) {
  const router = useRouter();
  const { clear: clearRelatedStacks } = useRelatedStacks();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  // Initialize interaction state from the local store so persisted likes/bookmarks
  // survive reload and show consistently across routes (e.g. a post liked on
  // /ChineseEVs shows as liked there, on /liked, and after a refresh). When
  // the post is not yet in the store, fall back to the props from the parent.
  // Initialize from the PARENT PROPS only so the first render matches the server
  // HTML. The store reads localStorage (invisible to the server), so reading it
  // during the initial render would cause a hydration mismatch. The effect below
  // re-syncs liked/bookmarked/count from the store immediately after mount.
  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [replyCount, setReplyCount] = useState(repliesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [mediaAttachments, setMediaAttachments] = useState<string[]>(initialMedia);
  const isActive = activePostId === id;
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  // NB: the highlight layer's scroll-to-span is fully self-contained inside
  // ActiveHighlightedContent (fixed-window mode) — no reveal state lives here.
  const isTextExpandedRef = useRef(isTextExpanded);
  isTextExpandedRef.current = isTextExpanded;
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(initialCard ? [initialCard] : []);
  const [tempRelatedStacks, setTempRelatedStacks] = useState<any[]>(relatedStacks);
  const { html: displayText, publishedDate, supplementalUrl } = useMemo(
    () => cleanPostHtml(text, previewCards[0]),
    [text, previewCards],
  );
  const contentPlainText = useMemo(
    () => preserveInlineLinkOffsets(stripHtml(text)),
    [text],
  );

  const [isOverflowing, setIsOverflowing] = useState(false);
  const [clampEllipsisPosition, setClampEllipsisPosition] = useState<ClampEllipsisPosition | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // Guards against setState after unmount: under feed virtualization a post can
  // unmount while a post-action refetch is still in flight.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Ownership is resolved after hydration so the server and first client render
  // match. Local posts use the local-store identity; Mastodon posts prefer the
  // immutable account id and fall back to the exact `acct` string.
  useEffect(() => {
    const stored = getPost(id);
    if (stored) {
      setCanDelete(stored.account.acct === getMe().acct);
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      setCanDelete(false);
      return;
    }
    const sameId = Boolean(accountId && currentUser.id && String(accountId) === String(currentUser.id));
    const normalizedRenderedAcct = account.trim().replace(/^@/, '').toLowerCase();
    const normalizedCurrentAcct = String(currentUser.acct ?? currentUser.username ?? '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    setCanDelete(sameId || Boolean(normalizedRenderedAcct && normalizedRenderedAcct === normalizedCurrentAcct));
  }, [account, accountId, id]);

  // Re-sync interaction state from the store whenever the rendered post id (or its
  // incoming props) changes — under feed virtualization a Post instance can be
  // reused for a different id, and this keeps the heart/bookmark/count accurate.
  useEffect(() => {
    const stored = getPost(id);
    if (stored) {
      setLiked(storeIsLiked(id));
      setBookmarkedState(storeIsBookmarked(id));
      setLikeCount(stored.favourites_count);
    } else {
      setLiked(favourited);
      setBookmarkedState(bookmarked);
      setLikeCount(favouritesCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, favourited, bookmarked, favouritesCount]);

  // Reply counts can change after a local reply or a background Mastodon
  // refresh. Keep the stateful action row aligned with the latest parent prop;
  // previously it permanently retained the value from the first render.
  useEffect(() => {
    setReplyCount(repliesCount);
  }, [id, repliesCount]);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || isTextExpanded) {
      setClampEllipsisPosition(null);
      return;
    }

    let animationFrame = 0;
    let cancelled = false;
    const measureOverflow = () => {
      if (cancelled) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        // A one-pixel tolerance avoids a false "Read more" when fractional line
        // metrics round scrollHeight and clientHeight in opposite directions.
        const overflowing = element.scrollHeight - element.clientHeight > 1;
        setIsOverflowing(overflowing);
        const nextPosition = overflowing ? measureClampEllipsis(element) : null;
        setClampEllipsisPosition((current) => {
          if (!current || !nextPosition) return current === nextPosition ? current : nextPosition;
          return Math.abs(current.left - nextPosition.left) < 0.25
            && Math.abs(current.top - nextPosition.top) < 0.25
            && Math.abs(current.lineHeight - nextPosition.lineHeight) < 0.25
            ? current
            : nextPosition;
        });
      });
    };

    measureOverflow();
    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(element);
    element.addEventListener('scroll', measureOverflow, { passive: true });
    void document.fonts?.ready.then(measureOverflow);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      element.removeEventListener('scroll', measureOverflow);
      resizeObserver.disconnect();
    };
  }, [displayText, text, isTextExpanded, clampLines, contentRelations, focusRelations]);
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

  // Counts, flags, card and media all arrive via props (from the parent's list/
  // thread fetch), so we no longer refetch each post's full status on mount —
  // that fired one /api/v1/statuses/{id} per mounted post and stormed the server
  // on long feeds/threads. fetchPostData remains for refreshing after an action.

  useEffect(() => {
    // Sync isExpanded with isActive state
    setIsExpanded(isActive);
  }, [isActive]);


  const handleNavigate = () => {
    if (onNavigate) { onNavigate(id); return; }
    // Store-backed posts (seeded study content, user posts, and local replies)
    // must stay on the compatible local thread route. Unknown ids are assumed
    // to belong to a live Mastodon surface and keep the API-backed route.
    const url = postRouteFor(id);
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname + window.location.search);
    saveFeedScrollSnapshot();
    router.push(url);
  };

  const handleReply = () => {
    if (onNavigate) { onNavigate(id); return; }
    const url = postRouteFor(id);
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname + window.location.search);
    saveFeedScrollSnapshot();
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
      // Bail if the post unmounted while the request was in flight, so we don't
      // setState on an unmounted component.
      if (!mountedRef.current) return;
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
    const profileHandle = account.trim().replace(/^@/, '');
    const mastodonSource = accountId
      ? `?source=mastodon&id=${encodeURIComponent(accountId)}`
      : '';
    const url = `/user/${encodeURIComponent(profileHandle)}${mastodonSource}`;
    router.push(url);
  };

  const handleLike = async () => {
    // Optimistic update so the heart reflects the tap instantly.
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));

    try {
      // Persists to Mastodon when authenticated and to the local JSON store in
      // demo mode, then confirms or reverts the optimistic state.
      const result = await toggleFavourite(id, wasLiked);
      if (!mountedRef.current) return;
      if (result.ok) {
        // Confirm against the active data source's authoritative state.
        setLiked(result.value);
        showUndoableAction({
          title: result.value ? 'Post liked' : 'Like removed',
          message: result.value ? 'This post was added to your likes.' : 'This post was removed from your likes.',
          onUndo: async () => {
            try {
              const undoResult = await toggleFavourite(id, result.value);
              if (!mountedRef.current) return;
              if (!undoResult.ok) throw new Error('toggleFavourite undo returned ok: false');
              setLiked(undoResult.value);
              setLikeCount((c) => Math.max(0, c + (undoResult.value ? 1 : -1)));
            } catch (error) {
              console.error('Error undoing like:', error);
              notifications.show({
                title: 'Error',
                message: 'Could not undo like. Please try again.',
                color: 'red',
              });
            }
          },
        });
      } else {
        throw new Error('toggleFavourite returned ok: false');
      }
    } catch (error) {
      console.error('Error liking post:', error);
      // Revert optimistic UI on failure.
      if (mountedRef.current) {
        setLiked(wasLiked);
        setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
      }
      notifications.show({
        title: 'Error',
        message: 'Could not update like. Please try again.',
        color: 'red',
      });
    }
  };

  const handleSave = async () => {
    // Optimistic update so the bookmark icon reflects the tap instantly.
    const wasBookmarked = bookmarkedState;
    setBookmarkedState(!wasBookmarked);

    try {
      // Persists to Mastodon when authenticated and to the local JSON store in
      // demo mode, then confirms or reverts the optimistic state.
      const result = await toggleBookmark(id, wasBookmarked);
      if (!mountedRef.current) return;
      if (result.ok) {
        setBookmarkedState(result.value);
        showUndoableAction({
          title: result.value ? 'Post saved' : 'Bookmark removed',
          message: result.value ? 'This post was added to your bookmarks.' : 'This post was removed from your bookmarks.',
          onUndo: async () => {
            try {
              const undoResult = await toggleBookmark(id, result.value);
              if (!mountedRef.current) return;
              if (!undoResult.ok) throw new Error('toggleBookmark undo returned ok: false');
              setBookmarkedState(undoResult.value);
            } catch (error) {
              console.error('Error undoing bookmark:', error);
              notifications.show({
                title: 'Error',
                message: 'Could not undo bookmark. Please try again.',
                color: 'red',
              });
            }
          },
        });
      } else {
        throw new Error('toggleBookmark returned ok: false');
      }
    } catch (error) {
      console.error('Error bookmarking post:', error);
      // Revert optimistic UI on failure.
      if (mountedRef.current) setBookmarkedState(wasBookmarked);
      notifications.show({
        title: 'Error',
        message: 'Could not update bookmark. Please try again.',
        color: 'red',
      });
    }
  };

  const handleAnnotation = () => {
    setAnnotationModalOpen(true);
  };

  const handleShare = () => {
    // Copy the in-app post link so a recipient lands on this post's focus view
    // (related responses in the aside). Route from the post's identity, not the
    // current page: Home, Likes, Bookmarks, search and hashtag feeds can all mix
    // Mastodon and frontend-backed posts in the same viewport.
    const url = `${window.location.origin}${postRouteFor(id)}`;
    copyLink(url, "Post link copied");
  };

  const handleDelete = async () => {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    const result = await deleteStatus(id);

    if (!result.ok) {
      if (mountedRef.current) setIsDeleting(false);
      notifications.show({
        title: 'Post not deleted',
        message: result.error,
        color: 'red',
      });
      return;
    }

    if (isActive) clearRelatedStacks();
    if (mountedRef.current) {
      setDeleteModalOpen(false);
      setIsDeleted(true);
      setIsDeleting(false);
    }
    notifications.show({
      title: 'Post deleted',
      message: 'Your post was permanently deleted.',
      color: 'green',
    });

    const currentPath = decodeURIComponent(window.location.pathname);
    if (
      currentPath === `/posts/${id}`
      || currentPath === `/ChineseEVs/posts/${id}`
      || currentPath === `/AIWorkforce/posts/${id}`
      || currentPath === `/EnergyTech/posts/${id}`
    ) {
      router.replace('/home');
    }
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
          title: 'Failed to load related posts',
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

  // Topic clicked on a NON-focused feed post: stash it across the focus switch,
  // publish this post through the shared context, then align it to the feed's
  // active line. The click never navigates into the detail route.
  const handleTopicFocusRequest = useCallback((topic: FocusTopicCandidate) => {
    setPendingFocusTopic(id, topic.topicKey, topic.rangeIndex);
    // Publish the post and its related payload through the same shared-context
    // transaction as an ordinary focus change. Updating only the feed-local id
    // made the scroll observer believe the post had already been published; the
    // aside stayed on the previous id, so both the pending filter and bridge
    // were lost.
    const position = paperRef.current?.getBoundingClientRect();
    onStackIconClick(Array.isArray(tempRelatedStacks) ? tempRelatedStacks : [], id, {
      top: position ? position.top + window.scrollY : 0,
      height: position?.height ?? 0,
    });
    // Scroll this post's top to the feed's "active line" (30% of the viewport, the
    // same line the feed uses to pick the focused post) so it settles focused —
    // centring it would leave a higher post on the line. Instant (not animated):
    // a smooth animation fires a scroll event per frame, and the feed re-evaluates
    // the active post on every one, which — now that every feed post renders the
    // highlight layer — is a re-render storm. One jump = one active switch.
    const el = paperRef.current;
    if (el) {
      const targetY = window.scrollY + (el.getBoundingClientRect().top - window.innerHeight * 0.3) + 4;
      window.scrollTo(0, Math.max(0, targetY));
    }
  }, [id, onStackIconClick, tempRelatedStacks]);

  const handleExpandText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsTextExpanded(true);
    setIsOverflowing(false);
  };

  const handleCollapseText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsTextExpanded(false);
    // isOverflowing will be recalculated by the useEffect on next render
  };

  const handleSingleClick = (e: React.MouseEvent) => {
    // If the click originated from a highlighted mark, let the mark's own
    // capture-phase handler deal with it — do not navigate.
    if ((e.target as HTMLElement).closest('mark, a, button')) return;
    e.stopPropagation();
    handleNavigate();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // If the mouseup came from a highlighted mark, do not navigate.
    if ((e.target as HTMLElement).closest('mark, a, button')) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length === 0) {
      handleNavigate();
    }
  };

  if (isDeleted) return null;

  return (
    <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <Paper
        ref={paperRef}
        data-testid="post"
        data-post-id={id}
        data-active={isActive ? 'true' : 'false'}
        style={{
          position: 'relative',
          width: "100%",
          backgroundColor: '#fff',
          zIndex: 5,
          borderRadius: '10px',
          borderStyle: 'solid',
          borderWidth: '2px',
          borderColor: isActive ? 'var(--cw-teal)' : '#dfe4ea',
          boxShadow: isActive
            ? '0 5px 14px rgba(28, 43, 74, 0.10), 0 2px 5px rgba(28, 43, 74, 0.06)'
            : '0 1px 6px rgba(28, 43, 74, 0.045)',
          transform: isActive ? 'translateY(-1px)' : 'none',
          // Border switches instantly (not transitioned) so the active outline
          // can't be caught mid-fade showing the inactive colour during scroll
          // re-renders (R-FEED-5). Elevation/lift still animate.
          transition: 'background-color 120ms ease, box-shadow 150ms ease, transform 150ms ease',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1rem',
          cursor: 'pointer',
        }}
      >
{/* The stack / category-count icon column on the focus post is permanently
    removed (RG-1 / R-NOSTACK-1). Related stacks live in the aside panel, not in a
    per-post icon column. Do NOT reinstate this — it has regressed via merges
    before (it reappeared on the detail route via `stackCount={p.stackCount}`). */}

        {canDelete && (
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 7 }}>
            <Menu position="bottom-end" shadow="md" width={176} withinPortal>
              <Menu.Target>
                <UnstyledButton
                  aria-label="More post actions"
                  title="More post actions"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#5f6b7a',
                    background: '#fff',
                  }}
                >
                  <IconDots size={19} aria-hidden="true" />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} aria-hidden="true" />}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete post
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
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
          <Group wrap="nowrap" gap="xs" style={{ alignItems: 'center', paddingRight: canDelete ? 34 : 0 }}>
            <UnstyledButton onClick={handleNavigateToUser} className="avatarHoverDim">
              <ProfileAvatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <AuthorHoverInfo displayName={author} account={account} stats={authorStats}>
              <Anchor
                component="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleNavigateToUser(e);
                }}
                underline="hover"
                // Username at body-text size (weight/colour carry the hierarchy,
                // not size) so the header reads denser — `inherit` tracks the card's
                // own font size (14px reply / 16px focus) so it always equals the
                // body text, X/YouTube-style. Truncate rather than push the inline
                // date/badges off the row.
                style={{
                  color: '#011445', fontWeight: 700, minWidth: 0, fontSize: 'inherit',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {author}
              </Anchor>
            </AuthorHoverInfo>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              · {formatPostDate(createdAt)}
            </Text>

            {categoryBadges && categoryBadges.length > 0 && (
              // Category tags live in the header row, pushed right. They compress
              // to icon-only when the card's container gets narrow (the
              // `.post-tag-text` label hides via a CSS @container query — see
              // globals.css); `title`/`aria-label` keep the meaning available.
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
                {categoryBadges.map((cat) => {
                  const tc = getCategoryColors(cat);
                  const label = CATEGORY_LABELS[cat] ?? cat;
                  return (
                    <span
                      key={cat}
                      data-reply-badge={cat}
                      title={label}
                      aria-label={label}
                      style={{
                        background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`,
                        borderRadius: '5px', padding: '2px 7px',
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                      }}
                    >
                      {categoryIcon(cat, 12, tc.text)}
                      <span className="post-tag-text">{label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </Group>
        </div>

        {replyingToAccount && (
          <Text
            data-testid="reply-context"
            size="xs"
            style={{
              paddingLeft: `${BODY_INDENT_PX}px`,
              marginTop: '2px',
              marginBottom: '3px',
              color: '#6b7280',
            }}
          >
            Replying to <span style={{ color: '#4f669d', fontWeight: 600 }}>@{replyingToAccount.split('@')[0]}</span>
          </Text>
        )}

        <div
          className="post-body-content"
          // X-style: the body + media indent to align under the USERNAME, past the
          // avatar (avatar 38px + the header row's 10px gap = 48px) — matching the
          // aside's related cards. The action row below uses the same indent.
          style={{ paddingLeft: `${BODY_INDENT_PX}px`, paddingRight: '0', cursor: 'pointer'}}
          onMouseUp={(e) => handleMouseUp(e)}
        >
          <div>
      <div className="post-text-clamp-shell">
      {contentRelations && contentRelations.length > 0 ? (
        // Reply with contributions: colored category spans over its own text
        // (the left-pane counterpart of a related card). Clamp/Read-more reuse
        // the same wrapper the plain branch uses.
        <div
          ref={textRef}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={{
            display: isTextExpanded ? 'block' : '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: isTextExpanded ? undefined : clampLines,
            overflow: isTextExpanded ? 'visible' : 'hidden',
            textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
            // No maxHeight: the line-clamp owns the collapsed height. A static
            // calc(1.5em * N) missed the paragraph gaps inside the window and
            // cropped the last visible line in half.
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445',
          }}
        >
          <ReplyHighlightedContent
            plainText={contentPlainText}
            relations={contentRelations}
            replyId={id}
            onSpanClick={onContentSpanClick}
            otherCountByTopic={replyTopicCount}
            activeClusterTopic={activeClusterTopic}
          />
        </div>
      ) : focusRelations.length > 0 ? (
        // Render the interactive spans for EVERY post that has them — not just the
        // focused one — so feed posts get span hover + click-to-focus. active gates
        // the focused-only behaviour (cross-highlight, filter visual, auto-reveal).
        <FocusTopicHighlightedContent
          ref={textRef}
          postId={id}
          displayText={displayText}
          rawText={text}
          isTextExpanded={isTextExpanded}
          focusRelations={focusRelations}
          active={isActive}
          postRelatedStacks={tempRelatedStacks}
          onTopicFocusRequest={handleTopicFocusRequest}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={
            isTextExpanded
              ? {
                  // Manual Read-more: full natural height.
                  display: 'block',
                  overflow: 'visible',
                  textOverflow: 'unset',
                  marginTop: '0px',
                  lineHeight: '1.5',
                  color: '#011445',
                }
              : {
                  // Clamp. The line-clamp owns the collapsed height (a static
                  // calc(1.5em * N) maxHeight missed the paragraph gaps inside
                  // the window and cropped the last visible line in half). The
                  // highlight layer switches this box to an internally-scrolled
                  // window at the MEASURED clamp height while a cross-highlight
                  // is active (fixed window — never grows).
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: clampLines,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: '0px',
                  lineHeight: '1.5',
                  color: '#011445',
                }
          }
        />
      ) : (
        <div
          ref={textRef}
          className={isTextExpanded ? undefined : 'postClampedText'}
          style={{
            display: isTextExpanded ? 'block' : '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: isTextExpanded ? undefined : clampLines,
            overflow: isTextExpanded ? 'visible' : 'hidden',
            textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
            // No maxHeight — see the clamp comment above (half-line crop).
            marginTop: '0px',
            lineHeight: '1.5',
            color: '#011445'
          }}
          dangerouslySetInnerHTML={{ __html: displayText }}
        />
      )}
      {isOverflowing && !isTextExpanded && (
        <button
          type="button"
          className="post-clamp-ellipsis"
          data-testid="post-clamp-ellipsis"
          data-inline-positioned={clampEllipsisPosition ? 'true' : 'false'}
          aria-label="Read full post"
          title="Read more"
          onClick={handleExpandText}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          style={clampEllipsisPosition ? {
            left: `${clampEllipsisPosition.left}px`,
            top: `${clampEllipsisPosition.top}px`,
            height: `${clampEllipsisPosition.lineHeight}px`,
            lineHeight: `${clampEllipsisPosition.lineHeight}px`,
          } : undefined}
        >…</button>
      )}
      </div>
      {supplementalUrl && !quotedPost && (
        <Anchor
          href={supplementalUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-focus-article-link
          className="inline-content-link supplemental-content-link"
          size="xs"
          onClick={(event: React.MouseEvent) => event.stopPropagation()}
          onMouseDown={(event: React.MouseEvent) => event.stopPropagation()}
          onMouseUp={(event: React.MouseEvent) => event.stopPropagation()}
          style={{
            display: 'inline',
            marginTop: '0.3rem',
            marginBottom: '0.35rem',
          }}
        >
          {supplementalUrl}
        </Anchor>
      )}
      {(isOverflowing || isTextExpanded) && (
        <Anchor
          component="button"
          type="button"
          size="sm"
          underline="hover"
          styles={(theme) => ({
            root: {
              padding: 0,
              marginLeft: supplementalUrl && !quotedPost ? '0.5rem' : 0,
              background: 'none',
              color: '#1c2b4a',
              fontWeight: 600,
              cursor: 'pointer',
              '&:hover': {
                color: theme.colors.blue[7],
              },
            },
          })}
          onClick={isTextExpanded ? handleCollapseText : handleExpandText}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          {isTextExpanded ? 'Read less' : 'Read more'}
        </Anchor>
      )}
    </div>
          {quotedPost && (
            <button
              type="button"
              className="quoted-post-card"
              data-testid="quoted-post"
              data-embedded-post
              aria-label={`Open post by ${quotedPost.account.display_name}`}
              title={quotedPost.title || `Post by ${quotedPost.account.display_name}`}
              onClick={(event) => {
                event.stopPropagation();
                if (onNavigate) onNavigate(quotedPost.id);
                else router.push(postRouteFor(quotedPost.id));
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onMouseUp={(event) => event.stopPropagation()}
            >
              <span className="quoted-post-header">
                <ProfileAvatar
                  src={quotedPost.account.avatar}
                  alt={quotedPost.account.display_name}
                  radius="xl"
                  size={32}
                  className="quoted-post-avatar"
                />
                <span className="quoted-post-meta">
                  <strong>{quotedPost.account.display_name}</strong>
                  <span aria-hidden>·</span>
                  <span>{formatPostDate(quotedPost.created_at)}</span>
                </span>
              </span>
              <span className="quoted-post-body">
                {quotedPost.title && <span className="quoted-post-title">{quotedPost.title}</span>}
                <span className="quoted-post-copy">{quotedPost.content}</span>
              </span>
            </button>
          )}
          {POST_IMAGES_ENABLED && mediaAttachments.length > 0 && (
            <div style={{ paddingLeft: '0', paddingRight: '0', paddingTop: '1rem' }}>
              {mediaAttachments.map((url, index) => (
                <img key={index} src={url} alt={`Attachment ${index + 1}`} loading="lazy" decoding="async" style={{ width: '100%', marginBottom: '10px' }} />
              ))}
            </div>
          )}

          {POST_IMAGES_ENABLED && previewCards.slice(0, 1).map((card, index) =>
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
                  loading="lazy"
                  decoding="async"
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

        <Divider style={{ marginTop:'1rem', marginLeft: BODY_INDENT_PX }}/>
        <div style={{ paddingLeft: `${BODY_INDENT_PX}px`, paddingRight: '0' }}>
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
            {/* Annotate action hidden in local mode. The trigger button and the
                AnnotationModal below are not rendered; AnnotationModal import +
                handleAnnotation remain in place for when it is re-enabled.
            <InteractionControl
              icon={<IconNote size={20} />}
              ariaLabel="Annotate"
              onClick={handleAnnotation}
            /> */}
            <InteractionControl
              icon={<IconShare size={20} />}
              ariaLabel="Share post"
              onClick={handleShare}
            />
          </Group>
        </div>
      </Paper>
      <Modal
        opened={deleteModalOpen}
        onClose={() => { if (!isDeleting) setDeleteModalOpen(false); }}
        title="Delete post?"
        centered
        size="sm"
        closeOnClickOutside={!isDeleting}
        closeOnEscape={!isDeleting}
        withCloseButton={!isDeleting}
      >
        <Text size="sm" c="dimmed">
          This permanently removes the post. This action can’t be undone.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button color="red" leftSection={<IconTrash size={16} />} loading={isDeleting} onClick={handleDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
      {/* AnnotationModal hidden in local mode (see hidden Annotate trigger above).
      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={id}
      /> */}
    </div>
  );
}

// Skip re-rendering a post when only `activePostId` changed but THIS post's own
// active state didn't flip (Post uses activePostId solely to derive isActive).
// Any other prop change still re-renders via shallow compare, so no stale UI.
// On the feed this stops every mounted post re-rendering on each scroll-focus
// change — only the two posts whose active state actually flips re-render.
function postPropsEqual(prev: PostProps, next: PostProps): boolean {
  if ((prev.activePostId === prev.id) !== (next.activePostId === next.id)) return false;
  const keys = Object.keys(next) as (keyof PostProps)[];
  if (keys.length !== Object.keys(prev).length) return false;
  for (const k of keys) {
    if (k === "activePostId") continue;
    if (prev[k] !== next[k]) return false;
  }
  return true;
}

export default React.memo(Post, postPropsEqual);
