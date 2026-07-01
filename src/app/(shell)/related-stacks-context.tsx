"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type RelatedStacksArray = any[];

/** Real-time writing feedback for the post composer (POST /posts/feedback). */
export type ComposerFeedbackData = {
  loading: boolean;
  advice?: string;
  praise?: string;
  simulatedReplies?: { id?: string; content: string }[];
};

type RelatedStacksContextValue = {
  relatedStacks: RelatedStacksArray;
  activePostId: string | null;
  previousPostId: string | null;
  setFromPost: (
    stacks: RelatedStacksArray,
    postId: string,
    options?: { force?: boolean; highlightPostId?: string | null }
  ) => void;
  showUpdate: boolean;
  clear: () => void;
  /** A related-post id to pin + emphasise in the aside (from a shared "pairing" link). */
  highlightPostId: string | null;
  setHighlightPostId: (postId: string | null) => void;
  /** Composer writing-feedback shown in the aside while drafting a post (null = none). */
  composerFeedback: ComposerFeedbackData | null;
  setComposerFeedback: (feedback: ComposerFeedbackData | null) => void;
};

const RelatedStacksContext = createContext<RelatedStacksContextValue | null>(null);

export function RelatedStacksProvider({ children }: { children: React.ReactNode }) {
  const [relatedStacks, setRelatedStacks] = useState<RelatedStacksArray>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [previousPostId, setPreviousPostId] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [composerFeedback, setComposerFeedback] = useState<ComposerFeedbackData | null>(null);

  // Mirrors of committed state, updated synchronously in every update path below.
  // They let setFromPost make a joint toggle decision across both atoms from
  // committed values, so two calls in one tick don't race on a stale render closure.
  const activePostIdRef = useRef<string | null>(activePostId);
  const relatedStacksRef = useRef<RelatedStacksArray>(relatedStacks);

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
    apply(null, [], null);
  }, [apply]);

  const setFromPost = useCallback(
    (
      stacks: RelatedStacksArray,
      postId: string,
      options?: { force?: boolean; highlightPostId?: string | null }
    ) => {
      const nextStacks = Array.isArray(stacks) ? stacks : [];
      const nextHighlight = options?.highlightPostId ?? null;

      if (options?.force) {
        // Skip no-op updates so the aside doesn't re-render (and replay framer-motion)
        // on every scroll tick. Read committed state via the ref mirror. A shared-pairing
        // highlight still needs to apply even when the post is already active, so don't
        // early-return when there's a highlight to set.
        if (postId === activePostIdRef.current && !nextHighlight) return;
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
      previousPostId,
      setFromPost,
      showUpdate: activePostId !== previousPostId,
      clear,
      highlightPostId,
      setHighlightPostId,
      composerFeedback,
      setComposerFeedback,
    }),
    [relatedStacks, activePostId, previousPostId, setFromPost, clear, highlightPostId, composerFeedback]
  );

  return <RelatedStacksContext.Provider value={value}>{children}</RelatedStacksContext.Provider>;
}

export function useRelatedStacks() {
  const ctx = useContext(RelatedStacksContext);
  if (!ctx) throw new Error("useRelatedStacks must be used within RelatedStacksProvider");
  return ctx;
}


