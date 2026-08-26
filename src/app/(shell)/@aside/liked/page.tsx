"use client";

import { usePathname, useRouter } from "next/navigation";
import RelatedStacks from "../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../related-stacks-context";
import { postRouteFor } from "../../../../utils/postRoute";

export default function LikedAside() {
  const pathname = usePathname();
  const router = useRouter();
  const { relatedStacks, activePostId, showUpdate } =
    useRelatedStacks();

  // Parallel-route slots are RETAINED across soft navigation: Next.js keeps this
  // slot mounted instead of swapping in @aside/default when leaving /liked. Guard
  // on the live pathname so the aside only renders on this route and never leaks a
  // previous post's related responses onto another page.
  if (!pathname || !pathname.startsWith("/liked")) return null;

  // Active post: show its related panel, or a graceful empty state
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
            sourcePostId={activePostId ?? undefined}
            expandGroups
            // No feed on this route registers a navigate callback, so
            // triggerNavigate would silently no-op (F-17) — route directly
            // to the demo detail page instead. Seed previousPath so the
            // detail page's Back button renders and returns here.
            onPostNavigate={(postId) => {
              const route = postRouteFor(postId);
              sessionStorage.setItem(`previousPath:${route}`, pathname);
              router.push(route);
            }}
          />
        </div>
      );
    }
    return (
      <div style={{ width: "100%", paddingTop: "0.5rem" }} role="status" aria-live="polite">
        <div style={{ padding: "1rem 0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Related Posts
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
