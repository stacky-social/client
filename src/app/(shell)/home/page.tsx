"use client";
import React from 'react';
import { Loader } from '@mantine/core';
import Posts from '../../../components/Posts/Posts';
import { MASTODON_INSTANCE_URL } from '../../../utils/mastodonApi';
import { useAccessToken } from '../../../utils/useAccessToken';
import { useStudyMode } from '../../../utils/studyMode';
import classes from './Home.module.css';

export default function Home() {
    const { token, ready } = useAccessToken();
    const studyMode = useStudyMode();
    // Study Mode is an explicitly local experience. Keep that boundary even
    // if a stale token appears in storage (for example from another tab), so
    // Mastodon's account- and tag-follow timelines cannot leak into the demo.
    const useBackendTimeline = Boolean(token) && !studyMode;

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
                <div data-feed-mode={useBackendTimeline ? 'mastodon-with-curated' : 'curated-demo'}>
                    <Posts
                        apiUrl={useBackendTimeline ? `${MASTODON_INSTANCE_URL}/api/v1/timelines/home` : undefined}
                        source={useBackendTimeline ? undefined : 'curated-home'}
                        localSupplement={useBackendTimeline ? 'curated' : undefined}
                        loadStackInfo
                        showSubmitAndSearch
                        showLoadMore={useBackendTimeline}
                    />
                </div>
            )}
        </main>
    );
}
