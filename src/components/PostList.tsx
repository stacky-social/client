import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { LoadingOverlay, Button, Box, Paper, Text, Anchor } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Virtuoso } from 'react-virtuoso';
import { PostType } from '../types/PostType';
import Post from './Posts/Post';
import axios from 'axios';
import {
    MASTODON_INSTANCE_URL,
    MASTODON_STATUS_CREATED_EVENT,
    RELATED_POSTS_API_URL,
    type MastodonStatus,
} from '../utils/mastodonApi';
import { nextMaxIdFromLink } from '../utils/mastodonPagination.mjs';
import { weaveTimeline } from '../utils/weaveTimeline.mjs';
import { useExperimentFlags } from '../utils/experimentFlags';
import {
    useLocalStore,
    useHydrated,
    getHomeFeed,
    getFollowedDemoFeed,
    getBookmarks,
    getLiked,
    getPost,
    type Post as StorePost,
} from '../utils/localStore';

/** Local (no-backend) feed sources backed by the localStore. */
export type FeedSource = 'home' | 'bookmarks' | 'liked';
export type LocalSupplementSource = 'followed' | 'bookmarks' | 'liked';
const EMPTY_STORE_POSTS: StorePost[] = [];

/** Friendly first line of the store-backed empty state, per feed source (F-23). */
const EMPTY_FEED_COPY: Record<FeedSource, string> = {
    home: 'Your feed is empty.',
    bookmarks: 'No bookmarks yet.',
    liked: 'No liked posts yet.',
};

/** Read the posts for a store-backed feed source. */
function selectStoreFeed(source: FeedSource, includeHomeReplies = false): StorePost[] {
    switch (source) {
        case 'home':
            return getHomeFeed(includeHomeReplies);
        case 'bookmarks':
            return getBookmarks();
        case 'liked':
            return getLiked();
        default:
            return EMPTY_STORE_POSTS;
    }
}

function selectLocalSupplement(source?: LocalSupplementSource, includeHomeReplies = false): StorePost[] {
    switch (source) {
        case 'followed':
            return getFollowedDemoFeed(includeHomeReplies);
        case 'bookmarks':
            return getBookmarks();
        case 'liked':
            return getLiked();
        default:
            return [];
    }
}

/** Map a store `Post` (Mastodon-style snake_case) into the feed's `PostType`.
 *  Mirrors PostList's `mapResponseToPosts` so store posts render identically to
 *  REST posts (the `replies` field is set to the count, as the REST path does). */
function storeToPost(post: StorePost): PostType {
    const parent = post.in_reply_to_id ? getPost(post.in_reply_to_id) : undefined;
    return {
        postId: post.id,
        text: post.content,
        author: post.account.username,
        account: post.account.acct,
        avatar: post.account.avatar,
        createdAt: post.created_at,
        replies: post.replies_count as unknown as PostType['replies'],
        replies_count: post.replies_count,
        stackCount: post.stackCount,
        favouritesCount: post.favourites_count,
        favourited: post.favourited,
        bookmarked: post.bookmarked,
        mediaAttachments: (post.media_attachments || []).map((m: any) =>
            typeof m === 'string' ? m : m.url
        ),
        relatedStacks: Array.isArray(post.relatedStacks) ? post.relatedStacks : [],
        focusRelations: Array.isArray(post.focusRelations) ? post.focusRelations : [],
        inReplyToId: post.in_reply_to_id ?? null,
        replyingToAccount: parent?.account.acct ?? null,
        previewCard: null,
    };
}

function mastodonStatusToPost(post: MastodonStatus, loadStackInfo: boolean): PostType {
    return {
        postId: post.id,
        text: post.content,
        author: post.account.display_name || post.account.username,
        account: post.account.acct,
        avatar: post.account.avatar,
        createdAt: post.created_at,
        replies: post.replies_count as unknown as PostType['replies'],
        replies_count: post.replies_count,
        stackCount: loadStackInfo ? null : -1,
        favouritesCount: post.favourites_count,
        favourited: post.favourited,
        bookmarked: post.bookmarked,
        mediaAttachments: (post.media_attachments || []).map((attachment) => attachment.url),
        relatedStacks: [],
        focusRelations: [],
        inReplyToId: typeof post.in_reply_to_id === 'string' ? post.in_reply_to_id : null,
        replyingToAccount: null,
        previewCard: post.card ? {
            title: post.card.title,
            description: post.card.description,
            image: post.card.image || undefined,
            url: post.card.url,
        } : null,
    };
}

// Module-level cache survives component remounts during SPA navigation
// without the size limits of sessionStorage
interface PostListCache {
    posts: PostType[];
    maxId: string | null;
    hasMore: boolean;
    timestamp: number;
    fetchedAt: number;
}
const postListCacheMap = new Map<string, PostListCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 20;

/** Drop cached API feeds whose URL contains `pathFragment`. */
export function invalidatePostListCache(pathFragment: string): void {
    for (const key of Array.from(postListCacheMap.keys())) {
        if (key.includes(pathFragment)) postListCacheMap.delete(key);
    }
}

