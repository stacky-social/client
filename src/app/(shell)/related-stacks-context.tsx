"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type RelatedStacksArray = any[];

type RelatedStacksContextValue = {
  relatedStacks: RelatedStacksArray;
  activePostId: string | null;
  previousPostId: string | null;
  setFromPost: (stacks: RelatedStacksArray, postId: string, options?: { force?: boolean }) => void;
  showUpdate: boolean;
  clear: () => void;
};

const RelatedStacksContext = createContext<RelatedStacksContextValue | null>(null);

export function RelatedStacksProvider({ children }: { children: React.ReactNode }) {
  const [relatedStacks, setRelatedStacks] = useState<RelatedStacksArray>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [previousPostId, setPreviousPostId] = useState<string | null>(null);

  // Mirrors of committed state, updated synchronously in every update path below.
  // They let setFromPost make a joint toggle decision across both atoms from
  // committed values, so two calls in one tick don't race on a stale render closure.
  const activePostIdRef = useRef<string | null>(activePostId);
  const relatedStacksRef = useRef<RelatedStacksArray>(relatedStacks);

  const apply = useCallback((nextActive: string | null, nextStacks: RelatedStacksArray) => {
    setPreviousPostId(activePostIdRef.current);
    activePostIdRef.current = nextActive;
    relatedStacksRef.current = nextStacks;
    setActivePostId(nextActive);
    setRelatedStacks(nextStacks);
  }, []);

  const clear = useCallback(() => {
    apply(null, []);
  }, [apply]);

  const setFromPost = useCallback(
    (stacks: RelatedStacksArray, postId: string, options?: { force?: boolean }) => {
      const nextStacks = Array.isArray(stacks) ? stacks : [];

      if (options?.force) {
        // Skip no-op updates so the aside doesn't re-render (and replay framer-motion)
        // on every scroll tick. Read committed state via the ref mirror.
        if (postId === activePostIdRef.current) return;
        apply(postId, nextStacks);
        return;
      }

      // Toggle behavior: if the same post is already active and showing stacks, hide them.
      // Decision is made from committed-state refs, not render-closure values.
      if (postId === activePostIdRef.current && relatedStacksRef.current.length > 0) {
        apply(null, []);
        return;
      }

      apply(postId, nextStacks);
    },
    [apply]
  );

  const value = useMemo(
    () => ({
      relatedStacks,
      activePostId,
      previousPostId,
      setFromPost,
      showUpdate: activePostId !== previousPostId,
      clear,
    }),
    [relatedStacks, activePostId, previousPostId, setFromPost, clear]
  );

  return <RelatedStacksContext.Provider value={value}>{children}</RelatedStacksContext.Provider>;
}

export function useRelatedStacks() {
  const ctx = useContext(RelatedStacksContext);
  if (!ctx) throw new Error("useRelatedStacks must be used within RelatedStacksProvider");
  return ctx;
}


