"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import RelatedStacks from "../../../../../components/RelatedStacks";
import { postRouteFor } from "../../../../../utils/postRoute";
import { useRelatedStacks } from "../../../related-stacks-context";
import { saveFeedScrollSnapshot } from "../../../../../utils/feedScrollRestoration";

/** Related-post pane for a live Mastodon status detail route. */
export default function LivePostAside() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { activePostId, relatedStacks, showUpdate, highlightPostId } = useRelatedStacks();
  const focusPostId = typeof params?.id === "string" ? params.id : undefined;

  // Parallel slots survive soft navigation. Never let this route's pane leak
  // onto another surface, and key the empty state to the URL while metadata is
  // loading rather than to a stale selection from the previous feed.
  if (!pathname?.startsWith("/posts/") || !focusPostId) return null;
  const panePostId = activePostId === focusPostId ? activePostId : focusPostId;

  if (!relatedStacks?.length || activePostId !== focusPostId) {
    return (
      <div
        style={{ width: "100%", padding: "1.5rem 0" }}
        data-related-focus-post-id={panePostId}
        data-testid="detail-related-empty"
        role="status"
        aria-live="polite"
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
          Related Posts
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
          No related posts yet.
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }} data-related-focus-post-id={focusPostId}>
      <RelatedStacks
        relatedStacks={relatedStacks}
        cardWidth="100%"
        onStackClick={() => {}}
        showupdate={showUpdate}
        mode="detail-cross-pane"
        sourcePostId={focusPostId}
        highlightPostId={highlightPostId}
        onPostNavigate={(postId) => {
          const route = postRouteFor(postId);
          sessionStorage.setItem(`previousPath:${route}`, window.location.pathname + window.location.search);
          saveFeedScrollSnapshot();
          router.push(route);
        }}
      />
    </div>
  );
}