/** Evict expired entries and cap total size (LRU — see cacheGet/cacheSet which refresh recency) */
function pruneCache<V extends { timestamp: number }>(cache: Map<string, V>, max: number) {
    const now = Date.now();
    cache.forEach((value, key) => {
        if (now - value.timestamp > CACHE_TTL) cache.delete(key);
    });
    while (cache.size > max) {
        // Map preserves insertion order; the least-recently used key is first
        // because cacheGet/cacheSet re-insert touched keys at the end.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/** Cache key includes the bearer token so a different user can't read another user's cached posts */
function cacheKeyFor(apiUrl: string, accessToken: string | null): string {
    return `${accessToken ?? 'anon'}::${apiUrl}`;
}

/** Read an entry and refresh its recency (re-insert at end) so eviction is LRU, not FIFO */
function cacheGet(key: string): PostListCache | null {
    const value = postListCacheMap.get(key);
    if (value === undefined) return null;
    postListCacheMap.delete(key);
    postListCacheMap.set(key, value);
    return value;
}

/** Write an entry and refresh its recency (re-insert at end) so eviction is LRU, not FIFO */
function cacheSet(key: string, value: PostListCache) {
    postListCacheMap.delete(key);
    postListCacheMap.set(key, value);
}

interface PostListProps {
    apiUrl: string;
    handleStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
    loadStackInfo: boolean;
    accessToken: string | null;
    setIsModalOpen: (isOpen: boolean) => void;
    setIsExpandModalOpen: (isOpen: boolean) => void;
    activePostId: string | null;
    setActivePostId: (id: string | null) => void;
    showLoadMore?: boolean;
    ready: boolean;
    /** Blend the matching local collection into an authenticated Mastodon feed. */
    localSupplement?: LocalSupplementSource;
    /** Mastodon hashtags whose followed timelines should be woven into Home. */
    remoteSupplementTags?: readonly string[];
    /** When set, the feed reads reactively from the localStore instead of fetching `apiUrl`. */
    source?: FeedSource;
}

const PostList: React.FC<PostListProps> = (props) => {
    // Store-backed feeds (Home/Bookmarks/Liked in local mode) bypass the REST
    // fetch + cache + virtualization entirely and render reactively from the
    // localStore. The apiUrl path below is preserved EXACTLY as-is.
    if (props.source) {
        return <StoreFeed {...props} source={props.source} />;
    }
    return <ApiFeed {...props} />;
};

const ApiFeed: React.FC<PostListProps> = (props) => {
    if (props.localSupplement || props.remoteSupplementTags?.length) {
        return <SupplementedApiFeed {...props} />;
    }
    return <ApiFeedCore {...props} />;
};

const SupplementedApiFeed: React.FC<PostListProps> = (props) => {
    const { homeReplies } = useExperimentFlags();
    const localHydrated = useHydrated();
    const localPosts = useLocalStore(() => selectLocalSupplement(props.localSupplement, homeReplies));
    const [remotePosts, setRemotePosts] = useState<PostType[]>([]);
    const [remoteLoading, setRemoteLoading] = useState(Boolean(props.remoteSupplementTags?.length));
    const remoteTagKey = (props.remoteSupplementTags ?? []).join('|');

    useEffect(() => {
        const tags = remoteTagKey.split('|').filter(Boolean);
        if (!props.ready || !props.accessToken || tags.length === 0) {
            setRemotePosts([]);
            setRemoteLoading(false);
            return;
        }

        const controller = new AbortController();
        let cancelled = false;
        const headers = { Authorization: `Bearer ${props.accessToken}` };

        const load = async () => {
            setRemoteLoading(true);
            try {
                const followedTimelines = await Promise.all(tags.map(async (tag) => {
                    const metadata = await axios.get(
                        `${MASTODON_INSTANCE_URL}/api/v1/tags/${encodeURIComponent(tag)}`,
                        { headers, signal: controller.signal },
                    );
                    if (!metadata.data?.following) return [] as MastodonStatus[];
                    const timeline = await axios.get(
                        `${MASTODON_INSTANCE_URL}/api/v1/timelines/tag/${encodeURIComponent(tag)}`,
                        { headers, params: { limit: 10 }, signal: controller.signal },
                    );
                    return Array.isArray(timeline.data) ? timeline.data as MastodonStatus[] : [];
                }));

                const seen = new Set<string>();
                const statuses = followedTimelines.flat().filter((status) => {
                    if (!status?.id || seen.has(status.id)) return false;
                    seen.add(status.id);
                    return true;
                });
                const mapped = statuses.map((status) => mastodonStatusToPost(status, props.loadStackInfo));
                // Show the followed-tag posts as soon as Mastodon returns them;
                // relation metadata is optional and hydrates in the background.
                if (!cancelled) {
                    setRemotePosts(mapped);
                    setRemoteLoading(false);
                }

                for (let index = 0; index < statuses.length; index += 2) {
                    const batch = await Promise.all(statuses.slice(index, index + 2).map(async (status) => {
                        const post = mastodonStatusToPost(status, props.loadStackInfo);
                        if (!props.loadStackInfo) return post;
                        try {
                            const related = await axios.get(
                                `${RELATED_POSTS_API_URL}/stacks/${status.id}/related`,
                                { signal: controller.signal },
                            );
                            const relatedStacks = Array.isArray(related.data?.relatedStacks)
                                ? related.data.relatedStacks
                                : [];
                            const stackCount = Number.isFinite(related.data?.size)
                                ? related.data.size
                                : relatedStacks.length;
                            return { ...post, stackCount, relatedStacks };
                        } catch (error) {
                            if (controller.signal.aborted) throw error;
                            return { ...post, stackCount: 0, relatedStacks: [] };
                        }
                    }));
                    if (!cancelled) {
                        const hydratedById = new Map(batch.map((post) => [post.postId, post]));
                        setRemotePosts((current) => current.map((post) => hydratedById.get(post.postId) ?? post));
                    }
                }
            } catch (error) {
                if (!cancelled && !controller.signal.aborted) setRemotePosts([]);
            } finally {
                if (!cancelled) setRemoteLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [props.accessToken, props.loadStackInfo, props.ready, remoteTagKey]);

    return (
        <ApiFeedCore
            {...props}
            localSupplementStorePosts={localHydrated ? localPosts : EMPTY_STORE_POSTS}
            remoteSupplementPosts={remotePosts}
            remoteSupplementLoading={remoteLoading}
        />
    );
};

const ApiFeedCore: React.FC<PostListProps & {
    localSupplementStorePosts?: StorePost[];
    remoteSupplementPosts?: PostType[];
    remoteSupplementLoading?: boolean;
}> = ({
    apiUrl,
    handleStackIconClick,
    loadStackInfo,
    accessToken,
    setIsModalOpen,
    setIsExpandModalOpen,
    activePostId,
    setActivePostId,
    showLoadMore = false,
    ready,
    localSupplementStorePosts = EMPTY_STORE_POSTS,
    remoteSupplementPosts = [],
    remoteSupplementLoading = false,
}) => {
    const { homeReplies } = useExperimentFlags();
    const isHomeTimeline = apiUrl.includes('/timelines/home');
    // Check cache synchronously during initialization to avoid a loading flash.
    // Stored in a ref so subsequent renders don't re-evaluate the cache check.
    const initialCacheRef = useRef(() => {
        return cacheGet(cacheKeyFor(apiUrl, accessToken));
    });
    const cachedSnapshot = useRef(initialCacheRef.current());
    const hasCachedData = !!cachedSnapshot.current;

    const [posts, setPosts] = useState<PostType[]>(() => cachedSnapshot.current?.posts ?? []);
    const localSupplementPosts = useMemo(
        () => localSupplementStorePosts.map(storeToPost),
        [localSupplementStorePosts],
    );
    const localSupplementIds = useMemo(
        () => new Set(localSupplementPosts.map((post) => post.postId)),
        [localSupplementPosts],
    );
    const supplementalPosts = useMemo(
        // Alternate bundled and Mastodon followed conversations before weaving
        // them into Home. This keeps either source from being buried when the
        // server's ordinary home timeline is empty or very short.
        () => weaveTimeline(localSupplementPosts, remoteSupplementPosts, 1),
        [localSupplementPosts, remoteSupplementPosts],
    );
    const displayPosts = useMemo(() => {
        const woven = weaveTimeline(posts, supplementalPosts);
        return isHomeTimeline && !homeReplies
            ? woven.filter((post) => !post.inReplyToId)
            : woven;
    }, [homeReplies, isHomeTimeline, posts, supplementalPosts]);
    const [loading, setLoading] = useState(() => !hasCachedData);
    const [loadingMore, setLoadingMore] = useState(false);
    const [maxId, setMaxId] = useState<string | null>(() => cachedSnapshot.current?.maxId ?? null);
    const maxIdRef = useRef<string | null>(maxId);
    maxIdRef.current = maxId;
    const [hasMore, setHasMore] = useState(() => cachedSnapshot.current?.hasMore ?? Boolean(cachedSnapshot.current?.maxId));
    const hasAutoHighlightedFirstPostRef = useRef(false);
    const hasPublishedFirstPostStacksRef = useRef(false);
    const scrollStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastUserActivateRef = useRef<number>(0);
    const manualActiveIdRef = useRef<string | null>(null);
    const manualLockRef = useRef(false);
    const fetchKeyRef = useRef<string | null>(null);
    const loadMoreInFlightRef = useRef(false);
    const restoredScrollRef = useRef(false);

    // Currently-viewport-intersecting post nodes, keyed by data-post-id. Kept up
    // to date by an IntersectionObserver so the active-post computation only has
    // to read rects for the handful of visible nodes instead of querying and
    // measuring every rendered [data-post-id] in the document on each scroll stop.
    const visiblePostElsRef = useRef<Map<string, Element>>(new Map());
    // Every currently-observed post node, keyed by id, so unmount can unobserve
    // precisely (the visible map only holds the intersecting subset).
    const observedPostElsRef = useRef<Map<string, Element>>(new Map());
    const postObserverRef = useRef<IntersectionObserver | null>(null);
    // Lazily create the observer so the post ref-callbacks (which run during the
    // first commit, before effects) have something to register with.
    const getPostObserver = (): IntersectionObserver | null => {
        if (typeof IntersectionObserver === 'undefined') return null;
        if (!postObserverRef.current) {
            postObserverRef.current = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    const id = entry.target.getAttribute('data-post-id');
                    if (!id) continue;
                    // isIntersecting mirrors the old visibility test
                    // (rect.bottom > 0 && rect.top < window.innerHeight).
                    if (entry.isIntersecting) visiblePostElsRef.current.set(id, entry.target);
                    else visiblePostElsRef.current.delete(id);
                }
            });
        }
        return postObserverRef.current;
    };
    // Stable ref-callback attached to each rendered post wrapper. Observes the
    // node on mount and unobserves + forgets it on unmount, so the visible set
    // tracks Virtuoso's dynamic mounting/unmounting without a full-DOM query.
    const registerPostNodeRef = useRef((node: HTMLDivElement | null, postId: string) => {
        const observer = getPostObserver();
        if (node) {
            observedPostElsRef.current.set(postId, node);
            observer?.observe(node);
        } else {
            const prev = observedPostElsRef.current.get(postId);
            if (prev) observer?.unobserve(prev);
            observedPostElsRef.current.delete(postId);
            visiblePostElsRef.current.delete(postId);
        }
    });

    // Mirror reactive values into refs so the scroll listener can attach ONCE
    // (stable deps) and still read the latest posts/activePostId/callbacks. This
    // avoids re-subscribing the window scroll listener on every posts update.
    const postsRef = useRef(displayPosts); postsRef.current = displayPosts;
    const activePostIdRef = useRef(activePostId); activePostIdRef.current = activePostId;
    const handleStackIconClickRef = useRef(handleStackIconClick); handleStackIconClickRef.current = handleStackIconClick;
    const setActivePostIdRef = useRef(setActivePostId); setActivePostIdRef.current = setActivePostId;

    // Restore scroll position after first paint when using cached data.
    // Virtuoso runs in useWindowScroll mode, so the window scroll position is
    // the source of truth and restoring it renders the right window of items.
    useEffect(() => {
        if (!hasCachedData || restoredScrollRef.current) return;
        restoredScrollRef.current = true;
        const savedY = sessionStorage.getItem(`scrollY:${window.location.pathname}`);
        if (savedY) {
            requestAnimationFrame(() => {
                window.scrollTo(0, parseInt(savedY, 10));
            });
            sessionStorage.removeItem(`scrollY:${window.location.pathname}`);
        }
    }, []);

    useEffect(() => {
        if (!ready) return; // wait for token check
        const key = `${apiUrl}|${loadStackInfo}|${accessToken}`;
        if (fetchKeyRef.current === key) return; // dedupe in Strict Mode
        fetchKeyRef.current = key;

        if (hasCachedData) {
            // Serve cache instantly, revalidate in background
            revalidate();
            return;
        }

        postListCacheMap.delete(cacheKeyFor(apiUrl, accessToken));
        fetchPosts();
    }, [apiUrl, accessToken, loadStackInfo, ready]);

    const fetchPosts = async (isLoadMore = false) => {
        try {
            if (isLoadMore) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const headers: Record<string, string> = {};
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

            const response = await axios.get(apiUrl, {
                headers,
                params: {
                    limit: 40,
                    ...(isLoadMore && maxIdRef.current && { max_id: maxIdRef.current })
                }
            });

            const data: PostType[] = (response.data as MastodonStatus[])
                .map((post) => mastodonStatusToPost(post, loadStackInfo));

            setPosts((prevPosts) => {
                if (!isLoadMore) return data;
                const seen = new Set(prevPosts.map((post) => post.postId));
                return [...prevPosts, ...data.filter((post) => !seen.has(post.postId))];
            });
            const linkedNextId = nextMaxIdFromLink(response.headers.link);
            // Link is authoritative. The full-page fallback supports older or
            // proxied Mastodon responses that strip the header.
            const nextId = linkedNextId ?? (data.length === 40 ? data[data.length - 1]?.postId ?? null : null);
            maxIdRef.current = nextId;
            setMaxId(nextId);
            setHasMore(Boolean(nextId));

            // Timeline content is the critical path. Related metadata hydrates
            // after the posts are visible, so a slow auxiliary service never
            // blocks reading or pagination.
            if (loadStackInfo) void loadStackDataInBatches(data, 2);
        } catch (error) {
            console.error('Error fetching Mastodon data:', error);
            notifications.show({
                color: 'red',
                title: 'Failed to load posts',
                message: 'Please try again later.',
            });
        } finally {
            setLoading(false);
            setLoadingMore(false);
            if (isLoadMore) loadMoreInFlightRef.current = false;
        }
    };

    const handleLoadMore = () => {
        if (loadingMore || loading || !hasMore || !maxIdRef.current || loadMoreInFlightRef.current) return;
        loadMoreInFlightRef.current = true;
        void fetchPosts(true);
    };

    const getScrollAnchor = (): { postId: string; offsetFromViewport: number } | null => {
        const els = Array.from(document.querySelectorAll('[data-post-id]'));
        for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.top >= 0 && rect.top < window.innerHeight) {
                return {
                    postId: el.getAttribute('data-post-id')!,
                    offsetFromViewport: rect.top,
                };
            }
        }
        return null;
    };

    const revalidate = async () => {
        try {
            const headers: Record<string, string> = {};
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

            const response = await axios.get(apiUrl, {
                headers,
                params: { limit: 40 },
            });

            const freshPosts: PostType[] = (response.data as MastodonStatus[])
                .map((post) => mastodonStatusToPost(post, loadStackInfo));

            // Capture scroll anchor before updating state
            const anchor = getScrollAnchor();

            setPosts((prev) => {
                const prevMap = new Map(prev.map(p => [p.postId, p]));
                const merged: PostType[] = [];

                for (const fp of freshPosts) {
                    const existing = prevMap.get(fp.postId);
                    if (existing) {
                        // Keep loaded stack data from cache, update everything else
                        merged.push({
                            ...fp,
                            stackCount: existing.stackCount !== null ? existing.stackCount : fp.stackCount,
                            relatedStacks: existing.relatedStacks.length > 0 ? existing.relatedStacks : fp.relatedStacks,
                        });
                        prevMap.delete(fp.postId);
                    } else {
                        merged.push(fp);
                    }
                }

                // Append any remaining old posts (from Load More) that weren't in the fresh page
                prevMap.forEach((p) => merged.push(p));

                return merged;
            });

            const linkedNextId = nextMaxIdFromLink(response.headers.link);
            const nextId = linkedNextId ?? (freshPosts.length === 40 ? freshPosts[freshPosts.length - 1]?.postId ?? null : null);
            maxIdRef.current = nextId;
            setMaxId(nextId);
            setHasMore(Boolean(nextId));

            // Restore scroll position after merge
            if (anchor) {
                requestAnimationFrame(() => {
                    const el = document.querySelector(`[data-post-id="${anchor.postId}"]`);
                    if (el) {
                        const newTop = el.getBoundingClientRect().top;
                        const drift = newTop - anchor.offsetFromViewport;
                        if (Math.abs(drift) > 1) {
                            window.scrollBy(0, drift);
                        }
                    }
                });
            }

            // Update fetchedAt in cache
            const cached = cacheGet(cacheKeyFor(apiUrl, accessToken));
            if (cached) {
                cached.fetchedAt = Date.now();
            }

            // Reload stack data for new posts that don't have it yet
            if (loadStackInfo) {
                const postsNeedingStacks = freshPosts.filter(p => p.stackCount === null);
                if (postsNeedingStacks.length > 0) {
                    await loadStackDataInBatches(postsNeedingStacks, 2);
                }
            }
        } catch {
            // Silent failure — user already has cached content
            console.warn('Background revalidation failed');
        }
    };

    // Auto-select the post whose center is nearest the viewport center.
    // Reads the DOM ([data-post-id]) rather than a refs array so it works with
    // virtualization (only the mounted/visible posts exist in the DOM).
    useEffect(() => {
        // Ensure the observer exists and is watching every currently-mounted post
        // node. Ref-callbacks register nodes during commit, but on a Strict-Mode
        // re-mount (cleanup nulled the observer) the nodes persist without their
        // ref-callbacks re-firing, so we (re)observe the tracked set here.
        const observer = getPostObserver();
        if (observer) {
            observedPostElsRef.current.forEach((node) => observer.observe(node));
        }

        const evaluateActiveByCenter = () => {
            const currentPosts = postsRef.current;

            // Respect manual selection while the selected post is still visible
            if (manualLockRef.current && manualActiveIdRef.current) {
                const el = document.querySelector(`[data-post-id="${CSS.escape(manualActiveIdRef.current)}"]`);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.bottom > 0 && rect.top < window.innerHeight) return; // keep manual selection
                }
                manualLockRef.current = false; // no longer visible; allow auto-selection again
            }

            const viewportCenter = window.innerHeight / 2;
            let bestId: string | null = null;
            let bestRect: DOMRect | null = null;
            let bestDistance = Number.POSITIVE_INFINITY;

            // Only the currently-intersecting nodes (maintained by the
            // IntersectionObserver) are candidates, so we read rects for a
            // handful of visible nodes instead of every rendered [data-post-id].
            // The same visibility guard is kept so the chosen "active" post is
            // identical to the old full-document scan even if an observer entry
            // is momentarily stale. Plain for-of (not forEach) so TS control-flow
            // analysis tracks the bestId/bestRect assignments for narrowing below.
            for (const [id, el] of Array.from(visiblePostElsRef.current.entries())) {
                const rect = el.getBoundingClientRect();
                if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue; // not visible
                const center = rect.top + rect.height / 2;
                const distance = Math.abs(center - viewportCenter);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestId = id;
                    bestRect = rect;
                }
            }

            if (bestId && bestRect && bestId !== activePostIdRef.current) {
                const post = currentPosts.find((p) => p.postId === bestId);
                if (post) {
                    setActivePostIdRef.current(post.postId);
                    const adjustedPosition = { top: bestRect.top + window.scrollY, height: bestRect.height };
                    handleStackIconClickRef.current(post.relatedStacks, post.postId, adjustedPosition);
                }
            }
        };

        const handleScroll = () => {
            if (scrollStopTimeoutRef.current) {
                clearTimeout(scrollStopTimeoutRef.current);
            }
            scrollStopTimeoutRef.current = setTimeout(() => {
                if (Date.now() - lastUserActivateRef.current < 400) return;
                evaluateActiveByCenter();
            }, 40);
        };

        // The IntersectionObserver delivers its first entries asynchronously, so
        // the visible set may be empty on this synchronous mount tick. Defer the
        // initial evaluation one frame so it runs against a populated set
        // (preserving the old on-mount auto-selection by viewport center).
        const initialRaf = requestAnimationFrame(() => evaluateActiveByCenter());
        window.addEventListener('scroll', handleScroll, { passive: true } as AddEventListenerOptions);
        return () => {
            window.removeEventListener('scroll', handleScroll as EventListener);
            if (scrollStopTimeoutRef.current) clearTimeout(scrollStopTimeoutRef.current);
            cancelAnimationFrame(initialRaf);
            postObserverRef.current?.disconnect();
            postObserverRef.current = null;
            // Clear the visible (intersecting) set — the observer that fed it is
            // gone. Keep observedPostElsRef: it tracks which nodes are mounted so
            // a Strict-Mode re-mount can re-observe them via getPostObserver().
            visiblePostElsRef.current.clear();
        };
    }, []); // attach once — reads latest values via refs

    // When the parent clears the active post (e.g., toggling a stackcount off),
    // release the manual lock so scrolling can auto-highlight the next post
    useEffect(() => {
        if (activePostId === null) {
            manualLockRef.current = false;
            manualActiveIdRef.current = null;
        }
    }, [activePostId]);

    // If the first post is already highlighted before its stacks load,
    // publish its related stacks to the aside once they arrive
    useEffect(() => {
        if (!loadStackInfo || displayPosts.length === 0) return;
        const first = displayPosts[0];
        if (
            activePostId === first.postId &&
            Array.isArray(first.relatedStacks) &&
            first.relatedStacks.length > 0 &&
            !hasPublishedFirstPostStacksRef.current
        ) {
            const el = document.querySelector(`[data-post-id="${CSS.escape(first.postId)}"]`);
            const rect = el ? el.getBoundingClientRect() : ({ top: 0, height: 0 } as { top: number; height: number });
            const adjustedPosition = { top: rect.top + window.scrollY, height: rect.height };
            handleStackIconClick(first.relatedStacks, first.postId, adjustedPosition);
            hasPublishedFirstPostStacksRef.current = true;
        }
    }, [displayPosts, activePostId, loadStackInfo, handleStackIconClick]);

    // Auto-highlight the first post once on initial page load only,
    // and wait until related stacks info is available when loadStackInfo is true
    useEffect(() => {
        if (hasAutoHighlightedFirstPostRef.current || displayPosts.length === 0 || activePostId) return;

        const firstPost = displayPosts[0];
        if (loadStackInfo) {
            if (firstPost.stackCount === null) return;
        }

        const el = document.querySelector(`[data-post-id="${CSS.escape(firstPost.postId)}"]`);
        const rect = el ? el.getBoundingClientRect() : ({ top: 0, height: 0 } as { top: number; height: number });
        const adjustedPosition = { top: rect.top + window.scrollY, height: rect.height };

        setActivePostId(firstPost.postId);
        // This call already publishes the first post's loaded related data.
        // Mark it before invoking the parent callback so the companion effect
        // above cannot publish the same post again after context updates and
        // accidentally trigger the manual "same post toggles off" behavior.
        hasPublishedFirstPostStacksRef.current = true;
        handleStackIconClick(firstPost.relatedStacks, firstPost.postId, adjustedPosition);
        hasAutoHighlightedFirstPostRef.current = true;
    }, [displayPosts, activePostId, handleStackIconClick, setActivePostId, loadStackInfo]);

    const loadStackDataInBatches = useCallback(async (posts: PostType[], batchSize: number) => {
        for (let i = 0; i < posts.length; i += batchSize) {
            const batch = posts.slice(i, i + batchSize);
            await Promise.all(batch.map(async (post) => {
                try {
                    const response = await axios.get(`${RELATED_POSTS_API_URL}/stacks/${post.postId}/related`);
                    const stackData = Array.isArray(response.data.relatedStacks) ? response.data.relatedStacks : [];
                    const stackCount = Number.isFinite(response.data.size) ? response.data.size : stackData.length;
                    setPosts((prevPosts) =>
                        prevPosts.map((p) =>
                            p.postId === post.postId
                                ? { ...p, stackCount: stackCount, relatedStacks: stackData }
                                : p
                        )
                    );
                } catch (error) {
                    // Most Mastodon statuses will not have CrossWeave relations.
                    // Resolve those lookups to a stable empty value so focus and
                    // pagination never wait forever on an optional service.
                    console.warn(`No related-post data for ${post.postId}:`, error);
                    setPosts((prevPosts) =>
                        prevPosts.map((candidate) =>
                            candidate.postId === post.postId
                                ? { ...candidate, stackCount: 0, relatedStacks: [] }
                                : candidate
                        )
                    );
                }
            }));
        }
    }, []);

    // A successful composer POST returns the canonical Mastodon status. Insert
    // it immediately, then hydrate related-post metadata in the background.
    useEffect(() => {
        const onStatusCreated = (event: Event) => {
            const status = (event as CustomEvent<MastodonStatus>).detail;
            if (!status?.id) return;
            const created = mastodonStatusToPost(status, loadStackInfo);
            setPosts((current) => [created, ...current.filter((post) => post.postId !== created.postId)]);
            if (loadStackInfo) void loadStackDataInBatches([created], 1);
        };
        window.addEventListener(MASTODON_STATUS_CREATED_EVENT, onStatusCreated);
        return () => window.removeEventListener(MASTODON_STATUS_CREATED_EVENT, onStatusCreated);
    }, [loadStackInfo, loadStackDataInBatches]);

    // Save to in-memory cache whenever posts update (even partially loaded stacks)
    useEffect(() => {
        if (loading || posts.length === 0) return;
        cacheSet(cacheKeyFor(apiUrl, accessToken), {
            posts,
            maxId,
            hasMore,
            timestamp: Date.now(),
            fetchedAt: Date.now(),
        });
        pruneCache(postListCacheMap, MAX_CACHE_ENTRIES);
    }, [posts, loading, apiUrl, maxId, hasMore, accessToken]);

    const renderPost = (_index: number, post: PostType) => (
        <div
            data-post-id={post.postId}
            data-feed-origin={localSupplementIds.has(post.postId) ? 'demo' : 'mastodon'}
            ref={(node) => registerPostNodeRef.current(node, post.postId)}
        >
            <Post
                id={post.postId}
                text={post.text}
                author={post.author}
                account={post.account}
                avatar={post.avatar}
                repliesCount={post.replies_count}
                createdAt={post.createdAt}
                stackCount={post.stackCount}
                favouritesCount={post.favouritesCount}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={post.mediaAttachments}
                onStackIconClick={handleStackIconClick}
                setIsModalOpen={setIsModalOpen}
                setIsExpandModalOpen={setIsExpandModalOpen}
                relatedStacks={post.relatedStacks}
                activePostId={activePostId}
                setActivePostId={(id: string | null) => {
                    lastUserActivateRef.current = Date.now();
                    manualActiveIdRef.current = id;
                    manualLockRef.current = !!id;
                    setActivePostId(id);
                }}
                initialCard={post.previewCard || null}
                focusRelations={post.focusRelations}
                replyingToAccount={post.replyingToAccount}
            />
        </div>
    );

    const Footer = () => {
        if (!showLoadMore || loading || !hasMore) return null;
        return (
            <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <Button onClick={handleLoadMore} disabled={loadingMore}
                    style={{ backgroundColor: '#1c2b4a', color: '#fff' }}>
                    {loadingMore ? 'Loading' : 'Load more'}
                </Button>
            </div>
        );
    };

    const emptyCopy = apiUrl.includes('/bookmarks')
        ? 'No Mastodon bookmarks yet.'
        : apiUrl.includes('/favourites')
            ? 'No liked Mastodon posts yet.'
            : apiUrl.includes('/timelines/home')
                ? 'Your Mastodon home timeline is empty.'
                : 'No posts found.';

    return (
        <Box style={{ width: '100%', position: 'relative', minHeight: 80 }}>
            <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && !remoteSupplementLoading && displayPosts.length === 0 && (
                <Paper withBorder radius="md" p="xl" style={{ textAlign: 'center', marginTop: 16 }} data-testid="api-feed-empty">
                    <Text fw={600}>{emptyCopy}</Text>
                    <Text size="sm" c="dimmed" mt={4}>There is nothing to show from the server right now.</Text>
                </Paper>
            )}
            {!loading && displayPosts.length > 0 && (
                <Virtuoso
                    useWindowScroll
                    data={displayPosts}
                    itemContent={renderPost}
                    computeItemKey={(_index: number, post: PostType) => post.postId}
                    // Auto-load the next page when the user nears the end (in
                    // addition to the explicit Load more button in the footer).
                    endReached={showLoadMore && hasMore ? () => handleLoadMore() : undefined}
                    increaseViewportBy={600}
                    components={{ Footer }}
                />
            )}
        </Box>
    );
};

