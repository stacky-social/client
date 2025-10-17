"use client";

import React, { createContext, useContext, useMemo, useRef, useState } from "react";

type RelatedStacksArray = any[];

type RelatedStacksContextValue = {
  relatedStacks: RelatedStacksArray;
  activePostId: string | null;
  previousPostId: string | null;
  setFromPost: (stacks: RelatedStacksArray, postId: string) => void;
  showUpdate: boolean;
};

const RelatedStacksContext = createContext<RelatedStacksContextValue | null>(null);

export function RelatedStacksProvider({ children }: { children: React.ReactNode }) {
  const [relatedStacks, setRelatedStacks] = useState<RelatedStacksArray>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const previousPostIdRef = useRef<string | null>(null);

  const setFromPost = (stacks: RelatedStacksArray, postId: string) => {
    previousPostIdRef.current = activePostId;
    setRelatedStacks(Array.isArray(stacks) ? [...stacks] : []);
    setActivePostId(postId);
  };

  const value = useMemo(
    () => ({
      relatedStacks,
      activePostId,
      previousPostId: previousPostIdRef.current,
      setFromPost,
      showUpdate: activePostId !== previousPostIdRef.current,
    }),
    [relatedStacks, activePostId]
  );

  return <RelatedStacksContext.Provider value={value}>{children}</RelatedStacksContext.Provider>;
}

export function useRelatedStacks() {
  const ctx = useContext(RelatedStacksContext);
  if (!ctx) throw new Error("useRelatedStacks must be used within RelatedStacksProvider");
  return ctx;
}


