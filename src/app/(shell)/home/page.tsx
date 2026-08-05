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
                    <p className={classes.subtitle}>Curated and followed conversations</p>
                </div>
                <div className={classes.latest} aria-label="Timeline sorted by latest activity">
                    <span aria-hidden="true" />
                    Latest
                </div>
            </header>
            {!ready ? (
                <div style={{ display: 'grid', minHeight: 180, placeItems: 'center' }} aria-label="Loading your timeline">
                    <Loader color="blue" size="sm" />
                </div>
            ) : (
                <div data-feed-mode={token ? 'mastodon' : 'json-demo'}>
                    <Posts
                        apiUrl={token ? `${MASTODON_INSTANCE_URL}/api/v1/timelines/home` : undefined}
                        source={token ? undefined : 'home'}
                        loadStackInfo
                        showSubmitAndSearch
                        showLoadMore={Boolean(token)}
                    />
                </div>
            )}
        </main>
    );
}
