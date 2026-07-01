"use client";

import { useEffect } from "react";
import { useRelatedStacks } from "../related-stacks-context";

// Routes without a focused post (home, search, bookmarks, …) get no aside.
// Clearing also drops any stale focus carried over from a listy route.
export default function DefaultAside() {
  const { clear } = useRelatedStacks();
  useEffect(() => { clear(); }, [clear]);
  return null;
}
