"use client";

import { useParams, useRouter } from "next/navigation";
import RelatedStacks from "../../../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../../../related-stacks-context";
import { navigateFromPanelScope } from "../../../../../../utils/highlightStore";

export default function MockPostAside() {
  const { relatedStacks, showUpdate, highlightPostId } = useRelatedStacks();
  const params = useParams();
  const router = useRouter();
  const focusPostId = typeof params?.id === "string" ? params.id : undefined;

  if (!relatedStacks || relatedStacks.length === 0) return null;

  // Override the default /posts/[id] navigation so we stay on the mock-backed route.
  // Manually attaches ?from= to preserve the back-link source.
  const onPostNavigate = (postId: string) => {
    const params = new URLSearchParams();
    if (focusPostId) params.set("from", focusPostId);
    const search = params.toString();
    const url = `/ChineseEVs/posts/${postId}${search ? "?" + search : ""}`;
    sessionStorage.setItem(`previousPath:/ChineseEVs/posts/${postId}`, window.location.pathname + window.location.search);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    // WS6: collapse any active undo sentinel on the way out (replace OVER it when
    // it is the current entry, else push) so Back returns here cleanly.
    navigateFromPanelScope(url, router);
  };

  return (
    <div style={{ width: "100%" }}>
      <RelatedStacks
        relatedStacks={relatedStacks}
        cardWidth={"100%"}
        onStackClick={() => {}}
        showupdate={showUpdate}
        mode="detail-cross-pane"
        sourcePostId={focusPostId}
        highlightPostId={highlightPostId}
        onPostNavigate={onPostNavigate}
      />
    </div>
  );
}
