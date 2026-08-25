"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type RelatedStacksArray = any[];

type RelatedStacksContextValue = {
  relatedStacks: RelatedStacksArray;
  activePostId: string | null;
  /** Feed surface that owns the active post, used to prevent stale route panes. */
  activeSurfaceKey: string | null;
  previousPostId: string | null;
  setFromPost: (
    stacks: RelatedStacksArray,
    postId: string,
    options?: { force?: boolean; highlightPostId?: string | null; surfaceKey?: string }
  ) => void;
  /** Enter a feed surface, clearing context retained from another route once. */
  enterFeedSurface: (surfaceKey: string) => void;
  /** Clear a feed only when it still owns the related pane. */
  leaveFeedSurface: (surfaceKey: string) => void;
  showUpdate: boolean;
  clear: () => void;
  /** A related-post id to pin + emphasise in the aside (from a shared "pairing" link). */
  highlightPostId: string | null;
  setHighlightPostId: (postId: string | null) => void;
};

const RelatedStacksContext = createContext<RelatedStacksContextValue | null>(null);

export function RelatedStacksProvider({ children }: { children: React.ReactNode }) {
  const [relatedStacks, setRelatedStacks] = useState<RelatedStacksArray>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [activeSurfaceKey, setActiveSurfaceKey] = useState<string | null>(null);
  const [previousPostId, setPreviousPostId] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);

  // Mirrors of committed state, updated synchronously in every update path below.
  // They let setFromPost make a joint toggle decision across both atoms from
  // committed values, so two calls in one tick don't race on a stale render closure.
  const activePostIdRef = useRef<string | null>(activePostId);
  const relatedStacksRef = useRef<RelatedStacksArray>(relatedStacks);
  const feedSurfaceKeyRef = useRef<string | null>(null);

  const apply = useCallback(
    (nextActive: string | null, nextStacks: RelatedStacksArray, nextHighlight: string | null = null) => {
      setPreviousPostId(activePostIdRef.current);
      activePostIdRef.current = nextActive;
      relatedStacksRef.current = nextStacks;
      setActivePostId(nextActive);
      setRelatedStacks(nextStacks);
      setHighlightPostId(nextHighlight);
    },
    []
  );

  const clear = useCallback(() => {
    feedSurfaceKeyRef.current = null;
    setActiveSurfaceKey(null);
    apply(null, [], null);
  }, [apply]);

  const enterFeedSurface = useCallback((surfaceKey: string) => {
    if (feedSurfaceKeyRef.current === surfaceKey) return;
    feedSurfaceKeyRef.current = surfaceKey;
    setActiveSurfaceKey(surfaceKey);
    apply(null, [], null);
  }, [apply]);

  const leaveFeedSurface = useCallback((surfaceKey: string) => {
    if (feedSurfaceKeyRef.current !== surfaceKey) return;
    feedSurfaceKeyRef.current = null;
    setActiveSurfaceKey(null);
    apply(null, [], null);
  }, [apply]);

  const setFromPost = useCallback(
    (
      stacks: RelatedStacksArray,
      postId: string,
      options?: { force?: boolean; highlightPostId?: string | null; surfaceKey?: string }
    ) => {
      // Draft retrieval temporarily owns the pane. Feed-center observers keep
      // firing while a writer scrolls the page; ignore those background claims
      // until the composer explicitly releases and restores its saved focus.
      if (
        feedSurfaceKeyRef.current?.startsWith("composer:")
        && options?.surfaceKey
        && !options.surfaceKey.startsWith("composer:")
      ) return;

      const nextStacks = Array.isArray(stacks) ? stacks : [];
      const nextHighlight = options?.highlightPostId ?? null;
      // Feed publishers claim their stable surface. Detail pages and other
      // publishers deliberately clear that claim, so returning to the same feed
      // after viewing a post still counts as a route transition. A feed's own
      // hydration/remount keeps the same key and therefore does not wipe the
      // focus it just published.
      feedSurfaceKeyRef.current = options?.surfaceKey ?? null;
      setActiveSurfaceKey(options?.surfaceKey ?? null);

      if (options?.force) {
        // Skip no-op updates so the aside doesn't re-render (and replay framer-motion)
        // on every scroll tick. Read committed state via the ref mirror. A scroll tick
        // resends the SAME memoized stacks array, so reference equality identifies it;
        // a re-seed with a different array (e.g. suppression toggling) must apply even
        // for the already-active post. A shared-pairing highlight also always applies.
        if (
          postId === activePostIdRef.current &&
          !nextHighlight &&
          nextStacks === relatedStacksRef.current
        ) return;
        apply(postId, nextStacks, nextHighlight);
        return;
      }

      // Toggle behavior: if the same post is already active and showing stacks, hide them.
      // Decision is made from committed-state refs, not render-closure values.
      if (postId === activePostIdRef.current && relatedStacksRef.current.length > 0) {
        apply(null, [], null);
        return;
      }

      apply(postId, nextStacks, nextHighlight);
    },
    [apply]
  );

  const value = useMemo(
    () => ({
      relatedStacks,
      activePostId,
      activeSurfaceKey,
      previousPostId,
      setFromPost,
      enterFeedSurface,
      leaveFeedSurface,
      showUpdate: activePostId !== previousPostId,
      clear,
      highlightPostId,
      setHighlightPostId,
    }),
    [relatedStacks, activePostId, activeSurfaceKey, previousPostId, setFromPost, enterFeedSurface, leaveFeedSurface, clear, highlightPostId]
  );

  return <RelatedStacksContext.Provider value={value}>{children}</RelatedStacksContext.Provider>;
}

export function useRelatedStacks() {
  const ctx = useContext(RelatedStacksContext);
  if (!ctx) throw new Error("useRelatedStacks must be used within RelatedStacksProvider");
  return ctx;
}
