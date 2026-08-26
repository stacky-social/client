import { demoRouteForPost } from "../data/demoCorpora";
import { getPost } from "./localStore";

/** Canonical detail route for corpus, local-only, and live Mastodon posts. */
export function postRouteFor(postId: string): string {
  const demoRoute = demoRouteForPost(postId);
  if (demoRoute) return demoRoute;
  // User-created local posts are not part of a corpus registry. Keep the
  // existing local detail surface as their fallback; unknown ids are live.
  return getPost(postId) ? `/ChineseEVs/posts/${encodeURIComponent(postId)}` : `/posts/${encodeURIComponent(postId)}`;
}
