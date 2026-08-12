"use client";
import { Loader } from '@mantine/core';
import Posts from '../../../components/Posts/Posts';
import { MASTODON_INSTANCE_URL } from '../../../utils/mastodonApi';
import { useAccessToken } from '../../../utils/useAccessToken';

export default function Liked() {
    const { token, ready } = useAccessToken();
    if (!ready) return <div style={{ display: 'grid', minHeight: 180, placeItems: 'center' }}><Loader size="sm" /></div>;
    return (
        <Posts
            apiUrl={token ? `${MASTODON_INSTANCE_URL}/api/v1/favourites` : undefined}
            source={token ? undefined : 'liked'}
            loadStackInfo
            showSubmitAndSearch
            showLoadMore={Boolean(token)}
            localSupplement={token ? 'liked' : undefined}
        />
    );
}
