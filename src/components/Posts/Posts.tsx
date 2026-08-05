"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import PostList from '../PostList';
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import { useAccessToken } from '../../utils/useAccessToken';

export default function Posts({ apiUrl, loadStackInfo, showSubmitAndSearch, showLoadMore = false, source, includeFollowedDemo = false, }: { apiUrl?: string, loadStackInfo: boolean, showSubmitAndSearch: boolean, showLoadMore?: boolean; source?: "home" | "bookmarks" | "liked"; includeFollowedDemo?: boolean; }) {
    const { token: accessToken, ready } = useAccessToken();
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

    const { setFromPost, activePostId: asideActivePostId, relatedStacks: asideStacks, clear } = useRelatedStacks();

    // Start each feed visit with a clean aside — clears any related panel left
    // over from a previous focus so it never shows orphaned (no highlighted post).
    useEffect(() => { clear(); }, [clear]);

    const handleStackIconClick = useCallback((incomingRelatedStacks: any[], postId: string, _position: { top: number, height: number }) => {
        const togglingOff = postId === asideActivePostId && Array.isArray(asideStacks) && asideStacks.length > 0;
        // Publish only the relation payload carried by the post adapter. This is
        // the same contract a real timeline/related-post API will satisfy and
        // avoids a demo-only resolver silently inventing data for empty posts.
        const stacksToPublish = Array.isArray(incomingRelatedStacks) ? incomingRelatedStacks : [];
        setFromPost(stacksToPublish, postId);
        setActivePostId(togglingOff ? null : postId);
        setIsExpandModalOpen(false);
    }, [activePostId, asideActivePostId, asideStacks, setFromPost]);

    return (
        <div
            style={{ position: 'relative' }}
            data-home-timeline={source === 'home' || apiUrl?.includes('/timelines/home') ? 'true' : undefined}
        >
            <div>
                {showSubmitAndSearch && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: source === 'home' || apiUrl?.includes('/timelines/home') ? 0 : '2rem' }}>
                        <div style={{ width: '100%' }}>
                            <SubmitPost appearance={source === 'home' || apiUrl?.includes('/timelines/home') ? 'timeline' : 'card'} />
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
                    includeFollowedDemo={includeFollowedDemo}
                />
            </div>
            {/* Related stacks are now rendered in AppShell.Aside via context */}
        </div>
    );
}
