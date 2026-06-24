"use client";

import { usePathname } from "next/navigation";
import RelatedStacks from "../../../../components/RelatedStacks";
import { ComposerFeedback } from "../../../../components/SubmitPost/ComposerFeedback";
import { useRelatedStacks } from "../../related-stacks-context";
import { triggerNavigate } from "../../../../utils/highlightStore";
import { FocusPostHeader } from "../FocusPostHeader";

export default function BookmarksAside() {
  const pathname = usePathname();
  const { relatedStacks, activePostId, showUpdate, composerFeedback, clear } =
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

  // PRIORITY 2 — active post: show the related-post panel for the focused post.
  if (activePostId && relatedStacks && relatedStacks.length > 0) {
    return (
      <div style={{ width: "100%" }}>
        <FocusPostHeader postId={activePostId} onClear={clear} />
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

  return null;
}
