"use client";

import { Shell } from "../../components/Shell";
import { SubmitPost } from "../../components/SubmitPost";
import Posts from "../../components/Posts";
import { useState } from 'react';

export default function HomePage(){
    const [searchResult, setSearchResult] = useState<string>('');

    const handleSearch = (query: string) => {

        setSearchResult(query);
        console.log('Search Result:', query); // For now, just log the search result
    };

    return (
        <Shell>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', gap: '20px' }}>
                <div style={{ gridColumn: '1 / 2' }}>
                    <SubmitPost />
                    <Posts />
                </div>
            </div>
        </Shell>
    );
};

