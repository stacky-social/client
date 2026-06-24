"use client";
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import SearchBar from '../SearchBar/SearchBar';
import RelatedStacks from '../RelatedStacks';
import PostList from '../PostList';
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";
import { useAccessToken } from '../../utils/useAccessToken';
import { getMockRelatedStacks } from '../../utils/mockPostResolver';

export default function Posts({ apiUrl, loadStackInfo, showSubmitAndSearch, showLoadMore = false, source, }: { apiUrl?: string, loadStackInfo: boolean, showSubmitAndSearch: boolean, showLoadMore?: boolean; source?: "home" | "bookmarks" | "liked"; }) {
    const { token: accessToken, ready } = useAccessToken();
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);
    const [previousPostId, setPreviousPostId] = useState<string | null>(null);

    const { setFromPost, activePostId: asideActivePostId, relatedStacks: asideStacks, clear } = useRelatedStacks();

    // Start each feed visit with a clean aside — clears any related panel left
    // over from a previous focus so it never shows orphaned (no highlighted post).
    useEffect(() => { clear(); }, [clear]);

    const handleStackIconClick = (incomingRelatedStacks: any[], postId: string, _position: { top: number, height: number }) => {
        const togglingOff = postId === asideActivePostId && Array.isArray(asideStacks) && asideStacks.length > 0;
        // Store-feed posts (home/bookmarks/liked) carry no inline related stacks;
        // fall back to the mock dataset so the related panel still populates.
        const stacksToPublish =
            Array.isArray(incomingRelatedStacks) && incomingRelatedStacks.length > 0
                ? incomingRelatedStacks
                : (getMockRelatedStacks(postId) || []);
        setFromPost(stacksToPublish, postId);
        setPreviousPostId(activePostId);
        setActivePostId(togglingOff ? null : postId);
        setIsExpandModalOpen(false);
    };


    const shouldUpdate = activePostId !== previousPostId;
    return (
        <div style={{ position: 'relative' }}>
            <div>
                {showSubmitAndSearch && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                        <div style={{ width: '100%' }}>
                            <SubmitPost />
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
                />
            </div>
            {/* Related stacks are now rendered in AppShell.Aside via context */}
        </div>
    );
}
