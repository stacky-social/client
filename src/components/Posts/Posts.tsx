"use client";
import React, { useEffect, useState } from 'react';
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

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        setAccessToken(token);

        const user = localStorage.getItem('currentUser');
        if (user) {
            setCurrentUser(JSON.parse(user));
        }
    }, []);

    const handleStackIconClick = (relatedStacks: any[], postId: string, position: { top: number, height: number }) => {
        setRelatedStacks([...relatedStacks]); // 更新 relatedStacks 的副本
        setActivePostId(postId);
        setPostPosition(position);
    };

    const handleClickOutside = () => {
        setRelatedStacks([]);
        setActivePostId(null);
        setPostPosition(null);
    };

    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            const relatedStacksElement = document.getElementById('related-stacks');
            if (relatedStacksElement && !relatedStacksElement.contains(event.target as Node)) {
                handleClickOutside();
            }
        };

        document.addEventListener('mousedown', handleMouseDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
        };
    }, []);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 500px', width: 'calc(100% - 2rem)', gap: '1rem', marginRight: '1rem' }}>
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
                />
            </div>
            <div style={{ gridColumn: '2 / 3', position: 'relative' }}>
                <SearchBar />
                <div style={{ marginRight: '10rem', position: 'relative' }}>
                    {relatedStacks.length > 0 && postPosition && (
                        <div id="related-stacks" style={{ position: 'absolute', top: postPosition.top - 200, left: 0 }}>
                            <RelatedStacks
                                relatedStacks={relatedStacks}
                                cardWidth={450}
                                cardHeight={200}
                                onStackClick={() => { }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
