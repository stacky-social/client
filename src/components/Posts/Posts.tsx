"use client";
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import SearchBar from '../SearchBar/SearchBar';
import RelatedStacks from '../RelatedStacks';
import PostList from '../PostList';
import { useRelatedStacks } from "../../app/(shell)/related-stacks-context";

export default function Posts({ apiUrl, loadStackInfo, showSubmitAndSearch,showLoadMore = false,}: { apiUrl: string, loadStackInfo: boolean, showSubmitAndSearch: boolean,showLoadMore?: boolean;}) {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false); 
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false); 
    const [previousPostId, setPreviousPostId] = useState<string | null>(null);

    const { setFromPost, activePostId: asideActivePostId, relatedStacks: asideStacks } = useRelatedStacks();

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        setAccessToken(token);

        const user = localStorage.getItem('currentUser');
        if (user) {
            setCurrentUser(JSON.parse(user));
        }
    }, []);

    const handleStackIconClick = (incomingRelatedStacks: any[], postId: string, _position: { top: number, height: number }) => {
        const togglingOff = postId === asideActivePostId && Array.isArray(asideStacks) && asideStacks.length > 0;
        const stacksToPublish = Array.isArray(incomingRelatedStacks) ? incomingRelatedStacks : [];
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
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem'}}>
                        <div style={{ width: '100%'}}>
                            <SubmitPost />
                        </div>
                    </div>
                )}
                <PostList
                    apiUrl={apiUrl}
                    handleStackIconClick={handleStackIconClick}
                    loadStackInfo={loadStackInfo}
                    accessToken={accessToken}
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
