// pages/index.tsx
"use client";

import { Shell } from "../../components/Shell";
import { SubmitPost } from "../../components/SubmitPost";
import Posts from "../../components/Posts";
import SearchBar from "../../components/SearchBar";
import { useState } from 'react';
import { Grid, Box, Text } from '@mantine/core';

const HomePage: React.FC = () => {
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

export default HomePage;
