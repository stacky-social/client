"use client";
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import SearchBar from '../SearchBar/SearchBar';
import RelatedStacks from '../RelatedStacks';
import PostList from '../PostList';

export default function Posts({ apiUrl, loadStackInfo, showSubmitAndSearch }: { apiUrl: string, loadStackInfo: boolean, showSubmitAndSearch: boolean }) {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [relatedStacks, setRelatedStacks] = useState<any[]>([]);
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [postPosition, setPostPosition] = useState<{ top: number, height: number } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false); 
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false); 


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
         
            setActivePostId(postId);
            setPostPosition(position);
            setIsExpandModalOpen(false);
        } else {
            console.error("relatedStacks is not an array:", relatedStacks);
            setRelatedStacks([]); 
        }
    };

    

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', width: 'calc(100% - 2rem)', gap: '1rem', marginRight: '1rem' }}>
            <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
                {showSubmitAndSearch && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                        <div style={{ width: '90%', marginLeft: '-3rem' }}>
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
                />
            </div>
            <div style={{ gridColumn: '2 / 3', position: 'relative' }}>
                {showSubmitAndSearch && <SearchBar />}
                <div style={{ marginRight: '10rem', position: 'relative' }} ref={relatedStacksRef}>
                    <AnimatePresence>
                        {relatedStacks.length > 0 && postPosition && (
                            <motion.div
                                id="related-stacks"
                                style={{ position: 'absolute', 
                                    top:  showSubmitAndSearch ? postPosition.top - 200: postPosition.top - 300, 
                                    left: 0 }}
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
                                    setIsExpandModalOpen={setIsExpandModalOpen} 
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
