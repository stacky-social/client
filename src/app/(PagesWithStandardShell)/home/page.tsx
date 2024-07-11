"use client";

import Posts from '../../../components/Posts/Posts';

export default function Home() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/timelines/home';
    const testurl = 'https://mastodon.social/api/v1/timelines/public';



    return (
            <Posts apiUrl={testurl} loadStackInfo={true} />

    );
}
