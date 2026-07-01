"use client";
import React from 'react';
import Posts from '../../../components/Posts/Posts';

export default function Home() {
    return (
        <Posts
            source="home"
            loadStackInfo
            showSubmitAndSearch
            showLoadMore={false}
        />
    );
}
