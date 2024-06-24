"use client";
import { Shell } from '../../components/Shell';
import Posts from '../../components/Posts/Posts';

export default function Bookmarks() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/bookmarks';

    return (
        <Shell>
            <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={false} />
        </Shell>
    );
}
