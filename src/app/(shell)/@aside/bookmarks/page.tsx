"use client";

import { usePathname } from "next/navigation";
import RelatedStacks from "../../../../components/RelatedStacks";
import { ComposerFeedback } from "../../../../components/SubmitPost/ComposerFeedback";
import { useRelatedStacks } from "../../related-stacks-context";
import { triggerNavigate } from "../../../../utils/highlightStore";

export default function BookmarksAside() {
  const pathname = usePathname();
  const { relatedStacks, activePostId, showUpdate, composerFeedback } =
    useRelatedStacks();

  // Parallel-route slots are RETAINED across soft navigation: Next.js keeps this
  // slot mounted instead of swapping in @aside/default when leaving /bookmarks.
  // Guard on the live pathname so the aside only renders on this route and never
  // leaks a previous post's related responses (or composer feedback) elsewhere.
  if (!pathname || !pathname.startsWith("/bookmarks")) return null;

  // PRIORITY 1 — composing: writing feedback takes over the aside while drafting.
  if (composerFeedback) {
    return (
      <div style={{ width: "100%" }}>
        <ComposerFeedback feedback={composerFeedback} />
      </div>
    );
  }

  // PRIORITY 2 — active post: show its related panel, or a graceful empty state
  // (your own posts, for example, have no related responses).
  if (activePostId) {
    if (relatedStacks && relatedStacks.length > 0) {
      return (
        <div style={{ width: "100%" }}>
          <RelatedStacks
            relatedStacks={relatedStacks}
            cardWidth="100%"
            onStackClick={() => {}}
            showupdate={showUpdate}
            onPostNavigate={(postId) => triggerNavigate(postId)}
          />
        </div>
      );
    }
    return (
      <div style={{ width: "100%", paddingTop: "0.5rem" }} role="status" aria-live="polite">
        <div style={{ padding: "1rem 0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Related responses
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
            No related responses for this post.
          </div>
        </div>
      </div>
    );
  }

  return null;
}
