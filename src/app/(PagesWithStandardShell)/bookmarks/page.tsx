"use client";
import Posts from '../../../components/Posts/Posts';

export default function Bookmarks() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/bookmarks';

    return (

            <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={false}  showSubmitAndSearch={true} />

    );
}
