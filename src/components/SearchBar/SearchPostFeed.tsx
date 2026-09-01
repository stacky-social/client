"use client";

import { Box } from "@mantine/core";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import type { PostType } from "../../types/PostType";
import {
  onFeedFocusScroll,
  selectStableFeedFocus,
  type FeedFocusCandidate,
} from "../../utils/stableFeedFocus";
import {
  restoreFeedScrollSnapshot,
  saveFeedScrollSnapshot,
} from "../../utils/feedScrollRestoration";
import Post from "../Posts/Post";
import { TOP_NAV_HEIGHT } from "../NavBar/TopNav";
import { postRouteFor } from "../../utils/postRoute";
import { curatedSearchTerms } from "../../utils/curatedSearchCore.mjs";

export type SearchFeedPost = PostType & { origin: "curated" };

const SCREEN_READER_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Search is a reading surface, not a list of navigation shortcuts. It uses the
 * same full post card and stable scroll-to-focus contract as Home so a person
 * can read every text match in place while the related pane follows along.
 */
export default function SearchPostFeed({
  posts,
  query,
  surfaceKey: surfaceKeyProp,
  scrollRequest,
}: {
  posts: SearchFeedPost[];
  query: string;
  surfaceKey?: string;
  scrollRequest?: number;
}) {
  const router = useRouter();
  const { enterFeedSurface, leaveFeedSurface, setFromPost } = useRelatedStacks();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const postsRef = useRef(posts);
  const activePostIdRef = useRef(activePostId);
  const manualPostIdRef = useRef<string | null>(null);
  const manualLockRef = useRef(false);
  const restoredScrollRef = useRef(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const highlightName = `curated-search-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const searchTerms = useMemo(() => curatedSearchTerms(query), [query]);
  const surfaceKey = useMemo(
    () => `search:${(surfaceKeyProp ?? query).trim().toLowerCase()}`,
    [query, surfaceKeyProp],
  );

  postsRef.current = posts;
  activePostIdRef.current = activePostId;

  const publish = useCallback((post: SearchFeedPost) => {
    activePostIdRef.current = post.postId;
    setActivePostId(post.postId);
    setFromPost(post.relatedStacks ?? [], post.postId, {
      force: true,
      surfaceKey,
    });
  }, [setFromPost, surfaceKey]);

  useEffect(() => {
    enterFeedSurface(surfaceKey);
    restoredScrollRef.current = false;
    manualPostIdRef.current = null;
    manualLockRef.current = false;
    setActivePostId(null);
    return () => leaveFeedSurface(surfaceKey);
  }, [enterFeedSurface, leaveFeedSurface, surfaceKey]);

  useEffect(() => {
    if (posts.length === 0 || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    return restoreFeedScrollSnapshot();
  }, [posts.length, surfaceKey]);

  // A submitted/refined search lands on its first post instead of leaving the
  // participant above the result feed. Restored search sessions do not pass a
  // new request, so their prior reading position remains eligible for restore.
  useEffect(() => {
    if (!scrollRequest || posts.length === 0) return;
    const frame = requestAnimationFrame(() => {
      feedRef.current
        ?.querySelector<HTMLElement>("[data-search-feed-post]")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [posts, scrollRequest, surfaceKey]);

  // Use the browser's Custom Highlight API so search marks can coexist with
  // CrossWeave's relation <mark> elements without nesting or changing their
  // offset geometry. A MutationObserver refreshes ranges when a Post swaps its
  // dangerously-set HTML during focus/expand interactions.
  useEffect(() => {
    const root = feedRef.current;
    const registry = (CSS as unknown as {
      highlights?: { set(name: string, value: unknown): void; delete(name: string): void };
    }).highlights;
    const HighlightConstructor = (window as unknown as {
      Highlight?: new (...ranges: Range[]) => unknown;
    }).Highlight;
    if (!root || !registry || !HighlightConstructor || searchTerms.length === 0) return;

    let frame = 0;
    const rebuild = () => {
      const ranges: Range[] = [];
      root.querySelectorAll<HTMLElement>("[data-search-feed-post]").forEach((card) => {
        let cardMatches = 0;
        const textRoot = card.querySelector<HTMLElement>(".post-text-clamp-shell");
        if (!textRoot) return;
        const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const value = node.nodeValue ?? "";
          const normalized = value.toLocaleLowerCase();
          for (const term of searchTerms) {
            let start = 0;
            while (start < normalized.length) {
              const index = normalized.indexOf(term, start);
              if (index < 0) break;
              const range = document.createRange();
              range.setStart(node, index);
              range.setEnd(node, index + term.length);
              ranges.push(range);
              cardMatches += 1;
              start = index + Math.max(1, term.length);
            }
          }
          node = walker.nextNode();
        }
        card.dataset.searchMatchCount = String(cardMatches);
      });
      registry.set(highlightName, new HighlightConstructor(...ranges));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(rebuild);
    };
    rebuild();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      registry.delete(highlightName);
    };
  }, [highlightName, posts, searchTerms]);

  useEffect(() => {
    if (posts.length === 0) return;

    const evaluate = () => {
      if (manualLockRef.current && manualPostIdRef.current) {
        const selected = document.querySelector<HTMLElement>(
          `[data-search-feed-post="${CSS.escape(manualPostIdRef.current)}"]`,
        );
        if (selected) {
          const rect = selected.getBoundingClientRect();
          if (rect.bottom > TOP_NAV_HEIGHT && rect.top < window.innerHeight) return;
        }
        manualLockRef.current = false;
      }

      const byId = new Map(postsRef.current.map((post) => [post.postId, post]));
      const candidates: Array<FeedFocusCandidate<SearchFeedPost>> = [];
      document.querySelectorAll<HTMLElement>("[data-search-feed-post]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= TOP_NAV_HEIGHT || rect.top >= window.innerHeight) return;
        const id = element.dataset.searchFeedPost;
        const post = id ? byId.get(id) : undefined;
        if (id && post) candidates.push({ id, value: post, rect });
      });

      const selected = selectStableFeedFocus({
        candidates,
        currentId: activePostIdRef.current,
        viewportTop: TOP_NAV_HEIGHT,
        viewportHeight: window.innerHeight,
        mode: "center",
        atTop: window.scrollY <= 2,
        atBottom:
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2,
      });
      if (selected && selected.id !== activePostIdRef.current) publish(selected.value);
    };

    // Do not eagerly claim the first result merely because it happens to fit
    // below the discovery summary. Search starts with an intentionally blank
    // related pane; a real scroll gesture (or explicit post action) selects it.
    const stopListening = onFeedFocusScroll(evaluate);
    return () => {
      stopListening();
    };
  }, [posts.length, publish]);

  // Relation metadata arrives after the Mastodon search results. Republish a
  // newly hydrated payload without changing focus or replaying panel motion.
  useEffect(() => {
    if (!activePostId) return;
    const active = posts.find((post) => post.postId === activePostId);
    if (active) {
      setFromPost(active.relatedStacks ?? [], active.postId, {
        force: true,
        surfaceKey,
      });
    }
  }, [activePostId, posts, setFromPost, surfaceKey]);

  const activateManually = useCallback((id: string | null) => {
    manualPostIdRef.current = id;
    manualLockRef.current = Boolean(id);
    setActivePostId(id);
    if (!id) return;
    const post = postsRef.current.find((candidate) => candidate.postId === id);
    if (post) publish(post);
  }, [publish]);

  const handleStackIconClick = useCallback((
    _relatedStacks: any[],
    postId: string,
    _position: { top: number; height: number },
  ) => {
    const post = postsRef.current.find((candidate) => candidate.postId === postId);
    if (post) publish(post);
  }, [publish]);

  return (
    <Box
      ref={feedRef}
      data-testid="search-post-feed"
      data-search-highlight={highlightName}
      role="region"
      aria-label={`${posts.length} curated post results for “${query}”. Matching terms are highlighted.`}
      style={{
        width: "100%",
        position: "relative",
        // Keep enough reading runway for even a single result to align below
        // the sticky nav when a search is submitted. This also lets the final
        // card in a longer result set become the stable feed focus.
        paddingBottom: posts.length > 0 ? "calc(100vh - 160px)" : undefined,
      }}
    >
      <style>{`::highlight(${highlightName}) { background: rgba(255, 214, 102, 0.72); color: inherit; }`}</style>
      {posts.map((post) => (
        <div
          key={`${post.origin}:${post.postId}`}
          data-post-id={post.postId}
          data-search-feed-post={post.postId}
          data-search-origin={post.origin}
          style={{ scrollMarginTop: TOP_NAV_HEIGHT + 14 }}
        >
          <span style={SCREEN_READER_ONLY}>
            Search result. Matching terms highlighted: {searchTerms.join(", ")}.
          </span>
          <Post
            id={post.postId}
            text={post.text}
            author={post.author}
            account={post.account}
            accountId={post.accountId}
            authorStats={post.authorStats}
            avatar={post.avatar}
            repliesCount={post.replies_count}
            createdAt={post.createdAt}
            stackCount={post.stackCount}
            favouritesCount={post.favouritesCount}
            favourited={post.favourited}
            bookmarked={post.bookmarked}
            mediaAttachments={post.mediaAttachments}
            onStackIconClick={handleStackIconClick}
            setIsModalOpen={() => {}}
            setIsExpandModalOpen={() => {}}
            relatedStacks={post.relatedStacks}
            activePostId={activePostId}
            setActivePostId={activateManually}
            initialCard={post.previewCard ?? null}
            quotedPost={post.quotedPost ?? null}
            focusRelations={post.focusRelations}
            replyingToAccount={post.replyingToAccount}
            relatedCountForSpans={(ranges) =>
              (post.relatedStacks ?? []).filter((stack: any) =>
                (stack?.topPost?.relations ?? []).some((relation: any) =>
                  ranges.some((range) =>
                    relation.focusStart < range.fe && range.fs < relation.focusEnd
                  ),
                ),
              ).length
            }
            onNavigate={(postId) => {
              const route = postRouteFor(postId);
              sessionStorage.setItem(`previousPath:${route}`, window.location.pathname + window.location.search);
              saveFeedScrollSnapshot();
              router.push(route);
            }}
          />
        </div>
      ))}
    </Box>
  );
}
