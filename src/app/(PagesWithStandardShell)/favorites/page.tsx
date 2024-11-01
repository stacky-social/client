"use client";
import Posts from '../../../components/Posts/Posts';

export default function Favorites() {
    const MastodonInstanceUrl = 'https://beta.stacky.social/api/v1/favourites';

    return (
        <Posts apiUrl={MastodonInstanceUrl} loadStackInfo={false}  showSubmitAndSearch={true} />
    );
}
