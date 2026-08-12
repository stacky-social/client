"use client";

import { usePathname, useRouter } from "next/navigation";
import RelatedStacks from "../../../../components/RelatedStacks";
import { ComposerFeedback } from "../../../../components/SubmitPost/ComposerFeedback";
import { useRelatedStacks } from "../../related-stacks-context";
import { getPost } from "../../../../utils/localStore";

export default function HomeAside() {
  const pathname = usePathname();
  const router = useRouter();
  const { relatedStacks, activePostId, showUpdate, composerFeedback } =
    useRelatedStacks();

  // Parallel-route slots are RETAINED across soft navigation: Next.js keeps this
  // slot mounted instead of swapping in @aside/default when leaving /home. Guard
  // on the live pathname so the aside only renders on this route and never leaks
  // a previous post's related responses (or composer feedback) onto another page.
  if (!pathname || !pathname.startsWith("/home")) return null;

  // PRIORITY 1 — composing: writing feedback takes over the aside while drafting.
  if (composerFeedback) {
    return (
      <div style={{ width: "100%" }}>
        <ComposerFeedback feedback={composerFeedback} />
      </div>
    );
  }

  // PRIORITY 2 — active post: show its related panel when the payload contains
  // responses. Posts with no relations keep the column geometrically stable but
  // intentionally render no message, card, or invented fallback content.
  if (activePostId) {
    if (relatedStacks && relatedStacks.length > 0) {
      return (
        <div style={{ width: "100%" }} data-related-focus-post-id={activePostId}>
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
              const route = getPost(postId) ? `/ChineseEVs/posts/${postId}` : `/posts/${postId}`;
              sessionStorage.setItem(`previousPath:${route}`, pathname);
              router.push(route);
            }}
          />
        </div>
      );
    }
    return <div data-testid="home-related-empty" data-related-focus-post-id={activePostId} aria-hidden="true" style={{ width: "100%", minHeight: 1 }} />;
  }

  // A blank mount keeps the Home feed width stable before the first post is
  // selected; otherwise the shell would jump from one column to two on load.
  return <div data-testid="home-related-empty" aria-hidden="true" style={{ width: "100%", minHeight: 1 }} />;
}
