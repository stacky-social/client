"use client";
import { Shell } from '../../components/Shell';
import Posts from '../../components/Posts/Posts';

export default function Home() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/timelines/home';

    return (
        <Shell>
            <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={true} />
        </Shell>
    );
}
