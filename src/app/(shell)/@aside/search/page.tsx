"use client";

import { usePathname, useRouter } from "next/navigation";
import RelatedStacks from "../../../../components/RelatedStacks";
import { getPost } from "../../../../utils/localStore";
import { useRelatedStacks } from "../../related-stacks-context";

export default function SearchAside() {
  const pathname = usePathname();
  const router = useRouter();
  const { activePostId, relatedStacks, showUpdate } = useRelatedStacks();

  if (pathname !== "/search" || !activePostId) return null;

  if (!relatedStacks?.length) {
    return (
      <div
        data-testid="search-related-empty"
        data-related-focus-post-id={activePostId}
        role="status"
        aria-live="polite"
        style={{ width: "100%", padding: "1.5rem 0" }}
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
    <div style={{ width: "100%" }} data-related-focus-post-id={activePostId}>
      <RelatedStacks
        relatedStacks={relatedStacks}
        cardWidth="100%"
        onStackClick={() => {}}
        showupdate={showUpdate}
        sourcePostId={activePostId}
        expandGroups
        onPostNavigate={(postId) => {
          const route = getPost(postId) ? `/ChineseEVs/posts/${postId}` : `/posts/${postId}`;
          sessionStorage.setItem(`previousPath:${route}`, window.location.pathname + window.location.search);
          router.push(route);
        }}
      />
    </div>
  );
}
