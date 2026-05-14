"use client";

import RelatedStacks from "../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../related-stacks-context";
import { triggerNavigate } from "../../../../utils/highlightStore";

export default function ListyInjectionAside() {
  const { relatedStacks, activePostId, showUpdate } = useRelatedStacks();

  // No focus post selected — aside has nothing to anchor against.
  if (!activePostId) return null;

  // Focus post exists but no related stacks — keep the panel visible so the
  // user knows their selection registered. Dropping the aside entirely makes
  // it look like the click was lost (study-session crash).
  if (!relatedStacks || relatedStacks.length === 0) {
    return (
      <div
        style={{ width: "100%", paddingTop: "0.5rem" }}
        role="status"
        aria-live="polite"
      >
        <div style={{ padding: "1rem 0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Related responses
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
            No related posts found for this thread yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", paddingTop: "0.5rem" }}>
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
