"use client";
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import SearchBar from '../SearchBar/SearchBar';
import RelatedStacks from '../RelatedStacks';
import PostList from '../PostList';

export default function Posts({ apiUrl, loadStackInfo, showSubmitAndSearch,showLoadMore = false,}: { apiUrl: string, loadStackInfo: boolean, showSubmitAndSearch: boolean,showLoadMore?: boolean;}) {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [relatedStacks, setRelatedStacks] = useState<any[]>([]);
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [postPosition, setPostPosition] = useState<{ top: number, height: number } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false); 
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false); 
    const [previousPostId, setPreviousPostId] = useState<string | null>(null);


    const relatedStacksRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        setAccessToken(token);

        const user = localStorage.getItem('currentUser');
        if (user) {
            setCurrentUser(JSON.parse(user));
        }
    }, []);

    const handleStackIconClick = (relatedStacks: any[], postId: string, position: { top: number, height: number }) => {
        if (Array.isArray(relatedStacks)) {
            setRelatedStacks([...relatedStacks]);
            setPreviousPostId(activePostId);
            setActivePostId(postId);
            setPostPosition(position);
            setIsExpandModalOpen(false);
        } else {
            console.error("relatedStacks is not an array:", relatedStacks);
            setRelatedStacks([]); 
        }
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
            {relatedStacks.length > 0 && postPosition && (
                <div
                    ref={relatedStacksRef}
                    style={{
                        position: 'absolute',
                        right: '-520px',
                        top: showSubmitAndSearch ? postPosition.top - 60 : postPosition.top - 300,
                        width: 450
                    }}
                >
                    <AnimatePresence>
                        <motion.div
                            id="related-stacks"
                            initial={{ opacity: 0, x: -200 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -200 }}
                            transition={{ duration: 0.2 }}
                        >
                            <RelatedStacks
                                key={relatedStacks.map((_, index) => index).join(',')}
                                relatedStacks={relatedStacks}
                                cardWidth={450}
                                onStackClick={() => { }}
                                showupdate={shouldUpdate}
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
