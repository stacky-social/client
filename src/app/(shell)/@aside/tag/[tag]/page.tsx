"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import RelatedStacks from "../../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../../related-stacks-context";
import { getPost } from "../../../../../utils/localStore";
import { triggerNavigate } from "../../../../../utils/highlightStore";
import { postRouteFor } from "../../../../../utils/postRoute";

export default function HashtagAside() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const tag = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const { relatedStacks, activePostId, showUpdate } = useRelatedStacks();

  if (!pathname?.startsWith("/tag/") || !activePostId || !relatedStacks?.length) return null;
  const normalizedTag = tag?.toLowerCase();
  const isLocalConversation = normalizedTag === "aiworkforce" || normalizedTag === "chineseevs";
  const usesModernRelatedUi = isLocalConversation || normalizedTag === "stackyinjection";

  return (
    <div style={{ width: "100%" }}>
      <RelatedStacks
        relatedStacks={relatedStacks}
        cardWidth="100%"
        onStackClick={() => {}}
        showupdate={showUpdate}
        sourcePostId={activePostId}
        mode={usesModernRelatedUi ? "aside-only" : undefined}
        expandGroups={normalizedTag === "stackyinjection"}
        onPostNavigate={(postId) => {
          if (isLocalConversation && getPost(postId)) {
            triggerNavigate(postId);
            return;
          }
          const route = postRouteFor(postId);
          sessionStorage.setItem(`previousPath:${route}`, pathname);
          router.push(route);
        }}
      />
    </div>
  );
}
