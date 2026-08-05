"use client";
import { Loader } from '@mantine/core';
import Posts from '../../../components/Posts/Posts';
import { MASTODON_INSTANCE_URL } from '../../../utils/mastodonApi';
import { useAccessToken } from '../../../utils/useAccessToken';

export default function Bookmarks() {
    const { token, ready } = useAccessToken();
    if (!ready) return <div style={{ display: 'grid', minHeight: 180, placeItems: 'center' }}><Loader size="sm" /></div>;
    return (
        <Posts
            apiUrl={token ? `${MASTODON_INSTANCE_URL}/api/v1/bookmarks` : undefined}
            source={token ? undefined : 'bookmarks'}
            loadStackInfo
            showSubmitAndSearch
            showLoadMore={Boolean(token)}
        />
    );
}
