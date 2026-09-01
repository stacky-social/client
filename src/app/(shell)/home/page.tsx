"use client";
import React from 'react';
import { Loader } from '@mantine/core';
import Posts from '../../../components/Posts/Posts';
import { MASTODON_INSTANCE_URL } from '../../../utils/mastodonApi';
import { useAccessToken } from '../../../utils/useAccessToken';
import classes from './Home.module.css';

export default function Home() {
    const { token, ready } = useAccessToken();

    return (
        <main className={classes.timeline} aria-labelledby="home-title">
            <header className={classes.header}>
                <div>
                    <h1 id="home-title" className={classes.title}>Home</h1>
                    <p className={classes.subtitle}>Curated conversations and posts from accounts you follow</p>
                </div>
            </header>
            {!ready ? (
                <div className={classes.loadingState} aria-label="Loading your timeline">
                    <Loader color="blue" size="sm" />
                </div>
            ) : (
                <div data-feed-mode={token ? 'mastodon-with-curated' : 'curated-demo'}>
                    <Posts
                        apiUrl={token ? `${MASTODON_INSTANCE_URL}/api/v1/timelines/home` : undefined}
                        source={token ? undefined : 'curated-home'}
                        localSupplement={token ? 'curated' : undefined}
                        loadStackInfo
                        showSubmitAndSearch
                        showLoadMore={Boolean(token)}
                    />
                </div>
            )}
        </main>
    );
}
