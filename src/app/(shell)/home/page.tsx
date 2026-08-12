"use client";
import React from 'react';
import { Loader } from '@mantine/core';
import Posts from '../../../components/Posts/Posts';
import { MASTODON_INSTANCE_URL } from '../../../utils/mastodonApi';
import { useAccessToken } from '../../../utils/useAccessToken';
import { HASHTAG_CATALOG } from '../../../data/hashtagCatalog';
import classes from './Home.module.css';

const REMOTE_CONVERSATION_TAGS = HASHTAG_CATALOG
    .filter((tag) => !tag.local)
    .map((tag) => tag.apiTag ?? tag.name);

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
                <div className={classes.loadingState} aria-label="Loading your timeline">
                    <Loader color="blue" size="sm" />
                </div>
            ) : (
                <div data-feed-mode={token ? 'mastodon' : 'json-demo'}>
                    <Posts
                        apiUrl={token ? `${MASTODON_INSTANCE_URL}/api/v1/timelines/home` : undefined}
                        source={token ? undefined : 'home'}
                        localSupplement={token ? 'followed' : undefined}
                        remoteSupplementTags={token ? REMOTE_CONVERSATION_TAGS : undefined}
                        loadStackInfo
                        showSubmitAndSearch
                        showLoadMore={Boolean(token)}
                    />
                </div>
            )}
        </main>
    );
}
