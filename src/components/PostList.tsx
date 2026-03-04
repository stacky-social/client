import React, { useEffect, useState, useRef } from 'react';
import { LoadingOverlay, Button, Box } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { PostType } from '../types/PostType';
import Post from './Posts/Post';
import axios from 'axios';

const MastodonInstanceUrl = 'https://beta.stacky.social:3002';

// Module-level cache survives component remounts during SPA navigation
// without the size limits of sessionStorage
interface PostListCache {
    posts: PostType[];
    maxId: string | null;
    timestamp: number;
    fetchedAt: number;
}
const postListCacheMap = new Map<string, PostListCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 20;

/** Evict expired entries and cap total size */
function pruneCache<V extends { timestamp: number }>(cache: Map<string, V>, max: number) {
    const now = Date.now();
    cache.forEach((value, key) => {
        if (now - value.timestamp > CACHE_TTL) cache.delete(key);
    });
    while (cache.size > max) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
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
}

const PostList: React.FC<PostListProps> = ({
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
}) => {
    // Check cache synchronously during initialization to avoid a loading flash.
    // Stored in a ref so subsequent renders don't re-evaluate the cache check.
    const initialCacheRef = useRef(() => {
        const cached = postListCacheMap.get(apiUrl);
        return cached ?? null;
    });
    const cachedSnapshot = useRef(initialCacheRef.current());
    const hasCachedData = !!cachedSnapshot.current;

    const [posts, setPosts] = useState<PostType[]>(() => cachedSnapshot.current?.posts ?? []);
    const [loading, setLoading] = useState(() => !hasCachedData);
    const [loadingMore, setLoadingMore] = useState(false);
    const postRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [maxId, setMaxId] = useState<string | null>(() => cachedSnapshot.current?.maxId ?? null);
    const hasAutoHighlightedFirstPostRef = useRef(false);
    const hasPublishedFirstPostStacksRef = useRef(false);
    const scrollStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastUserActivateRef = useRef<number>(0);
    const manualActiveIdRef = useRef<string | null>(null);
    const manualLockRef = useRef(false);
    const fetchKeyRef = useRef<string | null>(null);
    const restoredScrollRef = useRef(false);
    const mergedMaxIdRef = useRef<string | null>(null);

    // Restore scroll position after first paint when using cached data
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

        postListCacheMap.delete(apiUrl);
        fetchPosts();
    }, [apiUrl, accessToken, loadStackInfo, ready]);

    const mapResponseToPosts = (data: any[]): PostType[] =>
        data.map((post: any) => ({
            postId: post.id,
            text: post.content,
            author: post.account.username,
            account: post.account.acct,
            avatar: post.account.avatar,
            createdAt: post.created_at,
            replies: post.replies_count,
            replies_count: post.replies_count,
            stackCount: loadStackInfo ? null : -1,
            favouritesCount: post.favourites_count,
            favourited: post.favourited,
            bookmarked: post.bookmarked,
            mediaAttachments: post.media_attachments,
            relatedStacks: [],
            previewCard: post.card ? {
                title: post.card.title,
                description: post.card.description,
                image: post.card.image || undefined,
                url: post.card.url,
            } : null
        }));

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
                    ...(maxId && { max_id: maxId }) // 如果有 maxId 就加上 max_id 参数
                }
            });

            const data: PostType[] = mapResponseToPosts(response.data);

            setPosts((prevPosts) => isLoadMore ? [...prevPosts, ...data] : data);
            if (data.length > 0) {
                setMaxId(data[data.length - 1].postId);
            }

            if (loadStackInfo) {
                await loadStackDataInBatches(data, 2);
            }
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
        }
    };

    const handleLoadMore = () => {
        fetchPosts(true);
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

            const freshPosts: PostType[] = mapResponseToPosts(response.data);

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

                // Compute maxId from the FULL merged list, not just freshPosts
                if (merged.length > 0) {
                    mergedMaxIdRef.current = merged[merged.length - 1].postId;
                }

                return merged;
            });

            // Update maxId from merged result
            if (mergedMaxIdRef.current) {
                setMaxId(mergedMaxIdRef.current);
                mergedMaxIdRef.current = null;
            }

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
            const cached = postListCacheMap.get(apiUrl);
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

    useEffect(() => {
        const evaluateActiveByCenter = () => {
            // Respect manual selection while the selected post is still visible
            if (manualLockRef.current && manualActiveIdRef.current) {
                const idxManual = posts.findIndex((p) => p.postId === manualActiveIdRef.current);
                if (idxManual !== -1) {
                    const ref = postRefs.current[idxManual];
                    if (ref) {
                        const rect = ref.getBoundingClientRect();
                        const visible = rect.bottom > 0 && rect.top < window.innerHeight;
                        if (visible) return; // keep the manual selection
                    }
                }
                manualLockRef.current = false; // manual selected post no longer visible; allow auto-selection again
            }

            const viewportCenter = window.innerHeight / 2;

            let bestIndex: number | null = null;
            let bestDistance = Number.POSITIVE_INFINITY;

            for (let i = 0; i < postRefs.current.length; i++) {
                const ref = postRefs.current[i];
                if (!ref) continue;
                const rect = ref.getBoundingClientRect();

                // Consider any item that intersects viewport
                const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
                if (!isVisible) continue;

                const center = rect.top + rect.height / 2;
                const distance = Math.abs(center - viewportCenter);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = i;
                }
            }

            if (bestIndex !== null) {
                const post = posts[bestIndex];
                if (post && post.postId !== activePostId) {
                    setActivePostId(post.postId);
                    const ref = postRefs.current[bestIndex]!;
                    const position = ref.getBoundingClientRect();
                    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
                    handleStackIconClick(post.relatedStacks, post.postId, adjustedPosition);
                }
            }
        };

        const handleScroll = () => {
            if (scrollStopTimeoutRef.current) {
                clearTimeout(scrollStopTimeoutRef.current);
            }
            scrollStopTimeoutRef.current = setTimeout(() => {
                // If a user has just manually activated a post, skip this auto-evaluation
                if (Date.now() - lastUserActivateRef.current < 400) return;
                evaluateActiveByCenter();
            }, 40);
        };

        // Initial evaluation in case the page loads with content already in view
        evaluateActiveByCenter();

        window.addEventListener('scroll', handleScroll, { passive: true } as AddEventListenerOptions);
        return () => {
            window.removeEventListener('scroll', handleScroll as EventListener);
            if (scrollStopTimeoutRef.current) clearTimeout(scrollStopTimeoutRef.current);
        };
    }, [posts, activePostId, handleStackIconClick, setActivePostId]);

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
        if (!loadStackInfo || posts.length === 0) return;
        const first = posts[0];
        if (
            activePostId === first.postId &&
            Array.isArray(first.relatedStacks) &&
            first.relatedStacks.length > 0 &&
            !hasPublishedFirstPostStacksRef.current
        ) {
            const ref = postRefs.current[0];
            const rect = ref ? ref.getBoundingClientRect() : ({ top: 0, height: 0 } as { top: number; height: number });
            const adjustedPosition = { top: rect.top + window.scrollY, height: rect.height };
            handleStackIconClick(first.relatedStacks, first.postId, adjustedPosition);
            hasPublishedFirstPostStacksRef.current = true;
        }
    }, [posts, activePostId, loadStackInfo, handleStackIconClick]);

    // Auto-highlight the first post once on initial page load only,
    // and wait until related stacks info is available when loadStackInfo is true
    useEffect(() => {
        if (hasAutoHighlightedFirstPostRef.current || posts.length === 0 || activePostId) return;

        const firstPost = posts[0];
        if (loadStackInfo) {
            // When loading stack info, wait until the first post's stackCount is resolved (null -> number)
            if (firstPost.stackCount === null) return;
        }

        const firstRef = postRefs.current[0];
        const rect = firstRef
            ? firstRef.getBoundingClientRect()
            : ({ top: 0, height: 0 } as { top: number; height: number });
        const adjustedPosition = { top: rect.top + window.scrollY, height: rect.height };

        setActivePostId(firstPost.postId);
        handleStackIconClick(firstPost.relatedStacks, firstPost.postId, adjustedPosition);
        hasAutoHighlightedFirstPostRef.current = true;
    }, [posts, activePostId, handleStackIconClick, setActivePostId, loadStackInfo]);

    const loadStackDataInBatches = async (posts: PostType[], batchSize: number) => {
        for (let i = 0; i < posts.length; i += batchSize) {
            const batch = posts.slice(i, i + batchSize);
            await Promise.all(batch.map(async (post) => {
                try {
                    console.log('Fetching stack data for post:', post.postId);
                    const headers: Record<string, string> = {};
                    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
                    const response = await axios.get(`${MastodonInstanceUrl}/stacks/${post.postId}/related`, { headers });
                    const stackData = response.data.relatedStacks || [];
                    const stackCount = response.data.size;
                    setPosts((prevPosts) =>
                        prevPosts.map((p) =>
                            p.postId === post.postId
                                ? { ...p, stackCount: stackCount, relatedStacks: stackData }
                                : p
                        )
                    );
                } catch (error) {
                    console.error(`Error fetching stack data for post ${post.postId}:`, error);
                    // notifications.show({
                    //     color: 'red',
                    //     title: 'Failed to load stacks',
                    //     message: `Post ${post.postId}: please try again later.`,
                    // });
                }
            }));
        }
    };

    // Save to in-memory cache whenever posts update (even partially loaded stacks)
    useEffect(() => {
        if (loading || posts.length === 0) return;
        postListCacheMap.set(apiUrl, {
            posts,
            maxId,
            timestamp: Date.now(),
            fetchedAt: Date.now(),
        });
        pruneCache(postListCacheMap, MAX_CACHE_ENTRIES);
    }, [posts, loading, apiUrl, maxId]);

    const postElements = posts.map((post: PostType, index) => (
        <div
            key={post.postId}
            data-post-id={post.postId}
            ref={(el) => {
                postRefs.current[index] = el;
            }}
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
            />
        </div>
    ));

    return (
        <Box style={{ width: '100%', position: 'relative', minHeight: 80 }}>
            <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}


            {showLoadMore && !loading && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <Button onClick={handleLoadMore} disabled={loadingMore}
                        style={{ backgroundColor: '#324e93', color: '#fff' }}>
                        {loadingMore ? 'Loading' : 'Load more'}
                    </Button>
                </div>
            )}
        </Box>
    );
};

export default PostList;
