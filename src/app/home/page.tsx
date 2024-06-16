"use client";

import { Shell } from "../../components/Shell";
import { SubmitPost } from "../../components/SubmitPost";
import Posts from "../../components/Posts";

export default function HomePage(){

    return (
        <Shell>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', gap: '20px' }}>
                <div style={{ gridColumn: '1 / 2' }}>
                    <SubmitPost />
                    <div style={{ marginBottom: '40px' }}>
                    </div>
                    <Posts />
                </div>
            </div>
        </Shell>
    );
};

