"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import PostList from '../PostList';
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import { useAccessToken } from '../../utils/useAccessToken';

export default function Posts({ apiUrl, loadStackInfo, showSubmitAndSearch = false, showLoadMore = false, source, localSupplement, remoteSupplementTags, }: { apiUrl?: string, loadStackInfo: boolean, showSubmitAndSearch?: boolean, showLoadMore?: boolean; source?: "home" | "curated-home" | "bookmarks" | "liked"; localSupplement?: "followed" | "curated" | "bookmarks" | "liked"; remoteSupplementTags?: readonly string[]; }) {
    const { token: accessToken, ready } = useAccessToken();
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

    const { setFromPost, enterFeedSurface, activePostId: asideActivePostId, relatedStacks: asideStacks } = useRelatedStacks();
    const isHomeTimeline = source === 'home' || source === 'curated-home' || apiUrl?.includes('/timelines/home');
    const feedSurfaceKey = source ? `store:${source}` : `api:${apiUrl ?? ''}`;

    // Parallel-route context outlives individual feed pages. Claim the stable
    // feed identity once on entry so an empty destination cannot display the
    // previous page's related cards. Publishing from this same feed records the
    // same key first, so hydration/remounts do not erase a newly selected post.
    useEffect(() => {
        enterFeedSurface(feedSurfaceKey);
    }, [enterFeedSurface, feedSurfaceKey]);

    const handleStackIconClick = useCallback((incomingRelatedStacks: any[], postId: string, _position: { top: number, height: number }) => {
        const togglingOff = postId === asideActivePostId && Array.isArray(asideStacks) && asideStacks.length > 0;
        // Publish only the relation payload carried by the post adapter. This is
        // the same contract a real timeline/related-post API will satisfy and
        // avoids a demo-only resolver silently inventing data for empty posts.
        const stacksToPublish = Array.isArray(incomingRelatedStacks) ? incomingRelatedStacks : [];
        setFromPost(stacksToPublish, postId, { surfaceKey: feedSurfaceKey });
        setActivePostId(togglingOff ? null : postId);
        setIsExpandModalOpen(false);
    }, [asideActivePostId, asideStacks, feedSurfaceKey, setFromPost]);

    return (
        <div
            style={{
                position: 'relative',
                // The active post is chosen nearest the viewport midpoint. A
                // half-viewport runway after Home lets the final posts reach
                // that line; it adds scroll range without resizing any card.
                paddingBottom: isHomeTimeline ? '50vh' : undefined,
            }}
            data-home-timeline={isHomeTimeline ? 'true' : undefined}
            data-feed-focus-runway={isHomeTimeline ? 'true' : undefined}
        >
            <div>
                {showSubmitAndSearch && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isHomeTimeline ? 0 : '2rem' }}>
                        <div style={{ width: '100%' }}>
                            <SubmitPost appearance={source === 'home' || source === 'curated-home' || apiUrl?.includes('/timelines/home') ? 'timeline' : 'card'} />
                        </div>
                    </div>
                )}
                <PostList
                    apiUrl={apiUrl ?? ""}
                    source={source}
                    handleStackIconClick={handleStackIconClick}
                    loadStackInfo={loadStackInfo}
                    accessToken={accessToken}
                    ready={ready}
                    setIsModalOpen={setIsModalOpen}
                    setIsExpandModalOpen={setIsExpandModalOpen}
                    activePostId={activePostId}
                    setActivePostId={setActivePostId}
                    showLoadMore={showLoadMore}
                    localSupplement={localSupplement}
                    remoteSupplementTags={remoteSupplementTags}
                />
            </div>
            {/* Related stacks are now rendered in AppShell.Aside via context */}
        </div>
    );
}
