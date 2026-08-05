"use client";
import React from 'react';
import Posts from '../../../components/Posts/Posts';
import classes from './Home.module.css';

export default function Home() {
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
            <Posts
                source="home"
                loadStackInfo
                showSubmitAndSearch
                showLoadMore={false}
            />
        </main>
    );
}
