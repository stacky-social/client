"use client";

import { Box } from "@mantine/core";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import type { PostType } from "../../types/PostType";
import {
  onStableWindowScroll,
  selectStableFeedFocus,
  type FeedFocusCandidate,
} from "../../utils/stableFeedFocus";
import Post from "../Posts/Post";

export type SearchFeedPost = PostType & { origin: "local" | "mastodon" };

/**
 * Search is a reading surface, not a list of navigation shortcuts. It uses the
 * same full post card and stable scroll-to-focus contract as Home so a person
 * can read every text match in place while the related pane follows along.
 */
export default function SearchPostFeed({
  posts,
  query,
}: {
  posts: SearchFeedPost[];
  query: string;
}) {
  const router = useRouter();
  const { enterFeedSurface, leaveFeedSurface, setFromPost } = useRelatedStacks();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const postsRef = useRef(posts);
  const activePostIdRef = useRef(activePostId);
  const manualPostIdRef = useRef<string | null>(null);
  const manualLockRef = useRef(false);
  const surfaceKey = useMemo(() => `search:${query.trim().toLowerCase()}`, [query]);

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
    manualPostIdRef.current = null;
    manualLockRef.current = false;
    setActivePostId(null);
    return () => leaveFeedSurface(surfaceKey);
  }, [enterFeedSurface, leaveFeedSurface, surfaceKey]);

  useEffect(() => {
    if (posts.length === 0) return;

    const evaluate = () => {
      if (manualLockRef.current && manualPostIdRef.current) {
        const selected = document.querySelector<HTMLElement>(
          `[data-search-feed-post="${CSS.escape(manualPostIdRef.current)}"]`,
        );
        if (selected) {
          const rect = selected.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < window.innerHeight) return;
        }
        manualLockRef.current = false;
      }

      const byId = new Map(postsRef.current.map((post) => [post.postId, post]));
      const candidates: Array<FeedFocusCandidate<SearchFeedPost>> = [];
      document.querySelectorAll<HTMLElement>("[data-search-feed-post]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
        const id = element.dataset.searchFeedPost;
        const post = id ? byId.get(id) : undefined;
        if (id && post) candidates.push({ id, value: post, rect });
      });

      const selected = selectStableFeedFocus({
        candidates,
        currentId: activePostIdRef.current,
        viewportHeight: window.innerHeight,
        mode: "center",
      });
      if (selected && selected.id !== activePostIdRef.current) publish(selected.value);
    };

    // Do not eagerly claim the first result merely because it happens to fit
    // below the discovery summary. Search starts with an intentionally blank
    // related pane; a real scroll gesture (or explicit post action) selects it.
    const stopListening = onStableWindowScroll(evaluate);
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
      data-testid="search-post-feed"
      style={{
        width: "100%",
        position: "relative",
        // A real multi-result feed needs enough runway for the final card to
        // become the focus. Unlike the removed detail-page spacer, this serves
        // an actual sequence of independently focusable posts.
        paddingBottom: posts.length > 1 ? "42vh" : undefined,
      }}
    >
      {posts.map((post) => (
        <div
          key={`${post.origin}:${post.postId}`}
          data-post-id={post.postId}
          data-search-feed-post={post.postId}
          data-search-origin={post.origin}
        >
          <Post
            id={post.postId}
            text={post.text}
            author={post.author}
            account={post.account}
            accountId={post.accountId}
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
              const route = post.origin === "mastodon"
                ? `/posts/${postId}`
                : `/ChineseEVs/posts/${postId}`;
              sessionStorage.setItem(`previousPath:${route}`, window.location.pathname + window.location.search);
              sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
              router.push(route);
            }}
          />
        </div>
      ))}
    </Box>
  );
}