/**
 * Store-backed feed (local/demo mode). Reads posts reactively from the localStore
 * for the given `source` (home/bookmarks/liked) instead of fetching `apiUrl`, and
 * renders them with the SAME `Post` component, prop mapping and `handleStackIconClick`
 * wiring the apiUrl path uses — so the aside lights up on click identically.
 *
 * No fetch, no module cache, no virtualization: the store is the source of truth
 * and re-renders on every mutation via useLocalStore. An empty result renders a
 * friendly empty-state card pointing at the demo thread (F-23).
 */
const StoreFeed: React.FC<PostListProps & { source: FeedSource }> = ({
    source,
    handleStackIconClick,
    setIsModalOpen,
    setIsExpandModalOpen,
    activePostId,
    setActivePostId,
}) => {
    const router = useRouter();
    const { homeReplies } = useExperimentFlags();
    // Re-renders on any store mutation (post/like/bookmark/follow) so the feed
    // stays live without a manual refresh.
    const hydrated = useHydrated();
    const storePosts = useLocalStore(() => selectStoreFeed(source, homeReplies));
    // Render empty on the server + first client render (the store reads
    // localStorage, which the server can't see) so hydration matches; fill in
    // immediately after mount.
    const posts: PostType[] = hydrated ? storePosts.map(storeToPost) : [];

    // Keep Home's related pane synced to the post nearest the viewport center,
    // matching the API-backed feed. This makes relation discovery passive and
    // predictable: scroll onto a focus post and its related responses appear;
    // scroll onto an ordinary reply and the stable right column becomes blank.
    const activePostIdRef = useRef(activePostId);
    activePostIdRef.current = activePostId;
    const postsRef = useRef(posts);
    postsRef.current = posts;
    const postMapRef = useRef(new Map(posts.map((post) => [post.postId, post])));
    postMapRef.current = new Map(posts.map((post) => [post.postId, post]));
    const stackHandlerRef = useRef(handleStackIconClick);
    stackHandlerRef.current = handleStackIconClick;

    useEffect(() => {
        if (source !== 'home' || !hydrated || postsRef.current.length === 0) return;
        let scrollTimer: ReturnType<typeof setTimeout> | null = null;

        const evaluate = () => {
            const viewportCenter = window.innerHeight / 2;
            let best: { post: PostType; rect: DOMRect; distance: number } | null = null;
            const elements = Array.from(
                document.querySelectorAll<HTMLElement>('[data-store-feed-post]'),
            );
            for (const element of elements) {
                const rect = element.getBoundingClientRect();
                if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
                const postId = element.dataset.storeFeedPost;
                const post = postId ? postMapRef.current.get(postId) : undefined;
                if (!post) continue;
                const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
                if (!best || distance < best.distance) best = { post, rect, distance };
            }

            if (!best || best.post.postId === activePostIdRef.current) return;
            activePostIdRef.current = best.post.postId;
            setActivePostId(best.post.postId);
            stackHandlerRef.current(best.post.relatedStacks, best.post.postId, {
                top: best.rect.top + window.scrollY,
                height: best.rect.height,
            });
        };

        const initialFrame = requestAnimationFrame(evaluate);
        const onScroll = () => {
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(evaluate, 50);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(initialFrame);
            if (scrollTimer) clearTimeout(scrollTimer);
            window.removeEventListener('scroll', onScroll);
        };
    }, [hydrated, source, setActivePostId]);

    // Mirror the apiUrl path's manual-selection bookkeeping so clicking a post
    // both highlights it and (when relatedStacks exist) drives the aside.
    const lastUserActivateRef = useRef<number>(0);
    const manualActiveIdRef = useRef<string | null>(null);
    const manualLockRef = useRef(false);

    // Empty state (F-23): once hydrated, a zero-post feed shows a friendly card
    // pointing at the always-available demo thread instead of a blank page.
    // Before hydration we still render the bare Box so server/client markup match.
    if (hydrated && posts.length === 0) {
        return (
            <Box style={{ width: '100%', position: 'relative', minHeight: 80 }}>
                <Paper
                    withBorder
                    radius="md"
                    p="xl"
                    style={{ textAlign: 'center', marginTop: '16px' }}
                    data-testid="store-feed-empty"
                >
                    <Text fw={600} mb={4}>
                        {EMPTY_FEED_COPY[source]}
                    </Text>
                    <Text size="sm" c="dimmed">
                        Browse the{' '}
                        <Anchor component={Link} href="/ChineseEVs" size="sm">
                            #ChineseEVs demo thread
                        </Anchor>{' '}
                        — no login required.
                    </Text>
                </Paper>
            </Box>
        );
    }

    return (
        <Box style={{ width: '100%', position: 'relative', minHeight: 80 }}>
            {posts.map((post) => (
                <div
                    key={post.postId}
                    data-post-id={post.postId}
                    data-store-feed-post={post.postId}
                >
                    <Post
                        id={post.postId}
                        text={post.text}
                        author={post.author}
                        account={post.account}
                        avatar={post.avatar}
                        repliesCount={post.replies_count}
                        createdAt={post.createdAt}
                        stackCount={post.stackCount}
                        favouritesCount={post.favouritesCount}
                        favourited={post.favourited}
                        bookmarked={post.bookmarked}
                        mediaAttachments={post.mediaAttachments}
                        onStackIconClick={handleStackIconClick}
                        // Store feeds are local study surfaces: publish the same
                        // related-panel focus as before, then open the compatible
                        // local detail route (never the auth-gated REST route).
                        onNavigate={(postId: string) => {
                            handleStackIconClick(post.relatedStacks ?? [], postId, { top: 0, height: 0 });
                            const url = `/ChineseEVs/posts/${postId}`;
                            sessionStorage.setItem(`previousPath:${url}`, window.location.pathname + window.location.search);
                            sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
                            router.push(url);
                        }}
                        setIsModalOpen={setIsModalOpen}
                        setIsExpandModalOpen={setIsExpandModalOpen}
                        relatedStacks={post.relatedStacks}
                        activePostId={activePostId}
                        setActivePostId={(id: string | null) => {
                            lastUserActivateRef.current = Date.now();
                            manualActiveIdRef.current = id;
                            manualLockRef.current = !!id;
                            setActivePostId(id);
                        }}
                        initialCard={post.previewCard || null}
                        focusRelations={post.focusRelations}
                        replyingToAccount={post.replyingToAccount}
                        appearance={source === 'home' ? 'timeline' : 'card'}
                    />
                </div>
            ))}
        </Box>
    );
};

export default PostList;
