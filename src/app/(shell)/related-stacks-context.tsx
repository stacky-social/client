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
  const previousPostIdRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    setActivePostId(prev => { previousPostIdRef.current = prev; return null; });
    setRelatedStacks([]);
  }, []);

  const setFromPost = (stacks: RelatedStacksArray, postId: string, options?: { force?: boolean }) => {
    if (options?.force) {
      // Skip no-op updates so the aside doesn't re-render (and replay framer-motion) on every scroll tick
      if (postId === activePostId) return;
      previousPostIdRef.current = activePostId;
      setRelatedStacks(Array.isArray(stacks) ? stacks : []);
      setActivePostId(postId);
      return;
    }
    // Toggle behavior: if the same post is already active and showing stacks, hide them
    if (postId === activePostId && relatedStacks && relatedStacks.length > 0) {
      previousPostIdRef.current = activePostId;
      setRelatedStacks([]);
      setActivePostId(null);
      return;
    }

    previousPostIdRef.current = activePostId;
    setRelatedStacks(Array.isArray(stacks) ? stacks : []);
    setActivePostId(postId);
  };

  const value = useMemo(
    () => ({
      relatedStacks,
      activePostId,
      previousPostId: previousPostIdRef.current,
      setFromPost,
      showUpdate: activePostId !== previousPostIdRef.current,
      clear,
    }),
    [relatedStacks, activePostId, clear]
  );

  return <RelatedStacksContext.Provider value={value}>{children}</RelatedStacksContext.Provider>;
}

export function useRelatedStacks() {
  const ctx = useContext(RelatedStacksContext);
  if (!ctx) throw new Error("useRelatedStacks must be used within RelatedStacksProvider");
  return ctx;
}


