"use client";

import Posts from '../../../components/Posts/Posts';

export default function Home() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/timelines/home';



    return (
            <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={true} />
    );
}
