"use client";

import { usePathname } from "next/navigation";
import RelatedStacks from "../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../related-stacks-context";
import { triggerNavigate } from "../../../../utils/highlightStore";

export default function ListyInjectionAside() {
  const pathname = usePathname();
  const { relatedStacks, activePostId, showUpdate } = useRelatedStacks();

  // Parallel-route slots are RETAINED across soft navigation: when you go from
  // /ChineseEVs to a focus-less route (home, search, …), Next.js keeps this
  // slot mounted instead of swapping in @aside/default (which clears). Guard on
  // the live pathname so the aside only renders on listy routes and never leaks a
  // previous post's related responses onto another page. The shared context is
  // left intact (the post-detail route renders related inline from it).
  if (
    !pathname
    || (!pathname.startsWith("/ChineseEVs") && !pathname.startsWith("/AIWorkforce") && !pathname.startsWith("/tag/AIWorkforce"))
  ) return null;

  // No focus post selected — aside has nothing to anchor against.
  if (!activePostId) return null;

  // Focus post exists but no related stacks — keep the panel visible so the
  // user knows their selection registered. Dropping the aside entirely makes
  // it look like the click was lost (study-session crash).
  if (!relatedStacks || relatedStacks.length === 0) {
    return (
      <div
        style={{ width: "100%", paddingTop: "0.5rem" }}
        data-related-focus-post-id={activePostId}
        role="status"
        aria-live="polite"
      >
        <div style={{ padding: "1rem 0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Related Posts
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
            No related posts found for this thread yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }} data-related-focus-post-id={activePostId}>
      <RelatedStacks
        relatedStacks={relatedStacks}
        cardWidth="100%"
        onStackClick={() => {}}
        showupdate={showUpdate}
        mode="aside-only"
        onPostNavigate={(postId) => triggerNavigate(postId)}
      />
    </div>
  );
}
