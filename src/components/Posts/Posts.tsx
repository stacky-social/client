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

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        setAccessToken(token);

        const user = localStorage.getItem('currentUser');
        if (user) {
            setCurrentUser(JSON.parse(user));
        }
    }, []);

    const handleStackIconClick = (relatedStacks: any[]) => {
        setRelatedStacks(relatedStacks);
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 500px', width: '100%', gap: '1rem' }}>
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
            <div style={{ gridColumn: '2 / 3' }}>
                <SearchBar />
                <div style={{ marginRight: '2rem' }}>
                {relatedStacks.length > 0 && (
                    <RelatedStacks
                        relatedStacks={relatedStacks}
                        cardWidth={450}
                        cardHeight={200}
                        onStackClick={() => {}}
                    />
                )}

                </div>
                
            </div>
        </div>
    );
}
