"use client";

import RelatedStacks from "../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../related-stacks-context";
import { triggerNavigate } from "../../../../utils/highlightStore";

export default function ListyInjectionAside() {
  const { relatedStacks, showUpdate } = useRelatedStacks();

  if (!relatedStacks || relatedStacks.length === 0) return null;

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
