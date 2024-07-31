"use client";
import React, { useState } from 'react';
import Posts from '../../../components/Posts/Posts';
import { SubmitPost } from '../../../components/SubmitPost/SubmitPost';
import SearchBar from '../../../components/SearchBar/SearchBar';

export default function Home() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/timelines/home';

    return (
        <div style={{marginLeft:"10rem", marginTop:"2rem"}}
        >
                    <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={true} showSubmitAndSearch={true} />

        </div>
            
            
    );
}
