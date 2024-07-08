"use client";
import React, { useEffect, useState, useRef } from 'react';
import { SubmitPost } from '../SubmitPost/SubmitPost';
import SearchBar from '../SearchBar/SearchBar';
import RelatedStacks from '../RelatedStacks';
import PostList from '../PostList';

export default function Posts({ apiUrl, loadStackInfo }: { apiUrl: string, loadStackInfo: boolean }) {
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
        setRelatedStacks([...relatedStacks]); 
        setActivePostId(postId);
        setPostPosition(position);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isExpandModalOpen) return;
            if (relatedStacksRef.current && !relatedStacksRef.current.contains(event.target as Node)) {
                setRelatedStacks([]);
                

            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [relatedStacks, isExpandModalOpen]);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', width: 'calc(100% - 2rem)', gap: '1rem', marginRight: '1rem' }}>
            <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                    <div style={{ width: '90%', marginLeft: '-3rem' }}>
                        <SubmitPost />
                    </div>
                </div>
                <PostList
                    apiUrl={apiUrl}
                    handleStackIconClick={handleStackIconClick}
                    loadStackInfo={loadStackInfo}
                    accessToken={accessToken}
                    setIsModalOpen={setIsModalOpen} 
                    setIsExpandModalOpen={setIsExpandModalOpen}
                  
                />
            </div>
            <div style={{ gridColumn: '2 / 3', position: 'relative' }}>
                <SearchBar />
                <div style={{ marginRight: '10rem', position: 'relative' }} ref={relatedStacksRef}>
                    {relatedStacks.length > 0 && postPosition && (
                        <div id="related-stacks" style={{ position: 'absolute', top: postPosition.top - 200, left: 0 }}>
                            <RelatedStacks
                                key={relatedStacks.map(stack => stack.stackId).join(',')} // 强制重新渲染
                                relatedStacks={relatedStacks}
                                cardWidth={450}
                                cardHeight={200}
                                onStackClick={() => { }}
                                setIsModalOpen={setIsModalOpen} 
                                setIsExpandModalOpen={setIsExpandModalOpen} 
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
